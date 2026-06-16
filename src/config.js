import { deepMerge, parseJsonObject } from "./template-options.js";

export function getActionInputs(env = process.env) {
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
    });
  }

  return {
    webhook,
    secret,
    template,
    templateOptions
  };
}

export function getInput(env, name, { required = false } = {}) {
  const candidates = inputEnvNames(name);
  const value = candidates
    .map((key) => env[key])
    .find((item) => item != null && item !== "");

  if (required && value == null) {
    throw new Error(`Missing required input: ${name}`);
  }

  return value == null ? "" : String(value).trim();
}

function getOptionalBooleanInput(env, name) {
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

function inputEnvNames(name) {
  const canonical = `INPUT_${name.toUpperCase().replace(/ /g, "_")}`;
  const underscore = canonical.replace(/-/g, "_");
  return canonical === underscore ? [canonical] : [canonical, underscore];
}
