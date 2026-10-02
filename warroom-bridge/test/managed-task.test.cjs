const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { dispatchManagedTask } = require("../managed-task.cjs");
const { TaskStore } = require("../task-store.cjs");

async function withStore(run) {
  const runtimeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "warroom-managed-task-")
  );
  const store = new TaskStore({
    runtimeDir,
    projectId: "project_test",
  });

  try {
    return await run(store);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

test("dispatches one managed task and exposes no capability in result or history", async () => withStore(async (store) => {
  const calls = [];
  const result = await dispatchManagedTask({
    store,
    identity: {
      division: "frontend",
      opencodeSession: "session_frontend",
      target: { server: "http://synthetic", session: "session_frontend" },
    },
    instruction: "Inspect managed fixture.",
    dispatch: async ({ envelope }) => {
      calls.push(envelope);
    },
  });

  assert.equal(result.created, true);
  assert.equal(result.dispatched, true);
  assert.equal(result.task.state, "submitted");
  assert.match(result.task.taskId, /^task_[0-9a-fA-F-]+$/);
  assert.match(result.task.opencodeMessageID, /^msg_[0-9a-fA-F-]+$/);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /warroom_task_complete exactly once/);
  assert.equal(JSON.stringify(result).includes("WRM_CAP_"), false);
  assert.equal(fs.readFileSync(store.file, "utf8").includes("WRM_CAP_"), false);
}));

test("keeps managed task queued during dispatch and submits after success", async () => withStore(async (store) => {
  let taskDuringDispatch;

  const result = await dispatchManagedTask({
    store,
    identity: {
      division: "frontend",
      opencodeSession: "session_frontend",
      target: { server: "http://synthetic", session: "session_frontend" },
    },
    instruction: "Observe dispatch state fixture.",
    dispatch: async ({ task }) => {
      taskDuringDispatch = store.getTask(task.taskId);
    },
  });

  assert.equal(taskDuringDispatch.state, "queued");
  assert.equal(result.task.state, "submitted");
  assert.equal(store.getTask(result.task.taskId).state, "submitted");
}));

test("duplicate managed instruction returns existing task without redispatch", async () => withStore(async (store) => {
  let dispatchCount = 0;
  const input = {
    store,
    identity: {
      division: "backend",
      opencodeSession: "session_backend",
      target: { server: "http://synthetic", session: "session_backend" },
    },
    instruction: "Same managed fixture.",
    dispatch: async () => {
      dispatchCount += 1;
    },
  };

  const first = await dispatchManagedTask(input);
  const duplicate = await dispatchManagedTask(input);

  assert.equal(first.task.taskId, duplicate.task.taskId);
  assert.equal(duplicate.created, false);
  assert.equal(dispatchCount, 1);
}));

test("dispatch failure leaves explicit non-completed state and redacts error", async () => withStore(async (store) => {
  await assert.rejects(
    () => dispatchManagedTask({
      store,
      identity: {
        division: "frontend",
        opencodeSession: "session_frontend",
        target: { server: "http://synthetic", session: "session_frontend" },
      },
      instruction: "Fail managed fixture.",
      dispatch: async ({ envelope }) => {
        const capability = envelope.match(/capability: (WRM_CAP_[A-Za-z0-9_-]+)/)[1];
        throw new Error(`synthetic dispatch failed with ${capability}`);
      },
    }),
    (error) => {
      assert.equal(error.code, "TASK_DISPATCH_FAILED");
      assert.equal(error.task.state, "dispatch_failed");
      assert.equal(error.message.includes("WRM_CAP_"), false);
      return true;
    }
  );
}));
