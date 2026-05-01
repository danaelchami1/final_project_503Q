const express = require("express");
const { products } = require("./data/products");

const app = express();
const port = Number(process.env.PORT) || 3001;
const inventory = products;

app.use(express.json());

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "catalog",
    status: "ok"
  });
});

app.get("/products", (req, res) => {
  const category = req.query.category;

  if (!category) {
    return res.status(200).json(products);
  }

  const filtered = products.filter(
    (product) => product.category.toLowerCase() === String(category).toLowerCase()
  );

  return res.status(200).json(filtered);
});

app.get("/products/:id", (req, res) => {
  const product = inventory.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  return res.status(200).json(product);
});

// Internal inventory management endpoints (called by admin service).
app.get("/admin/products", (_req, res) => {
  return res.status(200).json(inventory);
});

app.post("/admin/products", (req, res) => {
  const { id, name, category, price, stock, currency, imageUrl } = req.body || {};
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

  const product = {
    id,
    name,
    category,
    price,
    stock,
    currency: currency || "USD",
    imageUrl: imageUrl || ""
  };
  inventory.push(product);

  return res.status(201).json(product);
});

app.patch("/admin/products/:id/stock", (req, res) => {
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

app.delete("/admin/products/:id", (req, res) => {
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
  console.log(`Catalog service is running on port ${port}`);
});
