import { deepMerge, parseJsonObject } from "./template-options.js";

export interface ActionInputs {
  webhook: string;
  secret: string;
  template: string;
  templateOptions: Record<string, unknown>;
}

export function getActionInputs(env: NodeJS.ProcessEnv = process.env): ActionInputs {
  const webhook = getInput(env, "webhook", { required: true });
  const secret = getInput(env, "secret");
  const template = getInput(env, "template") || "default";
  let templateOptions = parseJsonObject(
    getInput(env, "template-options") || "{}",
    "template-options"
  );
  const showRepository = getOptionalBooleanInput(env, "show-repository");

  if (showRepository != null) {
    templateOptions = deepMerge(templateOptions, {
      show: {
        repository: showRepository
      }
    }) as Record<string, unknown>;
  }

  return {
    webhook,
    secret,
    template,
    templateOptions
  };
}

export function getInput(
  env: NodeJS.ProcessEnv,
  name: string,
  { required = false }: { required?: boolean } = {}
): string {
  const candidates = inputEnvNames(name);
  const value = candidates
    .map((key) => env[key])
    .find((item) => item != null && item !== "");

  if (required && value == null) {
    throw new Error(`Missing required input: ${name}`);
  }

  return value == null ? "" : String(value).trim();
}

function getOptionalBooleanInput(env: NodeJS.ProcessEnv, name: string): boolean | undefined {
  const value = getInput(env, name);
  if (!value) {
    return undefined;
  }

  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(value.toLowerCase())) {
    return false;
  }

  throw new Error(`${name} must be a boolean`);
}

function inputEnvNames(name: string): string[] {
  const canonical = `INPUT_${name.toUpperCase().replace(/ /g, "_")}`;
  const underscore = canonical.replace(/-/g, "_");
  return canonical === underscore ? [canonical] : [canonical, underscore];
}
