const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const launcher = path.join(root, "bin", "warroom");

function projectId(project) {
  const real = fs.realpathSync(project);
  const name = path.basename(real) || "project";
  const slug = name
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[-._]+|[-._]+$/g, "")
    .toLowerCase() || "project";
  const key = crypto.createHash("sha256").update(real).digest("hex").slice(0, 12);
  return `${slug}-${key}`;
}

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-cli-active-"));
  const home = path.join(dir, "home");
  const warroomHome = path.join(home, ".warroom");
  const projectsDir = path.join(warroomHome, "projects");
  const projectA = path.join(dir, "project-a");
  const projectB = path.join(dir, "project-b");
  const elsewhere = path.join(dir, "elsewhere");

  for (const p of [home, projectsDir, projectA, projectB, elsewhere]) {
    fs.mkdirSync(p, { recursive: true });
  }

  fs.writeFileSync(
    path.join(warroomHome, "aliases.json"),
    JSON.stringify({ beta: projectB }),
  );

  for (const project of [projectA, projectB]) {
    const state = {
      project,
      frontend: { port: 4211 },
      backend: { port: 4212 },
      bridge: { port: 4213 },
    };
    fs.writeFileSync(
      path.join(projectsDir, `${projectId(project)}.json`),
      JSON.stringify(state),
    );
  }

  fs.writeFileSync(
    path.join(warroomHome, "active-project.json"),
    JSON.stringify({ project: projectA }),
  );

  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  return { dir, home, warroomHome, projectA, projectB, elsewhere };
}

function run(f, cwd, ...args) {
  return spawnSync("bash", [launcher, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: f.home,
      WARROOM_HOME: f.warroomHome,
      XDG_CONFIG_HOME: path.join(f.home, ".config"),
      WARROOM_TUNNEL_CLIENT: path.join(f.dir, "missing-tunnel-client"),
    },
  });
}

test("status without project uses active project instead of cwd", (t) => {
  const f = fixture(t);
  const result = run(f, f.elsewhere, "status");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`project  : ${f.projectA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("explicit dot wins over active project", (t) => {
  const f = fixture(t);
  const result = run(f, f.projectB, "status", ".");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`project  : ${f.projectB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("explicit alias wins over active project", (t) => {
  const f = fixture(t);
  const result = run(f, f.elsewhere, "status", "beta");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`project  : ${f.projectB.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
});

test("missing active project fails clearly instead of using cwd", (t) => {
  const f = fixture(t);
  fs.rmSync(path.join(f.warroomHome, "active-project.json"));

  const result = run(f, f.elsewhere, "status");

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no active War Room project/);
});

test("stale active project fails instead of falling back to cwd", (t) => {
  const f = fixture(t);
  fs.writeFileSync(
    path.join(f.warroomHome, "active-project.json"),
    JSON.stringify({ project: path.join(f.dir, "missing-project") }),
  );

  const result = run(f, f.elsewhere, "status");

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /no active War Room project/);
});
