const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const app = express();
const port = Number(process.env.PORT) || 3006;
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";
const checkoutServiceUrl = process.env.CHECKOUT_SERVICE_URL || "http://127.0.0.1:3003";
<<<<<<< HEAD
const catalogServiceUrl = process.env.CATALOG_SERVICE_URL || "http://127.0.0.1:3001";
=======
const authRateLimitWindowMs = Number(process.env.ADMIN_AUTH_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000;
const authRateLimitMax = Number(process.env.ADMIN_AUTH_RATE_LIMIT_MAX) || 8;
>>>>>>> maryam-branch

let inventoryPanelHtml = "";
try {
  inventoryPanelHtml = fs.readFileSync(path.join(__dirname, "inventory-panel.html"), "utf8");
} catch (error) {
  console.error(`inventory_panel_read_failed: ${error.message}`);
  inventoryPanelHtml = "<!doctype html><title>Admin</title><p>Internal panel file missing.</p>";
}

/** Internal warehouse UI — only reachable on private networks (internal ALB / VPN / port-forward), never public. */
app.get("/", (_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  res.status(200).send(inventoryPanelHtml);
});

app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'");
  next();
});

app.use(express.json());

const authAttempts = new Map();

function getRateLimitKey(req) {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function authRateLimit(req, res, next) {
  const key = getRateLimitKey(req);
  const now = Date.now();
  const entry = authAttempts.get(key);

  if (!entry || now - entry.windowStart >= authRateLimitWindowMs) {
    authAttempts.set(key, { windowStart: now, count: 1 });
    return next();
  }

  if (entry.count >= authRateLimitMax) {
    const retryAfterSeconds = Math.ceil((authRateLimitWindowMs - (now - entry.windowStart)) / 1000);
    res.setHeader("Retry-After", String(Math.max(retryAfterSeconds, 1)));
    return res.status(429).json({
      error: "Too many admin auth attempts. Try again later."
    });
  }

  entry.count += 1;
  return next();
}

async function proxyJsonToAuth(authPath, req, res) {
  try {
    const body = JSON.stringify(req.body || {});
    const data = await requestJson(`${authServiceUrl}${authPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body
    });
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    const payload =
      error.body && typeof error.body === "object" ? error.body : { error: error.message || "Proxy failed" };
    return res.status(status).json(payload);
  }
}

app.post("/cognito-admin/login", authRateLimit, (req, res) => proxyJsonToAuth("/auth/cognito-admin/login", req, res));

app.post("/cognito-admin/respond-mfa", authRateLimit, (req, res) =>
  proxyJsonToAuth("/auth/cognito-admin/respond-mfa", req, res)
);

function requestJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObject = new URL(url);
    const transport = urlObject.protocol === "https:" ? https : http;

    const request = transport.request(
      {
        protocol: urlObject.protocol,
        hostname: urlObject.hostname,
        port: urlObject.port || (urlObject.protocol === "https:" ? 443 : 80),
        path: `${urlObject.pathname}${urlObject.search}`,
        method: options.method || "GET",
        headers: options.headers || {}
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          let body = {};
          if (raw) {
            try {
              body = JSON.parse(raw);
            } catch {
              body = { raw };
            }
          }

          const statusCode = response.statusCode || 500;
          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(`Request failed: ${statusCode}`);
            error.status = statusCode;
            error.body = body;
            return reject(error);
          }

          return resolve(body);
        });
      }
    );

    request.setTimeout(5000, () => {
      request.destroy(new Error("Request timeout"));
    });

    request.on("error", (error) => reject(error));

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

async function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({
      error: "Missing Authorization header"
    });
  }

  try {
    await requestJson(`${authServiceUrl}/auth/admin-check`, {
      method: "GET",
      headers: {
        Authorization: authHeader
      }
    });

    return next();
  } catch (error) {
    const status = error.status || 401;
    return res.status(status).json({
      error: "Admin authorization failed",
      details: error.body || error.message
    });
  }
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "admin",
    status: "ok"
  });
});

app.get("/admin/orders", requireAdmin, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  try {
    const data = await requestJson(`${checkoutServiceUrl}/orders`, {
      method: "GET",
      headers: {
        Authorization: authHeader
      }
    });
    return res.status(200).json(data);
  } catch (error) {
    const status = error.status || 500;
    return res.status(status).json({
      error: "Failed to load orders from checkout",
      details: error.body || error.message
    });
  }
});

app.get("/admin/products", requireAdmin, (_req, res) => {
  requestJson(`${catalogServiceUrl}/admin/products`)
    .then((data) => res.status(200).json(data))
    .catch((error) => {
      const status = error.status || 500;
      return res.status(status).json({
        error: "Failed to load products from catalog",
        details: error.body || error.message
      });
    });
});

app.post("/admin/products", requireAdmin, (req, res) => {
  requestJson(`${catalogServiceUrl}/admin/products`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  })
    .then((data) => res.status(201).json(data))
    .catch((error) => {
      const status = error.status || 500;
      return res.status(status).json({
        error: "Failed to add product in catalog",
        details: error.body || error.message
      });
    });
});

app.patch("/admin/products/:id/stock", requireAdmin, (req, res) => {
  requestJson(`${catalogServiceUrl}/admin/products/${encodeURIComponent(req.params.id)}/stock`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req.body || {})
  })
    .then((data) => res.status(200).json(data))
    .catch((error) => {
      const status = error.status || 500;
      return res.status(status).json({
        error: "Failed to update product stock in catalog",
        details: error.body || error.message
      });
    });
});

app.delete("/admin/products/:id", requireAdmin, (req, res) => {
  requestJson(`${catalogServiceUrl}/admin/products/${encodeURIComponent(req.params.id)}`, {
    method: "DELETE"
  })
    .then((data) => res.status(200).json(data))
    .catch((error) => {
      const status = error.status || 500;
      return res.status(status).json({
        error: "Failed to delete product in catalog",
        details: error.body || error.message
      });
    });
});

app.listen(port, () => {
  console.log(`Admin service is running on port ${port}`);
  console.log(`Using AUTH_SERVICE_URL=${authServiceUrl}`);
  console.log(`Using CHECKOUT_SERVICE_URL=${checkoutServiceUrl}`);
<<<<<<< HEAD
  console.log(`Using CATALOG_SERVICE_URL=${catalogServiceUrl}`);
=======
  console.log(`Using ADMIN_AUTH_RATE_LIMIT_WINDOW_MS=${authRateLimitWindowMs}`);
  console.log(`Using ADMIN_AUTH_RATE_LIMIT_MAX=${authRateLimitMax}`);
>>>>>>> maryam-branch
});
