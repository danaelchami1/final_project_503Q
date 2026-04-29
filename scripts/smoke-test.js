const fs = require("fs/promises");
const path = require("path");

const BASE = "http://127.0.0.1";

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${url}: ${JSON.stringify(body)}`);
  }

  return body;
}

async function assertHealthChecks() {
  const services = [
    { name: "catalog", port: 3001 },
    { name: "cart", port: 3002 },
    { name: "checkout", port: 3003 },
    { name: "invoice-worker", port: 3004 },
    { name: "auth", port: 3005 },
    { name: "admin", port: 3006 }
  ];

  for (const service of services) {
    const health = await requestJson(`${BASE}:${service.port}/health`);
    if (health.status !== "ok") {
      throw new Error(`${service.name} health is not ok`);
    }
    console.log(`Health ok: ${service.name}`);
  }
}

async function runFlow() {
  const login = await requestJson(`${BASE}:3005/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "customer@example.com",
      password: "customer123"
    })
  });

  if (!login.accessToken) {
    throw new Error("Login did not return access token");
  }
  console.log("Login ok");

  const userId = "u1";

  await requestJson(`${BASE}:3002/cart/${userId}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      productId: "p-1001",
      quantity: 2
    })
  });
  console.log("Add to cart ok");

  const checkout = await requestJson(`${BASE}:3003/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      email: "customer@example.com"
    })
  });

  if (!checkout.orderId) {
    throw new Error("Checkout did not return orderId");
  }
  console.log(`Checkout ok: ${checkout.orderId}`);

  // Give invoice worker a short time slice to write the file.
  await wait(1000);

  const invoicePath = path.join(
    __dirname,
    "..",
    "services",
    "invoice-worker",
    "invoices",
    `${checkout.orderId}.txt`
  );
  const invoiceContent = await fs.readFile(invoicePath, "utf8");

  if (!invoiceContent.includes("ShopCloud Invoice")) {
    throw new Error("Invoice file does not contain expected header");
  }

  console.log(`Invoice generated: ${invoicePath}`);
  console.log("Invoice trigger verified (file or queue path)");
}

async function main() {
  console.log("Running ShopCloud smoke test...");
  await assertHealthChecks();
  await runFlow();
  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
