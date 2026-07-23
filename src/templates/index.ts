import { renderDefaultTemplate } from "./default.ts";
import type { GitHubEventMessage } from "../github/types.ts";
import type { LarkMessage } from "../lark/types.ts";

const templates = new Map([["default", renderDefaultTemplate]]);

export function renderTemplate(
  name: string,
  event: GitHubEventMessage,
  options: Record<string, unknown> = {}
): LarkMessage {
  const render = templates.get(name);
  if (!render) {
    throw new Error(`Unknown template: ${name}`);
  }

  return render(event, options);
}

export function listTemplates(): string[] {
  return [...templates.keys()];
}
