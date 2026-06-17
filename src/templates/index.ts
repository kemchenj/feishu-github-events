import { renderDefaultTemplate } from "./default.js";
import type { FeishuInteractiveMessage, LarkMessage } from "../types.js";

const templates = new Map([["default", renderDefaultTemplate]]);

export function renderTemplate(
  name: string,
  event: LarkMessage,
  options: Record<string, unknown> = {}
): FeishuInteractiveMessage {
  const render = templates.get(name);
  if (!render) {
    throw new Error(`Unknown template: ${name}`);
  }

  return render(event, options);
}

export function listTemplates(): string[] {
  return [...templates.keys()];
}
