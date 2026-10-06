const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..", "..");
const launcher = path.join(root, "bin", "warroom");

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-systemd-"));
  const bin = path.join(dir, "bin");
  const configDir = path.join(dir, "config", "warroom");
  const calls = path.join(dir, "systemctl.calls");
  const systemctl = path.join(bin, "systemctl");
  const tunnel = path.join(bin, "tunnel-client");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
    supervisor: {
      alias: "fixture-supervisor",
      tunnel_profile: "fixture-profile",
      tunnel_id: "tunnel_fixture",
      runtime_key_file: path.join(dir, "runtime-key"),
    },
  }));
  fs.writeFileSync(path.join(dir, "runtime-key"), "fixture-only\n");
  fs.writeFileSync(systemctl, [
    "#!/bin/sh",
    `printf '%s\\n' \"$*\" >> '${calls}'`,
    "if [ \"$2\" = cat ]; then",
    "  test -f \"$HOME/config/systemd/user/warroom-supervisor.service\"",
    "  exit $?",
    "fi",
    "exit 0",
  ].join("\n"));
  fs.writeFileSync(tunnel, [
    "#!/bin/sh",
    "if [ \"$2\" = status ]; then",
    "  printf '%s\\n' '{\"process_running\":true,\"healthy\":true,\"ready\":true,\"runtime_state\":\"ready\"}'",
    "fi",
  ].join("\n"));
  fs.chmodSync(systemctl, 0o755);
  fs.chmodSync(tunnel, 0o755);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { dir, calls, systemctl, tunnel };
}

function run(fixture, ...args) {
  return spawnSync("bash", [launcher, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: fixture.dir,
      XDG_CONFIG_HOME: path.join(fixture.dir, "config"),
      PATH: `${path.join(fixture.dir, "bin")}:${process.env.PATH}`,
      WARROOM_TUNNEL_CLIENT: fixture.tunnel,
    },
  });
}

test("supervisor install writes a secret-free persistent watchdog service and enables it", (t) => {
  const f = fixture(t);
  const result = run(f, "supervisor", "install");
  assert.equal(result.status, 0, result.stderr);
  const service = fs.readFileSync(path.join(f.dir, "config", "systemd", "user", "warroom-supervisor.service"), "utf8");
  assert.match(service, /Type=simple/);
  assert.doesNotMatch(service, /RemainAfterExit/);
  assert.match(service, /Restart=on-failure/);
  assert.match(service, /RestartSec=10/);
  assert.match(service, /supervisor supervisor-watch/);
  assert.doesNotMatch(service, /supervisor supervisor-run/);
  assert.doesNotMatch(service, /fixture-only|runtime-key|WRM_CAP_/);
  assert.match(fs.readFileSync(f.calls, "utf8"), /enable --now warroom-supervisor\.service/);
  assert.match(result.stdout, /loginctl enable-linger/);
});

test("supervisor lifecycle commands use mocked user systemctl and remain idempotent", (t) => {
  const f = fixture(t);
  for (const action of ["install", "install", "start", "status", "disable", "remove", "remove"]) {
    const result = run(f, "supervisor", action);
    assert.equal(result.status, 0, `${action}: ${result.stderr}`);
  }
  const calls = fs.readFileSync(f.calls, "utf8");
  assert.match(calls, /daemon-reload/);
  assert.match(calls, /start warroom-supervisor\.service/);
  assert.match(calls, /disable --now warroom-supervisor\.service/);
  assert.equal(fs.existsSync(path.join(f.dir, "config", "systemd", "user", "warroom-supervisor.service")), false);
});

test("supervisor install fails clearly when required config is absent", (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.dir, "config", "warroom", "config.json"), JSON.stringify({ supervisor: {} }));
  const result = run(f, "supervisor", "install");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /tunnel_id or runtime_key_file is not configured/);
});

test("warroom up prefers installed systemd service before readiness fallback and direct connect", () => {
  const source = fs.readFileSync(launcher, "utf8");
  const section = source.slice(source.indexOf('  up)'), source.indexOf('  down)'));

  const installed = section.indexOf("if supervisor_service_installed; then");
  const start = section.indexOf('systemctl --user start "$WARROOM_SUPERVISOR_SERVICE"');
  const readyFallback = section.indexOf("elif supervisor_ready; then");
  const directConnect = section.indexOf("supervisor_connect", readyFallback);

  assert.ok(installed >= 0);
  assert.ok(start > installed);
  assert.ok(readyFallback > start);
  assert.ok(directConnect > readyFallback);
});

test("supervisor watchdog is persistent and reconnects unhealthy runtime", () => {
  const source = fs.readFileSync(launcher, "utf8");

  const start = source.indexOf("supervisor_watch() {");
  const end = source.indexOf("supervisor_service_installed()", start);
  assert.ok(start >= 0 && end > start);

  const watch = source.slice(start, end);

  assert.match(watch, /while true/);
  assert.match(watch, /if ! supervisor_ready; then/);
  assert.match(watch, /supervisor_connect/);
  assert.match(watch, /sleep 10/);
  assert.match(watch, /trap 'exit 0' INT TERM/);
});

test("warroom up starts installed systemd supervisor before trusting existing readiness", () => {
  const source = fs.readFileSync(launcher, "utf8");
  const section = source.slice(source.indexOf("  up)"), source.indexOf("  down)"));

  const installed = section.indexOf("if supervisor_service_installed; then");
  const start = section.indexOf('systemctl --user start "$WARROOM_SUPERVISOR_SERVICE"');
  const readyFallback = section.indexOf("elif supervisor_ready; then");

  assert.ok(installed >= 0);
  assert.ok(start > installed);
  assert.ok(readyFallback > start);
});
