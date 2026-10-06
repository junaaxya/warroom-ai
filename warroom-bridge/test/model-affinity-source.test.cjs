const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "..", "bin", "warroom"),
  "utf8"
);

test("onboarding persists division models and launches each role explicitly", () => {
  assert.match(source, /"model":\s*\n\s*"router9\/ag\/gemini-3\.8-flash-high"/);
  assert.match(source, /"model":\s*\n\s*"router9\/cx\/gpt-5\.6-terra"/);
  assert.match(source, /\\"providerID\\":\\"router9\\",\\"modelID\\":\\"ag\/gemini-3\.8-flash-high\\"/);
  assert.match(source, /\\"providerID\\":\\"router9\\",\\"modelID\\":\\"cx\/gpt-5\.6-terra\\"/);
  assert.match(source, /env-broker\.cjs[\s\S]*?--launch/);
  assert.match(source, /"\$MODEL"/);
  assert.match(source, /state\.get\("onboarding", \{\}\)\.get\("engine"\) == "generic-v1"/);
});
