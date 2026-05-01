const express = require("express");
const { createClient } = require("redis");
const http = require("http");
const https = require("https");

const app = express();
const port = Number(process.env.PORT) || 3002;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";
const redisTlsRejectUnauthorized = String(process.env.REDIS_TLS_REJECT_UNAUTHORIZED || "true") !== "false";

app.use(express.json());

// In-memory cart store for MVP. Replace with Redis/Postgres later.
const cartsByUser = new Map();
let redisClient = null;
let redisReady = false;

async function connectRedis() {
  try {
    const parsedRedisUrl = new URL(redisUrl);
    if (parsedRedisUrl.protocol !== "redis:" && parsedRedisUrl.protocol !== "rediss:") {
      throw new Error(`Unsupported REDIS_URL protocol: ${parsedRedisUrl.protocol}`);
    }

    const clientOptions = { url: redisUrl };
    if (parsedRedisUrl.protocol === "rediss:") {
      clientOptions.socket = {
        tls: true,
        rejectUnauthorized: redisTlsRejectUnauthorized
      };
    }

    redisClient = createClient(clientOptions);
    redisClient.on("error", (error) => {
      redisReady = false;
      console.error("Redis client error:", error.message);
    });
    await redisClient.connect();
    redisReady = true;
    console.log(`Connected to Redis at ${redisUrl}`);
    console.log(`Redis TLS mode: ${parsedRedisUrl.protocol === "rediss:" ? "enabled" : "disabled"}`);
    if (parsedRedisUrl.protocol === "rediss:") {
      console.log(`Using REDIS_TLS_REJECT_UNAUTHORIZED=${redisTlsRejectUnauthorized}`);
    }
  } catch (error) {
    redisReady = false;
    redisClient = null;
    console.error("Redis unavailable, using in-memory cart store:", error.message);
  }
}

function getInMemoryCart(userId) {
  if (!cartsByUser.has(userId)) {
    cartsByUser.set(userId, []);
  }

  return cartsByUser.get(userId);
}

async function getUserCart(userId) {
  if (!redisReady || !redisClient) {
    return getInMemoryCart(userId);
  }

  const stored = await redisClient.get(`cart:${userId}`);
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveUserCart(userId, items) {
  if (!redisReady || !redisClient) {
    cartsByUser.set(userId, items);
    return;
  }

  await redisClient.set(`cart:${userId}`, JSON.stringify(items));
}

function parseQuantity(value) {
  const quantity = Number(value);
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null;
}

function readBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [prefix, token] = authorizationHeader.split(" ");
  if (prefix !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObject = new URL(url);
    const transport = urlObject.protocol === "https:" ? https : http;
    const method = options.method || "GET";
    const headers = options.headers || {};

    const request = transport.request(
      {
        protocol: urlObject.protocol,
        hostname: urlObject.hostname,
        port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
        path: `${urlObject.pathname}${urlObject.search}`,
        method,
        headers
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let parsedBody = {};
          if (raw.length > 0) {
            try {
              parsedBody = JSON.parse(raw);
            } catch {
              parsedBody = { raw };
            }
          }

          const statusCode = response.statusCode || 500;
          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(`Request failed: ${statusCode}`);
            error.status = statusCode;
            error.body = parsedBody;
            return reject(error);
          }

          return resolve(parsedBody);
        });
      }
    );

    request.setTimeout(5000, () => {
      request.destroy(new Error("Request timeout"));
    });

    request.on("error", (error) => {
      reject(error);
    });

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

async function requireAuth(req, res, next) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header"
    });
  }

  try {
    const response = await fetchJson(`${authServiceUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    req.session = response.user;
    return next();
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({
      error: "Authentication failed",
      details: error.body || error.message
    });
  }
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "cart",
    status: "ok"
  });
});

app.get("/cart/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (req.session.id !== userId && req.session.role !== "admin") {
    return res.status(403).json({
      error: "Cannot access another user's cart"
    });
  }
  const items = await getUserCart(userId);

  return res.status(200).json({
    userId,
    items
  });
});

app.post("/cart/:userId/items", requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (req.session.id !== userId && req.session.role !== "admin") {
    return res.status(403).json({
      error: "Cannot modify another user's cart"
    });
  }
  const { productId, quantity } = req.body || {};

  if (!productId || typeof productId !== "string") {
    return res.status(400).json({
      error: "productId is required and must be a string"
    });
  }

  const parsedQuantity = parseQuantity(quantity);
  if (!parsedQuantity) {
    return res.status(400).json({
      error: "quantity is required and must be a positive integer"
    });
  }

  const cart = await getUserCart(userId);
  const existing = cart.find((item) => item.productId === productId);

  if (existing) {
    existing.quantity += parsedQuantity;
  } else {
    cart.push({ productId, quantity: parsedQuantity });
  }

  await saveUserCart(userId, cart);

  return res.status(201).json({
    userId,
    items: cart
  });
});

app.delete("/cart/:userId/items/:productId", requireAuth, async (req, res) => {
  const { userId, productId } = req.params;
  if (req.session.id !== userId && req.session.role !== "admin") {
    return res.status(403).json({
      error: "Cannot modify another user's cart"
    });
  }
  const cart = await getUserCart(userId);
  const nextCart = cart.filter((item) => item.productId !== productId);

  if (nextCart.length === cart.length) {
    return res.status(404).json({
      error: "Product is not in cart"
    });
  }

  await saveUserCart(userId, nextCart);

  return res.status(200).json({
    userId,
    items: nextCart
  });
});

app.delete("/cart/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;
  if (req.session.id !== userId && req.session.role !== "admin") {
    return res.status(403).json({
      error: "Cannot clear another user's cart"
    });
  }
  await saveUserCart(userId, []);

  return res.status(200).json({
    userId,
    items: []
  });
});

connectRedis().finally(() => {
  app.listen(port, () => {
    console.log(`Cart service is running on port ${port}`);
  });
});
