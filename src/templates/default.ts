import { shortRef, shortSha } from "../github-event.ts";
import { deepMerge } from "../template-options.ts";
import type { GitHubEventMessage, SummaryItem } from "../github/types.ts";
import type { LarkCardElement, LarkMessage } from "../lark/types.ts";

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

const EVENTS_WITHOUT_DEFAULT_REF = new Set([
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

const EVENTS_WITHOUT_DEFAULT_ACTOR = new Set([
  "schedule"
]);

type TemplateOptions = typeof DEFAULT_OPTIONS & {
  eventHeaderTemplates: Record<string, string>;
} & Record<string, any>;

export function renderDefaultTemplate(
  event: GitHubEventMessage,
  overrides: Record<string, unknown> = {}
): LarkMessage {
  const options = deepMerge(DEFAULT_OPTIONS, overrides) as TemplateOptions;
  const fields = buildFields(event, options);
  const elements: LarkCardElement[] = [];

  if (fields.length) {
    elements.push({
      tag: "div",
      fields: fields.map(({ label, value }) => ({
        is_short: true,
        text: {
          tag: "lark_md",
          content: `**${label}**: ${value}`
        }
      }))
    });
  }

  if (options.show.summary && event.summary?.length) {
    if (elements.length) {
      elements.push({ tag: "hr" });
    }

    elements.push(...buildSummaryElements(event.summary, options));
  }

  if (options.show.link && event.primaryUrl) {
    elements.push({
      tag: "action",
      actions: [
        {
          tag: "button",
          text: {
            tag: "plain_text",
            content: options.buttonText
          },
          url: event.primaryUrl,
          type: "primary"
        }
      ]
    });
  }

  return {
    msg_type: "interactive",
    card: {
      config: {
        wide_screen_mode: true
      },
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

function buildFields(event: GitHubEventMessage, options: TemplateOptions): Array<{ label: string; value: string }> {
  return compact([
    options.show.event && field(options.labels.event, event.name),
    options.show.action && field(options.labels.action, event.action),
    options.show.repository &&
      field(options.labels.repository, formatLink(event.repository, event.repositoryUrl)),
    options.show.actor &&
      !EVENTS_WITHOUT_DEFAULT_ACTOR.has(event.name) &&
      field(options.labels.actor, formatLink(event.actor, event.actorUrl)),
    options.show.ref &&
      !titleAlreadyShowsRef(event) &&
      !EVENTS_WITHOUT_DEFAULT_REF.has(event.name) &&
      field(options.labels.ref, shortRef(event.ref)),
    options.show.sha && field(options.labels.sha, formatLink(shortSha(event.sha), event.shaUrl)),
    options.show.workflow && field(options.labels.workflow, event.workflow)
  ]);
}

function titleAlreadyShowsRef(event: GitHubEventMessage): boolean {
  return ["push", "create", "delete", "merge_group"].includes(event.name);
}

function buildSummaryElements(summary: SummaryItem[], options: TemplateOptions): LarkCardElement[] {
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
      content: [
        ...items.map((item) => `- ${formatSummaryText(item)}`),
        hiddenCount > 0 ? `- +${hiddenCount} more` : ""
      ].filter(Boolean).join("\n")
    }
  }];
}

function formatKeyValueBlock(items: SummaryItem[], group: string | undefined, hiddenCount: number): string {
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

function formatSummaryText(item: SummaryItem): string {
  const text = sanitizeMarkdown(item.text);
  if (!item.author) {
    return text;
  }

  return `${formatLink(`@${item.author}`, item.authorUrl)}: ${text}`;
}

function field(label: string, value: string): { label: string; value: string } | null {
  return value ? { label, value } : null;
}

function formatLink(text: string, url?: string): string {
  if (!text) {
    return "";
  }

  if (!url) {
    return escapeMarkdown(text);
  }

  return `[${escapeMarkdown(text)}](${url})`;
}

function escapeMarkdown(value: unknown): string {
  return String(value).replace(/\n/g, " ").replace(/\]/g, "\\]");
}

function sanitizeMarkdown(value: unknown): string {
  return String(value || "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function compact<T>(values: Array<T | false | null | undefined | "">): T[] {
  return values.filter(Boolean) as T[];
}
