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

test("registers read-only task routing without managed or legacy dispatch", () => {
  const tool = new RegExp(
    'server\\.registerTool\\(\\s*"warroom_route_task"[\\s\\S]*?\\n\\);'
  ).exec(source)?.[0];

  assert.ok(tool, "warroom_route_task is registered");
  assert.match(tool, /Read-only routing decision, not completion proof/);
  assert.match(tool, /inspection_first requires inspection\/decomposition before delegation/);
  assert.match(tool, /warroom_delegate_frontend and warroom_delegate_backend remain available/);
  assert.match(tool, /instruction: z\.string\(\)\.min\(1\)\.max\(4000\)/);
  assert.match(tool, /routeTaskIntent\(instruction\)/);
  assert.doesNotMatch(tool, /delegateTask|sendTo|bridgeRequest|taskStatus|taskWait/);
});

test("delegate and wait uses one managed dispatch and bounded wait slices", () => {
  const tool = new RegExp(
    'server\\.registerTool\\(\\s*"warroom_delegate_and_wait"[\\s\\S]*?\\n\\);'
  ).exec(source)?.[0];

  assert.ok(tool, "warroom_delegate_and_wait is registered");
  assert.match(tool, /explicit callback remains completion proof/i);
  assert.match(tool, /wait in bounded slices/i);
  assert.match(tool, /Timeout does not complete, fail, or cancel task/);
  assert.match(tool, /cannot proactively push result after ChatGPT turn has ended/);
  assert.match(tool, /division: z\.enum\(/);
  assert.match(tool, /instruction: z\.string\(\)\.min\(1\)\.max\(4000\)/);
  assert.match(tool, /timeoutMs: z\.number\(\)\.int\(\)\.min\(1\)\.max\(MAX_TASK_WAIT_SLICE_MS\)/);
  assert.match(tool, /overallTimeoutMs: z\.number\(\)\.int\(\)\.min\(1\)\.max\(MAX_TASK_WAIT_OVERALL_MS\)/);
  assert.match(tool, /delegateAndWait\(\{/);
  assert.doesNotMatch(tool, /sendTo|readDivision|warroom_broadcast_plan/);
});

test("registers bounded active-project policy update", () => {
  const tool = new RegExp(
    'server\\.registerTool\\(\\s*"warroom_project_policy_update"[\\s\\S]*?\\n\\);'
  ).exec(source)?.[0];

  assert.ok(tool, "warroom_project_policy_update is registered");
  assert.match(tool, /expectedProjectId: z\.string\(\)\.min\(1\)/);
  assert.match(tool, /ownership: z\.object\(/);
  assert.match(tool, /shared: z\.object\(/);
  assert.match(tool, /protected: z\.object\(/);
  assert.match(tool, /environment: z\.object\(/);
  assert.match(tool, /updateProjectPolicy\(\{/);
  assert.match(tool, /\.\.\.\(environment !== undefined && \{ environment \}\)/);
  assert.match(tool, /never modifies project source files/);
  assert.doesNotMatch(tool, /bridgeRequest|spawn|execFileAsync/);
});

test("registers explicit project-bound operator task cancellation", () => {
  const tool = new RegExp(
    'server\\.registerTool\\(\\s*"warroom_task_cancel"[\\s\\S]*?\\n\\);'
  ).exec(source)?.[0];

  assert.ok(tool, "warroom_task_cancel is registered");
  assert.match(tool, /Explicit operator cancellation/);
  assert.match(tool, /not agent completion/);
  assert.match(tool, /taskId: z\.string\(\)\.min\(1\)\.max\(128\)/);
  assert.match(tool, /expectedProjectId: z\.string\(\)\.min\(1\)\.max\(128\)/);
  assert.match(tool, /reason: z\.string\(\)\.min\(1\)\.max\(400\)/);
  assert.match(tool, /await taskCancel\(/);
  assert.doesNotMatch(tool, /delegateTask|sendTo|readDivision/);
});
