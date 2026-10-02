const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { redactCapabilities } = require("./message-normalizer.cjs");

const TERMINAL_OUTCOMES = new Set([
  "completed",
  "failed",
  "blocked",
]);
const ACTIVE_STATES = new Set([
  "queued",
  "submitted",
]);
const MAX_RESULT_LENGTH = 4000;
const MAX_WAIT_MS = 25000;

function taskFile(runtimeDir, projectId) {
  return path.join(runtimeDir, `${projectId}-tasks.json`);
}

function capabilityHash(capability) {
  return crypto
    .createHash("sha256")
    .update(capability)
    .digest("hex");
}

function createCapability() {
  return `WRM_CAP_${crypto.randomBytes(32).toString("base64url")}`;
}

function canonicalizeInstruction(instruction) {
  if (typeof instruction !== "string") {
    throw new Error(`instruction must be 1-${MAX_RESULT_LENGTH} characters`);
  }

  const canonical = instruction
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .trim();

  if (!canonical || canonical.length > MAX_RESULT_LENGTH) {
    throw new Error(`instruction must be 1-${MAX_RESULT_LENGTH} characters`);
  }

  return canonical;
}

function publicTask(task) {
  return {
    taskId: task.taskId,
    division: task.division,
    projectId: task.projectId,
    opencodeSession: task.opencodeSession,
    opencodeMessageID: task.opencodeMessageID,
    requestHash: task.requestHash,
    submittedAt: task.submittedAt,
    updatedAt: task.updatedAt,
    state: task.state,
    outcome: task.outcome,
    result:
      typeof task.result === "string"
        ? redactCapabilities(task.result)
        : task.result,
  };
}

function validId(value, name) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`${name} is invalid`);
  }
}

function validDivision(value) {
  if (!["frontend", "backend"].includes(value)) {
    throw new Error("division is invalid");
  }
}

function validResult(value) {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > MAX_RESULT_LENGTH
  ) {
    throw new Error(`result must be 1-${MAX_RESULT_LENGTH} characters`);
  }
}

function validCapability(value) {
  if (
    typeof value !== "string" ||
    !(
      /^WRM_CAP_[A-Za-z0-9_-]+$/.test(value) ||
      /^[A-Za-z0-9_-]{32,256}$/.test(value)
    )
  ) {
    throw new Error("task capability is invalid");
  }
}

function validWait(timeoutMs) {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 0 ||
    timeoutMs > MAX_WAIT_MS
  ) {
    throw new Error(`timeoutMs must be 0-${MAX_WAIT_MS}`);
  }
}

