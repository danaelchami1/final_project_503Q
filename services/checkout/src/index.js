const express = require("express");
const http = require("http");
const https = require("https");

const app = express();
const port = Number(process.env.PORT) || 3003;

const cartBaseUrl = process.env.CART_SERVICE_URL || "http://127.0.0.1:3002";
const catalogBaseUrl = process.env.CATALOG_SERVICE_URL || "http://127.0.0.1:3001";
const invoiceWorkerUrl = process.env.INVOICE_WORKER_URL || "http://127.0.0.1:3004";

app.use(express.json());

const orders = [];

function createOrderId() {
  return `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
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

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "checkout",
    status: "ok"
  });
});

app.get("/orders", (_req, res) => {
  res.status(200).json(orders);
});

app.post("/checkout", async (req, res) => {
  try {
    const { userId, email } = req.body || {};

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({
        error: "userId is required and must be a string"
      });
    }

    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: "email is required and must be a string"
      });
    }

    const cartResponse = await fetchJson(`${cartBaseUrl}/cart/${userId}`);
    const cartItems = cartResponse.items || [];

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        error: "Cart is empty"
      });
    }

    const pricedItems = await Promise.all(
      cartItems.map(async (item) => {
        const product = await fetchJson(`${catalogBaseUrl}/products/${item.productId}`);

        return {
          productId: item.productId,
          name: product.name,
          quantity: item.quantity,
          unitPrice: Number(product.price),
          lineTotal: Number(product.price) * item.quantity
        };
      })
    );

    const total = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const roundedTotal = Number(total.toFixed(2));

    // MVP behavior: simulated payment always succeeds.
    const order = {
      id: createOrderId(),
      userId,
      email,
      items: pricedItems,
      total: roundedTotal,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };

    orders.push(order);

    await fetchJson(`${cartBaseUrl}/cart/${userId}`, {
      method: "DELETE"
    });

    const invoiceEvent = {
      eventType: "order.confirmed",
      orderId: order.id,
      userId: order.userId,
      email: order.email,
      total: order.total,
      currency: "USD",
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice
      })),
      timestamp: new Date().toISOString()
    };

    // For now we log the event. Later this becomes SQS publish.
    console.log("Invoice event:", JSON.stringify(invoiceEvent));
    try {
      await fetchJson(`${invoiceWorkerUrl}/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(invoiceEvent)
      });
    } catch (workerError) {
      // Checkout remains successful even if invoice processing is temporarily unavailable.
      console.error("Invoice worker call failed:", workerError.message);
    }

    return res.status(201).json({
      orderId: order.id,
      status: order.status,
      total: order.total
    });
  } catch (error) {
    const status = error.status || 500;
    const message =
      status === 404
        ? "Dependent data not found (cart item or product)"
        : "Checkout failed";

    console.error("Checkout error:", {
      message: error.message,
      status: error.status || null,
      body: error.body || null
    });

    return res.status(status).json({
      error: message,
      details: error.body || error.message || null
    });
  }
});

app.listen(port, () => {
  console.log(`Checkout service is running on port ${port}`);
  console.log(`Using CART_SERVICE_URL=${cartBaseUrl}`);
  console.log(`Using CATALOG_SERVICE_URL=${catalogBaseUrl}`);
  console.log(`Using INVOICE_WORKER_URL=${invoiceWorkerUrl}`);
});
