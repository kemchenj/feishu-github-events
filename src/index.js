import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getActionInputs } from "./config.js";
import { sendFeishuWebhook } from "./feishu.js";
import { normalizeGitHubEvent } from "./github-event.js";
import { renderTemplate } from "./templates/index.js";
import { addMask, setFailed } from "./workflow-command.js";

export async function main({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const inputs = getActionInputs(env);
  addMask(inputs.webhook);
  addMask(inputs.secret);

  const eventName = requireEnv(env, "GITHUB_EVENT_NAME");
  const eventPath = requireEnv(env, "GITHUB_EVENT_PATH");
  const payload = JSON.parse(await readFile(eventPath, "utf8"));
  const event = normalizeGitHubEvent(eventName, payload, env);
  const message = renderTemplate(inputs.template, event, inputs.templateOptions);

  await sendFeishuWebhook(inputs.webhook, message, {
    secret: inputs.secret,
    fetchImpl
  });

  console.log(`Sent ${eventName} event to Feishu`);
}

function requireEnv(env, name) {
  if (!env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return env[name];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(setFailed);
}
