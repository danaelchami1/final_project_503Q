const fs = require("fs/promises");
const path = require("path");
const PDFDocument = require("pdfkit");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendRawEmailCommand } = require("@aws-sdk/client-ses");

const localInvoicesDir = path.join(__dirname, "..", "invoices");
const awsRegion = process.env.AWS_REGION || "us-east-1";
const invoiceBucketName = process.env.INVOICE_BUCKET_NAME || "";
const sesFromEmail = process.env.SES_FROM_EMAIL || "";
const enableS3Upload = String(process.env.INVOICE_S3_UPLOAD_ENABLED || "true") === "true";
const enableSesSend = String(process.env.INVOICE_SES_SEND_ENABLED || "true") === "true";

let s3Client = null;
let sesClient = null;

function getS3Client() {
  if (!s3Client) {
    s3Client = new S3Client({ region: awsRegion });
  }
  return s3Client;
}

function getSesClient() {
  if (!sesClient) {
    sesClient = new SESClient({ region: awsRegion });
  }
  return sesClient;
}

async function ensureInvoicesDir() {
  const invoicesDir = process.env.AWS_LAMBDA_FUNCTION_NAME ? "/tmp/invoices" : localInvoicesDir;
  await fs.mkdir(invoicesDir, { recursive: true });
  return invoicesDir;
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

function createInvoicePdfBuffer(event) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(20).text("ShopCloud Invoice", { underline: true });
    doc.moveDown();
    doc.fontSize(12);
    doc.text(`Order ID: ${event.orderId}`);
    doc.text(`User ID: ${event.userId || "unknown"}`);
    doc.text(`Email: ${event.email}`);
    doc.text(`Currency: ${event.currency || "USD"}`);
    doc.text(`Created At: ${event.timestamp || new Date().toISOString()}`);
    doc.moveDown();
    doc.text("Items:");
    doc.moveDown(0.5);

    event.items.forEach((item, index) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      const lineTotal = Number((quantity * unitPrice).toFixed(2));
      doc.text(
        `${index + 1}. productId=${item.productId} qty=${quantity} unitPrice=${unitPrice.toFixed(2)} total=${lineTotal.toFixed(2)}`
      );
    });

    doc.moveDown();
    doc.fontSize(13).text(`Total: ${Number(event.total).toFixed(2)} ${(event.currency || "USD").toUpperCase()}`);
    doc.moveDown();
    doc.fontSize(10).text("Status: Generated");
    doc.end();
  });
}

async function uploadToS3(fileName, fileBuffer) {
  if (!enableS3Upload || !invoiceBucketName) {
    return null;
  }

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: invoiceBucketName,
      Key: `invoices/${fileName}`,
      Body: fileBuffer,
      ContentType: "application/pdf"
    })
  );

  return `s3://${invoiceBucketName}/invoices/${fileName}`;
}

