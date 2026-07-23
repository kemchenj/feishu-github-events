import type { webhooks } from "@octokit/openapi-webhooks-types";
import type { ActionEventName } from "../action-events.ts";

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

export interface GitHubEventMessage {
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
  base: GitHubEventMessage;
}

export type GitHubEventHandler<Name extends ActionEventName = ActionEventName> = (
  payload: PayloadOf<Name>,
  context: HandlerContext
) => Partial<GitHubEventMessage>;
