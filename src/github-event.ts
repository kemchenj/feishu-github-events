import { isActionEventName, type ActionEventName } from "./action-events.js";
import type {
  GitHubEventHandler,
  GitHubPayload,
  HandlerContext,
  LarkMessage,
  SummaryItem
} from "./types.js";

export const defaultHandlers = {
  branch_protection_rule: buildBranchProtectionRuleEvent,
  check_run: buildCheckRunEvent,
  check_suite: buildCheckSuiteEvent,
  create: buildCreateEvent,
  delete: buildDeleteEvent,
  deployment: buildDeploymentEvent,
  deployment_status: buildDeploymentStatusEvent,
  discussion: buildDiscussionEvent,
  discussion_comment: buildDiscussionCommentEvent,
  fork: buildForkEvent,
  gollum: buildGollumEvent,
  image_version: buildImageVersionEvent,
  issue_comment: buildIssueCommentEvent,
  issues: buildIssuesEvent,
  label: buildLabelEvent,
  merge_group: buildMergeGroupEvent,
  milestone: buildMilestoneEvent,
  page_build: buildPageBuildEvent,
  public: buildPublicEvent,
  pull_request: buildPullRequestEvent,
  pull_request_review: buildPullRequestReviewEvent,
  pull_request_review_comment: buildPullRequestReviewCommentEvent,
  pull_request_target: buildPullRequestTargetEvent,
  push: buildPushEvent,
  registry_package: buildRegistryPackageEvent,
  release: buildReleaseEvent,
  repository_dispatch: buildRepositoryDispatchEvent,
  schedule: buildScheduleEvent,
  status: buildStatusEvent,
  watch: buildWatchEvent,
  workflow_call: buildWorkflowCallEvent,
  workflow_dispatch: buildWorkflowDispatchEvent,
  workflow_run: buildWorkflowRunEvent
} satisfies Record<ActionEventName, GitHubEventHandler<any>>;

export function buildGitHubEventMessage(
  eventName: string,
  payload: GitHubPayload = {},
  env: NodeJS.ProcessEnv = process.env
): LarkMessage {
  if (!isActionEventName(eventName)) {
    throw new Error(`Unsupported GitHub event: ${eventName}`);
  }

  const base = buildBaseMessage(eventName, payload, env);
  const handler = defaultHandlers[eventName] as GitHubEventHandler;
  const patch = handler(payload, { env, base });

  return {
    ...base,
    ...patch,
    summary: patch.summary ?? base.summary
  };
}

export function normalizeGitHubEvent(
  eventName: string,
  payload: GitHubPayload = {},
  env: NodeJS.ProcessEnv = process.env
): LarkMessage {
  return buildGitHubEventMessage(eventName, payload, env);
}

function buildBaseMessage(
  eventName: ActionEventName,
  payload: GitHubPayload,
  env: NodeJS.ProcessEnv
): LarkMessage {
  const repository = payload.repository || {};
  const sender = payload.sender || {};
  const sha = pickSha(payload, env);
  const repositoryUrl = repository.html_url || "";
  const runUrl = pickRunUrl(env);

  return {
    name: eventName,
    action: pickAction(eventName, payload),
    repository: repository.full_name || env.GITHUB_REPOSITORY || "",
    repositoryUrl,
    actor: sender.login || payload.pusher?.name || env.GITHUB_ACTOR || "",
    actorUrl: sender.html_url || "",
    ref: pickRef(payload, env),
    sha,
    shaUrl: repositoryUrl && sha ? `${repositoryUrl}/commit/${sha}` : "",
    workflow: pickWorkflow(payload, env),
    title: `${eventName}${payload.action ? ` ${payload.action}` : ""}`,
    summary: [],
    primaryUrl: pickPrimaryUrl(payload, repositoryUrl, sha, runUrl)
  };
}

export function buildPushEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: pushTitle(payload),
    summary: [pushSummary(payload)].filter(Boolean) as SummaryItem[],
    headerTemplate: "green"
  };
}

export function buildBranchProtectionRuleEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Branch protection ${payload.action || ""}: ${payload.rule?.name || payload.rule?.pattern || ""}`.trim()
  };
}

export function buildPullRequestEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: pullRequestTitle(payload)
  };
}

export function buildPullRequestTargetEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return buildPullRequestEvent(payload);
}

export function buildIssuesEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: issueTitle(payload),
    summary: issuesSummary(payload)
  };
}

export function buildIssueCommentEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: issueCommentTitle(payload),
    summary: [commentSummary(payload.comment)].filter(Boolean) as SummaryItem[]
  };
}

export function buildReleaseEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Release ${payload.action || ""}: ${payload.release?.name || payload.release?.tag_name || ""}`.trim()
  };
}

