import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGitHubEvent, shortRef, shortSha } from "../src/github-event.js";
import { createMockPayload } from "../scripts/mock-payloads.js";

test("normalizes push payload", () => {
  const event = normalizeGitHubEvent("push", createMockPayload("push"));

  assert.equal(event.name, "push");
  assert.equal(event.repository, "octocat/hello-world");
  assert.equal(event.actor, "monalisa");
  assert.equal(event.ref, "refs/heads/main");
  assert.equal(event.sha, "0123456789abcdef0123456789abcdef01234567");
  assert.match(event.title, /Push to main/);
  assert.ok(event.summary.length >= 1);
  assert.match(event.summary[0].text, /Latest: feat: add Feishu notification action/);
  assert.equal(
    event.primaryUrl,
    "https://github.com/octocat/hello-world/compare/1111111111111111111111111111111111111111...0123456789abcdef0123456789abcdef01234567"
  );
});

test("normalizes pull request payload", () => {
  const event = normalizeGitHubEvent("pull_request", createMockPayload("pull_request"));

  assert.equal(event.action, "opened");
  assert.match(event.title, /PR #42 opened/);
  assert.equal(event.primaryUrl, "https://github.com/octocat/hello-world/pull/42");
});

test("falls back to the workflow run URL when an event has no detail URL", () => {
  const event = normalizeGitHubEvent("public", createMockPayload("public"), {
    GITHUB_REPOSITORY: "octocat/hello-world",
    GITHUB_RUN_ID: "1001",
    GITHUB_SERVER_URL: "https://github.com"
  });

  assert.equal(event.primaryUrl, "https://github.com/octocat/hello-world/actions/runs/1001");
});

test("distinguishes commit status payloads by context and state", () => {
  const event = normalizeGitHubEvent("status", createMockPayload("status"));
  const failurePayload = createMockPayload("status");
  failurePayload.state = "failure";
  failurePayload.description = "Unit tests failed";
  const failure = normalizeGitHubEvent("status", failurePayload);

  assert.equal(event.title, "Status passed on main: ci/test @ 0123456");
  assert.equal(event.ref, "main");
  assert.equal(event.primaryUrl, "https://github.com/octocat/hello-world/actions/runs/1001");
  assert.deepEqual(event.summary, []);
  assert.equal(failure.title, "Status failed on main: ci/test @ 0123456");
  assert.equal(failure.summary[0].text, "Unit tests failed");
});

test("writes specific pull request review titles", () => {
  const review = normalizeGitHubEvent(
    "pull_request_review",
    createMockPayload("pull_request_review")
  );
  const comment = normalizeGitHubEvent(
    "pull_request_review_comment",
    createMockPayload("pull_request_review_comment")
  );

  assert.equal(review.title, "PR #42 approved: Add Feishu notifications");
  assert.equal(comment.title, "PR #42 review comment: src/index.js");
});

test("prefixes comment summaries with the author", () => {
  const review = normalizeGitHubEvent(
    "pull_request_review",
    createMockPayload("pull_request_review")
  );
  const comment = normalizeGitHubEvent(
    "pull_request_review_comment",
    createMockPayload("pull_request_review_comment")
  );

  assert.equal(review.summary[0].author, "octocat-reviewer");
  assert.equal(review.summary[0].authorUrl, "https://github.com/octocat-reviewer");
  assert.match(review.summary[0].text, /^Looks good/);
  assert.equal(comment.summary[0].author, "octocat-reviewer");
  assert.equal(comment.summary[0].authorUrl, "https://github.com/octocat-reviewer");
  assert.match(comment.summary[0].text, /^Can we include/);
});

test("does not repeat wiki page names in the body", () => {
  const event = normalizeGitHubEvent("gollum", createMockPayload("gollum"));

  assert.equal(event.title, "Wiki updated: Home, Runbook");
  assert.deepEqual(event.summary, []);
});

test("keeps comment titles short and truncates comment bodies", () => {
  const payload = createMockPayload("issue_comment");
  payload.issue.title = "A very long issue title that should not be copied into the comment notification title";
  payload.comment.body = `${"x".repeat(140)}\nsecond line`;
  const event = normalizeGitHubEvent("issue_comment", payload);

  assert.match(event.title, /^Issue #7 comment:/);
  assert.ok(event.title.length <= 80);
  assert.ok(event.summary[0].text.length <= 120);
  assert.match(event.summary[0].text, /\.\.\.$/);
  assert.doesNotMatch(event.title, /second line/);
});

test("shows workflow conclusions in the title", () => {
  const success = normalizeGitHubEvent("workflow_run", createMockPayload("workflow_run"));
  const failurePayload = createMockPayload("workflow_run");
  failurePayload.workflow_run.conclusion = "failure";
  const failure = normalizeGitHubEvent("workflow_run", failurePayload);

  assert.equal(success.title, "Workflow passed on main: CI");
  assert.deepEqual(success.summary, []);
  assert.equal(failure.title, "Workflow failed on main: CI");
  assert.deepEqual(failure.summary, []);
});

test("does not repeat package type when package title is already specific", () => {
  const event = normalizeGitHubEvent("registry_package", createMockPayload("registry_package"));

  assert.equal(event.title, "Package published: hello-world@1.0.0");
  assert.deepEqual(event.summary, []);
});

test("shortens refs and shas", () => {
  assert.equal(shortRef("refs/heads/main"), "main");
  assert.equal(shortRef("refs/tags/v1.0.0"), "v1.0.0");
  assert.equal(shortSha("0123456789abcdef"), "0123456");
});
