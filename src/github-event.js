export function normalizeGitHubEvent(eventName, payload = {}, env = process.env) {
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
    title: buildTitle(eventName, payload),
    summary: buildSummary(eventName, payload),
    primaryUrl: pickPrimaryUrl(payload, repositoryUrl, sha, runUrl)
  };
}

function pickAction(eventName, payload) {
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

function pickRef(payload, env) {
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

function pickSha(payload, env) {
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

function pickWorkflow(payload, env) {
  return (
    payload.workflow?.name ||
    payload.workflow_run?.name ||
    payload.check_run?.app?.name ||
    env.GITHUB_WORKFLOW ||
    ""
  );
}

function pickRunUrl(env) {
  if (!env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) {
    return "";
  }

  return `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}

function buildTitle(eventName, payload) {
  switch (eventName) {
    case "push":
      return pushTitle(payload);
    case "branch_protection_rule":
      return `Branch protection ${payload.action || ""}: ${payload.rule?.name || payload.rule?.pattern || ""}`.trim();
    case "pull_request":
    case "pull_request_target":
      return pullRequestTitle(payload);
    case "issues":
      return issueTitle(payload);
    case "issue_comment":
      return issueCommentTitle(payload);
    case "release":
      return `Release ${payload.action || ""}: ${payload.release?.name || payload.release?.tag_name || ""}`.trim();
    case "workflow_run":
      return titleWithDetails(
        titleWithRef(`Workflow ${workflowRunState(payload)}`, payload.workflow_run?.head_branch),
        payload.workflow_run?.name
      );
    case "workflow_dispatch":
      return titleWithDetails(
        titleWithRef("Workflow manually triggered", payload.ref),
        payload.workflow?.name
      );
    case "workflow_call":
      return titleWithDetails(
        titleWithRef("Workflow called", payload.ref),
        payload.workflow?.name
      );
    case "schedule":
      return `Schedule triggered: ${payload.schedule || ""}`.trim();
    case "create":
      return refChangeTitle("created", payload);
    case "delete":
      return refChangeTitle("deleted", payload);
    case "deployment":
      return titleWithDetails(
        titleFromRef("Deployment requested", payload.deployment?.ref),
        payload.deployment?.environment
      );
    case "deployment_status":
      return titleWithDetails(
        titleFromRef(`Deployment ${deploymentState(payload.deployment_status?.state)}`, payload.deployment?.ref),
        payload.deployment_status?.environment || payload.deployment?.environment
      );
    case "pull_request_review":
      return pullRequestReviewTitle(payload);
    case "pull_request_review_comment":
      return pullRequestReviewCommentTitle(payload);
    case "discussion":
      return `Discussion ${payload.action || ""}: ${truncate(payload.discussion?.title || "")}`.trim();
    case "discussion_comment":
      return discussionCommentTitle(payload);
    case "check_run":
      return titleWithDetails(
        titleWithRef(`Check run ${checkState(payload.check_run, payload.action)}`, payload.check_run?.check_suite?.head_branch),
        payload.check_run?.name
      );
    case "check_suite":
      return titleWithRef(`Check suite ${checkState(payload.check_suite, payload.action)}`, payload.check_suite?.head_branch);
    case "gollum":
      return `Wiki updated: ${(payload.pages || []).map((page) => page.page_name).filter(Boolean).join(", ")}`;
    case "image_version":
      return `Image version ${payload.action || ""}: ${compact([payload.image_version?.name, payload.image_version?.version]).join(" ")}`.trim();
    case "label":
      return `Label ${payload.action || ""}: ${payload.label?.name || ""}`.trim();
    case "merge_group":
      return titleWithDetails(
        `Merge group ${actionLabel(payload.action, { checks_requested: "checks requested" })}`,
        payload.merge_group?.base_ref || payload.merge_group?.head_ref
      );
    case "milestone":
      return `Milestone ${payload.action || ""}: ${payload.milestone?.title || ""}`.trim();
    case "page_build":
      return titleWithDetails(`Pages build ${pageBuildState(payload.build?.status)}`, shortSha(payload.build?.commit || ""));
    case "public":
      return "Repository made public";
    case "registry_package":
      return titleWithDetails(`Package ${payload.action || ""}`, registryPackageName(payload));
    case "repository_dispatch":
      return `Repository dispatch: ${payload.event_type || ""}`.trim();
    case "status":
      return titleWithDetails(
        titleWithRef(`Status ${statusState(payload.state)}`, payload.branches?.[0]?.name),
        compact([payload.context || payload.name, shortSha(payload.sha || "") && `@ ${shortSha(payload.sha || "")}`]).join(" ")
      );
    case "watch":
      return "Repository starred";
    case "fork":
      return `Repository forked: ${payload.forkee?.full_name || ""}`.trim();
    default:
      return `${eventName}${payload.action ? ` ${payload.action}` : ""}`;
  }
}

function buildSummary(eventName, payload) {
  switch (eventName) {
    case "push":
      return [pushSummary(payload)].filter(Boolean);
    case "issues":
      return issuesSummary(payload);
    case "gollum":
      return [];
    case "workflow_dispatch":
      return [];
    case "workflow_call":
      return objectEntries(payload.inputs || {}, "Inputs");
    case "repository_dispatch":
      return [];
    case "status":
      return statusSummary(payload);
    case "issue_comment":
      return [commentSummary(payload.comment)].filter(Boolean);
    case "discussion_comment":
      return [commentSummary(payload.comment)].filter(Boolean);
    case "pull_request_review":
      return [commentSummary(payload.review)].filter(Boolean);
    case "pull_request_review_comment":
      return [commentSummary(payload.comment)].filter(Boolean);
    case "check_suite":
    case "check_run":
    case "deployment":
    case "deployment_status":
    case "gollum":
    case "label":
    case "milestone":
    case "page_build":
    case "registry_package":
      return [];
    case "workflow_run":
      return [];
    default:
      return compact([
        labeled("Status", payload.status?.state),
        labeled("Package type", payload.registry_package?.package_type),
        labeled("Label", payload.label?.name),
        labeled("Milestone", payload.milestone?.title)
      ]).map((text) => ({ text, url: "" }));
  }
}

function pushSummary(payload) {
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

function pushTitle(payload) {
  return titleWithDetails(`Push to ${shortRef(payload.ref || "")}`, commitCount(payload.commits || []));
}

function commitCount(commits) {
  if (!commits.length) {
    return "";
  }

  return `${commits.length} commit${commits.length === 1 ? "" : "s"}`;
}

function refChangeTitle(verb, payload) {
  return titleWithDetails(`${humanizeKey(payload.ref_type || "ref")} ${verb}`, payload.ref || payload.master_branch);
}

function checkState(check, fallbackAction) {
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

function workflowRunState(payload) {
  if (payload.action === "completed") {
    return resultState(payload.workflow_run?.conclusion) || "completed";
  }

  return actionLabel(payload.action, {
    requested: "requested",
    in_progress: "in progress",
    completed: "completed"
  });
}

function resultState(value) {
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

function statusState(value) {
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

function statusLabel(value) {
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

function deploymentState(value) {
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

function pageBuildState(value) {
  if (!value) {
    return "";
  }

  return actionLabel(value, {
    built: "completed",
    errored: "failed",
    building: "building"
  });
}

function registryPackageName(payload) {
  const registryPackage = payload.registry_package || {};
  const version = registryPackage.package_version?.version || registryPackage.package_version?.name;

  return compact([
    registryPackage.name,
    version && `@${version}`
  ]).join("");
}

function issuesSummary(payload) {
  const labels = (payload.issue?.labels || [])
    .map((label) => label.name)
    .filter(Boolean);
  const value = labels.length ? labels.join(", ") : payload.label?.name || "";

  return value ? [{
    label: "Labels",
    value,
    text: `Labels: ${value}`,
    url: ""
  }] : [];
}

function statusSummary(payload) {
  if (!payload.description || payload.state === "success") {
    return [];
  }

  return [{
    text: payload.description,
    url: payload.target_url || ""
  }];
}

function pickPrimaryUrl(payload, repositoryUrl, sha, runUrl) {
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

function pullRequestTitle(payload) {
  const pullRequest = payload.pull_request || {};
  return `PR #${pullRequest.number || ""} ${pullRequestAction(payload)}: ${truncate(pullRequest.title || "")}`.trim();
}

function issueTitle(payload) {
  const issue = payload.issue || {};
  return `Issue #${issue.number || ""} ${issueAction(payload.action)}: ${truncate(issue.title || "")}`.trim();
}

function issueCommentTitle(payload) {
  const issue = payload.issue || {};
  const kind = issue.pull_request ? "PR" : "Issue";
  return titleWithDetails(
    `${kind} #${issue.number || ""} comment${commentTitleSuffix(payload.action)}`,
    truncate(issue.title || "", 60)
  );
}

function pullRequestReviewTitle(payload) {
  const pullRequest = payload.pull_request || {};
  return `PR #${pullRequest.number || ""} ${reviewState(payload.review?.state || payload.action)}: ${truncate(pullRequest.title || "")}`.trim();
}

function pullRequestReviewCommentTitle(payload) {
  const pullRequest = payload.pull_request || {};
  return titleWithDetails(
    `PR #${pullRequest.number || ""} review comment${commentTitleSuffix(payload.action)}`,
    truncate(payload.comment?.path || "", 60)
  );
}

function discussionCommentTitle(payload) {
  return titleWithDetails(
    `Discussion comment${commentTitleSuffix(payload.action)}`,
    truncate(payload.discussion?.title || "", 60)
  );
}

function commentTitleSuffix(action) {
  if (!action || action === "created") {
    return "";
  }

  return ` ${commentAction(action)}`;
}

function pullRequestAction(payload) {
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

function issueAction(action) {
  return actionLabel(action, {
    opened: "opened",
    closed: "closed",
    reopened: "reopened",
    assigned: "assigned",
    labeled: "labeled",
    unlabeled: "unlabeled"
  });
}

function commentAction(action) {
  return actionLabel(action, {
    created: "added",
    edited: "edited",
    deleted: "deleted"
  });
}

function reviewState(state) {
  return actionLabel(String(state || "").toLowerCase(), {
    approved: "approved",
    changes_requested: "requested changes",
    commented: "commented",
    submitted: "submitted",
    dismissed: "dismissed"
  });
}

function actionLabel(action, labels) {
  return labels[action] || action || "updated";
}

function commentSummary(comment) {
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

function truncate(value, maxLength = 80) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function objectEntries(value, group) {
  return Object.entries(value).map(([key, item]) => ({
    group,
    label: humanizeKey(key),
    value: String(item),
    text: `${humanizeKey(key)}: ${String(item)}`,
    url: ""
  }));
}

function humanizeKey(key) {
  return String(key)
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function labeled(label, value) {
  return value ? `${label}: ${value}` : "";
}

function titleWithDetails(title, details) {
  return compact([title, details]).join(": ");
}

function titleWithRef(title, ref) {
  const value = shortRef(ref);
  return value ? `${title} on ${value}` : title;
}

function titleFromRef(title, ref) {
  const value = shortRef(ref);
  return value ? `${title} from ${value}` : title;
}

function compact(values) {
  return values.filter(Boolean);
}

export function shortSha(sha) {
  return sha ? String(sha).slice(0, 7) : "";
}

export function shortRef(ref) {
  return String(ref || "")
    .replace(/^refs\/heads\//, "")
    .replace(/^refs\/tags\//, "")
    .replace(/^refs\/pull\//, "pull/");
}
