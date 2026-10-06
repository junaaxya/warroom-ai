const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const DIVISIONS = new Set(["frontend", "backend"]);
const MODES = new Set(["legacy_inherited", "isolated"]);
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const WINDOWS_ABSOLUTE = /^(?:[A-Za-z]:|[\\/]{1,2})/;
const RUNTIME_HOME = (() => {
  try {
    return os.userInfo().homedir;
  } catch {
    return "/tmp";
  }
})();
const ISOLATED_BASELINE = Object.freeze({
  HOME: RUNTIME_HOME,
  LANG: "C.UTF-8",
  PATH: process.platform === "win32"
    ? "C:\\Windows\\System32"
    : `${path.join(RUNTIME_HOME, ".local", "bin")}:/usr/local/bin:/usr/bin:/bin`,
  TMPDIR: "/tmp",
  XDG_CONFIG_HOME: path.join(RUNTIME_HOME, ".config"),
});

function isolatedBaseline(parentEnv = process.env) {
  const parentPath = typeof parentEnv.PATH === "string" ? parentEnv.PATH : "";
  const safeEntries = parentPath
    .split(path.delimiter)
    .filter((entry) => entry && path.isAbsolute(entry));
  const safePath = [...new Set(safeEntries)].join(path.delimiter);

  return {
    ...ISOLATED_BASELINE,
    PATH: safePath || ISOLATED_BASELINE.PATH,
  };
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertSourcePath(value, label = "environment source path") {
  if (
    typeof value !== "string" ||
    !value ||
    /[\0\r\n]/.test(value) ||
    path.isAbsolute(value) ||
    WINDOWS_ABSOLUTE.test(value)
  ) {
    throw new Error(`${label} must be a non-empty project-relative path`);
  }
  const source = value.replace(/\\/g, "/");
  if (source.split("/").includes("..")) {
    throw new Error(`${label} must not contain traversal`);
  }
  const normalized = path.posix.normalize(source);
  if (normalized === ".") {
    throw new Error(`${label} must be a non-empty project-relative path`);
  }
  return normalized;
}

function assertName(value, label = "environment variable name") {
  if (
    typeof value !== "string" ||
    !ENV_NAME.test(value) ||
    value.includes("\r") ||
    value.includes("\n")
  ) {
    throw new Error(`${label} is invalid`);
  }
  return value;
}

function uniqueNames(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  const seen = new Set();
  return values.map((value) => assertName(value, `${label} entry`)).filter((value) => {
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function validateEnvironment(environment) {
  if (environment === undefined) return undefined;
  assertObject(environment, "policy.environment");
  if (!MODES.has(environment.mode)) throw new Error("policy.environment.mode is invalid");
  if (!Array.isArray(environment.sources)) throw new Error("policy.environment.sources must be an array");
  assertObject(environment.allow, "policy.environment.allow");

  const sources = [];
  const seenSources = new Set();

  for (const [index, source] of environment.sources.entries()) {
    const normalized = assertSourcePath(
      source,
      `policy.environment.sources[${index}]`
    );

    if (!seenSources.has(normalized)) {
      sources.push(normalized);
      seenSources.add(normalized);
    }
  }
  const allow = {};
  for (const division of DIVISIONS) {
    allow[division] = uniqueNames(environment.allow[division], `policy.environment.allow.${division}`);
  }
  for (const key of Object.keys(environment.allow)) {
    if (!DIVISIONS.has(key)) throw new Error(`policy.environment.allow.${key} is unsupported`);
  }
  for (const key of Object.keys(environment)) {
    if (!["mode", "sources", "allow"].includes(key)) throw new Error(`policy.environment.${key} is unsupported`);
  }
  return { mode: environment.mode, sources, allow };
}

function projectSource(project, source) {
  const root = fs.realpathSync(project);
  const target = path.resolve(root, source);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`environment source escapes project: ${source}`);
  }
  if (!fs.existsSync(target)) return { exists: false };
  const resolved = fs.realpathSync(target);
  const resolvedRelative = path.relative(root, resolved);
  if (resolvedRelative === ".." || resolvedRelative.startsWith(`..${path.sep}`) || path.isAbsolute(resolvedRelative)) {
    throw new Error(`environment source escapes project: ${source}`);
  }
  if (!fs.statSync(resolved).isFile()) throw new Error(`environment source is not a file: ${source}`);
  return { exists: true, target: resolved };
}

function unquoteEnvValue(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed[0] === '"' && trimmed.at(-1) === '"') {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  if (trimmed.length >= 2 && trimmed[0] === "'" && trimmed.at(-1) === "'") return trimmed.slice(1, -1);
  const comment = trimmed.search(/\s+#/);
  return comment === -1 ? trimmed : trimmed.slice(0, comment).trimEnd();
}

function parseEnvironment(text) {
  const values = new Map();
  for (const rawLine of String(text).replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = rawLine.trimStart();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values.set(match[1], unquoteEnvValue(match[2]));
  }
  return values;
}

function resolveDivisionEnvironment({ project, environment, division, parentEnv = process.env }) {
  if (!DIVISIONS.has(division)) throw new Error("division is invalid");
  const policy = validateEnvironment(environment);
  if (!policy) {
    return {
      mode: "isolated",
      approvedValues: {},
      status: [],
      childEnv: isolatedBaseline(parentEnv),
    };
  }

  const wanted = new Set(policy.allow[division]);
  const values = new Map();
  const status = new Map(policy.allow[division].map((name) => [name, {
    name,
    source: policy.sources.at(-1) ?? null,
    status: "missing",
  }]));
  for (const source of policy.sources) {
    const location = projectSource(project, source);
    const parsed = location.exists ? parseEnvironment(fs.readFileSync(location.target, "utf8")) : new Map();
    for (const name of wanted) {
      if (!parsed.has(name)) continue;
      const value = parsed.get(name);
      values.set(name, value);
      status.set(name, { name, source, status: value === "" ? "empty" : "present" });
    }
  }
  const approvedValues = Object.fromEntries(values);
  const childEnv = policy.mode === "isolated"
    ? { ...isolatedBaseline(parentEnv), ...approvedValues }
    : { ...parentEnv, ...approvedValues };
  return { mode: policy.mode, approvedValues, status: [...status.values()], childEnv };
}

function environmentStatus({ project, environment, division }) {
  const resolved = resolveDivisionEnvironment({
    project,
    environment,
    division,
  });

  return {
    division,
    mode: resolved.mode,
    variables: resolved.status,
  };
}

function approvedValuesForState(state, parentEnv = process.env) {
  const values = {};
  for (const division of DIVISIONS) {
    for (const [name, value] of Object.entries(resolveDivisionEnvironment({
      project: state.project,
      environment: state.environment,
      division,
      parentEnv,
    }).approvedValues)) {
      values[`${division}:${name}`] = value;
    }
  }
  return values;
}

function projectEnvironment(state, division, parentEnv = process.env) {
  const resolved = resolveDivisionEnvironment({
    project: state.project,
    environment: state.environment,
    division,
    parentEnv,
  });
  return {
    env: resolved.childEnv,
    mode: resolved.mode,
    status: resolved.status,
  };
}

function resolveOpenCodeExecutable(parentPath = process.env.PATH || "") {
  const names = process.platform === "win32"
    ? ["opencode.exe", "opencode.cmd", "opencode.bat"]
    : ["opencode"];

  for (const directory of parentPath.split(path.delimiter)) {
    if (!directory) continue;

    for (const name of names) {
      const candidate = path.resolve(directory, name);

      try {
        const stat = fs.statSync(candidate);

        if (stat.isFile() && (process.platform === "win32" || (stat.mode & 0o111))) {
          return candidate;
        }
      } catch {}
    }
  }

  throw new Error("opencode is not available in parent PATH");
}

function launch(argv = process.argv.slice(2)) {
  const [command, stateFile, division, port, session, model, project] = argv;
  if (
    argv.length !== 7 ||
    command !== "--launch" ||
    !stateFile ||
    !division ||
    !project ||
    !/^[1-9]\d{0,4}$/.test(port) ||
    Number(port) > 65535 ||
    !/^[A-Za-z0-9_][A-Za-z0-9_-]{0,127}$/.test(session) ||
    (model && (
      typeof model !== "string" ||
      model.length > 256 ||
      model.startsWith("-") ||
      /[\0\r\n]/.test(model)
    ))
  ) {
    throw new Error("env broker launch arguments are incomplete");
  }
  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const resolvedProject = fs.realpathSync(project);
  if (fs.realpathSync(state.project) !== resolvedProject) throw new Error("env broker project does not match state");
  const resolved = resolveDivisionEnvironment({ project: resolvedProject, environment: state.environment, division });
  const args = ["--port", port, "--session", session];
  if (model) args.push("--model", model);
  args.push(resolvedProject);
  const child = spawn(resolveOpenCodeExecutable(), args, {
    cwd: resolvedProject,
    env: {
      ...resolved.childEnv,
      WARROOM_BRIDGE_URL: `http://${state.bridge?.host || "127.0.0.1"}:${state.bridge?.port || 7777}`,
      WARROOM_DIVISION: division,
      WARROOM_STATE: stateFile,
      OPENCODE_PORT: port,
    },
    stdio: "inherit",
  });
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
  child.on("error", (error) => { process.stderr.write(`[warroom] OpenCode launch failed: ${error.message}\n`); process.exitCode = 1; });
  child.on("exit", (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });
}

if (require.main === module) {
  try { launch(); } catch (error) { process.stderr.write(`[warroom] env broker failed: ${error.message}\n`); process.exitCode = 1; }
}

module.exports = {
  ISOLATED_BASELINE,
  approvedValuesForState,
  assertName,
  assertSourcePath,
  environmentStatus,
  launch,
  parseEnvironment,
  projectEnvironment,
  resolveDivisionEnvironment,
  resolveOpenCodeExecutable,
  validateEnvironment,
};
