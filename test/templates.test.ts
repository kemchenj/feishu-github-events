import test from "node:test";
import assert from "node:assert/strict";
import { ACTION_EVENTS } from "../src/action-events.ts";
import { deepMerge } from "../src/template-options.ts";
import { buildGitHubEventMessage } from "../src/github-event.ts";
import { renderTemplate } from "../src/templates/index.ts";
import { createMockPayload, listFixtureCases } from "../scripts/mock-payloads.ts";

const EVENT_SPECIFIC_KEYS = {
  branch_protection_rule: ["rule"],
  check_run: ["check_run"],
  check_suite: ["check_suite"],
  create: ["ref", "ref_type", "master_branch"],
  delete: ["ref", "ref_type"],
  deployment: ["deployment"],
  deployment_status: ["deployment", "deployment_status"],
  discussion: ["discussion"],
  discussion_comment: ["discussion", "comment"],
  fork: ["forkee"],
  gollum: ["pages"],
  image_version: ["image_version"],
  issue_comment: ["issue", "comment"],
  issues: ["issue"],
  label: ["label"],
  merge_group: ["merge_group"],
  milestone: ["milestone"],
  page_build: ["build"],
  public: ["action"],
  pull_request: ["pull_request"],
  pull_request_review: ["pull_request", "review"],
  pull_request_review_comment: ["pull_request", "comment"],
  pull_request_target: ["pull_request"],
  push: ["ref", "before", "after", "commits", "head_commit", "pusher"],
  registry_package: ["registry_package"],
  release: ["release"],
  repository_dispatch: ["event_type", "client_payload"],
  schedule: ["schedule"],
  status: ["sha", "state", "commit", "branches"],
  watch: ["action"],
  workflow_call: ["workflow", "inputs"],
  workflow_dispatch: ["workflow", "inputs"],
  workflow_run: ["workflow", "workflow_run"]
};

test("deep merges template options without mutating base", () => {
  const base = { show: { sha: true, actor: true }, items: [1] };
  const merged = deepMerge(base, { show: { sha: false }, items: [2] });

  assert.deepEqual(merged, { show: { sha: false, actor: true }, items: [2] });
  assert.deepEqual(base, { show: { sha: true, actor: true }, items: [1] });
});

test("renders default template for every supported action event", () => {
  for (const eventName of ACTION_EVENTS) {
    const event = buildGitHubEventMessage(eventName, createMockPayload(eventName));
    const message = renderTemplate("default", event);

    assert.equal(message.msg_type, "interactive", eventName);
    assert.ok(message.card.header.title.content, eventName);
    assert.ok(message.card.elements.length > 0, eventName);
  }
});

test("renders every fixture case as an interactive card", () => {
  for (const fixture of listFixtureCases()) {
    const event = buildGitHubEventMessage(fixture.event, createMockPayload(fixture.event, fixture.case));
    const message = renderTemplate("default", event);

    assert.equal(message.msg_type, "interactive", `${fixture.event}/${fixture.case}`);
    assert.ok(message.card.header.title.content, `${fixture.event}/${fixture.case}`);
    assert.ok(message.card.elements.length > 0, `${fixture.event}/${fixture.case}`);
  }
});

test("provides rich mock payloads for every supported action event", () => {
  for (const eventName of ACTION_EVENTS) {
    const payload = createMockPayload(eventName);

    assert.ok(payload.repository?.full_name, `${eventName}: repository`);
    assert.ok(payload.repository?.owner?.login, `${eventName}: repository.owner`);
    assert.ok(payload.sender?.login, `${eventName}: sender`);
    assert.ok(payload.organization?.login, `${eventName}: organization`);
    assert.ok(payload.enterprise?.slug, `${eventName}: enterprise`);
    assert.ok(payload.installation?.id, `${eventName}: installation`);

    for (const key of EVENT_SPECIFIC_KEYS[eventName]) {
      assert.ok(payload[key], `${eventName}: ${key}`);
    }
  }
});

test("applies template option tweaks", () => {
  const event = buildGitHubEventMessage("push", createMockPayload("push"));
  const message = renderTemplate("default", event, {
    titlePrefix: "CI",
    show: {
      sha: false
    }
  });
  const content = JSON.stringify(message);

  assert.match(message.card.header.title.content, /^CI · /);
  assert.doesNotMatch(content, /Commit/);
});

test("omits repeated metadata from default body", () => {
  const event = buildGitHubEventMessage("push", createMockPayload("push"));
  const message = renderTemplate("default", event);
  const body = JSON.stringify(message.card.elements);

  assert.doesNotMatch(body, /\*\*Event\*\*/);
  assert.doesNotMatch(body, /\*\*Action\*\*/);
  assert.doesNotMatch(body, /\*\*Workflow\*\*/);
});

