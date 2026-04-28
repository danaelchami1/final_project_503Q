const express = require("express");
const http = require("http");
const https = require("https");

const app = express();
const port = Number(process.env.PORT) || 3006;
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";

app.use(express.json());

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
});
