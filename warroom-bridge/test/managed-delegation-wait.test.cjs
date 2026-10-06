const test = require("node:test");
const assert = require("node:assert/strict");

const {
  delegateAndWait,
} = require("../managed-delegation-wait.cjs");

test("dispatches once and returns exact completed task after wait slices", async () => {
  let dispatches = 0;
  const waits = [];
  let now = 0;
  const completed = {
    taskId: "task_test",
    state: "completed",
    outcome: "completed",
    result: "done",
  };

  const result = await delegateAndWait({
    division: "backend",
    instruction: "fixture",
    timeoutMs: 25000,
    overallTimeoutMs: 60000,
    delegateTask: async () => {
      dispatches += 1;
      return { task: { taskId: "task_test", state: "submitted" } };
    },
    taskWait: async (taskId, timeoutMs) => {
      waits.push({ taskId, timeoutMs });
      now += timeoutMs;
      return {
        task: waits.length === 2
          ? completed
          : { taskId, state: "submitted" },
      };
    },
    now: () => now,
  });

  assert.equal(dispatches, 1);
  assert.deepEqual(waits, [
    { taskId: "task_test", timeoutMs: 25000 },
    { taskId: "task_test", timeoutMs: 25000 },
  ]);
  assert.equal(result, completed);
});

test("returns active task on overall timeout without another dispatch", async () => {
  let dispatches = 0;
  let now = 0;
  const active = { taskId: "task_timeout", state: "submitted" };

  const result = await delegateAndWait({
    division: "frontend",
    instruction: "fixture",
    timeoutMs: 25000,
    overallTimeoutMs: 30000,
    delegateTask: async () => {
      dispatches += 1;
      return { task: active };
    },
    taskWait: async (_taskId, timeoutMs) => {
      now += timeoutMs;
      return { task: active, timedOut: true };
    },
    now: () => now,
  });

  assert.equal(dispatches, 1);
  assert.deepEqual(result, { task: active, timedOut: true });
  assert.equal(active.state, "submitted");
});