export function buildWorkflowRunEvent(payload: GitHubPayload): Partial<LarkMessage> {
  const conclusion = payload.workflow_run?.conclusion;
  if (payload.action === "completed" && isFailure(conclusion)) {
    return buildWorkflowRunFailedEvent(payload);
  }

  if (payload.action === "completed" && conclusion === "success") {
    return buildWorkflowRunPassedEvent(payload);
  }

  return {
    title: titleWithDetails(
      titleWithRef(`Workflow ${workflowRunState(payload)}`, payload.workflow_run?.head_branch),
      payload.workflow_run?.name
    )
  };
}

export function buildWorkflowRunPassedEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleWithRef("Workflow passed", payload.workflow_run?.head_branch),
      payload.workflow_run?.name
    ),
    headerTemplate: "green"
  };
}

export function buildWorkflowRunFailedEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleWithRef(`Workflow ${resultState(payload.workflow_run?.conclusion)}`, payload.workflow_run?.head_branch),
      payload.workflow_run?.name
    ),
    headerTemplate: "red"
  };
}

export function buildWorkflowDispatchEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleWithRef("Workflow manually triggered", payload.ref),
      payload.workflow?.name
    ),
    summary: []
  };
}

export function buildWorkflowCallEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleWithRef("Workflow called", payload.ref),
      payload.workflow?.name
    ),
    summary: objectEntries(payload.inputs || {}, "Inputs")
  };
}

export function buildScheduleEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Schedule triggered: ${payload.schedule || ""}`.trim()
  };
}

export function buildCreateEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: refChangeTitle("created", payload),
    headerTemplate: payload.ref_type === "tag" ? "purple" : "green"
  };
}

export function buildDeleteEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: refChangeTitle("deleted", payload),
    headerTemplate: "red"
  };
}

export function buildDeploymentEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleFromRef("Deployment requested", payload.deployment?.ref),
      payload.deployment?.environment
    )
  };
}

export function buildDeploymentStatusEvent(payload: GitHubPayload): Partial<LarkMessage> {
  const state = payload.deployment_status?.state;
  if (state === "success") {
    return buildDeploymentSuccessEvent(payload);
  }

  if (isFailure(state)) {
    return buildDeploymentFailureEvent(payload);
  }

  return {
    title: titleWithDetails(
      titleFromRef(`Deployment ${deploymentState(state)}`, payload.deployment?.ref),
      payload.deployment_status?.environment || payload.deployment?.environment
    )
  };
}

export function buildDeploymentSuccessEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleFromRef("Deployment succeeded", payload.deployment?.ref),
      payload.deployment_status?.environment || payload.deployment?.environment
    ),
    headerTemplate: "green"
  };
}

export function buildDeploymentFailureEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      titleFromRef("Deployment failed", payload.deployment?.ref),
      payload.deployment_status?.environment || payload.deployment?.environment
    ),
    summary: [deploymentDescription(payload)].filter(Boolean) as SummaryItem[],
    headerTemplate: "red"
  };
}

export function buildPullRequestReviewEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: pullRequestReviewTitle(payload),
    summary: [commentSummary(payload.review)].filter(Boolean) as SummaryItem[]
  };
}

export function buildPullRequestReviewCommentEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: pullRequestReviewCommentTitle(payload),
    summary: [commentSummary(payload.comment)].filter(Boolean) as SummaryItem[]
  };
}

export function buildDiscussionEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Discussion ${payload.action || ""}: ${truncate(payload.discussion?.title || "")}`.trim()
  };
}

export function buildDiscussionCommentEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: discussionCommentTitle(payload),
    summary: [commentSummary(payload.comment)].filter(Boolean) as SummaryItem[]
  };
}

export function buildCheckRunEvent(payload: GitHubPayload): Partial<LarkMessage> {
  const state = checkState(payload.check_run, payload.action);
  return {
    title: titleWithDetails(
      titleWithRef(`Check run ${state}`, payload.check_run?.check_suite?.head_branch),
      payload.check_run?.name
    ),
    headerTemplate: isFailure(payload.check_run?.conclusion) ? "red" : undefined
  };
}

