const { extractInvoiceEvent, processInvoiceEvent } = require("./processor");

exports.handler = async (event) => {
  const records = Array.isArray(event?.Records) ? event.Records : [];
  const results = [];

  for (const record of records) {
    const payload = extractInvoiceEvent({
      Records: [{ body: record.body }]
    });

    if (!payload) {
      throw new Error("Invalid SQS record body for invoice processing");
    }

    const processed = await processInvoiceEvent(payload, "lambda-sqs");
    results.push({
      orderId: payload.orderId,
      invoiceFile: processed.fileName,
      s3Uri: processed.s3Uri || null,
      sesSent: processed.sesSent
    });
  }

  return {
    statusCode: 200,
    processed: results.length,
    results
  };
};
