import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ACTION_EVENTS, type ActionEventName } from "../src/action-events.js";

const OCTOKIT_INDEX_URL = "https://octokit.github.io/webhooks/payload-examples/api.github.com/index.json";

interface PayloadExample {
  name: string;
  path: string;
  url: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const examples = await fetchPayloadExamples();
  const events = args.eventName ? [args.eventName] : ACTION_EVENTS;

  for (const eventName of events) {
    const match = findExampleForEvent(examples, eventName);
    if (!match) {
      console.log(`skip ${eventName}: no Octokit payload example found`);
      continue;
    }

    const payload = await fetchJson(match.url);
    const target = path.join("fixtures", "events", eventName, "primary.json");
    console.log(`${args.dryRun ? "would sync" : "sync"} ${eventName}: ${match.path} -> ${target}`);

    if (!args.dryRun) {
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
    }
  }
}

function parseArgs(args: string[]): { eventName?: ActionEventName; dryRun: boolean } {
  const dryRun = args.includes("--dry-run");
  const eventName = args.find((arg) => arg !== "--dry-run") as ActionEventName | undefined;

  if (eventName && !ACTION_EVENTS.includes(eventName)) {
    throw new Error(`Unsupported event: ${eventName}`);
  }

  return { eventName, dryRun };
}

async function fetchPayloadExamples(): Promise<PayloadExample[]> {
  const index = await fetchJson(OCTOKIT_INDEX_URL);
  return collectExamples(index);
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.json();
}

function collectExamples(value: unknown): PayloadExample[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectExamples(item));
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  const record = value as Record<string, unknown>;
  const pathValue = typeof record.path === "string" ? record.path : "";
  const urlValue = typeof record.url === "string" ? record.url : "";
  const nameValue = typeof record.name === "string" ? record.name : path.basename(pathValue);

  const current = pathValue.endsWith(".json") && urlValue
    ? [{ name: nameValue, path: pathValue, url: urlValue }]
    : [];

  return [
    ...current,
    ...Object.values(record).flatMap((item) => collectExamples(item))
  ];
}

function findExampleForEvent(examples: PayloadExample[], eventName: ActionEventName): PayloadExample | undefined {
  const folder = eventName.replace(/_/g, "-");
  return examples.find((example) => {
    const normalized = example.path.replace(/_/g, "-");
    return normalized.includes(`/${folder}/`) || normalized.startsWith(`${folder}/`);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
