import { readFileSync } from "node:fs";
import { ACTION_EVENTS, isActionEventName, type ActionEventName } from "../src/action-events.ts";
import type { GitHubPayload } from "../src/github/types.ts";

export interface FixtureCase {
  event: ActionEventName;
  case: string;
  path: string;
  source: "local" | "octokit";
  notes?: string;
}

export interface MockPayload {
  eventName: ActionEventName;
  caseName: string;
  payload: GitHubPayload;
}

export function createMockPayload(eventName: ActionEventName, caseName?: string): GitHubPayload {
  const fixture = findFixtureCase(eventName, caseName);
  const payload = readFixture(`../fixtures/${fixture.path}`) as GitHubPayload;
  return structuredClone(payload);
}

export function createMockPayloads({
  eventName,
  caseName
}: {
  eventName?: string;
  caseName?: string;
  allCases?: boolean;
} = {}): MockPayload[] {
  const fixtures = selectFixtureCases({ eventName, caseName });
  return fixtures.map((fixture) => ({
    eventName: fixture.event,
    caseName: fixture.case,
    payload: createMockPayload(fixture.event, fixture.case)
  }));
}

export function createAllMockPayloads(): MockPayload[] {
  return createMockPayloads();
}

export function listFixtureCases(): FixtureCase[] {
  const manifest = readFixture("../fixtures/events.json") as Array<Omit<FixtureCase, "event"> & { event: string }>;

  return manifest.map((item) => {
    if (!isActionEventName(item.event)) {
      throw new Error(`Unsupported fixture event in manifest: ${item.event}`);
    }

    return {
      ...item,
      event: item.event
    };
  });
}

function selectFixtureCases({
  eventName,
  caseName
}: {
  eventName?: string;
  caseName?: string;
}): FixtureCase[] {
  const fixtures = listFixtureCases();

  if (eventName && !isActionEventName(eventName)) {
    throw new Error(`Unsupported mock event: ${eventName}\nAvailable events: ${ACTION_EVENTS.join(", ")}`);
  }

  const scoped = eventName ? fixtures.filter((fixture) => fixture.event === eventName) : fixtures;
  const selected = scoped.filter((fixture) => {
    if (caseName) {
      return fixture.case === caseName;
    }

    return true;
  });

  if (selected.length === 0) {
    const available = scoped.map((fixture) => fixture.case).join(", ") || "none";
    throw new Error(`No mock fixture matched${eventName ? ` ${eventName}` : ""}${caseName ? ` case ${caseName}` : ""}.\nAvailable cases: ${available}`);
  }

  return selected;
}

function findFixtureCase(eventName: ActionEventName, caseName?: string): FixtureCase {
  return selectFixtureCases({ eventName, caseName })[0];
}

function readFixture(path: string): unknown {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}
