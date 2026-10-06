const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  MAX_WAIT_MS,
  MAX_RESULT_LENGTH,
  TaskStore,
  formatTaskEnvelope,
} = require("../task-store.cjs");

async function withStore(run) {
  const runtimeDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "warroom-task-store-")
  );
  const store = new TaskStore({
    runtimeDir,
    projectId: "project_test",
  });

  try {
    return await run(store, runtimeDir);
  } finally {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
  }
}

function filesystemHonorsPermissions(runtimeDir) {
  const probe = path.join(runtimeDir, ".mode-probe");
  fs.writeFileSync(probe, "", { mode: 0o600 });
  fs.chmodSync(probe, 0o600);
  const honorsPermissions =
    (fs.statSync(probe).mode & 0o777) === 0o600;
  fs.rmSync(probe, { force: true });
  return honorsPermissions;
}

async function createSubmittedTask(store) {
  const created = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Inspect synthetic fixture.",
  });
  await store.markSubmitted(created.task.taskId);
  return created;
}

function completion(created, overrides = {}) {
  return {
    taskId: created.task.taskId,
    division: "frontend",
    projectId: "project_test",
    opencodeSession: "session_frontend",
    capability: created.capability,
    outcome: "completed",
    result: "Synthetic task completed.",
    ...overrides,
  };
}

test("creates minimal queued task atomically with 0600 storage", async () => withStore(async (store) => {
  const created = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Inspect synthetic fixture.",
  });

  assert.equal(created.task.state, "queued");
  assert.match(created.task.taskId, /^task_[0-9a-fA-F-]+$/);
  assert.match(created.task.opencodeMessageID, /^msg_[0-9a-fA-F-]+$/);
  assert.equal(created.task.capabilityHash, undefined);
  assert.ok(fs.existsSync(store.file));
  if (filesystemHonorsPermissions(path.dirname(store.file))) {
    assert.equal(fs.statSync(store.file).mode & 0o777, 0o600);
  }
  assert.equal(fs.readdirSync(path.dirname(store.file)).some((name) => name.includes(".tmp-")), false);

  const another = await store.createTask({
    division: "backend",
    opencodeSession: "session_backend",
    instruction: "Another synthetic fixture.",
  });
  assert.match(another.task.taskId, /^task_[0-9a-fA-F-]+$/);
  assert.match(another.task.opencodeMessageID, /^msg_[0-9a-fA-F-]+$/);
  assert.notEqual(created.task.opencodeMessageID, another.task.opencodeMessageID);
  assert.equal(store.load().tasks[0].opencodeMessageID, created.task.opencodeMessageID);
  assert.equal(store.load().tasks[1].opencodeMessageID, another.task.opencodeMessageID);
}));

test("records observable dispatch transitions", async () => withStore(async (store) => {
  const submitted = await createSubmittedTask(store);
  assert.equal(store.load().tasks[0].state, "submitted");
  assert.ok(store.load().tasks[0].submittedAt);

  const failedDispatch = await store.createTask({
    division: "backend",
    opencodeSession: "session_backend",
    instruction: "Synthetic dispatch failure.",
  });
  assert.equal((await store.markDispatchFailed(failedDispatch.task.taskId)).state, "dispatch_failed");
  assert.throws(
    () => store.markSubmitted(failedDispatch.task.taskId),
    /expected queued/
  );
  assert.equal(submitted.task.division, "frontend");
}));

for (const outcome of ["completed", "failed", "blocked"]) {
  test(`accepts explicit ${outcome} completion from assigned division`, async () => withStore(async (store) => {
    const created = await createSubmittedTask(store);
    const task = await store.completeTask(completion(created, { outcome }));

    assert.equal(task.state, outcome);
    assert.equal(task.outcome, outcome);
    assert.equal(task.result, "Synthetic task completed.");
  }));
}

test("rejects completion from wrong division, project, or session", async () => withStore(async (store) => {
  const created = await createSubmittedTask(store);

  assert.throws(() => store.completeTask(completion(created, {
    division: "backend",
  })), /division does not match/);
  assert.throws(() => store.completeTask(completion(created, {
    projectId: "project_other",
  })), /project does not match task store/);
  assert.throws(() => store.completeTask(completion(created, {
    opencodeSession: "session_old",
  })), /OpenCode session does not match/);
}));

test("rejects unknown task and invalid capability", async () => withStore(async (store) => {
  const created = await createSubmittedTask(store);

  assert.throws(() => store.completeTask(completion(created, {
    taskId: "task_missing",
  })), /task not found/);
  assert.throws(() => store.completeTask(completion(created, {
    capability: "WRM_CAP_" + "x".repeat(32),
  })), /capability does not match/);
}));

test("accepts duplicate identical completion but rejects conflict", async () => withStore(async (store) => {
  const created = await createSubmittedTask(store);
  const input = completion(created);
  const first = await store.completeTask(input);
  const duplicate = await store.completeTask(input);

  assert.deepEqual(duplicate, first);
  assert.throws(() => store.completeTask({
    ...input,
    outcome: "failed",
    result: "Different result.",
  }), /terminal outcome/);
}));

