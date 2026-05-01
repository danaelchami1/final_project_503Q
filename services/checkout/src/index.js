const express = require("express");
const http = require("http");
const https = require("https");
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { Pool } = require("pg");

const app = express();
const port = Number(process.env.PORT) || 3003;

const cartBaseUrl = process.env.CART_SERVICE_URL || "http://127.0.0.1:3002";
const catalogBaseUrl = process.env.CATALOG_SERVICE_URL || "http://127.0.0.1:3001";
const invoiceWorkerUrl = process.env.INVOICE_WORKER_URL || "http://127.0.0.1:3004";
const authServiceUrl = process.env.AUTH_SERVICE_URL || "http://127.0.0.1:3005";
const awsRegion = process.env.AWS_REGION || "us-east-1";
const checkoutConfigSecretId = process.env.CHECKOUT_CONFIG_SECRET_ID || "";
const useAwsSecrets = String(process.env.USE_AWS_SECRETS || "false") === "true";
let invoiceQueueUrl = process.env.INVOICE_QUEUE_URL || "";
let invoiceMode = process.env.INVOICE_MODE || (invoiceQueueUrl ? "sqs" : "http");
let databaseUrl =
  process.env.DATABASE_URL ||
  `postgres://${process.env.POSTGRES_USER || "shopcloud"}:${process.env.POSTGRES_PASSWORD || "change-me-postgres"}@${process.env.POSTGRES_HOST || "127.0.0.1"}:${process.env.POSTGRES_PORT || "5432"}/${process.env.POSTGRES_DB || "shopcloud_orders"}`;

app.use(express.json());

const orders = [];
let dbPool = null;
let dbReady = false;
let sqsClient = null;
let secretsManagerClient = null;

function readBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== "string") {
    return null;
  }

  const [prefix, token] = authorizationHeader.split(" ");
  if (prefix !== "Bearer" || !token) {
    return null;
  }

  return token;
}

function getSecretsManagerClient() {
  if (!secretsManagerClient) {
    secretsManagerClient = new SecretsManagerClient({ region: awsRegion });
  }
  return secretsManagerClient;
}

async function loadAwsRuntimeConfig() {
  if (!useAwsSecrets || !checkoutConfigSecretId) {
    return;
  }

  const response = await getSecretsManagerClient().send(
    new GetSecretValueCommand({
      SecretId: checkoutConfigSecretId
    })
  );

  if (!response.SecretString) {
    throw new Error("checkout secret has empty SecretString");
  }

  const parsed = JSON.parse(response.SecretString);
  databaseUrl = parsed.DATABASE_URL || databaseUrl;
  invoiceQueueUrl = parsed.INVOICE_QUEUE_URL || invoiceQueueUrl;
  if (!process.env.INVOICE_MODE) {
    invoiceMode = invoiceQueueUrl ? "sqs" : "http";
  }
}

function poolOptionsForUrl(url) {
  const opts = { connectionString: url };
  // RDS Postgres commonly requires TLS; without ssl, pg_hba may reject the pod with "no encryption".
  if (url && String(url).includes("rds.amazonaws.com") && !/sslmode\s*=\s*disable/i.test(String(url))) {
    opts.ssl = { rejectUnauthorized: false };
  }
  return opts;
}

async function connectDatabase() {
  try {
    dbPool = new Pool(poolOptionsForUrl(databaseUrl));
    await dbPool.query("SELECT 1");
    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        items JSONB NOT NULL,
        total NUMERIC(12, 2) NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    dbReady = true;
    console.log(`Connected to Postgres at ${databaseUrl}`);
  } catch (error) {
    dbReady = false;
    dbPool = null;
    console.error("Postgres unavailable, using in-memory orders:", error.message);
  }
}

async function saveOrder(order) {
  if (!dbReady || !dbPool) {
    orders.push(order);
    return;
  }

  await dbPool.query(
    `
      INSERT INTO orders (id, user_id, email, items, total, status, created_at)
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
    `,
    [
      order.id,
      order.userId,
      order.email,
      JSON.stringify(order.items),
      order.total,
      order.status,
      order.createdAt
    ]
  );
}

async function getAllOrders() {
  if (!dbReady || !dbPool) {
    return orders;
  }

  const result = await dbPool.query(`
    SELECT id, user_id, email, items, total, status, created_at
    FROM orders
    ORDER BY created_at DESC
  `);

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    email: row.email,
    items: row.items,
    total: Number(row.total),
    status: row.status,
    createdAt: row.created_at
  }));
}

function createOrderId() {
  return `ord-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function buildInvoiceEvent(order) {
  return {
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
}

async function triggerInvoice(event) {
  const useSqs = invoiceMode === "sqs" && invoiceQueueUrl;
  if (useSqs) {
    if (!sqsClient) {
      sqsClient = new SQSClient({ region: awsRegion });
    }
    await sqsClient.send(
      new SendMessageCommand({
        QueueUrl: invoiceQueueUrl,
        MessageBody: JSON.stringify(event)
      })
    );
    return { mode: "sqs", queued: true };
  }

  await fetchJson(`${invoiceWorkerUrl}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(event)
  });

  return { mode: "http", queued: true };
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

