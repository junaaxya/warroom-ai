const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  updateProjectPolicy,
} = require("../project-policy-update.cjs");

function policy(backendWrite = ["warroom-bridge/**"]) {
  return {
    ownership: {
      frontend: { write: [], read: ["**"], deny_write: ["**"] },
      backend: { write: backendWrite, read: ["**"], deny_write: [".omo/**", ".git/**"] },
    },
    shared: { paths: [], policy: "coordinate_before_semantic_change", reservation_ttl_ms: 600000 },
    protected: { paths: [".omo/**", ".git/**"] },
  };
}

function environment(mode = "isolated") {
  return {
    mode,
    sources: [".env", ".env.local", ".env"],
    allow: {
      frontend: ["FRONTEND_TOKEN", "FRONTEND_TOKEN"],
      backend: ["BACKEND_TOKEN"],
    },
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-policy-"));
  const stateFile = path.join(directory, "state.json");
  const state = {
    project_id: "project_test",
    project: "/workspace/project",
    frontend: { port: 4203, session: "frontend_session" },
    backend: { port: 4204, session: "backend_session" },
    bridge: { host: "127.0.0.1", port: 4205 },
    onboarding: { alias: "project", created_at: "2026-01-01T00:00:00.000Z" },
    history: ["keep"],
    secret: "must-not-return",
    ...policy(),
  };
  fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  return { directory, stateFile, state };
}

test("expands policy without changing runtime identity or unrelated state", () => {
  const { directory, stateFile, state } = fixture();
  try {
    const result = updateProjectPolicy({
      active: { state_file: stateFile },
      expectedProjectId: state.project_id,
      policy: policy(["warroom-bridge/**", "scripts/**"]),
    });
    const updated = JSON.parse(fs.readFileSync(stateFile, "utf8"));

    assert.equal(JSON.stringify(result).includes("must-not-return"), false);
    assert.deepEqual(Object.keys(result).sort(), ["newPolicy", "oldPolicy"]);
    assert.deepEqual(result.oldPolicy, policy());
    assert.deepEqual(result.newPolicy, policy(["warroom-bridge/**", "scripts/**"]));
    assert.deepEqual(updated.frontend, state.frontend);
    assert.deepEqual(updated.backend, state.backend);
    assert.deepEqual(updated.bridge, state.bridge);
    assert.equal(updated.project_id, state.project_id);
    assert.equal(updated.project, state.project);
    assert.deepEqual(updated.onboarding, state.onboarding);
    assert.deepEqual(updated.history, state.history);
    fs.chmodSync(stateFile, 0o600);
    const mode = fs.statSync(stateFile).mode & 0o777;

    if (mode === 0o600) {
      assert.equal(mode, 0o600);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects wrong project, unsafe paths, and protection removal without writing", () => {
  const { directory, stateFile, state } = fixture();
  try {
    state.protected.paths.push("state/**");
    fs.writeFileSync(stateFile, `${JSON.stringify(state)}\n`, { mode: 0o600 });
    const before = fs.readFileSync(stateFile, "utf8");
    assert.throws(() => updateProjectPolicy({
      active: { state_file: stateFile }, expectedProjectId: "wrong", policy: policy(),
    }), /does not match/);
    for (const unsafe of ["/absolute", "C:\\absolute", "../escape", "bad\0path"]) {
      assert.throws(() => updateProjectPolicy({
        active: { state_file: stateFile }, expectedProjectId: state.project_id, policy: policy([unsafe]),
      }), /relative patterns|traversal/);
    }
    const withoutProtected = policy();
    withoutProtected.protected.paths = [".omo/**", ".git/**"];
    assert.throws(() => updateProjectPolicy({
      active: { state_file: stateFile }, expectedProjectId: state.project_id, policy: withoutProtected,
    }), /Existing protected policy path must remain/);
    assert.equal(fs.readFileSync(stateFile, "utf8"), before);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("sets, updates, and preserves validated name-only environment metadata", () => {
  const { directory, stateFile, state } = fixture();

  try {
    const initial = policy();
    initial.environment = environment();
    const set = updateProjectPolicy({
      active: { state_file: stateFile },
      expectedProjectId: state.project_id,
      policy: initial,
    });
    const expectedInitial = {
      mode: "isolated",
      sources: [".env", ".env.local"],
      allow: { frontend: ["FRONTEND_TOKEN"], backend: ["BACKEND_TOKEN"] },
    };

    assert.deepEqual(set.newPolicy.environment, expectedInitial);
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, "utf8")).environment, expectedInitial);

    const changed = policy(["warroom-bridge/**", "scripts/**"]);
    changed.environment = environment("legacy_inherited");
    changed.environment.allow.backend = ["NEW_BACKEND_TOKEN"];
    const update = updateProjectPolicy({
      active: { state_file: stateFile },
      expectedProjectId: state.project_id,
      policy: changed,
    });

    assert.equal(update.newPolicy.environment.mode, "legacy_inherited");
    assert.deepEqual(update.newPolicy.environment.allow.backend, ["NEW_BACKEND_TOKEN"]);

    const preserve = updateProjectPolicy({
      active: { state_file: stateFile },
      expectedProjectId: state.project_id,
      policy: policy(),
    });

    assert.deepEqual(preserve.oldPolicy.environment, update.newPolicy.environment);
    assert.deepEqual(preserve.newPolicy.environment, update.newPolicy.environment);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("rejects unsafe environment metadata without writing", () => {
  const { directory, stateFile, state } = fixture();

  try {
    for (const source of ["/absolute", "C:\\absolute", "../escape", "bad\0path"]) {
      const candidate = policy();
      candidate.environment = environment();
      candidate.environment.sources = [source];
      const before = fs.readFileSync(stateFile, "utf8");

      assert.throws(
        () => updateProjectPolicy({
          active: { state_file: stateFile },
          expectedProjectId: state.project_id,
          policy: candidate,
        }),
        /project-relative|traversal/
      );
      assert.equal(fs.readFileSync(stateFile, "utf8"), before);
    }

    const invalidName = policy();
    invalidName.environment = environment();
    invalidName.environment.allow.frontend = ["BAD-NAME"];
    assert.throws(
      () => updateProjectPolicy({
        active: { state_file: stateFile }, expectedProjectId: state.project_id, policy: invalidName,
      }),
      /invalid/
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
