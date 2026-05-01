const express = require("express");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");

const app = express();
const port = Number(process.env.PORT) || 3006;
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";
const checkoutServiceUrl = process.env.CHECKOUT_SERVICE_URL || "http://127.0.0.1:3003";

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

app.use(express.json());

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

app.post("/cognito-admin/login", (req, res) => proxyJsonToAuth("/auth/cognito-admin/login", req, res));

app.post("/cognito-admin/respond-mfa", (req, res) => proxyJsonToAuth("/auth/cognito-admin/respond-mfa", req, res));

// MVP in-memory inventory store managed by admins.
const inventory = [
  {
    id: "p-1001",
    name: "ShopCloud Hoodie",
    category: "apparel",
    price: 59.99,
    stock: 120
  },
  {
    id: "p-1002",
    name: "Mechanical Keyboard",
    category: "electronics",
    price: 89.0,
    stock: 45
  }
];

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
  return res.status(200).json(inventory);
});

app.post("/admin/products", requireAdmin, (req, res) => {
  const { id, name, category, price, stock } = req.body || {};
  if (!id || !name || !category || typeof price !== "number" || !Number.isInteger(stock)) {
    return res.status(400).json({
      error: "id, name, category, numeric price, and integer stock are required"
    });
  }

  if (inventory.some((item) => item.id === id)) {
    return res.status(409).json({
      error: "Product id already exists"
    });
  }

  const product = { id, name, category, price, stock };
  inventory.push(product);

  return res.status(201).json(product);
});

app.patch("/admin/products/:id/stock", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { stock } = req.body || {};
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({
      error: "stock must be a non-negative integer"
    });
  }

  const product = inventory.find((item) => item.id === id);
  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  product.stock = stock;
  return res.status(200).json(product);
});

app.delete("/admin/products/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const index = inventory.findIndex((item) => item.id === id);
  if (index === -1) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  const [deleted] = inventory.splice(index, 1);
  return res.status(200).json({
    deleted
  });
});

app.listen(port, () => {
  console.log(`Admin service is running on port ${port}`);
  console.log(`Using AUTH_SERVICE_URL=${authServiceUrl}`);
  console.log(`Using CHECKOUT_SERVICE_URL=${checkoutServiceUrl}`);
});
