const fs = require("fs/promises");
const path = require("path");

const BASE_CANDIDATES = process.env.SMOKE_BASE_URL
  ? [process.env.SMOKE_BASE_URL]
  : ["http://127.0.0.1", "http://localhost"];
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS || 5000);
const HEALTH_RETRIES = Number(process.env.SMOKE_HEALTH_RETRIES || 20);
const HEALTH_RETRY_DELAY_MS = Number(process.env.SMOKE_HEALTH_RETRY_DELAY_MS || 2000);
let BASE = BASE_CANDIDATES[0];

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let response;
  let text = "";

  try {
    response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    text = await response.text();
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms: ${url}`);
    }
    throw new Error(`Request failed for ${url}: ${error.message}`);
  } finally {
    clearTimeout(timeout);
  }

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
    console.log(`Checking health: ${service.name}`);
    let health = null;
    let lastError = null;

    for (let attempt = 1; attempt <= HEALTH_RETRIES; attempt += 1) {
      try {
        health = await requestJson(`${BASE}:${service.port}/health`);
        if (health.status === "ok") {
          break;
        }
        lastError = new Error(`${service.name} health is not ok`);
      } catch (error) {
        lastError = error;
      }

      if (attempt < HEALTH_RETRIES) {
        await wait(HEALTH_RETRY_DELAY_MS);
      }
    }

    if (!health || health.status !== "ok") {
      throw new Error(
        `${service.name} health check failed after ${HEALTH_RETRIES} attempts: ${lastError?.message || "unknown error"}`
      );
    }
    console.log(`Health ok: ${service.name}`);
  }
}

async function selectReachableBase() {
  for (const candidate of BASE_CANDIDATES) {
    try {
      await requestJson(`${candidate}:3001/health`);
      BASE = candidate;
      console.log(`Using base URL: ${BASE}`);
      return;
    } catch (_error) {
      // Try next candidate.
    }
  }

  throw new Error(
    `Could not reach services on any base URL: ${BASE_CANDIDATES.join(", ")}`
  );
}

async function runFlow() {
  try {
    const login = await requestJson(`${BASE}:3005/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "customer@example.com",
        password: "customer123"
      })
    });

    if (login.accessToken) {
      console.log("Login ok");
    } else {
      console.log("Login skipped (no access token returned)");
    }
  } catch (error) {
    if (String(error.message).includes("Local login disabled in Cognito mode")) {
      console.log("Login skipped (Cognito mode)");
    } else {
      throw error;
    }
  }

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
    `${checkout.orderId}.pdf`
  );
  const invoiceContent = await fs.readFile(invoicePath);

  const pdfSignature = invoiceContent.subarray(0, 4).toString("utf8");
  if (pdfSignature !== "%PDF") {
    throw new Error("Invoice file is not a valid PDF");
  }

  console.log(`Invoice generated: ${invoicePath}`);
  console.log("Invoice trigger verified (file or queue path)");
}

async function main() {
  console.log("Running ShopCloud smoke test...");
  await selectReachableBase();
  await assertHealthChecks();
  await runFlow();
  console.log("Smoke test passed.");
}

main().catch((error) => {
  console.error("Smoke test failed:", error.message);
  process.exit(1);
});
