import test from "node:test";
import assert from "node:assert/strict";
import { getActionInputs, getInput } from "../src/config.js";

test("reads action inputs from GitHub-style env names", () => {
  const inputs = getActionInputs({
    "INPUT_WEBHOOK": " https://example.com/webhook ",
    "INPUT_SECRET": " secret ",
    "INPUT_TEMPLATE": "default",
    "INPUT_TEMPLATE-OPTIONS": "{\"show\":{\"sha\":false}}",
    "INPUT_SHOW-REPOSITORY": "true"
  });

  assert.equal(inputs.webhook, "https://example.com/webhook");
  assert.equal(inputs.secret, "secret");
  assert.equal(inputs.template, "default");
  assert.deepEqual(inputs.templateOptions, { show: { sha: false, repository: true } });
});

test("accepts underscore fallback for hyphenated input names", () => {
  assert.equal(
    getInput({ INPUT_TEMPLATE_OPTIONS: "{\"titlePrefix\":\"CI\"}" }, "template-options"),
    "{\"titlePrefix\":\"CI\"}"
  );
});

test("requires webhook input", () => {
  assert.throws(() => getActionInputs({}), /Missing required input: webhook/);
});

test("rejects invalid template-options JSON", () => {
  assert.throws(
    () =>
      getActionInputs({
        INPUT_WEBHOOK: "https://example.com",
        "INPUT_TEMPLATE-OPTIONS": "{"
      }),
    /template-options must be valid JSON/
  );
});

test("rejects non-object template-options JSON", () => {
  assert.throws(
    () =>
      getActionInputs({
        INPUT_WEBHOOK: "https://example.com",
        "INPUT_TEMPLATE-OPTIONS": "[]"
      }),
    /template-options must be a JSON object/
  );
});

test("rejects invalid show-repository boolean input", () => {
  assert.throws(
    () =>
      getActionInputs({
        INPUT_WEBHOOK: "https://example.com",
        "INPUT_SHOW-REPOSITORY": "sometimes"
      }),
    /show-repository must be a boolean/
  );
});
