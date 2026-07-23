import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { createHmac } from "node:crypto";
//#region src/template-options.ts
function isPlainObject(value) {
	return Object.prototype.toString.call(value) === "[object Object]";
}
function deepMerge(base, override) {
	if (!isPlainObject(base)) return clone(override);
	const result = clone(base);
	if (!isPlainObject(override)) return result;
	for (const [key, value] of Object.entries(override)) if (isPlainObject(value) && isPlainObject(result[key])) result[key] = deepMerge(result[key], value);
	else result[key] = clone(value);
	return result;
}
function parseJsonObject(value, label = "JSON") {
	if (value == null || String(value).trim() === "") return {};
	let parsed;
	try {
		parsed = JSON.parse(String(value));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`${label} must be valid JSON: ${message}`);
	}
	if (!isPlainObject(parsed)) throw new Error(`${label} must be a JSON object`);
	return parsed;
}
function clone(value) {
	if (Array.isArray(value)) return value.map((item) => clone(item));
	if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
	return value;
}
//#endregion
//#region src/config.ts
function getActionInputs(env = process.env) {
	const webhook = getInput(env, "webhook", { required: true });
	const secret = getInput(env, "secret");
	const template = getInput(env, "template") || "default";
	let templateOptions = parseJsonObject(getInput(env, "template-options") || "{}", "template-options");
	const showRepository = getOptionalBooleanInput(env, "show-repository");
	if (showRepository != null) templateOptions = deepMerge(templateOptions, { show: { repository: showRepository } });
	return {
		webhook,
		secret,
		template,
		templateOptions
	};
}
function getInput(env, name, { required = false } = {}) {
	const value = inputEnvNames(name).map((key) => env[key]).find((item) => item != null && item !== "");
	if (required && value == null) throw new Error(`Missing required input: ${name}`);
	return value == null ? "" : String(value).trim();
}
function getOptionalBooleanInput(env, name) {
	const value = getInput(env, name);
	if (!value) return;
	if ([
		"true",
		"1",
		"yes",
		"on"
	].includes(value.toLowerCase())) return true;
	if ([
		"false",
		"0",
		"no",
		"off"
	].includes(value.toLowerCase())) return false;
	throw new Error(`${name} must be a boolean`);
}
function inputEnvNames(name) {
	const canonical = `INPUT_${name.toUpperCase().replace(/ /g, "_")}`;
	const underscore = canonical.replace(/-/g, "_");
	return canonical === underscore ? [canonical] : [canonical, underscore];
}
//#endregion
//#region src/feishu.ts
function createSignature(timestamp, secret) {
	return createHmac("sha256", `${timestamp}\n${secret}`).update("").digest("base64");
}
function createWebhookBody(message, { secret = "", timestamp = nowSeconds() } = {}) {
	if (!secret) return message;
	return {
		timestamp: String(timestamp),
		sign: createSignature(timestamp, secret),
		...message
	};
}
async function sendFeishuWebhook(webhook, message, { secret = "", fetchImpl = globalThis.fetch } = {}) {
	if (!webhook) throw new Error("Feishu webhook is required");
	if (typeof fetchImpl !== "function") throw new Error("No fetch implementation is available");
	const body = createWebhookBody(message, { secret });
	const response = await fetchImpl(webhook, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	const text = await response.text();
	if (!response.ok) throw new Error(`Feishu webhook returned HTTP ${response.status}: ${text}`);
	const data = parseMaybeJson(text);
	assertFeishuSuccess(data, text);
	return data;
}
function assertFeishuSuccess(data, rawText) {
	if (!data || typeof data !== "object") return;
	const body = data;
	const statusCode = body.StatusCode ?? body.code;
	if (statusCode != null && Number(statusCode) !== 0) {
		const message = body.msg || body.StatusMessage || body.message || rawText;
		throw new Error(`Feishu webhook failed: ${message}`);
	}
}
function parseMaybeJson(text) {
	if (!text) return {};
	try {
		return JSON.parse(text);
	} catch {
		return { raw: text };
	}
}
function nowSeconds() {
	return Math.floor(Date.now() / 1e3);
}
//#endregion
//#region src/action-events.ts
const ACTION_EVENTS = [
	"branch_protection_rule",
	"check_run",
	"check_suite",
	"create",
	"delete",
	"deployment",
	"deployment_status",
	"discussion",
	"discussion_comment",
	"fork",
	"gollum",
	"image_version",
	"issue_comment",
	"issues",
	"label",
	"merge_group",
	"milestone",
	"page_build",
	"public",
	"pull_request",
	"pull_request_review",
	"pull_request_review_comment",
	"pull_request_target",
	"push",
	"registry_package",
	"release",
	"repository_dispatch",
	"schedule",
	"status",
	"watch",
	"workflow_call",
	"workflow_dispatch",
	"workflow_run"
];
function isActionEventName(value) {
	return ACTION_EVENTS.includes(value);
}
//#endregion
//#region src/github-event.ts
const defaultHandlers = {
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
};
function buildGitHubEventMessage(eventName, payload = {}, env = process.env) {
	if (!isActionEventName(eventName)) throw new Error(`Unsupported GitHub event: ${eventName}`);
	const base = buildBaseMessage(eventName, payload, env);
	const handler = defaultHandlers[eventName];
	const patch = handler(payload, {
		env,
		base
	});
	return {
		...base,
		...patch,
		summary: patch.summary ?? base.summary
	};
}
function buildBaseMessage(eventName, payload, env) {
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
function buildPushEvent(payload) {
	return {
		title: pushTitle(payload),
		summary: [pushSummary(payload)].filter(Boolean),
		headerTemplate: "green"
	};
}
function buildBranchProtectionRuleEvent(payload) {
	return { title: `Branch protection ${payload.action || ""}: ${payload.rule?.name || payload.rule?.pattern || ""}`.trim() };
}
function buildPullRequestEvent(payload) {
	return { title: pullRequestTitle(payload) };
}
function buildPullRequestTargetEvent(payload) {
	return buildPullRequestEvent(payload);
}
function buildIssuesEvent(payload) {
	return {
		title: issueTitle(payload),
		summary: issuesSummary(payload)
	};
}
function buildIssueCommentEvent(payload) {
	return {
		title: issueCommentTitle(payload),
		summary: [commentSummary(payload.comment)].filter(Boolean)
	};
}
function buildReleaseEvent(payload) {
	return { title: `Release ${payload.action || ""}: ${payload.release?.name || payload.release?.tag_name || ""}`.trim() };
}
function buildWorkflowRunEvent(payload) {
	const conclusion = payload.workflow_run?.conclusion;
	if (payload.action === "completed" && isFailure(conclusion)) return buildWorkflowRunFailedEvent(payload);
	if (payload.action === "completed" && conclusion === "success") return buildWorkflowRunPassedEvent(payload);
	return { title: titleWithDetails(titleWithRef(`Workflow ${workflowRunState(payload)}`, payload.workflow_run?.head_branch), payload.workflow_run?.name) };
}
function buildWorkflowRunPassedEvent(payload) {
	return {
		title: titleWithDetails(titleWithRef("Workflow passed", payload.workflow_run?.head_branch), payload.workflow_run?.name),
		headerTemplate: "green"
	};
}
function buildWorkflowRunFailedEvent(payload) {
	return {
		title: titleWithDetails(titleWithRef(`Workflow ${resultState(payload.workflow_run?.conclusion)}`, payload.workflow_run?.head_branch), payload.workflow_run?.name),
		headerTemplate: "red"
	};
}
function buildWorkflowDispatchEvent(payload) {
	return {
		title: titleWithDetails(titleWithRef("Workflow manually triggered", payload.ref), payload.workflow?.name),
		summary: []
	};
}
function buildWorkflowCallEvent(payload) {
	return {
		title: titleWithDetails(titleWithRef("Workflow called", payload.ref), payload.workflow?.name),
		summary: objectEntries(payload.inputs || {}, "Inputs")
	};
}
function buildScheduleEvent(payload) {
	return { title: `Schedule triggered: ${payload.schedule || ""}`.trim() };
}
function buildCreateEvent(payload) {
	return {
		title: refChangeTitle("created", payload),
		headerTemplate: payload.ref_type === "tag" ? "purple" : "green"
	};
}
function buildDeleteEvent(payload) {
	return {
		title: refChangeTitle("deleted", payload),
		headerTemplate: "red"
	};
}
function buildDeploymentEvent(payload) {
	return { title: titleWithDetails(titleFromRef("Deployment requested", payload.deployment?.ref), payload.deployment?.environment) };
}
function buildDeploymentStatusEvent(payload) {
	const state = payload.deployment_status?.state;
	if (state === "success") return buildDeploymentSuccessEvent(payload);
	if (isFailure(state)) return buildDeploymentFailureEvent(payload);
	return { title: titleWithDetails(titleFromRef(`Deployment ${deploymentState(state)}`, payload.deployment?.ref), payload.deployment_status?.environment || payload.deployment?.environment) };
}
function buildDeploymentSuccessEvent(payload) {
	return {
		title: titleWithDetails(titleFromRef("Deployment succeeded", payload.deployment?.ref), payload.deployment_status?.environment || payload.deployment?.environment),
		headerTemplate: "green"
	};
}
function buildDeploymentFailureEvent(payload) {
	return {
		title: titleWithDetails(titleFromRef("Deployment failed", payload.deployment?.ref), payload.deployment_status?.environment || payload.deployment?.environment),
		summary: [deploymentDescription(payload)].filter(Boolean),
		headerTemplate: "red"
	};
}
function buildPullRequestReviewEvent(payload) {
	return {
		title: pullRequestReviewTitle(payload),
		summary: [commentSummary(payload.review)].filter(Boolean)
	};
}
function buildPullRequestReviewCommentEvent(payload) {
	return {
		title: pullRequestReviewCommentTitle(payload),
		summary: [commentSummary(payload.comment)].filter(Boolean)
	};
}
function buildDiscussionEvent(payload) {
	return { title: `Discussion ${payload.action || ""}: ${truncate(payload.discussion?.title || "")}`.trim() };
}
function buildDiscussionCommentEvent(payload) {
	return {
		title: discussionCommentTitle(payload),
		summary: [commentSummary(payload.comment)].filter(Boolean)
	};
}
function buildCheckRunEvent(payload) {
	return {
		title: titleWithDetails(titleWithRef(`Check run ${checkState(payload.check_run, payload.action)}`, payload.check_run?.check_suite?.head_branch), payload.check_run?.name),
		headerTemplate: isFailure(payload.check_run?.conclusion) ? "red" : void 0
	};
}
function buildCheckSuiteEvent(payload) {
	return {
		title: titleWithRef(`Check suite ${checkState(payload.check_suite, payload.action)}`, payload.check_suite?.head_branch),
		headerTemplate: isFailure(payload.check_suite?.conclusion) ? "red" : void 0
	};
}
function buildGollumEvent(payload) {
	return { title: `Wiki updated: ${(payload.pages || []).map((page) => page.page_name).filter(Boolean).join(", ")}` };
}
function buildImageVersionEvent(payload) {
	return { title: `Image version ${payload.action || ""}: ${compact$1([payload.image_version?.name, payload.image_version?.version]).join(" ")}`.trim() };
}
function buildLabelEvent(payload) {
	return { title: `Label ${payload.action || ""}: ${payload.label?.name || ""}`.trim() };
}
function buildMergeGroupEvent(payload) {
	return { title: titleWithDetails(`Merge group ${actionLabel(payload.action, { checks_requested: "checks requested" })}`, payload.merge_group?.base_ref || payload.merge_group?.head_ref) };
}
function buildMilestoneEvent(payload) {
	return { title: `Milestone ${payload.action || ""}: ${payload.milestone?.title || ""}`.trim() };
}
function buildPageBuildEvent(payload) {
	const failed = payload.build?.status === "errored";
	return {
		title: titleWithDetails(`Pages build ${pageBuildState(payload.build?.status)}`, shortSha(payload.build?.commit || "")),
		headerTemplate: failed ? "red" : void 0
	};
}
function buildPublicEvent() {
	return { title: "Repository made public" };
}
function buildRegistryPackageEvent(payload) {
	return { title: titleWithDetails(`Package ${payload.action || ""}`, registryPackageName(payload)) };
}
function buildRepositoryDispatchEvent(payload) {
	return {
		title: `Repository dispatch: ${payload.event_type || ""}`.trim(),
		summary: []
	};
}
function buildStatusEvent(payload) {
	const failed = isFailure(payload.state);
	return {
		title: titleWithDetails(titleWithRef(`Status ${statusState(payload.state)}`, payload.branches?.[0]?.name), compact$1([payload.context || payload.name, shortSha(payload.sha || "") && `@ ${shortSha(payload.sha || "")}`]).join(" ")),
		summary: statusSummary(payload),
		headerTemplate: failed ? "red" : void 0
	};
}
function buildWatchEvent() {
	return { title: "Repository starred" };
}
function buildForkEvent(payload) {
	return { title: `Repository forked: ${payload.forkee?.full_name || ""}`.trim() };
}
function pickAction(eventName, payload) {
	if (payload.action) return payload.action;
	if (eventName === "repository_dispatch") return payload.event_type || "";
	if (eventName === "schedule") return payload.schedule || "";
	if (payload.ref_type) return payload.ref_type;
	if (payload.state) return payload.state;
	return "";
}
function pickRef(payload, env) {
	return payload.ref || payload.workflow_run?.head_branch || payload.pull_request?.head?.ref || payload.merge_group?.head_ref || payload.check_run?.check_suite?.head_branch || payload.check_suite?.head_branch || payload.deployment?.ref || payload.branches?.[0]?.name || env.GITHUB_REF || "";
}
function pickSha(payload, env) {
	return payload.after || payload.workflow_run?.head_sha || payload.pull_request?.head?.sha || payload.merge_group?.head_sha || payload.check_run?.head_sha || payload.check_suite?.head_sha || payload.deployment?.sha || payload.build?.commit || payload.sha || env.GITHUB_SHA || "";
}
function pickWorkflow(payload, env) {
	return payload.workflow?.name || payload.workflow_run?.name || payload.check_run?.app?.name || env.GITHUB_WORKFLOW || "";
}
function pickRunUrl(env) {
	if (!env.GITHUB_REPOSITORY || !env.GITHUB_RUN_ID) return "";
	return `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`;
}
function pickPrimaryUrl(payload, repositoryUrl, sha, runUrl) {
	return payload.pull_request?.html_url || payload.issue?.html_url || payload.release?.html_url || payload.workflow_run?.html_url || payload.check_run?.html_url || payload.discussion?.html_url || payload.comment?.html_url || payload.compare || payload.target_url || payload.deployment_status?.target_url || payload.status?.target_url || payload.forkee?.html_url || payload.registry_package?.html_url || payload.build?.html_url || runUrl || (repositoryUrl && sha ? `${repositoryUrl}/commit/${sha}` : repositoryUrl);
}
function pushSummary(payload) {
	const commits = payload.commits || [];
	if (commits.length === 0) return null;
	const messages = commits.map((commit) => commit.message?.split("\n")[0]?.trim()).filter(Boolean);
	if (messages.length === 0) return null;
	return {
		text: [...messages.slice(0, 3).map((message) => `- ${message}`), messages.length > 3 ? "- ..." : ""].filter(Boolean).join("\n"),
		url: payload.compare || commits[commits.length - 1]?.url || ""
	};
}
function pushTitle(payload) {
	return titleWithDetails(`Push to ${shortRef(payload.ref || "")}`, commitCount(payload.commits || []));
}
function commitCount(commits) {
	if (!commits.length) return "";
	return `${commits.length} commit${commits.length === 1 ? "" : "s"}`;
}
function refChangeTitle(verb, payload) {
	return titleWithDetails(`${humanizeKey(payload.ref_type || "ref")} ${verb}`, payload.ref || payload.master_branch);
}
function checkState(check, fallbackAction) {
	return resultState(check?.conclusion) || statusLabel(check?.status) || actionLabel(fallbackAction, {
		rerequested: "rerequested",
		requested: "requested",
		completed: "completed"
	});
}
function workflowRunState(payload) {
	if (payload.action === "completed") return resultState(payload.workflow_run?.conclusion) || "completed";
	return actionLabel(payload.action, {
		requested: "requested",
		in_progress: "in progress",
		completed: "completed"
	});
}
function resultState(value) {
	if (!value) return "";
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
	if (!value) return "";
	return actionLabel(value, {
		success: "passed",
		failure: "failed",
		error: "failed",
		pending: "pending"
	});
}
function statusLabel(value) {
	if (!value) return "";
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
	if (!value) return "";
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
	if (!value) return "";
	return actionLabel(value, {
		built: "completed",
		errored: "failed",
		building: "building"
	});
}
function registryPackageName(payload) {
	const registryPackage = payload.registry_package || {};
	const version = registryPackage.package_version?.version || registryPackage.package_version?.name;
	return compact$1([registryPackage.name, version && `@${version}`]).join("");
}
function issuesSummary(payload) {
	const labels = (payload.issue?.labels || []).map((label) => label.name).filter(Boolean);
	const value = labels.length ? labels.join(", ") : payload.label?.name || "";
	return value ? [{
		label: "Labels",
		value,
		text: `Labels: ${value}`,
		url: ""
	}] : [];
}
function statusSummary(payload) {
	if (!payload.description || payload.state === "success") return [];
	return [{
		text: payload.description,
		url: payload.target_url || ""
	}];
}
function deploymentDescription(payload) {
	const description = payload.deployment_status?.description || payload.deployment_status?.log_url;
	if (!description) return null;
	return {
		text: description,
		url: payload.deployment_status?.target_url || ""
	};
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
	return titleWithDetails(`${issue.pull_request ? "PR" : "Issue"} #${issue.number || ""} comment${commentTitleSuffix(payload.action)}`, truncate(issue.title || "", 60));
}
function pullRequestReviewTitle(payload) {
	const pullRequest = payload.pull_request || {};
	return `PR #${pullRequest.number || ""} ${reviewState(payload.review?.state || payload.action)}: ${truncate(pullRequest.title || "")}`.trim();
}
function pullRequestReviewCommentTitle(payload) {
	return titleWithDetails(`PR #${(payload.pull_request || {}).number || ""} review comment${commentTitleSuffix(payload.action)}`, truncate(payload.comment?.path || "", 60));
}
function discussionCommentTitle(payload) {
	return titleWithDetails(`Discussion comment${commentTitleSuffix(payload.action)}`, truncate(payload.discussion?.title || "", 60));
}
function commentTitleSuffix(action) {
	if (!action || action === "created") return "";
	return ` ${commentAction(action)}`;
}
function pullRequestAction(payload) {
	if (payload.action === "closed" && payload.pull_request?.merged) return "merged";
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
	if (!body) return null;
	return {
		author: comment.user?.login || "",
		authorUrl: comment.user?.html_url || "",
		text: truncate(body, 120),
		url: comment.html_url || ""
	};
}
function truncate(value, maxLength = 80) {
	const text = String(value || "").trim();
	if (text.length <= maxLength) return text;
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
	return String(key).replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function titleWithDetails(title, details) {
	return compact$1([title, details]).join(": ");
}
function titleWithRef(title, ref) {
	const value = shortRef(ref);
	return value ? `${title} on ${value}` : title;
}
function titleFromRef(title, ref) {
	const value = shortRef(ref);
	return value ? `${title} from ${value}` : title;
}
function compact$1(values) {
	return values.filter(Boolean).map(String);
}
function isFailure(value) {
	return [
		"failure",
		"error",
		"cancelled",
		"timed_out"
	].includes(value);
}
function shortSha(sha) {
	return sha ? String(sha).slice(0, 7) : "";
}
function shortRef(ref) {
	return String(ref || "").replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "").replace(/^refs\/pull\//, "pull/");
}
//#endregion
//#region src/templates/default.ts
const DEFAULT_OPTIONS = Object.freeze({
	titlePrefix: "GitHub",
	headerTemplate: "blue",
	eventHeaderTemplates: {
		push: "green",
		delete: "red",
		pull_request: "turquoise",
		pull_request_target: "turquoise",
		issues: "orange",
		issue_comment: "blue",
		release: "purple",
		workflow_run: "indigo",
		deployment_status: "green",
		status: "green",
		check_run: "green",
		check_suite: "green"
	},
	labels: {
		event: "Event",
		action: "Action",
		repository: "Repository",
		actor: "By",
		ref: "Ref",
		sha: "Commit",
		workflow: "Workflow"
	},
	show: {
		event: false,
		action: false,
		repository: false,
		actor: false,
		ref: false,
		sha: false,
		workflow: false,
		summary: true,
		link: true
	},
	maxSummaryItems: 3,
	buttonText: "View Detail"
});
const EVENTS_WITHOUT_DEFAULT_REF = /* @__PURE__ */ new Set([
	"branch_protection_rule",
	"discussion",
	"discussion_comment",
	"fork",
	"gollum",
	"image_version",
	"issue_comment",
	"issues",
	"label",
	"milestone",
	"page_build",
	"public",
	"registry_package",
	"release",
	"repository_dispatch",
	"schedule",
	"watch",
	"workflow_call"
]);
const EVENTS_WITHOUT_DEFAULT_ACTOR = /* @__PURE__ */ new Set(["schedule"]);
function renderDefaultTemplate(event, overrides = {}) {
	const options = deepMerge(DEFAULT_OPTIONS, overrides);
	const fields = buildFields(event, options);
	const elements = [];
	if (fields.length) elements.push({
		tag: "div",
		fields: fields.map(({ label, value }) => ({
			is_short: true,
			text: {
				tag: "lark_md",
				content: `**${label}**: ${value}`
			}
		}))
	});
	if (options.show.summary && event.summary?.length) {
		if (elements.length) elements.push({ tag: "hr" });
		elements.push(...buildSummaryElements(event.summary, options));
	}
	if (options.show.link && event.primaryUrl) elements.push({
		tag: "action",
		actions: [{
			tag: "button",
			text: {
				tag: "plain_text",
				content: options.buttonText
			},
			url: event.primaryUrl,
			type: "primary"
		}]
	});
	return {
		msg_type: "interactive",
		card: {
			config: { wide_screen_mode: true },
			header: {
				template: event.headerTemplate || options.eventHeaderTemplates[event.name] || options.headerTemplate,
				title: {
					tag: "plain_text",
					content: compact([options.titlePrefix, event.title]).join(" · ")
				}
			},
			elements
		}
	};
}
function buildFields(event, options) {
	return compact([
		options.show.event && field(options.labels.event, event.name),
		options.show.action && field(options.labels.action, event.action),
		options.show.repository && field(options.labels.repository, formatLink(event.repository, event.repositoryUrl)),
		options.show.actor && !EVENTS_WITHOUT_DEFAULT_ACTOR.has(event.name) && field(options.labels.actor, formatLink(event.actor, event.actorUrl)),
		options.show.ref && !titleAlreadyShowsRef(event) && !EVENTS_WITHOUT_DEFAULT_REF.has(event.name) && field(options.labels.ref, shortRef(event.ref)),
		options.show.sha && field(options.labels.sha, formatLink(shortSha(event.sha), event.shaUrl)),
		options.show.workflow && field(options.labels.workflow, event.workflow)
	]);
}
function titleAlreadyShowsRef(event) {
	return [
		"push",
		"create",
		"delete",
		"merge_group"
	].includes(event.name);
}
function buildSummaryElements(summary, options) {
	const items = summary.slice(0, options.maxSummaryItems);
	const hiddenCount = Math.max(0, summary.length - items.length);
	const fieldItems = items.filter((item) => item.label && item.value);
	if (fieldItems.length === items.length) {
		const group = fieldItems.find((item) => item.group)?.group;
		return [{
			tag: "div",
			text: {
				tag: "lark_md",
				content: formatKeyValueBlock(fieldItems, group, hiddenCount)
			}
		}];
	}
	if (items.length === 1 && hiddenCount === 0) {
		const [item] = items;
		return [{
			tag: "div",
			text: {
				tag: "lark_md",
				content: formatSummaryText(item)
			}
		}];
	}
	return [{
		tag: "div",
		text: {
			tag: "lark_md",
			content: [...items.map((item) => `- ${formatSummaryText(item)}`), hiddenCount > 0 ? `- +${hiddenCount} more` : ""].filter(Boolean).join("\n")
		}
	}];
}
function formatKeyValueBlock(items, group, hiddenCount) {
	if (!group && items.length === 1 && hiddenCount === 0) {
		const [item] = items;
		return `${item.label}: ${sanitizeMarkdown(item.value)}`;
	}
	return [
		group ? `**${group}:**` : "",
		...items.map((item) => `- ${item.label}: ${sanitizeMarkdown(item.value)}`),
		hiddenCount > 0 ? `- +${hiddenCount} more` : ""
	].filter(Boolean).join("\n");
}
function formatSummaryText(item) {
	const text = sanitizeMarkdown(item.text);
	if (!item.author) return text;
	return `${formatLink(`@${item.author}`, item.authorUrl)}: ${text}`;
}
function field(label, value) {
	return value ? {
		label,
		value
	} : null;
}
function formatLink(text, url) {
	if (!text) return "";
	if (!url) return escapeMarkdown(text);
	return `[${escapeMarkdown(text)}](${url})`;
}
function escapeMarkdown(value) {
	return String(value).replace(/\n/g, " ").replace(/\]/g, "\\]");
}
function sanitizeMarkdown(value) {
	return String(value || "").replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}
function compact(values) {
	return values.filter(Boolean);
}
//#endregion
//#region src/templates/index.ts
const templates = /* @__PURE__ */ new Map([["default", renderDefaultTemplate]]);
function renderTemplate(name, event, options = {}) {
	const render = templates.get(name);
	if (!render) throw new Error(`Unknown template: ${name}`);
	return render(event, options);
}
//#endregion
//#region src/workflow-command.ts
function addMask(value) {
	if (value) console.log(`::add-mask::${escapeData(value)}`);
}
function setFailed(error) {
	const message = error instanceof Error ? error.message : String(error);
	console.error(`::error::${escapeData(message)}`);
	process.exitCode = 1;
}
function escapeData(value) {
	return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
//#endregion
//#region src/index.ts
async function main({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
	const inputs = getActionInputs(env);
	addMask(inputs.webhook);
	addMask(inputs.secret);
	const eventName = requireEnv(env, "GITHUB_EVENT_NAME");
	const eventPath = requireEnv(env, "GITHUB_EVENT_PATH");
	const event = buildGitHubEventMessage(eventName, JSON.parse(await readFile(eventPath, "utf8")), env);
	const message = renderTemplate(inputs.template, event, inputs.templateOptions);
	await sendFeishuWebhook(inputs.webhook, message, {
		secret: inputs.secret,
		fetchImpl
	});
	console.log(`Sent ${eventName} event to Feishu`);
}
function requireEnv(env, name) {
	if (!env[name]) throw new Error(`Missing required environment variable: ${name}`);
	return env[name];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(setFailed);
//#endregion
export { main };