test("renders summary without default context fields", () => {
  const event = buildGitHubEventMessage("push", createMockPayload("push"));
  const message = renderTemplate("default", event);
  const [summary] = message.card.elements as any[];
  const body = JSON.stringify(message.card.elements);

  assert.equal(summary.tag, "div");
  assert.ok(summary.text.content.includes("feat: add Feishu notification action"));
  assert.match(summary.text.content, /^- feat: add Feishu notification action/);
  assert.doesNotMatch(summary.text.content, /\]\(https?:\/\//);
  assert.doesNotMatch(body, /\*\*By\*\*/);
  assert.doesNotMatch(body, /\*\*Ref\*\*/);
});

test("renders single comment summaries without list markers", () => {
  const event = buildGitHubEventMessage(
    "pull_request_review_comment",
    createMockPayload("pull_request_review_comment")
  );
  const message = renderTemplate("default", event);
  const summary = message.card.elements.find((element) => element.tag === "div" && element.text?.content) as any;

  assert.ok(summary.text.content.includes("[@octocat-reviewer](https://github.com/octocat-reviewer): Can we include the workflow name"));
  assert.doesNotMatch(summary.text.content, /^- /);
  assert.doesNotMatch(summary.text.content, /discussion_r820/);
});

test("preserves markdown in comment summaries without links", () => {
  const payload = createMockPayload("pull_request_review_comment");
  payload.comment.body = "**Please check**\n- See [the docs](https://example.com/docs)";
  const event = buildGitHubEventMessage("pull_request_review_comment", payload);
  const message = renderTemplate("default", event);
  const summary = message.card.elements.find((element) => element.tag === "div" && element.text?.content) as any;

  assert.equal(summary.text.tag, "lark_md");
  assert.match(summary.text.content, /\[@octocat-reviewer\]\(https:\/\/github\.com\/octocat-reviewer\): \*\*Please check\*\*/);
  assert.match(summary.text.content, /\n- See the docs/);
  assert.doesNotMatch(summary.text.content, /https:\/\/example\.com/);
  assert.doesNotMatch(summary.text.content, /the docs\]\(/);
});

test("renders single key-value summaries without list markers", () => {
  const event = buildGitHubEventMessage("issues", createMockPayload("issues"));
  const message = renderTemplate("default", event);
  const summary = message.card.elements.find((element) => element.tag === "div" && element.text?.content) as any;

  assert.match(summary.text.content, /^Labels: /);
  assert.doesNotMatch(summary.text.content, /^- /);
});

test("renders workflow call inputs as a yaml-like summary block", () => {
  const event = buildGitHubEventMessage("workflow_call", createMockPayload("workflow_call"));
  const message = renderTemplate("default", event);
  const summary = message.card.elements.find(
    (element) => element.tag === "div" && element.text?.content?.includes("**Inputs:**")
  ) as any;
  const content = summary.text.content;

  assert.ok(summary);
  assert.match(content, /\*\*Inputs:\*\*/);
  assert.match(content, /- Environment: production/);
  assert.match(content, /- Release Tag: v1\.0\.0/);
  assert.doesNotMatch(content, /Input:/);
  assert.doesNotMatch(content, /input\.environment/);
});

test("omits manual workflow inputs by default", () => {
  const event = buildGitHubEventMessage("workflow_dispatch", createMockPayload("workflow_dispatch"));
  const message = renderTemplate("default", event);
  const body = JSON.stringify(message.card.elements);

  assert.doesNotMatch(body, /Inputs/);
  assert.doesNotMatch(body, /Environment: staging/);
});

test("omits repository dispatch payload by default", () => {
  const event = buildGitHubEventMessage("repository_dispatch", createMockPayload("repository_dispatch"));
  const message = renderTemplate("default", event);
  const body = JSON.stringify(message.card.elements);

  assert.doesNotMatch(body, /Payload/);
  assert.doesNotMatch(body, /Environment: production/);
});

test("omits default context fields", () => {
  const event = buildGitHubEventMessage("workflow_dispatch", createMockPayload("workflow_dispatch"));
  const message = renderTemplate("default", event);
  const body = JSON.stringify(message.card.elements);

  assert.doesNotMatch(body, /\*\*Repository\*\*/);
  assert.doesNotMatch(body, /\*\*By\*\*/);
  assert.doesNotMatch(body, /\*\*Ref\*\*/);
  assert.doesNotMatch(body, /\*\*Commit\*\*/);
});

test("hides default actor and ref fields for repository-level events", () => {
  const event = buildGitHubEventMessage("issues", createMockPayload("issues"));
  const message = renderTemplate("default", event);
  const body = JSON.stringify(message.card.elements);

  assert.doesNotMatch(body, /\*\*By\*\*/);
  assert.doesNotMatch(body, /\*\*Ref\*\*/);
});

test("renders branch deletion with a red header", () => {
  const event = buildGitHubEventMessage("delete", createMockPayload("delete"));
  const message = renderTemplate("default", event);

  assert.equal(message.card.header.template, "red");
});

test("can show repository when enabled", () => {
  const event = buildGitHubEventMessage("push", createMockPayload("push"));
  const message = renderTemplate("default", event, {
    show: {
      repository: true
    }
  });
  const context = JSON.stringify(message.card.elements[0]);

  assert.match(context, /\*\*Repository\*\*/);
  assert.match(context, /octocat\/hello-world/);
});

test("uses one consistent button label by default", () => {
  for (const eventName of ACTION_EVENTS) {
    const event = buildGitHubEventMessage(eventName, createMockPayload(eventName));
    const message = renderTemplate("default", event);
    const action = message.card.elements.find((element) => element.tag === "action") as any;

    if (action) {
      assert.equal(action.actions[0].text.content, "View Detail", eventName);
      assert.equal(action.actions[0].type, "primary", eventName);
    }
  }
});

test("rejects unknown template", () => {
  const event = buildGitHubEventMessage("push", createMockPayload("push"));

  assert.throws(() => renderTemplate("missing", event), /Unknown template/);
});
