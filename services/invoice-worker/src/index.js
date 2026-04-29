const express = require("express");
const fs = require("fs/promises");
const path = require("path");

const app = express();
const port = Number(process.env.PORT) || 3004;
const invoicesDir = path.join(__dirname, "..", "invoices");

app.use(express.json());

async function ensureInvoicesDir() {
  await fs.mkdir(invoicesDir, { recursive: true });
}

function validateInvoiceEvent(payload) {
  if (!payload || typeof payload !== "object") {
    return "Payload must be an object";
  }

  if (!payload.orderId || typeof payload.orderId !== "string") {
    return "orderId is required and must be a string";
  }

  if (!payload.email || typeof payload.email !== "string") {
    return "email is required and must be a string";
  }

  if (!Array.isArray(payload.items)) {
    return "items is required and must be an array";
  }

  if (typeof payload.total !== "number") {
    return "total is required and must be a number";
  }

  return null;
}

function buildInvoiceDocument(event) {
  const lines = [];
  lines.push("ShopCloud Invoice");
  lines.push("=================");
  lines.push(`Order ID: ${event.orderId}`);
  lines.push(`User ID: ${event.userId || "unknown"}`);
  lines.push(`Email: ${event.email}`);
  lines.push(`Currency: ${event.currency || "USD"}`);
  lines.push(`Created At: ${event.timestamp || new Date().toISOString()}`);
  lines.push("");
  lines.push("Items:");

  event.items.forEach((item, index) => {
    lines.push(
      `${index + 1}. productId=${item.productId}, qty=${item.quantity}, unitPrice=${item.unitPrice}`
    );
  });

  lines.push("");
  lines.push(`Total: ${event.total}`);
  lines.push("");
  lines.push("Status: Generated (MVP local file)");

  return lines.join("\n");
}

function extractInvoiceEvent(payload) {
  if (
    payload &&
    Array.isArray(payload.Records) &&
    payload.Records.length > 0 &&
    payload.Records[0].body
  ) {
    try {
      return JSON.parse(payload.Records[0].body);
    } catch {
      return null;
    }
  }

  return payload;
}

function detectEventMode(payload) {
  return payload && Array.isArray(payload.Records) ? "sqs" : "http";
}

app.get("/health", async (_req, res) => {
  await ensureInvoicesDir();
  res.status(200).json({
    service: "invoice-worker",
    status: "ok"
  });
});

app.post("/events", async (req, res) => {
  const eventMode = detectEventMode(req.body);
  const event = extractInvoiceEvent(req.body);
  if (!event) {
    return res.status(400).json({
      error: "Invalid event wrapper format"
    });
  }

  const validationError = validateInvoiceEvent(event);
  if (validationError) {
    console.error(`invoice_validation_failed reason=${validationError}`);
    return res.status(400).json({
      error: validationError
    });
  }

  try {
    await ensureInvoicesDir();
    const fileName = `${event.orderId}.txt`;
    const outputPath = path.join(invoicesDir, fileName);
    const document = buildInvoiceDocument(event);
    await fs.writeFile(outputPath, document, "utf8");

    console.log(`invoice_processed orderId=${event.orderId} mode=${eventMode}`);
    console.log(`Invoice written: ${outputPath}`);
    console.log(`Simulated SES send to: ${event.email}`);

    return res.status(201).json({
      status: "processed",
      invoiceFile: fileName
    });
  } catch (error) {
    console.error(`invoice_processing_failed error=${error.message}`);
    return res.status(500).json({
      error: "Failed to process invoice event"
    });
  }
});

app.listen(port, () => {
  console.log(`Invoice worker is running on port ${port}`);
});
