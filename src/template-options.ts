export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function deepMerge<T extends unknown, U extends unknown>(base: T, override: U): T | U {
  if (!isPlainObject(base)) {
    return clone(override);
  }

  const result = clone(base) as Record<string, unknown>;
  if (!isPlainObject(override)) {
    return result as T;
  }

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = clone(value);
    }
  }

  return result as T | U;
}

export function parseJsonObject(value: unknown, label = "JSON"): Record<string, unknown> {
  if (value == null || String(value).trim() === "") {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(String(value));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} must be valid JSON: ${message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error(`${label} must be a JSON object`);
  }

  return parsed;
}

function clone<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => clone(item)) as T;
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, clone(item)])
    ) as T;
  }

  return value;
}
