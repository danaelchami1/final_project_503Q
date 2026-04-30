const express = require("express");
const {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand
} = require("@aws-sdk/client-sqs");
const {
  awsRegion,
  ensureInvoicesDir,
  processInvoiceEvent,
  extractInvoiceEvent,
  detectEventMode
} = require("./processor");

const app = express();
const port = Number(process.env.PORT) || 3004;
const invoiceQueueUrl = process.env.INVOICE_QUEUE_URL || "";
const pollEnabled = String(process.env.INVOICE_SQS_POLL_ENABLED || "true") === "true";
let sqsClient = null;
let pollLoopStarted = false;

app.use(express.json());

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
