const express = require("express");
const fs = require("fs/promises");
const path = require("path");
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand
} = require("@aws-sdk/client-sqs");

const app = express();
const port = Number(process.env.PORT) || 3004;
const invoicesDir = path.join(__dirname, "..", "invoices");
const awsRegion = process.env.AWS_REGION || "us-east-1";
const invoiceQueueUrl = process.env.INVOICE_QUEUE_URL || "";
const pollEnabled = String(process.env.INVOICE_SQS_POLL_ENABLED || "true") === "true";
let sqsClient = null;
let pollLoopStarted = false;

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

async function processInvoiceEvent(event, eventMode) {
  const validationError = validateInvoiceEvent(event);
  if (validationError) {
    console.error(`invoice_validation_failed reason=${validationError}`);
    throw new Error(validationError);
  }

  await ensureInvoicesDir();
  const fileName = `${event.orderId}.txt`;
  const outputPath = path.join(invoicesDir, fileName);
  const document = buildInvoiceDocument(event);
  await fs.writeFile(outputPath, document, "utf8");

  console.log(`invoice_processed orderId=${event.orderId} mode=${eventMode}`);
  console.log(`Invoice written: ${outputPath}`);
  console.log(`Simulated SES send to: ${event.email}`);

  return { fileName };
}

function getSqsClient() {
  if (!sqsClient) {
    sqsClient = new SQSClient({ region: awsRegion });
  }
  return sqsClient;
}

async function pollInvoiceQueue() {
  if (!pollEnabled || !invoiceQueueUrl) {
    return;
  }

  while (true) {
    try {
      const response = await getSqsClient().send(
        new ReceiveMessageCommand({
          QueueUrl: invoiceQueueUrl,
          MaxNumberOfMessages: 5,
          WaitTimeSeconds: 20,
          VisibilityTimeout: 30
        })
      );

      const messages = response.Messages || [];
      for (const message of messages) {
        let event = null;
        try {
          event = JSON.parse(message.Body || "{}");
        } catch (error) {
          console.error(`invoice_sqs_body_parse_failed error=${error.message}`);
        }

        if (event) {
          try {
            await processInvoiceEvent(event, "sqs-poller");
          } catch (error) {
            console.error(`invoice_processing_failed error=${error.message}`);
            continue;
          }
        }

        if (message.ReceiptHandle) {
          await getSqsClient().send(
            new DeleteMessageCommand({
              QueueUrl: invoiceQueueUrl,
              ReceiptHandle: message.ReceiptHandle
            })
          );
        }
      }
    } catch (error) {
      console.error(`invoice_sqs_poll_failed error=${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

app.get("/health", async (_req, res) => {
  await ensureInvoicesDir();
  res.status(200).json({
    service: "invoice-worker",
    status: "ok",
    sqsPoller: pollEnabled && Boolean(invoiceQueueUrl) ? "enabled" : "disabled"
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

  try {
    const { fileName } = await processInvoiceEvent(event, eventMode);

    return res.status(201).json({
      status: "processed",
      invoiceFile: fileName
    });
  } catch (error) {
    if (error.message && error.message.includes("required")) {
      return res.status(400).json({
        error: error.message
      });
    }

    console.error(`invoice_processing_failed error=${error.message}`);
    return res.status(500).json({
      error: "Failed to process invoice event"
    });
  }
});

app.listen(port, () => {
  console.log(`Invoice worker is running on port ${port}`);
  console.log(`Using AWS_REGION=${awsRegion}`);
  console.log(`Using INVOICE_QUEUE_URL=${invoiceQueueUrl || "(not set)"}`);
  console.log(`Using INVOICE_SQS_POLL_ENABLED=${pollEnabled}`);
  if (!pollLoopStarted && pollEnabled && invoiceQueueUrl) {
    pollLoopStarted = true;
    pollInvoiceQueue().catch((error) => {
      console.error(`invoice_sqs_poller_fatal error=${error.message}`);
    });
  }
});