async function requireAuth(req, res, next) {
  const token = readBearerToken(req.headers.authorization);
  if (!token) {
    return res.status(401).json({
      error: "Missing or invalid Authorization header"
    });
  }

  try {
    const response = await fetchJson(`${authServiceUrl}/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    req.session = response.user;
    req.accessToken = token;
    return next();
  } catch (error) {
    return res.status(error.status || 401).json({
      error: "Authentication failed",
      details: error.body || error.message
    });
  }
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.role !== "admin") {
    return res.status(403).json({
      error: "Requires admin role"
    });
  }
  return next();
}

app.get("/health", (_req, res) => {
  res.status(200).json({
    service: "checkout",
    status: "ok"
  });
});

app.get("/orders", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const allOrders = await getAllOrders();
    res.status(200).json(allOrders);
  } catch (error) {
    console.error("Failed to read orders:", error.message);
    res.status(500).json({
      error: "Failed to fetch orders"
    });
  }
});

app.post("/checkout", requireAuth, async (req, res) => {
  try {
    const { userId: requestedUserId, email: requestedEmail } = req.body || {};
    const isAdmin = req.session.role === "admin";
    const userId = isAdmin && requestedUserId ? requestedUserId : req.session.id;
    const email = isAdmin && requestedEmail ? requestedEmail : req.session.email;

    if (!userId || typeof userId !== "string") {
      return res.status(400).json({ error: "Unable to resolve checkout user id from token" });
    }
    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Unable to resolve checkout email from token" });
    }
    const trimmedEmail = email.trim();
    if (!trimmedEmail.includes("@") || trimmedEmail === "unknown") {
      return res.status(400).json({
        error:
          "Your account does not have a usable email for invoices. Sign in with an email address (or complete email verification in Cognito)."
      });
    }

    const cartResponse = await fetchJson(`${cartBaseUrl}/cart/${userId}`, {
      headers: { Authorization: `Bearer ${req.accessToken}` }
    });
    const cartItems = cartResponse.items || [];

    if (!Array.isArray(cartItems) || cartItems.length === 0) {
      return res.status(400).json({
        error: "Cart is empty"
      });
    }

    const reserveResponse = await fetchJson(`${catalogBaseUrl}/internal/checkout/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cartItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity
        }))
      })
    });
    const pricedItems = Array.isArray(reserveResponse.items) ? reserveResponse.items : [];
    if (pricedItems.length === 0) {
      return res.status(409).json({
        error: "Checkout failed because inventory is no longer available"
      });
    }

    const total = pricedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const roundedTotal = Number(total.toFixed(2));

    // MVP behavior: simulated payment always succeeds.
    const order = {
      id: createOrderId(),
      userId,
      email: trimmedEmail,
      items: pricedItems,
      total: roundedTotal,
      status: "confirmed",
      createdAt: new Date().toISOString()
    };

    await saveOrder(order);

    await fetchJson(`${cartBaseUrl}/cart/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${req.accessToken}` }
    });

    const invoiceEvent = buildInvoiceEvent(order);

    res.status(201).json({
      orderId: order.id,
      status: order.status,
      total: order.total
    });

    // Do not await: SQS/HTTP invoice work must not delay the checkout HTTP response.
    void triggerInvoice(invoiceEvent)
      .then((invoiceResult) => {
        console.log("Invoice trigger result:", invoiceResult);
      })
      .catch((workerError) => {
        console.error("Invoice trigger failed:", workerError.message);
      });
  } catch (error) {
    const status = error.status || 500;
    const message =
      status === 404
        ? "Dependent data not found (cart item or product)"
        : status === 409
          ? "Insufficient stock for one or more items in your cart"
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
  loadAwsRuntimeConfig()
    .then(() => connectDatabase())
    .catch((error) => {
      console.error(`AWS secret load failed, continuing with env config: ${error.message}`);
      return connectDatabase();
    })
    .finally(() => {
      console.log(`Checkout service is running on port ${port}`);
      console.log(`Using CART_SERVICE_URL=${cartBaseUrl}`);
      console.log(`Using CATALOG_SERVICE_URL=${catalogBaseUrl}`);
      console.log(`Using INVOICE_WORKER_URL=${invoiceWorkerUrl}`);
      console.log(`Using AUTH_SERVICE_URL=${authServiceUrl}`);
      console.log(`Using INVOICE_MODE=${invoiceMode}`);
      console.log(`Using INVOICE_QUEUE_URL=${invoiceQueueUrl || "(not set)"}`);
      console.log(`Using AWS_REGION=${awsRegion}`);
      console.log(`Using USE_AWS_SECRETS=${useAwsSecrets}`);
      console.log(`Using CHECKOUT_CONFIG_SECRET_ID=${checkoutConfigSecretId || "(not set)"}`);
      console.log(`Using DATABASE_URL=${databaseUrl}`);
    });
});
