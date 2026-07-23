import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ACTION_EVENTS, type ActionEventName } from "../src/action-events.ts";

const OCTOKIT_INDEX_URL = "https://octokit.github.io/webhooks/payload-examples/api.github.com/index.json";

interface PayloadExampleEvent {
  name: string;
  examples?: unknown[];
}

interface FixtureCase {
  event: ActionEventName;
  case: string;
  path: string;
  source: string;
  notes: string;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const exampleEvents = await fetchPayloadExamples();
  const events = args.eventName ? [args.eventName] : ACTION_EVENTS;
  const manifest = readManifest();
  const nextManifest = manifest.filter((fixture) => {
    return !events.includes(fixture.event) || fixture.source !== "octokit";
  });

  for (const eventName of events) {
    const examples = findExamplesForEvent(exampleEvents, eventName);
    if (examples.length === 0) {
      console.log(`skip ${eventName}: no Octokit payload example found`);
      continue;
    }

    const caseNames = buildCaseNames(examples);
    for (const [index, payload] of examples.entries()) {
      const caseName = caseNames[index];
      const fixturePath = path.posix.join("events", eventName, `${caseName}.json`);
      const target = path.join("fixtures", fixturePath);
      console.log(`${args.dryRun ? "would sync" : "sync"} ${eventName}/${caseName} -> ${target}`);

      nextManifest.push({
        event: eventName,
        case: caseName,
        path: fixturePath,
        source: "octokit",
        notes: buildNotes(payload, index)
      });

      if (!args.dryRun) {
        mkdirSync(path.dirname(target), { recursive: true });
        writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
      }
    }
  }

  if (!args.dryRun) {
    writeFileSync("fixtures/events.json", `${JSON.stringify(sortManifest(nextManifest), null, 2)}\n`);
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

async function fetchPayloadExamples(): Promise<PayloadExampleEvent[]> {
  const index = await fetchJson(OCTOKIT_INDEX_URL);
  if (!Array.isArray(index)) {
    throw new Error("Unexpected Octokit payload examples index shape.");
  }

  return index.filter((item): item is PayloadExampleEvent => {
    return Boolean(item && typeof item === "object" && typeof (item as PayloadExampleEvent).name === "string");
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching ${url}`);
  }

  return response.json();
}

function readManifest(): FixtureCase[] {
  if (!existsSync("fixtures/events.json")) {
    return [];
  }

  return JSON.parse(readFileSync("fixtures/events.json", "utf8")) as FixtureCase[];
}

function findExamplesForEvent(events: PayloadExampleEvent[], eventName: ActionEventName): unknown[] {
  return events.find((event) => event.name === eventName)?.examples ?? [];
}

function buildCaseNames(examples: unknown[]): string[] {
  const bases = examples.map((payload) => slug(findCaseSignal(payload)) || "example");
  const totals = countValues(bases);
  const seen = new Map<string, number>();

  return bases.map((base) => {
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return totals.get(base) === 1 ? base : `${base}-${count}`;
  });
}

function findCaseSignal(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const record = payload as Record<string, unknown>;
  const ref = typeof record.ref === "string" ? record.ref.split("/").pop() : "";
  const fields = [
    record.action,
    record.state,
    record.ref_type,
    ref,
    record.workflow_run && typeof record.workflow_run === "object"
      ? (record.workflow_run as Record<string, unknown>).event
      : undefined
  ];

  return fields.find((field): field is string => typeof field === "string" && field.length > 0) ?? "";
}

function slug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function buildNotes(payload: unknown, index: number): string {
  const signal = findCaseSignal(payload);
  return `Octokit webhook payload example #${index + 1}${signal ? ` (${signal})` : ""}.`;
}

function countValues(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return counts;
}

function sortManifest(manifest: FixtureCase[]): FixtureCase[] {
  const eventOrder = new Map(ACTION_EVENTS.map((event, index) => [event, index]));
  return [...manifest].sort((left, right) => {
    const eventDiff = (eventOrder.get(left.event) ?? 999) - (eventOrder.get(right.event) ?? 999);
    if (eventDiff !== 0) {
      return eventDiff;
    }

    if (left.source !== right.source) {
      return left.source.localeCompare(right.source);
    }

    return left.case.localeCompare(right.case);
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
