import { renderDefaultTemplate } from "./default.js";
import type { GitHubEventMessage } from "../github/types.js";
import type { LarkMessage } from "../lark/types.js";

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
