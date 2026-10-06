const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  ISOLATED_BASELINE,
  environmentStatus,
  projectEnvironment,
  validateEnvironment,
} = require("../env-broker.cjs");
const {
  createSecretRedactor,
  redactorForState,
  safeRedactorForState,
  shellDoubleQuote,
  shellSingleQuote,
} = require("../secret-redactor.cjs");
const { normalizeMessages } = require("../message-normalizer.cjs");
const { TaskStore } = require("../task-store.cjs");

function fixture(t, files, environment) {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-env-"));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(project, name), content);
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));
  return { project, environment };
}

async function launchFixture(args, env) {
  const child = spawn(process.execPath, [
    path.join(__dirname, "..", "env-broker.cjs"),
    "--launch",
    ...args,
  ], { env, stdio: "pipe" });
  const [code] = await once(child, "exit");

  assert.equal(code, 0);
}

test("broker applies deterministic sources only to allowed division", (t) => {
  const state = fixture(t, { ".env": "FRONT=sentinel\nBOTH=first\n", ".env.local": "BOTH=second\nBACK=backend-secret\nEMPTY=\n" }, { mode: "isolated", sources: [".env", ".env.local"], allow: { frontend: ["FRONT", "BOTH", "EMPTY"], backend: ["BACK", "BOTH"] } });
  const frontend = projectEnvironment(state, "frontend", { HOME: "/tmp", PATH: "/bin", LEAK: "parent-secret" });
  const backend = projectEnvironment(state, "backend", { HOME: "/tmp", PATH: "/bin", LEAK: "parent-secret" });
  assert.equal(frontend.env.FRONT, "sentinel");
  assert.equal(frontend.env.BOTH, "second");
  assert.equal(frontend.env.BACK, undefined);
  assert.equal(frontend.env.LEAK, undefined);
  assert.equal(frontend.env.PATH, "/bin");
  assert.equal(backend.env.BACK, "backend-secret");
  assert.equal(backend.env.FRONT, undefined);
  assert.deepEqual(frontend.status, [{ name: "FRONT", source: ".env", status: "present" }, { name: "BOTH", source: ".env.local", status: "present" }, { name: "EMPTY", source: ".env.local", status: "empty" }]);
  assert.equal(JSON.stringify(frontend.status).includes("sentinel"), false);
  assert.equal(JSON.stringify(frontend).includes("backend-secret"), false);
});

test("missing policy uses isolated baseline without source reads", (t) => {
  const parent = { LEAK: "parent-secret" };
  const missingPolicy = projectEnvironment({ project: "/tmp" }, "frontend", parent);
  assert.equal(missingPolicy.mode, "isolated");
  assert.equal(missingPolicy.env.LEAK, undefined);
  assert.equal(missingPolicy.env.PATH, ISOLATED_BASELINE.PATH);
  assert.deepEqual(missingPolicy.status, []);

  const emptyProject = fixture(t, { ".env": "LEAK=project-secret\n" });
  const noPolicy = projectEnvironment(emptyProject, "frontend", parent);
  assert.equal(noPolicy.env.LEAK, undefined);

  const state = fixture(t, { ".env": "FRONT=project\n" }, { mode: "legacy_inherited", sources: [".env"], allow: { frontend: ["FRONT"], backend: [] } });
  const result = projectEnvironment(state, "frontend", parent);
  assert.equal(result.env.LEAK, "parent-secret");
  assert.equal(result.env.FRONT, "project");
});

test("environment status returns configured names without values", (t) => {
  const state = fixture(t, { ".env": "PRESENT=sentinel\nEMPTY=\n" }, {
    mode: "isolated",
    sources: [".env"],
    allow: { frontend: ["PRESENT", "EMPTY", "MISSING"], backend: [] },
  });
  const status = environmentStatus({
    project: state.project,
    environment: state.environment,
    division: "frontend",
  });

  assert.deepEqual(status, {
    division: "frontend",
    mode: "isolated",
    variables: [
      { name: "PRESENT", source: ".env", status: "present" },
      { name: "EMPTY", source: ".env", status: "empty" },
      { name: "MISSING", source: ".env", status: "missing" },
    ],
  });
  assert.equal(JSON.stringify(status).includes("sentinel"), false);

  assert.deepEqual(environmentStatus({
    project: state.project,
    division: "backend",
  }), {
    division: "backend",
    mode: "isolated",
    variables: [],
  });
});

