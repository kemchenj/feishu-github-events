import test from "node:test";
import assert from "node:assert/strict";
import { createMockPayloads } from "../scripts/mock-payloads.js";

test("selects one primary fixture for a specific mock event", () => {
  const payloads = createMockPayloads({ eventName: "push" });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].eventName, "push");
  assert.equal(payloads[0].caseName, "primary");
});

test("selects a specific mock fixture case", () => {
  const payloads = createMockPayloads({ eventName: "deployment_status", caseName: "failure" });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].eventName, "deployment_status");
  assert.equal(payloads[0].caseName, "failure");
  assert.equal(payloads[0].payload.deployment_status.state, "failure");
});

test("selects every fixture case for all-cases mock runs", () => {
  const primary = createMockPayloads();
  const all = createMockPayloads({ allCases: true });

  assert.ok(all.length > primary.length);
});

test("fails clearly for unknown events and cases", () => {
  assert.throws(
    () => createMockPayloads({ eventName: "missing" }),
    /Unsupported mock event: missing/
  );
  assert.throws(
    () => createMockPayloads({ eventName: "push", caseName: "missing" }),
    /Available cases: primary/
  );
});
