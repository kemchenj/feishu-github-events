import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { getActionInputs } from "./config.ts";
import { sendFeishuWebhook } from "./feishu.ts";
import { buildGitHubEventMessage } from "./github-event.ts";
import { renderTemplate } from "./templates/index.ts";
import { addMask, setFailed } from "./workflow-command.ts";

export async function main({
  env = process.env,
  fetchImpl = globalThis.fetch
}: {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<void> {
  const inputs = getActionInputs(env);
  addMask(inputs.webhook);
  addMask(inputs.secret);

  const eventName = requireEnv(env, "GITHUB_EVENT_NAME");
  const eventPath = requireEnv(env, "GITHUB_EVENT_PATH");
  const payload = JSON.parse(await readFile(eventPath, "utf8"));
  const event = buildGitHubEventMessage(eventName, payload, env);
  const message = renderTemplate(inputs.template, event, inputs.templateOptions);

  await sendFeishuWebhook(inputs.webhook, message, {
    secret: inputs.secret,
    fetchImpl
  });

  console.log(`Sent ${eventName} event to Feishu`);
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  if (!env[name]) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return env[name];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(setFailed);
}
