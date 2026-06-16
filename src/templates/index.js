import { renderDefaultTemplate } from "./default.js";

const templates = new Map([["default", renderDefaultTemplate]]);

export function renderTemplate(name, event, options = {}) {
  const render = templates.get(name);
  if (!render) {
    throw new Error(`Unknown template: ${name}`);
  }

  return render(event, options);
}

export function listTemplates() {
  return [...templates.keys()];
}
