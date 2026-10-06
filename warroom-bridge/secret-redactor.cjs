const { approvedValuesForState } = require("./env-broker.cjs");

const REDACTED = "[REDACTED]";
const MIN_VALUE_LENGTH = 4;
const MAX_BASE64_VALUE_LENGTH = 512;

function boundedBase64(value) {
  if (value.length < MIN_VALUE_LENGTH || value.length > MAX_BASE64_VALUE_LENGTH) {
    return [];
  }

  const encoded = Buffer.from(value, "utf8").toString("base64");
  const unpadded = encoded.replace(/=+$/, "");
  return [...new Set([encoded, unpadded, encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")])];
}

function shellDoubleQuote(value) {
  return `"${value.replace(/["\\$`]/g, "\\$&")}"`;
}

function shellSingleQuote(value) {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function secretCandidates(values) {
  const candidates = new Set();

  for (const value of Object.values(values ?? {})) {
    if (typeof value !== "string" || value.length === 0) continue;

    candidates.add(value);
    candidates.add(JSON.stringify(value));
    candidates.add(shellDoubleQuote(value));
    candidates.add(shellSingleQuote(value));
    const uri = encodeURIComponent(value);
    const lowerUri = uri.replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase());
    candidates.add(uri);
    candidates.add(lowerUri);
    candidates.add(uri.replace(/%20/g, "+"));
    candidates.add(lowerUri.replace(/%20/g, "+"));

    for (const encoded of boundedBase64(value)) candidates.add(encoded);
  }

  return [...candidates].sort((left, right) => right.length - left.length);
}

function redactText(value, approvedValues) {
  if (typeof value !== "string") return value;

  let redacted = value.replace(/WRM_CAP_[A-Za-z0-9_-]+/g, REDACTED);

  for (const candidate of secretCandidates(approvedValues)) {
    redacted = redacted.split(candidate).join(REDACTED);
  }

  return redacted;
}

function redactValue(value, approvedValues, seen = new WeakSet()) {
  if (typeof value === "string") return redactText(value, approvedValues);
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, approvedValues, seen));
  }

  const redacted = {};

  for (const [key, item] of Object.entries(value)) {
    redacted[key] = redactValue(item, approvedValues, seen);
  }

  return redacted;
}

function createSecretRedactor(values) {
  const approvedValues = Array.isArray(values)
    ? Object.fromEntries(values.map((value, index) => [index, value]))
    : values;
  return (value) => redactText(value, approvedValues);
}

function redactorForState(state, parentEnv = process.env) {
  const approvedValues = approvedValuesForState(state, parentEnv);

  return {
    approvedValues,
    redactText: (value) => redactText(value, approvedValues),
    redactValue: (value) => redactValue(value, approvedValues),
  };
}

function safeRedactorForState(state, parentEnv = process.env) {
  try {
    return redactorForState(state, parentEnv);
  } catch {
    if (state?.environment !== undefined) {
      return {
        approvedValues: {},
        redactText: (value) => typeof value === "string" ? REDACTED : value,
        redactValue: () => REDACTED,
      };
    }

    return {
      approvedValues: {},
      redactText: (value) => redactText(value, {}),
      redactValue: (value) => redactValue(value, {}),
    };
  }
}

module.exports = {
  REDACTED,
  boundedBase64,
  createSecretRedactor,
  redactText,
  redactValue,
  redactorForState,
  safeRedactorForState,
  shellDoubleQuote,
  shellSingleQuote,
  secretCandidates,
};