test("legacy policy overlays allowed values onto inherited environment", (t) => {
  const parent = { LEAK: "parent-secret" };
  const state = fixture(t, { ".env": "FRONT=project\n" }, { mode: "legacy_inherited", sources: [".env"], allow: { frontend: ["FRONT"], backend: [] } });
  const result = projectEnvironment(state, "frontend", parent);
  assert.equal(result.env.LEAK, "parent-secret");
  assert.equal(result.env.FRONT, "project");
});

test("broker launch gives each division only its approved environment", { timeout: 10000 }, async (t) => {
  const state = fixture(t, {
    ".env": "FRONT=frontend-sentinel\nBACK=backend-sentinel\n",
  }, {
    mode: "isolated",
    sources: [".env"],
    allow: { frontend: ["FRONT"], backend: ["BACK"] },
  });
  const bin = path.join(state.project, "bin");
  const capture = path.join(state.project, "captured.txt");
  const stateFile = path.join(state.project, "state.json");
  const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "opencode"), [
    "#!/bin/sh",
    `printf '%s\\n' \"$FRONT|$BACK|$LEAK|$WARROOM_DIVISION|$OPENCODE_PORT\" > ${quote(capture)}`,
  ].join("\n"));
  fs.chmodSync(path.join(bin, "opencode"), 0o755);
  fs.writeFileSync(stateFile, JSON.stringify({
    project: state.project,
    bridge: { host: "127.0.0.1", port: 4567 },
    environment: state.environment,
  }));

  await launchFixture([
    stateFile,
    "frontend",
    "4321",
    "session_frontend",
    "router9/test-model",
    state.project,
  ], {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    LEAK: "parent-sentinel",
  });

  assert.equal(
    fs.readFileSync(capture, "utf8"),
    "frontend-sentinel|||frontend|4321\n"
  );
});

test("broker launch without policy isolates parent env without project source reads", { timeout: 10000 }, async (t) => {
  const state = fixture(t, { ".env": "PROJECT_SECRET=project-sentinel\n" });
  const bin = path.join(state.project, "bin");
  const capture = path.join(state.project, "captured.txt");
  const stateFile = path.join(state.project, "state.json");
  const quote = (value) => `'${value.replace(/'/g, "'\\''")}'`;

  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "opencode"), [
    "#!/bin/sh",
    `printf '%s\\n' "$PARENT_SECRET|$PROJECT_SECRET|$WARROOM_DIVISION|$OPENCODE_PORT" > ${quote(capture)}`,
  ].join("\n"));
  fs.chmodSync(path.join(bin, "opencode"), 0o755);
  fs.writeFileSync(stateFile, JSON.stringify({
    project: state.project,
    bridge: { host: "127.0.0.1", port: 4567 },
  }));

  await launchFixture([
    stateFile,
    "frontend",
    "4321",
    "session_frontend",
    "router9/test-model",
    state.project,
  ], {
    ...process.env,
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    PARENT_SECRET: "parent-sentinel",
  });

  assert.equal(
    fs.readFileSync(capture, "utf8"),
    "||frontend|4321\n"
  );
});

test("policy rejects unsafe paths and invalid names", () => {
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: ["../.env"], allow: { frontend: [], backend: [] } }));
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: ["/tmp/env"], allow: { frontend: [], backend: [] } }));
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: ["C:relative.env"], allow: { frontend: [], backend: [] } }));
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: [".env"], allow: { frontend: ["BAD-NAME"], backend: [] } }));
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: [".env\n"], allow: { frontend: [], backend: [] } }));
  assert.throws(() => validateEnvironment({ mode: "isolated", sources: [".env"], allow: { frontend: [], backend: [] }, extra: true }));
  assert.throws(() => validateEnvironment({ mode: "wrong", sources: [], allow: { frontend: [], backend: [] } }));
});

test("missing source reports safe missing statuses without values", (t) => {
  const state = fixture(t, {}, {
    mode: "isolated",
    sources: ["missing.env"],
    allow: { frontend: ["MISSING"], backend: [] },
  });

  const result = projectEnvironment(state, "frontend", {});

  assert.deepEqual(result.status, [{
    name: "MISSING",
    source: "missing.env",
    status: "missing",
  }]);
  assert.equal(JSON.stringify(result).includes("MISSING="), false);
});

