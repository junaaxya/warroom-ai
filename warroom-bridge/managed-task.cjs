const {
  canonicalizeInstruction,
  createCapability,
  formatTaskEnvelope,
} = require("./task-store.cjs");
const { redactCapabilities } = require("./message-normalizer.cjs");

async function dispatchManagedTask({
  store,
  identity,
  instruction,
  dispatch,
  redact,
}) {
  const redactError = redact || store.redact || redactCapabilities;
  const canonicalInstruction = canonicalizeInstruction(instruction);
  const capability = createCapability();
  const created = store.createTask({
    division: identity.division,
    opencodeSession: identity.opencodeSession,
    instruction: canonicalInstruction,
    capability,
  });

  if (!created.created) {
    return {
      task: created.task,
      created: false,
      dispatched: false,
    };
  }

  const envelope = formatTaskEnvelope({
    task: created.task,
    capability,
    instruction: canonicalInstruction,
  });

  try {
    await dispatch({
      task: created.task,
      envelope,
      target: identity.target,
    });
  } catch (error) {
    let dispatchFailed;

    try {
      dispatchFailed = store.markDispatchFailed(created.task.taskId);
    } catch {
      dispatchFailed = store.getTask(created.task.taskId);
    }

    const safeError = new Error(redactError(String(error)));
    safeError.code = "TASK_DISPATCH_FAILED";
    safeError.task = dispatchFailed;
    throw safeError;
  }

  const submitted = store.markSubmitted(created.task.taskId);

  return {
    task: submitted,
    created: true,
    dispatched: true,
  };
}

module.exports = {
  dispatchManagedTask,
};
