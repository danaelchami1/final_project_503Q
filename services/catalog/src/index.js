const express = require("express");
const { createClient } = require("redis");
const { products } = require("./data/products");

const app = express();
const port = Number(process.env.PORT) || 3001;
const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const redisTlsRejectUnauthorized = String(process.env.REDIS_TLS_REJECT_UNAUTHORIZED || "true") !== "false";
const inventoryKey = "catalog:inventory:v1";

const inventory = products.map((item) => ({ ...item }));
let redisClient = null;
let redisReady = false;

app.use(express.json());

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
      console.error("Catalog Redis client error:", error.message);
    });
    await redisClient.connect();
    redisReady = true;
    console.log(`Catalog connected to Redis at ${redisUrl}`);
  } catch (error) {
    redisReady = false;
    redisClient = null;
    console.error("Catalog Redis unavailable, using in-memory inventory:", error.message);
  }
}

async function loadInventory() {
  if (!redisReady || !redisClient) {
    return inventory;
  }
  try {
    const raw = await redisClient.get(inventoryKey);
    if (!raw) {
      await redisClient.set(inventoryKey, JSON.stringify(inventory));
      return inventory;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      await redisClient.set(inventoryKey, JSON.stringify(inventory));
      return inventory;
    }
    return parsed;
  } catch (error) {
    console.error("catalog_inventory_load_failed:", error.message);
    return inventory;
  }
}

async function saveInventory(items) {
  if (!redisReady || !redisClient) {
    inventory.splice(0, inventory.length, ...items);
    return;
  }
  await redisClient.set(inventoryKey, JSON.stringify(items));
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "catalog",
    status: "ok"
  });
});

app.get("/products", async (req, res) => {
  const category = req.query.category;
  const items = await loadInventory();

  if (!category) {
    return res.status(200).json(items);
  }

  const filtered = items.filter(
    (product) => product.category.toLowerCase() === String(category).toLowerCase()
  );

  return res.status(200).json(filtered);
});

app.get("/products/:id", async (req, res) => {
  const items = await loadInventory();
  const product = items.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  return res.status(200).json(product);
});

// Internal inventory management endpoints (called by admin service).
app.get("/admin/products", async (_req, res) => {
  const items = await loadInventory();
  return res.status(200).json(items);
});

app.post("/admin/products", async (req, res) => {
  const { id, name, category, price, stock, currency, imageUrl } = req.body || {};
  if (!id || !name || !category || typeof price !== "number" || !Number.isInteger(stock)) {
    return res.status(400).json({
      error: "id, name, category, numeric price, and integer stock are required"
    });
  }

  const items = await loadInventory();
  if (items.some((item) => item.id === id)) {
    return res.status(409).json({
      error: "Product id already exists"
    });
  }

  const product = {
    id,
    name,
    category,
    price,
    stock,
    currency: currency || "USD",
    imageUrl: imageUrl || ""
  };
  items.push(product);
  await saveInventory(items);

  return res.status(201).json(product);
});

app.patch("/admin/products/:id/stock", async (req, res) => {
  const { id } = req.params;
  const { stock } = req.body || {};
  if (!Number.isInteger(stock) || stock < 0) {
    return res.status(400).json({
      error: "stock must be a non-negative integer"
    });
  }

  const items = await loadInventory();
  const product = items.find((item) => item.id === id);
  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  product.stock = stock;
  await saveInventory(items);
  return res.status(200).json(product);
});

app.delete("/admin/products/:id", async (req, res) => {
  const { id } = req.params;
  const items = await loadInventory();
  const index = items.findIndex((item) => item.id === id);
  if (index === -1) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  const [deleted] = items.splice(index, 1);
  await saveInventory(items);
  return res.status(200).json({
    deleted
  });
});

connectRedis().finally(async () => {
  await loadInventory();
  app.listen(port, () => {
    console.log(`Catalog service is running on port ${port}`);
  });
});
