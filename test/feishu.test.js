import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createSignature, createWebhookBody, sendFeishuWebhook } from "../src/feishu.js";

test("creates Feishu bot signature", () => {
  const expected = createHmac("sha256", "1700000000\nsecret")
    .update("")
    .digest("base64");

  assert.equal(createSignature(1700000000, "secret"), expected);
});

test("adds timestamp and sign when secret exists", () => {
  const body = createWebhookBody(
    { msg_type: "interactive", card: { elements: [] } },
    { secret: "secret", timestamp: 1700000000 }
  );

  assert.equal(body.timestamp, "1700000000");
  assert.equal(body.sign, createSignature(1700000000, "secret"));
  assert.equal(body.msg_type, "interactive");
});

test("sends webhook and accepts code zero", async () => {
  let request;
  const data = await sendFeishuWebhook(
    "https://example.com/webhook",
    { msg_type: "interactive", card: { elements: [] } },
    {
      fetchImpl: async (url, init) => {
        request = { url, init };
        return response(200, { code: 0, msg: "success" });
      }
    }
  );

  assert.equal(request.url, "https://example.com/webhook");
  assert.equal(JSON.parse(request.init.body).msg_type, "interactive");
  assert.equal(data.code, 0);
});

test("throws on non-2xx response", async () => {
  await assert.rejects(
    () =>
      sendFeishuWebhook("https://example.com/webhook", {}, {
        fetchImpl: async () => response(500, { error: "server" })
      }),
    /HTTP 500/
  );
});

test("throws on Feishu error payload", async () => {
  await assert.rejects(
    () =>
      sendFeishuWebhook("https://example.com/webhook", {}, {
        fetchImpl: async () => response(200, { code: 19021, msg: "bad sign" })
      }),
    /bad sign/
  );
});

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body)
  };
}
