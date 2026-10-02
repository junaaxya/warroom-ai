const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(
  path.join(__dirname, "..", "supervisor-mcp.js"),
  "utf8"
);

test("registers named managed delegation tools with completion guidance", () => {
  for (const division of ["frontend", "backend"]) {
    const name = `warroom_delegate_${division}`;
    const tool = new RegExp(
      `server\\.registerTool\\(\\s*"${name}"[\\s\\S]*?\\n\\);`
    ).exec(source)?.[0];

    assert.ok(tool, `${name} is registered`);
    assert.match(tool, /Preferred for .* work requiring a result/);
    assert.match(tool, /If task is submitted, call warroom_task_wait again for completion/);
    assert.match(
      tool,
      new RegExp(`await delegateTask\\(\\s*"${division}"`)
    );
  }
});

test("labels legacy send and read tools as non-completion proof", () => {
  for (const name of [
    "warroom_send_frontend",
    "warroom_send_backend",
    "warroom_read_frontend",
    "warroom_read_backend",
  ]) {
    const tool = new RegExp(
      `server\\.registerTool\\(\\s*"${name}"[\\s\\S]*?\\n\\);`
    ).exec(source)?.[0];

    assert.ok(tool, `${name} is registered`);
    assert.match(tool, /fire-and-forget/i);
    assert.match(tool, /not completion proof/i);
  }
});
