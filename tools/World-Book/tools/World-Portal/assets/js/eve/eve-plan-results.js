const TOKEN = /^\$result\.([^.]+)\.([a-zA-Z0-9_]+)$/;

export function isResultReference(value) {
  return typeof value === "string" && TOKEN.test(value);
}

function resolveString(value, results) {
  const match = typeof value === "string" ? value.match(TOKEN) : null;
  if (!match) return value;
  const result = results.get(match[1]);
  if (!result || !(match[2] in result)) {
    throw new Error(`Command result reference ${value} is unavailable.`);
  }
  return result[match[2]];
}

export function resolvePlanValue(value, results) {
  if (Array.isArray(value)) return value.map((item) => resolvePlanValue(item, results));
  if (value && typeof value === "object") {
    if (typeof value.fromCommand === "string" && typeof value.field === "string") {
      return resolveString(`$result.${value.fromCommand}.${value.field}`, results);
    }
    return Object.fromEntries(Object.entries(value).map(([key, item]) => (
      [key, resolvePlanValue(item, results)]
    )));
  }
  return resolveString(value, results);
}
