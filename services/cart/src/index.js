const express = require("express");
const { createClient } = require("redis");

const app = express();
const port = Number(process.env.PORT) || 3002;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

app.use(express.json());

// In-memory cart store for MVP. Replace with Redis/Postgres later.
const cartsByUser = new Map();
let redisClient = null;
let redisReady = false;

async function connectRedis() {
  try {
    redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (error) => {
      redisReady = false;
      console.error("Redis client error:", error.message);
    });
    await redisClient.connect();
    redisReady = true;
    console.log(`Connected to Redis at ${redisUrl}`);
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

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "cart",
    status: "ok"
  });
});

app.get("/cart/:userId", async (req, res) => {
  const { userId } = req.params;
  const items = await getUserCart(userId);

  return res.status(200).json({
    userId,
    items
  });
});

app.post("/cart/:userId/items", async (req, res) => {
  const { userId } = req.params;
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

app.delete("/cart/:userId/items/:productId", async (req, res) => {
  const { userId, productId } = req.params;
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

app.delete("/cart/:userId", async (req, res) => {
  const { userId } = req.params;
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
