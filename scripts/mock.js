import { getActionInputs } from "../src/config.js";
import { sendFeishuWebhook } from "../src/feishu.js";
import { normalizeGitHubEvent } from "../src/github-event.js";
import { renderTemplate } from "../src/templates/index.js";
import { createAllMockPayloads } from "./mock-payloads.js";

async function main() {
  const inputs = getMockInputs(process.env);
  const events = createAllMockPayloads();

  for (const [index, { eventName, payload }] of events.entries()) {
    const event = normalizeGitHubEvent(eventName, payload, {
      GITHUB_ACTOR: "monalisa",
      GITHUB_REPOSITORY: "octocat/hello-world",
      GITHUB_REF: "refs/heads/main",
      GITHUB_RUN_ID: "1001",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567",
      GITHUB_WORKFLOW: "Mock GitHub Events"
    });
    const message = renderTemplate(inputs.template, event, inputs.templateOptions);

    await sendFeishuWebhook(inputs.webhook, message, {
      secret: inputs.secret
    });

    console.log(`[${index + 1}/${events.length}] sent ${eventName}`);
    await delay(inputs.delayMs);
  }
}

function getMockInputs(env) {
  return getActionInputs({
    "INPUT_WEBHOOK": env.FEISHU_WEBHOOK,
    "INPUT_SECRET": env.FEISHU_SECRET || "",
    "INPUT_TEMPLATE": env.TEMPLATE || "default",
    "INPUT_TEMPLATE-OPTIONS": env.TEMPLATE_OPTIONS || "{}",
    "INPUT_SHOW-REPOSITORY": env.SHOW_REPOSITORY || ""
  });
}

function delay(ms) {
  const value = Number(ms || process.env.MOCK_DELAY_MS || 300);
  return new Promise((resolve) => setTimeout(resolve, value));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
