const test = require("node:test");
const assert = require("node:assert/strict");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function unusedPort() {
  const server = http.createServer();
  const port = await listen(server);
  await close(server);
  return port;
}

async function waitForBridge(url, child) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error("bridge exited before becoming ready");
    }

    try {
      const response = await fetch(`${url}/status`);

      if (response.ok) {
        return;
      }
    } catch {}

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error("bridge did not become ready");
}

async function stop(child) {
  if (child.exitCode === null) {
    child.kill();
    await once(child, "exit");
  }
}

test("dispatch sends generated messageID while task remains queued", { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "warroom-bridge-dispatch-")
  );
  let messageID;
  let taskPayload;
  let stateDuringDispatch;
  const target = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      let body = "";

      for await (const chunk of req) {
        body += chunk;
      }

      taskPayload = JSON.parse(body);
      messageID = taskPayload.messageID;
      const taskFile = path.join(
        root,
        ".warroom",
        "runtime",
        "project_test-tasks.json"
      );
      stateDuringDispatch = JSON.parse(
        fs.readFileSync(taskFile, "utf8")
      ).tasks[0].state;
    }

    res.writeHead(204);
    res.end();
  });
  const targetPort = await listen(target);
  const bridgePort = await unusedPort();
  const stateFile = path.join(root, "state.json");

  fs.writeFileSync(stateFile, JSON.stringify({
    project: root,
    project_id: "project_test",
    bridge: { host: "127.0.0.1", port: bridgePort },
    frontend: {
      port: targetPort,
      session: "session_frontend",
      model: "router9/ag/gemini-3.8-flash-high",
    },
    backend: {
      port: targetPort,
      session: "session_backend",
      model: "router9/cx/gpt-5.6-terra",
    },
  }));

  const bridge = spawn(
    process.execPath,
    [path.join(__dirname, "..", "bridge.cjs")],
    {
      env: {
        ...process.env,
        HOME: root,
        WARROOM_STATE: stateFile,
      },
      stdio: "ignore",
    }
  );

  t.after(async () => {
    await stop(bridge);
    await close(target);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  await waitForBridge(bridgeUrl, bridge);
  const response = await fetch(`${bridgeUrl}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      division: "frontend",
      instruction: "Dispatch message ID fixture.",
    }),
  });
  const result = await response.json();

  assert.equal(response.status, 202);
  assert.match(result.task.taskId, /^task_[0-9a-fA-F-]+$/);
  assert.match(result.task.opencodeMessageID, /^msg_[0-9a-fA-F-]+$/);
  assert.equal(messageID, result.task.opencodeMessageID);
  assert.deepEqual(taskPayload.model, {
    providerID: "router9",
    modelID: "ag/gemini-3.8-flash-high",
  });
  assert.equal(stateDuringDispatch, "queued");
  assert.equal(result.task.state, "submitted");
  assert.equal(JSON.stringify(result).includes("WRM_CAP_"), false);
});

test("legacy generic state uses explicit division model defaults", { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-bridge-model-"));
  const payloads = [];
  const target = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(204);
      res.end();
      return;
    }

    let body = "";

    for await (const chunk of req) {
      body += chunk;
    }

    payloads.push(JSON.parse(body));
    res.writeHead(204);
    res.end();
  });
  const targetPort = await listen(target);
  const bridgePort = await unusedPort();
  const stateFile = path.join(root, "state.json");

  fs.writeFileSync(stateFile, JSON.stringify({
    project: root,
    project_id: "project_test",
    bridge: { host: "127.0.0.1", port: bridgePort },
    frontend: { port: targetPort, session: "session_frontend" },
    backend: { port: targetPort, session: "session_backend" },
    onboarding: { engine: "generic-v1" },
  }));

  const bridge = spawn(process.execPath, [path.join(__dirname, "..", "bridge.cjs")], {
    env: { ...process.env, HOME: root, WARROOM_STATE: stateFile },
    stdio: "ignore",
  });

  t.after(async () => {
    await stop(bridge);
    await close(target);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  await waitForBridge(bridgeUrl, bridge);

  for (const division of ["frontend", "backend"]) {
    const response = await fetch(`${bridgeUrl}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        division,
        instruction: `${division} affinity fixture.`,
      }),
    });

    assert.equal(response.status, 202);
  }

  assert.deepEqual(payloads.map((payload) => payload.model), [
    { providerID: "router9", modelID: "ag/gemini-3.8-flash-high" },
    { providerID: "router9", modelID: "cx/gpt-5.6-terra" },
  ]);
});