test("operator cancellation releases active lock and rejects late callback", async () => withStore(async (store) => {
  const queued = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Cancel queued fixture.",
  });
  const cancelled = store.cancelTask({
    taskId: queued.task.taskId,
    projectId: "project_test",
    reason: "  Operator\r\nrecovery.  ",
  });

  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.outcome, "cancelled");
  assert.equal(cancelled.result, "Operator\nrecovery.");
  assert.ok(cancelled.cancelledAt);
  const replacement = store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Replacement fixture.",
  });
  assert.equal(replacement.created, true);
  assert.throws(
    () => store.completeTask(completion(queued)),
    /terminal outcome cancelled/
  );
}));

test("operator cancellation accepts submitted task and redacts its reason", async () => withStore(async (store) => {
  const submitted = await createSubmittedTask(store);
  const cancelled = store.cancelTask({
    taskId: submitted.task.taskId,
    projectId: "project_test",
    reason: `Operator recovery ${submitted.capability}`,
  });

  assert.equal(cancelled.state, "cancelled");
  assert.equal(cancelled.result, "Operator recovery [REDACTED]");
  assert.equal(JSON.stringify(cancelled).includes(submitted.capability), false);
}));

test("operator cancellation only accepts active task in matching project", async () => withStore(async (store) => {
  const submitted = await createSubmittedTask(store);
  assert.throws(
    () => store.cancelTask({
      taskId: submitted.task.taskId,
      projectId: "project_other",
      reason: "Wrong project.",
    }),
    /project does not match task store/
  );
  store.completeTask(completion(submitted));
  assert.throws(
    () => store.cancelTask({
      taskId: submitted.task.taskId,
      projectId: "project_test",
      reason: "Too late.",
    }),
    /expected queued or submitted/
  );
}));

test("rejects malformed or oversized result and terminal overwrite", async () => withStore(async (store) => {
  const created = await createSubmittedTask(store);

  assert.throws(() => store.completeTask(completion(created, {
    result: "",
  })), /result must be/);
  assert.throws(() => store.completeTask(completion(created, {
    result: "x".repeat(MAX_RESULT_LENGTH + 1),
  })), /result must be/);

  await store.completeTask(completion(created));
  assert.throws(() => store.completeTask(completion(created, {
    result: "Overwritten.",
  })), /terminal outcome/);
}));

test("survives reload and task envelope requires explicit callback", async () => withStore(async (store, runtimeDir) => {
  const created = await createSubmittedTask(store);
  const reloaded = new TaskStore({
    runtimeDir,
    projectId: "project_test",
  });
  const envelope = formatTaskEnvelope({
    task: created.task,
    capability: created.capability,
    instruction: "Inspect synthetic fixture.",
  });

  assert.equal(reloaded.load().tasks[0].state, "submitted");
  assert.match(envelope, new RegExp(`TASK_ID: ${created.task.taskId}`));
  assert.match(envelope, /warroom_task_complete exactly once/);
  assert.match(envelope, /without secrets/);
}));

test("returns same active task for canonical instruction and rejects different instruction", async () => withStore(async (store) => {
  const first = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "  Inspect\r\nsynthetic fixture.  ",
  });
  const duplicate = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Inspect\nsynthetic fixture.",
  });

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.task.taskId, first.task.taskId);
  assert.equal(duplicate.capability, undefined);
  assert.throws(() => store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Different instruction.",
  }), /active task already exists/);
}));

test("serializes same-store mutations without duplicate active tasks", async () => withStore(async (store) => {
  const results = await Promise.all([
    Promise.resolve().then(() => store.createTask({
      division: "backend",
      opencodeSession: "session_backend",
      instruction: "Concurrent synthetic instruction.",
    })),
    Promise.resolve().then(() => store.createTask({
      division: "backend",
      opencodeSession: "session_backend",
      instruction: "Concurrent synthetic instruction.",
    })),
  ]);

  assert.equal(store.load().tasks.length, 1);
  assert.deepEqual(
    results.map((result) => result.task.taskId),
    [results[0].task.taskId, results[0].task.taskId]
  );
}));

test("redacts capability in completion result and never persists raw credential", async () => withStore(async (store) => {
  const created = await createSubmittedTask(store);
  const leaked = `result includes ${created.capability}`;
  const completed = await store.completeTask(completion(created, {
    result: leaked,
  }));
  const persisted = fs.readFileSync(store.file, "utf8");

  assert.equal(completed.result, "result includes [REDACTED]");
  assert.equal(persisted.includes(created.capability), false);
  assert.equal(JSON.stringify(completed).includes(created.capability), false);
}));

test("wait expiry observes active task without changing state", async () => withStore(async (store) => {
  const created = await store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Wait for synthetic completion.",
  });
  const waited = await store.waitForTask({
    taskId: created.task.taskId,
    timeoutMs: 5,
  });

  assert.equal(waited.timedOut, true);
  assert.equal(waited.task.state, "queued");
  assert.equal(store.load().tasks[0].state, "queued");
  assert.throws(() => store.waitForTask({
    taskId: created.task.taskId,
    timeoutMs: MAX_WAIT_MS + 1,
  }), /timeoutMs/);
}));