function writeAtomic(file, data) {
  const temp = `${file}.tmp-${process.pid}-${crypto.randomUUID()}`;
  const fd = fs.openSync(temp, "w", 0o600);

  try {
    fs.writeFileSync(fd, JSON.stringify(data, null, 2) + "\n");
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  fs.renameSync(temp, file);
  fs.chmodSync(file, 0o600);
}

class TaskStore {
  constructor({ runtimeDir, projectId }) {
    validId(projectId, "projectId");
    this.runtimeDir = runtimeDir;
    this.projectId = projectId;
    this.file = taskFile(runtimeDir, projectId);
    this.mutationLock = false;
  }

  load() {
    fs.mkdirSync(this.runtimeDir, { recursive: true, mode: 0o700 });

    if (!fs.existsSync(this.file)) {
      return {
        schemaVersion: 1,
        projectId: this.projectId,
        tasks: [],
      };
    }

    const store = JSON.parse(fs.readFileSync(this.file, "utf8"));

    if (
      store?.schemaVersion !== 1 ||
      store?.projectId !== this.projectId ||
      !Array.isArray(store.tasks)
    ) {
      throw new Error("task store is invalid");
    }

    return store;
  }

  save(store) {
    writeAtomic(this.file, store);
  }

  serializeMutation(mutation) {
    // Sync fs calls finish before next event-loop turn; this guard covers
    // in-process reentry only, not coordination across processes.
    if (this.mutationLock) {
      throw new Error("task store mutation is already in progress");
    }

    this.mutationLock = true;
    try {
      return mutation();
    } finally {
      this.mutationLock = false;
    }
  }

  createTask({
    division,
    opencodeSession,
    instruction,
    capability = createCapability(),
  }) {
    return this.serializeMutation(() => {
      validDivision(division);
      validId(opencodeSession, "opencodeSession");
      validCapability(capability);

      const canonicalInstruction = canonicalizeInstruction(instruction);
      const requestHash = crypto
        .createHash("sha256")
        .update(canonicalInstruction)
        .digest("hex");
      const store = this.load();
      const activeTask = store.tasks.find(
        (task) =>
          task.division === division &&
          task.opencodeSession === opencodeSession &&
          ACTIVE_STATES.has(task.state)
      );

      if (activeTask) {
        if (activeTask.requestHash === requestHash) {
          return {
            task: publicTask(activeTask),
            created: false,
          };
        }

        const error = new Error(
          `active task already exists for ${division}/${opencodeSession}`
        );
        error.code = "TASK_BUSY";
        throw error;
      }

      const taskId = `task_${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      const task = {
        taskId,
        division,
        projectId: this.projectId,
        opencodeSession,
        opencodeMessageID: `msg_${crypto.randomUUID()}`,
        requestHash,
        capabilityHash: capabilityHash(capability),
        submittedAt: null,
        updatedAt: now,
        state: "queued",
        outcome: null,
        result: null,
      };

      store.tasks.push(task);
      this.save(store);

      return {
        task: publicTask(task),
        capability,
        created: true,
      };
    });
  }

  getTask(taskId) {
    validId(taskId, "taskId");
    const task = this.load().tasks.find((item) => item.taskId === taskId);

    if (!task) {
      throw new Error(`task not found: ${taskId}`);
    }

    return publicTask(task);
  }

  transition(taskId, expectedState, nextState) {
    return this.serializeMutation(() => {
      validId(taskId, "taskId");
      const store = this.load();
      const task = store.tasks.find((item) => item.taskId === taskId);

      if (!task) {
        throw new Error(`task not found: ${taskId}`);
      }
      if (task.state !== expectedState) {
        throw new Error(
          `task ${taskId} is ${task.state}, expected ${expectedState}`
        );
      }

      task.state = nextState;
      task.updatedAt = new Date().toISOString();
      if (nextState === "submitted") {
        task.submittedAt = task.updatedAt;
      }
      this.save(store);
      return publicTask(task);
    });
  }

  markSubmitted(taskId) {
    return this.transition(taskId, "queued", "submitted");
  }

  markDispatchFailed(taskId) {
    return this.serializeMutation(() => {
      validId(taskId, "taskId");
      const store = this.load();
      const task = store.tasks.find((item) => item.taskId === taskId);

      if (!task) {
        throw new Error(`task not found: ${taskId}`);
      }
      if (!ACTIVE_STATES.has(task.state)) {
        throw new Error(
          `task ${taskId} is ${task.state}, expected active`
        );
      }

      task.state = "dispatch_failed";
      task.updatedAt = new Date().toISOString();
      this.save(store);
      return publicTask(task);
    });
  }

  completeTask({
    taskId,
    division,
    projectId,
    opencodeSession,
    capability,
    outcome,
    result,
  }) {
    return this.serializeMutation(() => {
      validId(taskId, "taskId");
      validDivision(division);
      validId(projectId, "projectId");
      validId(opencodeSession, "opencodeSession");
      validCapability(capability);
      validResult(result);

      if (!TERMINAL_OUTCOMES.has(outcome)) {
        throw new Error("outcome is invalid");
      }
      if (projectId !== this.projectId) {
        throw new Error("project does not match task store");
      }

      const safeResult = redactCapabilities(result);
      const store = this.load();
      const task = store.tasks.find((item) => item.taskId === taskId);

      if (!task) {
        throw new Error(`task not found: ${taskId}`);
      }
      if (task.division !== division) {
        throw new Error("division does not match task");
      }
      if (task.projectId !== projectId) {
        throw new Error("project does not match task");
      }
      if (task.opencodeSession !== opencodeSession) {
        throw new Error("OpenCode session does not match task");
      }
      if (
        !crypto.timingSafeEqual(
          Buffer.from(task.capabilityHash),
          Buffer.from(capabilityHash(capability))
        )
      ) {
        throw new Error("task capability does not match");
      }

      if (TERMINAL_OUTCOMES.has(task.state)) {
        if (task.state === outcome && task.result === safeResult) {
          return publicTask(task);
        }
        throw new Error(
          `task ${taskId} already has terminal outcome ${task.state}`
        );
      }
      if (task.state !== "submitted") {
        throw new Error(
          `task ${taskId} is ${task.state}, expected submitted`
        );
      }

      task.state = outcome;
      task.outcome = outcome;
      task.result = safeResult;
      task.updatedAt = new Date().toISOString();
      this.save(store);
      return publicTask(task);
    });
  }

  waitForTask({ taskId, timeoutMs }) {
    validId(taskId, "taskId");
    validWait(timeoutMs);

    const deadline = Date.now() + timeoutMs;
    let task = this.getTask(taskId);

    return (async () => {
      while (
        ACTIVE_STATES.has(task.state) &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(50, deadline - Date.now())));
        task = this.getTask(taskId);
      }

      return {
        task,
        timedOut: ACTIVE_STATES.has(task.state),
      };
    })();
  }
}

function formatTaskEnvelope({ task, capability, instruction }) {
  validCapability(capability);

  return [
    "[WARROOM TASK]",
    `TASK_ID: ${task.taskId}`,
    `DIVISION: ${task.division}`,
    "",
    canonicalizeInstruction(instruction),
    "",
    "When finished, call warroom_task_complete exactly once.",
    `taskId: ${task.taskId}`,
    `capability: ${capability}`,
    "outcome: completed, failed, or blocked",
    "result: concise result without secrets",
  ].join("\n");
}

module.exports = {
  ACTIVE_STATES,
  MAX_RESULT_LENGTH,
  MAX_WAIT_MS,
  TERMINAL_OUTCOMES,
  TaskStore,
  canonicalizeInstruction,
  createCapability,
  formatTaskEnvelope,
};
