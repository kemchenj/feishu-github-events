import type { webhooks } from "@octokit/openapi-webhooks-types";
import type { ActionEventName } from "./action-events.js";

type WebhookPayload<Key extends keyof webhooks> =
  webhooks[Key]["post"] extends {
    requestBody: {
      content: {
        "application/json": infer Payload;
      };
    };
  }
    ? Payload
    : Record<string, unknown>;

export type PushEvent = WebhookPayload<"push">;
export type DeploymentEvent =
  | WebhookPayload<"deployment-created">
  | WebhookPayload<"deployment-status-created">;

export type GitHubPayload = Record<string, any>;

export type PayloadOf<Name extends ActionEventName> =
  Name extends "push" ? PushEvent : GitHubPayload;

export interface SummaryItem {
  group?: string;
  label?: string;
  value?: string;
  text: string;
  url?: string;
  author?: string;
  authorUrl?: string;
}

export interface LarkMessage {
  name: ActionEventName;
  action: string;
  repository: string;
  repositoryUrl: string;
  actor: string;
  actorUrl: string;
  ref: string;
  sha: string;
  shaUrl: string;
  workflow: string;
  title: string;
  summary: SummaryItem[];
  primaryUrl: string;
  headerTemplate?: string;
}

export interface HandlerContext {
  env: NodeJS.ProcessEnv;
  base: LarkMessage;
}

export type GitHubEventHandler<Name extends ActionEventName = ActionEventName> = (
  payload: PayloadOf<Name>,
  context: HandlerContext
) => Partial<LarkMessage>;

export interface FeishuText {
  tag: "plain_text" | "lark_md";
  content: string;
}

export interface FeishuCardElement {
  tag: string;
  text?: FeishuText;
  fields?: Array<{
    is_short: boolean;
    text: FeishuText;
  }>;
  actions?: Array<{
    tag: "button";
    text: FeishuText;
    url: string;
    type?: string;
  }>;
}

export interface FeishuInteractiveMessage {
  msg_type: "interactive";
  card: {
    config: {
      wide_screen_mode: boolean;
    };
    header: {
      template: string;
      title: FeishuText;
    };
    elements: FeishuCardElement[];
  };
}
