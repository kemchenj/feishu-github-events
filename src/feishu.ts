import { createHmac } from "node:crypto";

interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<FetchResponse>;

export function createSignature(timestamp: number | string, secret: string): string {
  const stringToSign = `${timestamp}\n${secret}`;
  return createHmac("sha256", stringToSign).update("").digest("base64");
}

export function createWebhookBody<T extends object>(
  message: T,
  { secret = "", timestamp = nowSeconds() }: { secret?: string; timestamp?: number | string } = {}
): T & { timestamp?: string; sign?: string } {
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
  webhook: string,
  message: object,
  { secret = "", fetchImpl = globalThis.fetch }: { secret?: string; fetchImpl?: FetchImpl } = {}
): Promise<unknown> {
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

function assertFeishuSuccess(data: unknown, rawText: string): void {
  if (!data || typeof data !== "object") {
    return;
  }

  const body = data as Record<string, unknown>;
  const statusCode = body.StatusCode ?? body.code;
  if (statusCode != null && Number(statusCode) !== 0) {
    const message = body.msg || body.StatusMessage || body.message || rawText;
    throw new Error(`Feishu webhook failed: ${message}`);
  }
}

function parseMaybeJson(text: string): unknown {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}