function buildRawEmail({ toEmail, attachmentName, attachmentBuffer, s3Uri }) {
  const mixedBoundary = `shopcloud-mixed-${Date.now()}`;
  const altBoundary = `shopcloud-alt-${Date.now()}`;
  const attachmentBase64 = attachmentBuffer.toString("base64");
  const orderLabel = attachmentName.replace(".pdf", "");
  const subject = `ShopCloud order confirmation - ${orderLabel}`;
  const sentAt = new Date().toUTCString();
  const messageId = `<${Date.now()}.${Math.random().toString(16).slice(2)}@shopcloud.win>`;
  const textBody = [
    "Hi there,",
    "",
    "Thank you for shopping with ShopCloud.",
    "",
    `We have received your order (${orderLabel}).`,
    `Your invoice is attached as ${attachmentName}.`,
    "Your order is now being processed and we will notify you if there are any updates.",
    "",
    "Best regards,",
    "ShopCloud Team",
    s3Uri ? `Archive URI: ${s3Uri}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const htmlBody = [
    "<!doctype html>",
    '<html><body style="margin:0;padding:0;background:#f6f4fb;font-family:Arial,sans-serif;color:#2b2142;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">',
    "<tr><td align=\"center\">",
    '<table role="presentation" width="620" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #e8def8;border-radius:12px;overflow:hidden;">',
    '<tr><td style="background:#5f33a8;color:#ffffff;padding:16px 20px;font-size:20px;font-weight:700;">ShopCloud</td></tr>',
    '<tr><td style="padding:20px;">',
    '<p style="margin:0 0 12px;">Hi there,</p>',
    '<p style="margin:0 0 12px;">Thank you for shopping with ShopCloud.</p>',
    `<p style="margin:0 0 12px;">We have received your order <strong>${orderLabel}</strong>.</p>`,
    `<p style="margin:0 0 12px;">Your invoice is attached as <strong>${attachmentName}</strong>.</p>`,
    '<p style="margin:0 0 12px;">Your order is now being processed and we will notify you if there are any updates.</p>',
    s3Uri ? `<p style="margin:0 0 12px;color:#6b4fa6;">Archive URI: ${s3Uri}</p>` : "",
    '<p style="margin:16px 0 0;">Best regards,<br/>ShopCloud Team</p>',
    "</td></tr>",
    "</table>",
    "</td></tr>",
    "</table>",
    "</body></html>"
  ]
    .filter(Boolean)
    .join("");

  return [
    `From: ShopCloud <${sesFromEmail}>`,
    `To: ${toEmail}`,
    `Reply-To: ${sesFromEmail}`,
    `Subject: ${subject}`,
    `Date: ${sentAt}`,
    `Message-ID: ${messageId}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    textBody,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    htmlBody,
    "",
    `--${altBoundary}--`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: application/pdf; name="${attachmentName}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${attachmentName}"`,
    "",
    attachmentBase64,
    `--${mixedBoundary}--`
  ].join("\n");
}

async function sendInvoiceEmail({ event, fileName, fileBuffer, s3Uri }) {
  if (!enableSesSend || !sesFromEmail) {
    return false;
  }

  const rawMessage = buildRawEmail({
    toEmail: event.email,
    attachmentName: fileName,
    attachmentBuffer: fileBuffer,
    s3Uri
  });

  await getSesClient().send(
    new SendRawEmailCommand({
      RawMessage: {
        Data: Buffer.from(rawMessage)
      }
    })
  );

  return true;
}

async function processInvoiceEvent(event, eventMode) {
  const validationError = validateInvoiceEvent(event);
  if (validationError) {
    console.error(`invoice_validation_failed reason=${validationError}`);
    throw new Error(validationError);
  }

  const invoicesDir = await ensureInvoicesDir();
  const fileName = `${event.orderId}.pdf`;
  const outputPath = path.join(invoicesDir, fileName);

  const pdfBuffer = await createInvoicePdfBuffer(event);
  await fs.writeFile(outputPath, pdfBuffer);

  let s3Uri = null;
  try {
    s3Uri = await uploadToS3(fileName, pdfBuffer);
  } catch (error) {
    console.error(`invoice_s3_upload_failed orderId=${event.orderId} error=${error.message}`);
  }

  let sesSent = false;
  try {
    sesSent = await sendInvoiceEmail({
      event,
      fileName,
      fileBuffer: pdfBuffer,
      s3Uri
    });
  } catch (error) {
    console.error(`invoice_ses_send_failed orderId=${event.orderId} error=${error.message}`);
  }

  console.log(`invoice_processed orderId=${event.orderId} mode=${eventMode}`);
  console.log(`Invoice PDF written: ${outputPath}`);
  console.log(`Invoice S3 URI: ${s3Uri || "not_uploaded"}`);
  console.log(`Invoice SES send: ${sesSent ? "sent" : "skipped_or_failed"}`);

  return { fileName, outputPath, s3Uri, sesSent };
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

module.exports = {
  awsRegion,
  ensureInvoicesDir,
  processInvoiceEvent,
  extractInvoiceEvent,
  detectEventMode
};
