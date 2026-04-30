const express = require("express");
const http = require("http");
const https = require("https");
const path = require("path");

const app = express();
const port = Number(process.env.PORT) || 3000;
const catalogBaseUrl = process.env.CATALOG_SERVICE_URL || "http://127.0.0.1:3001";
const cartBaseUrl = process.env.CART_SERVICE_URL || "http://127.0.0.1:3002";
const checkoutBaseUrl = process.env.CHECKOUT_SERVICE_URL || "http://127.0.0.1:3003";
const authBaseUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";

app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

function buildAuthHeader(req) {
  const authorization = req.headers.authorization;
  if (!authorization || typeof authorization !== "string") {
    return {};
  }
  return { Authorization: authorization };
}

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

    request.setTimeout(5000, () => request.destroy(new Error("Request timeout")));
    request.on("error", reject);
    if (options.body) {
      request.write(options.body);
    }
    request.end();
  });
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "frontend",
    status: "ok"
  });
});

app.get("/api/products", async (req, res) => {
  try {
    const query = req.query.category ? `?category=${encodeURIComponent(req.query.category)}` : "";
    const data = await requestJson(`${catalogBaseUrl}/products${query}`);
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.get("/api/cart/:userId", async (req, res) => {
  try {
    const data = await requestJson(`${cartBaseUrl}/cart/${req.params.userId}`, {
      headers: {
        ...buildAuthHeader(req)
      }
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.post("/api/cart/:userId/items", async (req, res) => {
  try {
    const data = await requestJson(`${cartBaseUrl}/cart/${req.params.userId}/items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeader(req) },
      body: JSON.stringify(req.body || {})
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.delete("/api/cart/:userId", async (req, res) => {
  try {
    const data = await requestJson(`${cartBaseUrl}/cart/${req.params.userId}`, {
      method: "DELETE",
      headers: {
        ...buildAuthHeader(req)
      }
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.post("/api/checkout", async (req, res) => {
  try {
    const data = await requestJson(`${checkoutBaseUrl}/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...buildAuthHeader(req) },
      body: JSON.stringify(req.body || {})
    });
    res.status(201).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const data = await requestJson(`${authBaseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body || {})
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const data = await requestJson(`${checkoutBaseUrl}/orders`, {
      headers: {
        ...buildAuthHeader(_req)
      }
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.get("/api/auth/me", async (req, res) => {
  try {
    const data = await requestJson(`${authBaseUrl}/auth/me`, {
      headers: {
        ...buildAuthHeader(req)
      }
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.get("/api/auth/admin-check", async (req, res) => {
  try {
    const data = await requestJson(`${authBaseUrl}/auth/admin-check`, {
      headers: {
        ...buildAuthHeader(req)
      }
    });
    res.status(200).json(data);
  } catch (error) {
    res.status(error.status || 500).json(error.body || { error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Frontend service is running on port ${port}`);
});