test("central redactor removes secret forms and retained capabilities", () => {
  const secret = "sentinel $ \"quote\" 'value'";
  const redact = createSecretRedactor([secret]);
  const forms = [
    secret,
    JSON.stringify(secret),
    shellDoubleQuote(secret),
    shellSingleQuote(secret),
    encodeURIComponent(secret),
    encodeURIComponent(secret).replace(/%20/g, "+"),
    encodeURIComponent(secret).replace(/%[0-9A-F]{2}/g, (match) => match.toLowerCase()),
    Buffer.from(secret).toString("base64"),
  ];
  const output = redact(`${forms.join(" ")} WRM_CAP_alpha`);

  for (const form of forms) assert.equal(output.includes(form), false);
  assert.equal(output.includes("WRM_CAP_alpha"), false);
  const messages = normalizeMessages([{ info: { role: "assistant" }, parts: [{ type: "text", text: secret }] }], redact);
  assert.equal(JSON.stringify(messages).includes(secret), false);
});

test("invalid environment metadata fails closed for output redaction", () => {
  const redactor = safeRedactorForState({
    project: "/tmp",
    environment: {
      mode: "isolated",
      sources: ["../outside"],
      allow: { frontend: [], backend: [] },
    },
  });

  assert.equal(redactor.redactText("unsafe output"), "[REDACTED]");
  assert.equal(redactor.redactValue({ message: "unsafe output" }), "[REDACTED]");
});

test("task store never persists broker-approved values", (t) => {
  const state = fixture(t, { ".env": "TOKEN=task-sentinel\n" }, {
    mode: "isolated",
    sources: [".env"],
    allow: { frontend: ["TOKEN"], backend: [] },
  });
  const store = new TaskStore({
    runtimeDir: path.join(state.project, "runtime"),
    projectId: "project_test",
    redact: redactorForState(state).redactText,
  });
  const created = store.createTask({
    division: "frontend",
    opencodeSession: "session_frontend",
    instruction: "Task persistence fixture.",
  });

  store.markSubmitted(created.task.taskId);
  const completed = store.completeTask({
    taskId: created.task.taskId,
    division: "frontend",
    projectId: "project_test",
    opencodeSession: "session_frontend",
    capability: created.capability,
    outcome: "completed",
    result: "task-sentinel result",
  });

  assert.equal(completed.result, "[REDACTED] result");
  assert.equal(fs.readFileSync(store.file, "utf8").includes("task-sentinel"), false);
});

test("install and upgrade stage and check broker runtime modules", () => {
  const root = path.join(__dirname, "..", "..");

  for (const script of ["scripts/install.sh", "scripts/upgrade.sh"]) {
    const source = fs.readFileSync(path.join(root, script), "utf8");

    for (const module of [
      "env-broker.cjs",
      "managed-delegation-wait.cjs",
      "project-policy-update.cjs",
      "secret-redactor.cjs",
      "task-router.cjs",
    ]) {
      assert.match(source, new RegExp(module.replace(".", "\\.")));
      assert.match(source, new RegExp(`node --check.*${module.replace(".", "\\.")}`));
    }
  }
});

test("division MCP exposes read-only safe environment status", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "mcp.js"),
    "utf8"
  );

  assert.match(source, /"warroom_environment_status"/);
  assert.match(source, /inputSchema: z\.object\(\{\}\)/);
  assert.match(source, /`\/environment\/\$\{division\}`/);
  assert.match(source, /never values/);
});

test("isolated mode preserves safe absolute parent PATH without inheriting other parent env", (t) => {
  const state = fixture(t, {}, undefined);
  const runtimePath = [
    "/home/test/.opencode/bin",
    "relative-bin",
    "/home/test/.nvm/versions/node/v24/bin",
    "/usr/bin",
  ].join(path.delimiter);

  const resolved = projectEnvironment(state, "frontend", {
    PATH: runtimePath,
    SECRET_TOKEN: "must-not-leak",
  });

  assert.equal(resolved.mode, "isolated");
  assert.equal(
    resolved.env.PATH,
    [
      "/home/test/.opencode/bin",
      "/home/test/.nvm/versions/node/v24/bin",
      "/usr/bin",
    ].join(path.delimiter),
  );
  assert.equal(resolved.env.SECRET_TOKEN, undefined);
});
