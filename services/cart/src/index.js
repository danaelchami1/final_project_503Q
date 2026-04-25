const express = require("express");

const app = express();
const port = Number(process.env.PORT) || 3002;

app.use(express.json());

// In-memory cart store for MVP. Replace with Redis/Postgres later.
const cartsByUser = new Map();

function getUserCart(userId) {
  if (!cartsByUser.has(userId)) {
    cartsByUser.set(userId, []);
  }

  return cartsByUser.get(userId);
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

app.get("/cart/:userId", (req, res) => {
  const { userId } = req.params;
  const items = getUserCart(userId);

  return res.status(200).json({
    userId,
    items
  });
});

app.post("/cart/:userId/items", (req, res) => {
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

  const cart = getUserCart(userId);
  const existing = cart.find((item) => item.productId === productId);

  if (existing) {
    existing.quantity += parsedQuantity;
  } else {
    cart.push({ productId, quantity: parsedQuantity });
  }

  return res.status(201).json({
    userId,
    items: cart
  });
});

app.delete("/cart/:userId/items/:productId", (req, res) => {
  const { userId, productId } = req.params;
  const cart = getUserCart(userId);
  const nextCart = cart.filter((item) => item.productId !== productId);

  if (nextCart.length === cart.length) {
    return res.status(404).json({
      error: "Product is not in cart"
    });
  }

  cartsByUser.set(userId, nextCart);

  return res.status(200).json({
    userId,
    items: nextCart
  });
});

app.delete("/cart/:userId", (req, res) => {
  const { userId } = req.params;
  cartsByUser.set(userId, []);

  return res.status(200).json({
    userId,
    items: []
  });
});

app.listen(port, () => {
  console.log(`Cart service is running on port ${port}`);
});
