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
  let stateDuringDispatch;
  const target = http.createServer(async (req, res) => {
    if (req.method === "POST") {
      let body = "";

      for await (const chunk of req) {
        body += chunk;
      }

      messageID = JSON.parse(body).messageID;
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
    frontend: { port: targetPort, session: "session_frontend" },
    backend: { port: targetPort, session: "session_backend" },
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
  assert.equal(stateDuringDispatch, "queued");
  assert.equal(result.task.state, "submitted");
  assert.equal(JSON.stringify(result).includes("WRM_CAP_"), false);
});
