export function isPlainObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function deepMerge(base, override) {
  if (!isPlainObject(base)) {
    return clone(override);
  }

  const result = clone(base);
  if (!isPlainObject(override)) {
    return result;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }

  return result;
}

export function parseJsonObject(value, label = "JSON") {
  if (value == null || String(value).trim() === "") {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed;
}

function clone(value) {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item));
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    );
  }

  return value;
}