export function buildCheckSuiteEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithRef(`Check suite ${checkState(payload.check_suite, payload.action)}`, payload.check_suite?.head_branch),
    headerTemplate: isFailure(payload.check_suite?.conclusion) ? "red" : undefined
  };
}

export function buildGollumEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Wiki updated: ${(payload.pages || []).map((page: GitHubPayload) => page.page_name).filter(Boolean).join(", ")}`
  };
}

export function buildImageVersionEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Image version ${payload.action || ""}: ${compact([payload.image_version?.name, payload.image_version?.version]).join(" ")}`.trim()
  };
}

export function buildLabelEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Label ${payload.action || ""}: ${payload.label?.name || ""}`.trim()
  };
}

export function buildMergeGroupEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(
      `Merge group ${actionLabel(payload.action, { checks_requested: "checks requested" })}`,
      payload.merge_group?.base_ref || payload.merge_group?.head_ref
    )
  };
}

export function buildMilestoneEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Milestone ${payload.action || ""}: ${payload.milestone?.title || ""}`.trim()
  };
}

export function buildPageBuildEvent(payload: GitHubPayload): Partial<LarkMessage> {
  const failed = payload.build?.status === "errored";
  return {
    title: titleWithDetails(`Pages build ${pageBuildState(payload.build?.status)}`, shortSha(payload.build?.commit || "")),
    headerTemplate: failed ? "red" : undefined
  };
}

export function buildPublicEvent(): Partial<LarkMessage> {
  return {
    title: "Repository made public"
  };
}

export function buildRegistryPackageEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: titleWithDetails(`Package ${payload.action || ""}`, registryPackageName(payload))
  };
}

export function buildRepositoryDispatchEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Repository dispatch: ${payload.event_type || ""}`.trim(),
    summary: []
  };
}

export function buildStatusEvent(payload: GitHubPayload): Partial<LarkMessage> {
  const failed = isFailure(payload.state);
  return {
    title: titleWithDetails(
      titleWithRef(`Status ${statusState(payload.state)}`, payload.branches?.[0]?.name),
      compact([payload.context || payload.name, shortSha(payload.sha || "") && `@ ${shortSha(payload.sha || "")}`]).join(" ")
    ),
    summary: statusSummary(payload),
    headerTemplate: failed ? "red" : undefined
  };
}

export function buildWatchEvent(): Partial<LarkMessage> {
  return {
    title: "Repository starred"
  };
}

export function buildForkEvent(payload: GitHubPayload): Partial<LarkMessage> {
  return {
    title: `Repository forked: ${payload.forkee?.full_name || ""}`.trim()
  };
}

function pickAction(eventName: ActionEventName, payload: GitHubPayload): string {
  if (payload.action) {
    return payload.action;
  }
  if (eventName === "repository_dispatch") {
    return payload.event_type || "";
  }
  if (eventName === "schedule") {
    return payload.schedule || "";
  }
  if (payload.ref_type) {
    return payload.ref_type;
  }
  if (payload.state) {
    return payload.state;
  }
  return "";
}

function pickRef(payload: GitHubPayload, env: NodeJS.ProcessEnv): string {
  return (
    payload.ref ||
    payload.workflow_run?.head_branch ||
    payload.pull_request?.head?.ref ||
    payload.merge_group?.head_ref ||
    payload.check_run?.check_suite?.head_branch ||
    payload.check_suite?.head_branch ||
    payload.deployment?.ref ||
    payload.branches?.[0]?.name ||
    env.GITHUB_REF ||
    ""
  );
}

function pickSha(payload: GitHubPayload, env: NodeJS.ProcessEnv): string {
  return (
    payload.after ||
    payload.workflow_run?.head_sha ||
    payload.pull_request?.head?.sha ||
    payload.merge_group?.head_sha ||
    payload.check_run?.head_sha ||
    payload.check_suite?.head_sha ||
    payload.deployment?.sha ||
    payload.build?.commit ||
    payload.sha ||
    env.GITHUB_SHA ||
    ""
  );
}

function pickWorkflow(payload: GitHubPayload, env: NodeJS.ProcessEnv): string {
  return (
    payload.workflow?.name ||
    payload.workflow_run?.name ||
    payload.check_run?.app?.name ||
    env.GITHUB_WORKFLOW ||
    ""
  );
}

function pickRunUrl(env: NodeJS.ProcessEnv): string {
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return "";
  }

  return `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function pickPrimaryUrl(
  payload: GitHubPayload,
  repositoryUrl: string,
  sha: string,
  runUrl: string
): string {
  return (
    payload.pull_request?.html_url ||
    payload.issue?.html_url ||
    payload.release?.html_url ||
    payload.workflow_run?.html_url ||
    payload.check_run?.html_url ||
    payload.discussion?.html_url ||
    payload.comment?.html_url ||
    payload.compare ||
    payload.target_url ||
    payload.deployment_status?.target_url ||
    payload.status?.target_url ||
    payload.forkee?.html_url ||
    payload.registry_package?.html_url ||
    payload.build?.html_url ||
    runUrl ||
    (repositoryUrl && sha ? `${repositoryUrl}/commit/${sha}` : repositoryUrl)
  );
}

