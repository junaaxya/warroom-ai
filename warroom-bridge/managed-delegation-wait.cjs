const MAX_TASK_WAIT_SLICE_MS = 25000;
const TERMINAL_TASK_STATES = new Set([
  "completed",
  "failed",
  "blocked",
]);

async function delegateAndWait({
  division,
  instruction,
  timeoutMs,
  overallTimeoutMs,
  delegateTask,
  taskWait,
  now = Date.now,
}) {
  const delegated = await delegateTask(
    division,
    instruction
  );
  let task = delegated.task;

  if (TERMINAL_TASK_STATES.has(task.state)) {
    return task;
  }

  const deadline = now() + overallTimeoutMs;

  while (now() < deadline) {
    const waited = await taskWait(
      task.taskId,
      Math.min(
        timeoutMs,
        MAX_TASK_WAIT_SLICE_MS,
        deadline - now()
      )
    );

    task = waited.task;

    if (TERMINAL_TASK_STATES.has(task.state)) {
      return task;
    }
  }

  return {
    task,
    timedOut: true,
  };
}

module.exports = {
  delegateAndWait,
  MAX_TASK_WAIT_SLICE_MS,
};
