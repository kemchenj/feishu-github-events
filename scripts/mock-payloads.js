import { readFileSync } from "node:fs";
import { ACTION_EVENTS } from "../src/action-events.js";

export function createMockPayload(eventName) {
  if (!ACTION_EVENTS.includes(eventName)) {
    throw new Error(`Unsupported mock event: ${eventName}`);
  }

  const payload = readFixture(`../fixtures/events/${eventName}.json`);
  return structuredClone(payload);
}

export function createAllMockPayloads() {
  return ACTION_EVENTS.map((eventName) => ({
    eventName,
    payload: createMockPayload(eventName)
  }));
}

function readFixture(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
}