function pushSummary(payload: GitHubPayload): SummaryItem | null {
  const commits = payload.commits || [];
  if (commits.length === 0) {
    return null;
  }

  const latestCommit = payload.head_commit || commits[commits.length - 1];
  const latest = latestCommit?.message?.split("\n")[0] || "";
  if (!latest) {
    return null;
  }

  return {
    text: `Latest: ${latest}`,
    url: payload.compare || latestCommit?.url || ""
  };
}

function pushTitle(payload: GitHubPayload): string {
  return titleWithDetails(`Push to ${shortRef(payload.ref || "")}`, commitCount(payload.commits || []));
}

function commitCount(commits: GitHubPayload[]): string {
  if (!commits.length) {
    return "";
  }

  return `${commits.length} commit${commits.length === 1 ? "" : "s"}`;
}

function refChangeTitle(verb: string, payload: GitHubPayload): string {
  return titleWithDetails(`${humanizeKey(payload.ref_type || "ref")} ${verb}`, payload.ref || payload.master_branch);
}

function checkState(check: GitHubPayload, fallbackAction: string): string {
  return (
    resultState(check?.conclusion) ||
    statusLabel(check?.status) ||
    actionLabel(fallbackAction, {
      rerequested: "rerequested",
      requested: "requested",
      completed: "completed"
    })
  );
}

function workflowRunState(payload: GitHubPayload): string {
  if (payload.action === "completed") {
    return resultState(payload.workflow_run?.conclusion) || "completed";
  }

  return actionLabel(payload.action, {
    requested: "requested",
    in_progress: "in progress",
    completed: "completed"
  });
}

function resultState(value: string): string {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    success: "passed",
    failure: "failed",
    error: "failed",
    cancelled: "canceled",
    skipped: "skipped",
    timed_out: "timed out",
    action_required: "action required",
    neutral: "neutral"
  });
}

function statusState(value: string): string {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    success: "passed",
    failure: "failed",
    error: "failed",
    pending: "pending"
  });
}

function statusLabel(value: string): string {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    queued: "queued",
    in_progress: "in progress",
    completed: "completed",
    waiting: "waiting",
    requested: "requested",
    pending: "pending"
  });
}

function deploymentState(value: string): string {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    success: "succeeded",
    failure: "failed",
    error: "failed",
    inactive: "inactive",
    in_progress: "in progress",
    queued: "queued",
    pending: "pending"
  });
}

function pageBuildState(value: string): string {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    built: "completed",
    errored: "failed",
    building: "building"
  });
}

function registryPackageName(payload: GitHubPayload): string {
  const registryPackage = payload.registry_package || {};
  const version = registryPackage.package_version?.version || registryPackage.package_version?.name;

  return compact([
    registryPackage.name,
    version && `@${version}`
  ]).join("");
}

function issuesSummary(payload: GitHubPayload): SummaryItem[] {
  const labels = (payload.issue?.labels || [])
    .map((label: GitHubPayload) => label.name)
    .filter(Boolean);
  const value = labels.length ? labels.join(", ") : payload.label?.name || "";

  return value ? [{
    label: "Labels",
    value,
    text: `Labels: ${value}`,
    url: ""
  }] : [];
}

function statusSummary(payload: GitHubPayload): SummaryItem[] {
  if (!payload.description || payload.state === "success") {
    return [];
  }

  return [{
    text: payload.description,
    url: payload.target_url || ""
  }];
}

function deploymentDescription(payload: GitHubPayload): SummaryItem | null {
  const description = payload.deployment_status?.description || payload.deployment_status?.log_url;
  if (!description) {
    return null;
  }

  return {
    text: description,
    url: payload.deployment_status?.target_url || ""
  };
}

