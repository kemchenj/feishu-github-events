import { getActionInputs } from "../src/config.js";
import { sendFeishuWebhook } from "../src/feishu.js";
import { buildGitHubEventMessage } from "../src/github-event.js";
import { renderTemplate } from "../src/templates/index.js";
import { createMockPayloads } from "./mock-payloads.js";

interface MockArgs {
  eventName?: string;
  caseName?: string;
  allCases: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const inputs = getMockInputs(process.env);
  const events = createMockPayloads(args);

  for (const [index, { eventName, caseName, payload }] of events.entries()) {
    const event = buildGitHubEventMessage(eventName, payload, {
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

    console.log(`[${index + 1}/${events.length}] sent ${eventName}/${caseName}`);
    await delay(inputs.delayMs);
  }
}

function parseArgs(args: string[]): MockArgs {
  let eventName: string | undefined;
  let caseName: string | undefined;
  let allCases = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--all-cases") {
      allCases = true;
      continue;
    }
    if (arg === "--case") {
      caseName = args[index + 1];
      index += 1;
      continue;
    }
    if (!eventName) {
      eventName = arg;
      continue;
    }

    throw new Error(`Unexpected argument: ${arg}`);
  }

  return { eventName, caseName, allCases };
}

function getMockInputs(env: NodeJS.ProcessEnv) {
  const inputs = getActionInputs({
    "INPUT_WEBHOOK": env.FEISHU_WEBHOOK,
    "INPUT_SECRET": env.FEISHU_SECRET || "",
    "INPUT_TEMPLATE": env.TEMPLATE || "default",
    "INPUT_TEMPLATE-OPTIONS": env.TEMPLATE_OPTIONS || "{}",
    "INPUT_SHOW-REPOSITORY": env.SHOW_REPOSITORY || ""
  });

  return {
    ...inputs,
    delayMs: Number(env.MOCK_DELAY_MS || 300)
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
