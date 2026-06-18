import test from "node:test";
import assert from "node:assert/strict";
import { createMockPayloads, listFixtureCases } from "../scripts/mock-payloads.js";

test("selects every fixture for a specific mock event by default", () => {
  const payloads = createMockPayloads({ eventName: "push" });
  const fixtures = listFixtureCases().filter((fixture) => fixture.event === "push");

  assert.equal(payloads.length, fixtures.length);
  assert.ok(payloads.length > 1);
  assert.deepEqual(
    payloads.map((payload) => payload.caseName),
    fixtures.map((fixture) => fixture.case)
  );
});

test("selects a specific mock fixture case", () => {
  const payloads = createMockPayloads({ eventName: "deployment_status", caseName: "failure" });

  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].eventName, "deployment_status");
  assert.equal(payloads[0].caseName, "failure");
  assert.equal(payloads[0].payload.deployment_status.state, "failure");
});

test("keeps all-cases as a compatibility alias", () => {
  const defaultPayloads = createMockPayloads();
  const all = createMockPayloads({ allCases: true });

  assert.equal(all.length, defaultPayloads.length);
});

test("fails clearly for unknown events and cases", () => {
  assert.throws(
    () => createMockPayloads({ eventName: "missing" }),
    /Unsupported mock event: missing/
  );
  assert.throws(
    () => createMockPayloads({ eventName: "push", caseName: "missing" }),
    /Available cases: main/
  );
});
