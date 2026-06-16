import { createHmac } from "node:crypto";

export function createSignature(timestamp, secret) {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

export function createWebhookBody(message, { secret, timestamp = nowSeconds() } = {}) {
  if (!secret) {
    return message;
  }

  return {
    timestamp: String(timestamp),
    sign: createSignature(timestamp, secret),
    ...message
  };
}

export async function sendFeishuWebhook(
  webhook,
  message,
  { secret = "", fetchImpl = globalThis.fetch } = {}
) {
  if (!webhook) {
    throw new Error("Feishu webhook is required");
  }

  if (typeof fetchImpl !== "function") {
    throw new Error("No fetch implementation is available");
  }

  const body = createWebhookBody(message, { secret });
  const response = await fetchImpl(webhook, {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Feishu webhook returned HTTP ${response.status}: ${text}`);
  }

  const data = parseMaybeJson(text);
  assertFeishuSuccess(data, text);
  return data;
}

function assertFeishuSuccess(data, rawText) {
  if (!data || typeof data !== "object") {
    return;
  }

  const statusCode = data.StatusCode ?? data.code;
  if (statusCode != null && Number(statusCode) !== 0) {
    const message = data.msg || data.StatusMessage || data.message || rawText;
    throw new Error(`Feishu webhook failed: ${message}`);
  }
}

function parseMaybeJson(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}
