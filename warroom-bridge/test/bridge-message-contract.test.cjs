const test = require("node:test");
const assert = require("node:assert/strict");

const {
  redactCapabilities,
  normalizeMessage,
  normalizeMessages,
} = require("../message-normalizer.cjs");

test("preserves role and text compatibility", () => {
  assert.deepEqual(
    normalizeMessage({
      info: { role: "assistant" },
      parts: [
        { type: "text", text: "first" },
        { type: "tool", text: "ignored" },
        { type: "text", text: "second" },
      ],
    }),
    {
      role: "assistant",
      text: "first\nsecond",
      info: { role: "assistant" },
    }
  );
});

test("preserves selected OpenCode message metadata without source mutation", () => {
  const source = {
    info: {
      id: "msg-assistant-1",
      messageID: "wrm-input-1",
      seq: 42,
      role: "assistant",
      agent: "build",
      parentID: "msg-user-1",
      metadata: { syntheticSecret: "must-not-copy" },
    },
    parts: [{ type: "text", text: "result" }],
  };
  const before = structuredClone(source);

  assert.deepEqual(normalizeMessage(source), {
    role: "assistant",
    text: "result",
    info: {
      id: "msg-assistant-1",
      messageID: "wrm-input-1",
      seq: 42,
      role: "assistant",
      agent: "build",
      parentID: "msg-user-1",
    },
  });
  assert.deepEqual(source, before);
});

test("preserves supplied messageID when OpenCode exposes it", () => {
  const messages = normalizeMessages([
    {
      info: {
        id: "msg-user-1",
        messageID: "wrm-input-1",
        seq: 41,
        role: "user",
      },
      parts: [{ type: "text", text: "request" }],
    },
  ]);

  assert.equal(messages[0].info.messageID, "wrm-input-1");
  assert.equal(messages[0].info.seq, 41);
});

test("does not claim assistant correlation when response has no link field", () => {
  const messages = normalizeMessages([
    {
      info: {
        id: "msg-user-1",
        messageID: "wrm-input-1",
        seq: 41,
        role: "user",
      },
      parts: [{ type: "text", text: "request" }],
    },
    {
      info: {
        id: "msg-assistant-1",
        seq: 42,
        role: "assistant",
      },
      parts: [{ type: "text", text: "response" }],
    },
  ]);

  assert.equal(messages[1].info.messageID, undefined);
  assert.equal(messages[1].info.parentID, undefined);
  assert.notEqual(messages[1].info.seq, messages[0].info.seq);
});

test("normalizes missing and malformed message structures safely", () => {
  assert.deepEqual(normalizeMessages([null, {}, {
    info: { role: { unexpected: true }, seq: "not-a-seq" },
    parts: [{ type: "text", text: 42 }, null],
  }]), [
    { role: "unknown", text: "" },
    { role: "unknown", text: "" },
    { role: "unknown", text: "" },
  ]);
  assert.deepEqual(normalizeMessages({ unexpected: true }), []);
});

test("redacts exact task capabilities from normalized message text", () => {
  const capability = "WRM_CAP_AbCdEf0123_-xyz";
  const message = normalizeMessage({
    info: { role: "assistant" },
    parts: [{
      type: "text",
      text: `before ${capability} after`,
    }],
  });

  assert.equal(message.text, "before [REDACTED] after");
  assert.equal(redactCapabilities(capability), "[REDACTED]");
  assert.equal(message.text.includes(capability), false);
});