function pullRequestTitle(payload: GitHubPayload): string {
  const pullRequest = payload.pull_request || {};
  return `PR #${pullRequest.number || ""} ${pullRequestAction(payload)}: ${truncate(pullRequest.title || "")}`.trim();
}

function issueTitle(payload: GitHubPayload): string {
  const issue = payload.issue || {};
  return `Issue #${issue.number || ""} ${issueAction(payload.action)}: ${truncate(issue.title || "")}`.trim();
}

function issueCommentTitle(payload: GitHubPayload): string {
  const issue = payload.issue || {};
  const kind = issue.pull_request ? "PR" : "Issue";
  return titleWithDetails(
    `${kind} #${issue.number || ""} comment${commentTitleSuffix(payload.action)}`,
    truncate(issue.title || "", 60)
  );
}

function pullRequestReviewTitle(payload: GitHubPayload): string {
  const pullRequest = payload.pull_request || {};
  return `PR #${pullRequest.number || ""} ${reviewState(payload.review?.state || payload.action)}: ${truncate(pullRequest.title || "")}`.trim();
}

function pullRequestReviewCommentTitle(payload: GitHubPayload): string {
  const pullRequest = payload.pull_request || {};
  return titleWithDetails(
    `PR #${pullRequest.number || ""} review comment${commentTitleSuffix(payload.action)}`,
    truncate(payload.comment?.path || "", 60)
  );
}

function discussionCommentTitle(payload: GitHubPayload): string {
  return titleWithDetails(
    `Discussion comment${commentTitleSuffix(payload.action)}`,
    truncate(payload.discussion?.title || "", 60)
  );
}

function commentTitleSuffix(action: string): string {
  if (!action || action === "created") {
    return "";
  }

  return ` ${commentAction(action)}`;
}

function pullRequestAction(payload: GitHubPayload): string {
  if (payload.action === "closed" && payload.pull_request?.merged) {
    return "merged";
  }

  return actionLabel(payload.action, {
    synchronize: "updated",
    reopened: "reopened",
    opened: "opened",
    closed: "closed",
    ready_for_review: "ready for review",
    review_requested: "review requested",
    converted_to_draft: "converted to draft"
  });
}

function issueAction(action: string): string {
  return actionLabel(action, {
    opened: "opened",
    closed: "closed",
    reopened: "reopened",
    assigned: "assigned",
    labeled: "labeled",
    unlabeled: "unlabeled"
  });
}

function commentAction(action: string): string {
  return actionLabel(action, {
    created: "added",
    edited: "edited",
    deleted: "deleted"
  });
}

function reviewState(state: string): string {
  return actionLabel(String(state || "").toLowerCase(), {
    approved: "approved",
    changes_requested: "requested changes",
    commented: "commented",
    submitted: "submitted",
    dismissed: "dismissed"
  });
}

function actionLabel(action: string, labels: Record<string, string>): string {
  return labels[action] || action || "updated";
}

function commentSummary(comment: GitHubPayload): SummaryItem | null {
  const body = comment?.body?.trim();
  if (!body) {
    return null;
  }

  return {
    author: comment.user?.login || "",
    authorUrl: comment.user?.html_url || "",
    text: truncate(body, 120),
    url: comment.html_url || ""
  };
}

function truncate(value: string, maxLength = 80): string {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function objectEntries(value: GitHubPayload, group: string): SummaryItem[] {
  return Object.entries(value).map(([key, item]) => ({
    group,
    label: humanizeKey(key),
    value: String(item),
    text: `${humanizeKey(key)}: ${String(item)}`,
    url: ""
  }));
}

function humanizeKey(key: string): string {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function titleWithDetails(title: string, details: string): string {
  return compact([title, details]).join(": ");
}

function titleWithRef(title: string, ref: string): string {
  const value = shortRef(ref);
  return value ? `${title} on ${value}` : title;
}

function titleFromRef(title: string, ref: string): string {
  const value = shortRef(ref);
  return value ? `${title} from ${value}` : title;
}

function compact(values: unknown[]): string[] {
  return values.filter(Boolean).map(String);
}

function isFailure(value: string): boolean {
  return ["failure", "error", "cancelled", "timed_out"].includes(value);
}

export function shortSha(sha: string): string {
  return sha ? String(sha).slice(0, 7) : "";
}

export function shortRef(ref: string): string {
  return String(ref || "")
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/tags\//, "")
    .replace(/^refs\/pull\//, "pull/");
}