test("bridge redacts approved values from messages and task storage", { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-bridge-redact-"));
  const secret = "bridge-sentinel";
  const target = http.createServer(async (req, res) => {
    if (req.url.includes("/message")) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{
        info: { role: "assistant" },
        parts: [{ type: "text", text: `message ${secret}` }],
      }]));
      return;
    }

    if (req.method === "POST") {
      for await (const _chunk of req) {}
    }

    res.writeHead(204);
    res.end();
  });
  const targetPort = await listen(target);
  const bridgePort = await unusedPort();
  const stateFile = path.join(root, "state.json");

  fs.writeFileSync(path.join(root, ".env"), `TOKEN=${secret}\n`);
  fs.writeFileSync(stateFile, JSON.stringify({
    project: root,
    project_id: "project_test",
    bridge: { host: "127.0.0.1", port: bridgePort },
    frontend: { port: targetPort, session: "session_frontend" },
    backend: { port: targetPort, session: "session_backend" },
    environment: {
      mode: "isolated",
      sources: [".env"],
      allow: { frontend: ["TOKEN"], backend: [] },
    },
  }));

  const bridge = spawn(process.execPath, [path.join(__dirname, "..", "bridge.cjs")], {
    env: { ...process.env, HOME: root, WARROOM_STATE: stateFile },
    stdio: "ignore",
  });

  t.after(async () => {
    await stop(bridge);
    await close(target);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  await waitForBridge(bridgeUrl, bridge);
  const messages = await (await fetch(`${bridgeUrl}/messages/frontend`)).text();
  const created = await (await fetch(`${bridgeUrl}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      division: "frontend",
      instruction: `task ${secret}`,
    }),
  })).text();
  const taskFile = path.join(root, ".warroom", "runtime", "project_test-tasks.json");

  assert.equal(messages.includes(secret), false);
  assert.equal(created.includes(secret), false);
  assert.equal(fs.readFileSync(taskFile, "utf8").includes(secret), false);
});

test("bridge environment endpoint returns safe configured status", { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "warroom-bridge-environment-"));
  const target = http.createServer((_req, res) => {
    res.writeHead(204);
    res.end();
  });
  const targetPort = await listen(target);
  const bridgePort = await unusedPort();
  const stateFile = path.join(root, "state.json");

  fs.writeFileSync(path.join(root, ".env"), "TOKEN=bridge-environment-sentinel\nEMPTY=\n");
  fs.writeFileSync(stateFile, JSON.stringify({
    project: root,
    project_id: "project_test",
    bridge: { host: "127.0.0.1", port: bridgePort },
    frontend: { port: targetPort, session: "session_frontend" },
    backend: { port: targetPort, session: "session_backend" },
    environment: {
      mode: "isolated",
      sources: [".env"],
      allow: { frontend: ["TOKEN", "EMPTY", "MISSING"], backend: [] },
    },
  }));

  const bridge = spawn(process.execPath, [path.join(__dirname, "..", "bridge.cjs")], {
    env: { ...process.env, HOME: root, WARROOM_STATE: stateFile },
    stdio: "ignore",
  });

  t.after(async () => {
    await stop(bridge);
    await close(target);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  await waitForBridge(bridgeUrl, bridge);
  const body = await (await fetch(`${bridgeUrl}/environment/frontend`)).text();

  assert.equal(body.includes("bridge-environment-sentinel"), false);
  assert.deepEqual(JSON.parse(body), {
    division: "frontend",
    mode: "isolated",
    variables: [
      { name: "TOKEN", source: ".env", status: "present" },
      { name: "EMPTY", source: ".env", status: "empty" },
      { name: "MISSING", source: ".env", status: "missing" },
    ],
  });
});

test("operator cancel requires active project binding and releases submitted task", { timeout: 10000 }, async (t) => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "warroom-bridge-cancel-")
  );
  const target = http.createServer((_req, res) => {
    res.writeHead(204);
    res.end();
  });
  const targetPort = await listen(target);
  const bridgePort = await unusedPort();
  const stateFile = path.join(root, "state.json");

  fs.writeFileSync(stateFile, JSON.stringify({
    project: root,
    project_id: "project_test",
    bridge: { host: "127.0.0.1", port: bridgePort },
    frontend: { port: targetPort, session: "session_frontend" },
    backend: { port: targetPort, session: "session_backend" },
  }));

  const bridge = spawn(
    process.execPath,
    [path.join(__dirname, "..", "bridge.cjs")],
    {
      env: { ...process.env, HOME: root, WARROOM_STATE: stateFile },
      stdio: "ignore",
    }
  );

  t.after(async () => {
    await stop(bridge);
    await close(target);
    fs.rmSync(root, { recursive: true, force: true });
  });

  const bridgeUrl = `http://127.0.0.1:${bridgePort}`;
  await waitForBridge(bridgeUrl, bridge);
  const created = await fetch(`${bridgeUrl}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      division: "frontend",
      instruction: "Cancel bridge fixture.",
    }),
  });
  const { task } = await created.json();

  const wrongProject = await fetch(`${bridgeUrl}/task/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: task.taskId,
      expectedProjectId: "project_other",
      reason: "Operator recovery.",
    }),
  });
  assert.equal(wrongProject.status, 400);

  const cancelled = await fetch(`${bridgeUrl}/task/cancel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId: task.taskId,
      expectedProjectId: "project_test",
      reason: "Operator recovery.",
    }),
  });
  const cancelledBody = await cancelled.json();

  assert.equal(cancelled.status, 200);
  assert.equal(cancelledBody.task.state, "cancelled");
  assert.ok(cancelledBody.task.cancelledAt);
});
