const {
  redactText: redactSecretText,
} = require("./secret-redactor.cjs");

const MESSAGE_INFO_FIELDS = [
  "id",
  "messageID",
  "seq",
  "role",
  "agent",
  "parentID",
];

const MESSAGE_INFO_TYPES = {
  id: "string",
  messageID: "string",
  seq: "number",
  role: "string",
  agent: "string",
  parentID: "string",
};

function redactCapabilities(text) {
  return redactSecretText(text, {});
}

function redactText(text, redact = redactCapabilities) {
  return redactCapabilities(redact(text));
}

function normalizeMessage(message, redact = redactCapabilities) {
  const info = {};

  for (const field of MESSAGE_INFO_FIELDS) {
    if (
      message?.info &&
      Object.prototype.hasOwnProperty.call(message.info, field) &&
      typeof message.info[field] === MESSAGE_INFO_TYPES[field]
    ) {
      info[field] = message.info[field];
    }
  }

  const parts = Array.isArray(message?.parts)
    ? message.parts
    : [];

  const normalized = {
    role:
      typeof message?.info?.role === "string"
        ? message.info.role
        : "unknown",
    text: parts
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => redactText(part.text, redact))
      .join("\n"),
  };

  if (Object.keys(info).length > 0) {
    normalized.info = info;
  }

  return normalized;
}

function normalizeMessages(messages, redact) {
  return Array.isArray(messages)
    ? messages.map((message) => normalizeMessage(message, redact))
    : [];
}

module.exports = {
  redactCapabilities,
  redactText,
  normalizeMessage,
  normalizeMessages,
};
