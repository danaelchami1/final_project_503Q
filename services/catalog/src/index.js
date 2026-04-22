const express = require("express");
const { products } = require("./data/products");

const app = express();
const port = Number(process.env.PORT) || 3001;

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
  const product = products.find((item) => item.id === req.params.id);

  if (!product) {
    return res.status(404).json({
      error: "Product not found"
    });
  }

  return res.status(200).json(product);
});

app.listen(port, () => {
  console.log(`Catalog service is running on port ${port}`);
});
