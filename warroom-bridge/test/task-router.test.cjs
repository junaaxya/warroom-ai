const test = require("node:test");
const assert = require("node:assert/strict");

const {
  routeTaskIntent,
} = require("../task-router.cjs");

function assertBoundedResult(result) {
  const resultKeys = Object.keys(result).sort();
  const dispatchKeys = Object.keys(result.dispatch).sort();

  assert.deepEqual(
    resultKeys,
    result.nextStep
      ? ["dispatch", "kind", "nextStep", "reason", "signals"]
      : ["dispatch", "kind", "reason", "signals"]
  );
  assert.deepEqual(
    dispatchKeys,
    result.dispatch.allowed
      ? ["allowed", "division"]
      : ["allowed"]
  );

  for (const key of [
    "taskId",
    "capability",
    "result",
    "state",
    "confidence",
    "input",
    "metadata",
    "rawInput",
    "task",
  ]) {
    assert.equal(key in result, false, `${key} is omitted`);
  }
}

test("explicit runtime phrases override division signals and block delegation", () => {
  const phrases = [
    "run website",
    "start app",
    "serve app",
    "restart app",
    "check logs",
    "port issue",
  ];

  for (const phrase of phrases) {
    const result = routeTaskIntent(
      `${phrase}; then fix navbar, database, and Prisma.`
    );

    assert.deepEqual(result, {
      kind: "supervisor_runtime",
      reason: "explicit_runtime_phrase",
      signals: [phrase],
      dispatch: {
        allowed: false,
      },
      nextStep: "handle_runtime",
    });
    assert.deepEqual(
      routeTaskIntent(`${phrase}; then fix navbar, database, and Prisma.`),
      result
    );
    assertBoundedResult(result);
  }
});

test("frontend signals route Indonesian navbar work to frontend", () => {
  const result = routeTaskIntent(
    "Tolong perbaiki navbar dan layout halaman."
  );

  assert.deepEqual(result, {
    kind: "frontend",
    reason: "frontend_signals",
    signals: ["page", "navbar", "styling"],
    dispatch: {
      allowed: true,
      division: "frontend",
    },
  });
  assertBoundedResult(result);
});

test("clear frontend wording routes to frontend", () => {
  for (const instruction of [
    "ubah navbar",
    "fix mobile navbar spacing",
    "make page responsive and accessible",
  ]) {
    const result = routeTaskIntent(instruction);
    assert.equal(result.kind, "frontend");
    assert.equal(result.dispatch.allowed, true);
    assert.equal(result.dispatch.division, "frontend");
    assertBoundedResult(result);
  }
});

test("backend database and Prisma signals route to backend", () => {
  const result = routeTaskIntent(
    "Update database schema with Prisma migration."
  );

  assert.deepEqual(result, {
    kind: "backend",
    reason: "backend_signals",
    signals: ["database", "prisma", "schema"],
    dispatch: {
      allowed: true,
      division: "backend",
    },
  });
  assertBoundedResult(result);
});

test("clear backend wording routes to backend", () => {
  for (const instruction of [
    "cek database",
    "add Prisma account field",
    "update route handler service ledger",
  ]) {
    const result = routeTaskIntent(instruction);
    assert.equal(result.kind, "backend");
    assert.equal(result.dispatch.allowed, true);
    assert.equal(result.dispatch.division, "backend");
    assertBoundedResult(result);
  }
});

test("strong mixed signals stop at inspection first", () => {
  const result = routeTaskIntent(
    "Redesign navbar styling and update database Prisma."
  );

  assert.deepEqual(result, {
    kind: "inspection_first",
    reason: "strong_mixed_signals",
    signals: ["navbar", "styling", "database", "prisma"],
    dispatch: {
      allowed: false,
    },
    nextStep: "inspect",
  });
  assertBoundedResult(result);
});

test("ties and ambiguous requests stop at inspection first", () => {
  const tied = routeTaskIntent("Fix navbar and database.");
  const ambiguous = routeTaskIntent("Please help with this.");
  const login = routeTaskIntent("fix login");
  const fullStackLogin = routeTaskIntent("add login UI and session API");

  assert.deepEqual(tied, {
    kind: "inspection_first",
    reason: "tied_signals",
    signals: ["navbar", "database"],
    dispatch: {
      allowed: false,
    },
    nextStep: "inspect",
  });
  assert.deepEqual(ambiguous, {
    kind: "inspection_first",
    reason: "ambiguous_intent",
    signals: [],
    dispatch: {
      allowed: false,
    },
    nextStep: "inspect",
  });
  assert.equal(login.kind, "inspection_first");
  assert.equal(login.dispatch.allowed, false);
  assert.equal(fullStackLogin.kind, "inspection_first");
  assert.equal(fullStackLogin.dispatch.allowed, false);
  assertBoundedResult(tied);
  assertBoundedResult(ambiguous);
  assertBoundedResult(login);
  assertBoundedResult(fullStackLogin);
});
