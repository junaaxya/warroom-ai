const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { randomUUID } = require("crypto");

const STATE_FILE =
  process.env.WARROOM_STATE;

if (!STATE_FILE) {
  console.error(
    "[warroom] WARROOM_STATE is required for bridge runtime"
  );
  process.exit(2);
}

function loadState() {
  return JSON.parse(
    fs.readFileSync(STATE_FILE, "utf8")
  );
}

function getRuntime() {
  const state = loadState();

  const host =
    state.bridge?.host || "127.0.0.1";

  const bridgePort =
    Number(state.bridge?.port || 7777);

  return {
    state,
    bridgePort,

    divisions: {
      frontend: {
        server:
          `http://127.0.0.1:${state.frontend.port}`,
        session: state.frontend.session,
      },

      backend: {
        server:
          `http://127.0.0.1:${state.backend.port}`,
        session: state.backend.session,
      },
    },
  };
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    "Content-Type": "application/json",
  });

  res.end(JSON.stringify(data, null, 2));
}

async function readBody(req) {
  let body = "";

  for await (const chunk of req) {
    body += chunk;
  }

  return body ? JSON.parse(body) : {};
}

async function checkDivision(name) {
  const { divisions } = getRuntime();
  const division = divisions[name];

  try {
    const response = await fetch(division.server);

    return {
      division: name,
      reachable: response.ok,
      server: division.server,
      session: division.session,
    };
  } catch (error) {
    return {
      division: name,
      reachable: false,
      server: division.server,
      session: division.session,
      error: String(error),
    };
  }
}

async function sendMessage(from, to, message) {
  const { divisions } = getRuntime();

  const target = divisions[to];

  if (!target) {
    throw new Error(
      `Unknown target division: ${to}`
    );
  }

  if (
    !["frontend", "backend", "supervisor"].includes(from)
  ) {
    throw new Error(
      `Unknown source division: ${from}`
    );
  }

  const prompt = [
    "[WARROOM MESSAGE]",
    `FROM: ${from}`,
    `TO: ${to}`,
    "",
    message,
  ].join("\n");

  const url =
    `${target.server}/session/${target.session}/prompt_async`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      parts: [
        {
          type: "text",
          text: prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(
      `OpenCode returned HTTP ${response.status}`
    );
  }

  return {
    delivered: true,
    from,
    to,
    targetSession: target.session,
  };
}

async function bestEffortNotify(
  from,
  to,
  message
) {
  try {
    await sendMessage(
      from,
      to,
      message
    );

    return true;
  } catch (error) {
    console.error(
      `[warroom] coordination notification ${from} -> ${to} failed:`,
      String(error)
    );

    return false;
  }
}

async function getMessages(name, limit = 10) {
  const { divisions } = getRuntime();
  const division = divisions[name];

  if (!division) {
    throw new Error(
      `Unknown division: ${name}`
    );
  }

  const url =
    `${division.server}/session/${division.session}/message?limit=${limit}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `OpenCode returned HTTP ${response.status}`
    );
  }

  const messages = await response.json();

  return messages.map((message) => ({
    role:
      message?.info?.role ?? "unknown",

    text: (message.parts ?? [])
      .filter((part) => part.type === "text")
      .map((part) => part.text)
      .join("\n"),
  }));
}

function getCoordinationFile() {
  const state = loadState();

  const projectName =
    (state.project_id || path.basename(state.project));

  return path.join(
    os.homedir(),
    ".warroom",
    "runtime",
    `${projectName}-shared.json`
  );
}

function loadCoordinationStore() {
  const file = getCoordinationFile();

  fs.mkdirSync(
    path.dirname(file),
    { recursive: true }
  );

  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(
        { requests: [] },
        null,
        2
      ) + "\n"
    );
  }

  return JSON.parse(
    fs.readFileSync(file, "utf8")
  );
}

function saveCoordinationStore(store) {
  const file = getCoordinationFile();
  const temp = `${file}.tmp`;

  fs.writeFileSync(
    temp,
    JSON.stringify(store, null, 2) + "\n"
  );

  fs.renameSync(temp, file);
}

function normalizeProjectPath(targetPath) {
  const state = loadState();
  const project = path.resolve(state.project);

  const resolved =
    path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(project, targetPath);

  const relative =
    path.relative(project, resolved);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "Coordination path must be inside the project"
    );
  }

  return {
    project,
    resolved,
    relative:
      relative.split(path.sep).join("/"),
  };
}

function matchSharedPath(targetPath) {
  const state = loadState();

  const {
    project,
    resolved,
    relative,
  } = normalizeProjectPath(targetPath);

  for (
    const pattern of state.shared?.paths ?? []
  ) {
    const cleaned = pattern
      .replace(/\/\*\*$/, "")
      .replace(/\/\*$/, "");

    const sharedRoot =
      path.resolve(project, cleaned);

    if (
      resolved === sharedRoot ||
      resolved.startsWith(
        sharedRoot + path.sep
      )
    ) {
      return {
        pattern,
        path: relative,
      };
    }
  }

  throw new Error(
    `Path is not covered by shared policy: ${targetPath}`
  );
}

function createCoordinationRequest(
  from,
  targetPath,
  reason
) {
  if (
    !["frontend", "backend"].includes(from)
  ) {
    throw new Error(
      `Unknown requesting division: ${from}`
    );
  }

  if (!targetPath) {
    throw new Error(
      "path is required"
    );
  }

  const matched =
    matchSharedPath(targetPath);

  const to =
    from === "frontend"
      ? "backend"
      : "frontend";

  const store =
    loadCoordinationStore();

  const request = {
    id: `coord_${randomUUID()}`,
    from,
    to,
    path: matched.path,
    sharedPattern: matched.pattern,
    reason: reason || "",
    status: "pending",
    createdAt:
      new Date().toISOString(),
    approvedAt: null,
    approvedBy: null,
  };

  store.requests.push(request);
  saveCoordinationStore(store);

  return request;
}

function approveCoordinationRequest(
  id,
  by
) {
  if (
    !["frontend", "backend"].includes(by)
  ) {
    throw new Error(
      `Unknown approving division: ${by}`
    );
  }

  const store =
    loadCoordinationStore();

  const request =
    store.requests.find(
      (item) => item.id === id
    );

  if (!request) {
    throw new Error(
      `Coordination request not found: ${id}`
    );
  }

  if (request.status !== "pending") {
    throw new Error(
      `Coordination request is already ${request.status}`
    );
  }

  if (request.to !== by) {
    throw new Error(
      `${by} cannot approve a request addressed to ${request.to}`
    );
  }

  request.status = "approved";
  request.approvedAt =
    new Date().toISOString();
  request.approvedBy = by;

  saveCoordinationStore(store);

  return request;
}

function listCoordinationRequests(
  status,
  division
) {
  const store =
    loadCoordinationStore();

  return store.requests.filter(
    (request) => {
      if (
        status &&
        request.status !== status
      ) {
        return false;
      }

      if (
        division &&
        request.from !== division &&
        request.to !== division
      ) {
        return false;
      }

      return true;
    }
  );
}

const runtime = getRuntime();

const server = http.createServer(
  async (req, res) => {
    try {
      const url = new URL(
        req.url,
        `http://${req.headers.host}`
      );

      if (
        req.method === "GET" &&
        url.pathname === "/status"
      ) {
        const frontend =
          await checkDivision("frontend");

        const backend =
          await checkDivision("backend");

        return sendJson(res, 200, {
          bridge: "warroom-v1",
          stateFile: STATE_FILE,
          project: loadState().project,
          frontend,
          backend,
        });
      }

      if (
        req.method === "POST" &&
        url.pathname === "/send"
      ) {
        const body = await readBody(req);

        const {
          from,
          to,
          message,
        } = body;

        if (!from || !to || !message) {
          return sendJson(res, 400, {
            error:
              "from, to, and message are required",
          });
        }

        const result =
          await sendMessage(
            from,
            to,
            message
          );

        return sendJson(
          res,
          202,
          result
        );
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/coordination/request"
      ) {
        const body = await readBody(req);

        const {
          from,
          path: targetPath,
          reason,
        } = body;

        if (!from || !targetPath) {
          return sendJson(res, 400, {
            error:
              "from and path are required",
          });
        }

        try {
          const request =
            createCoordinationRequest(
              from,
              targetPath,
              reason
            );

          await bestEffortNotify(
            request.from,
            request.to,
            [
              "[WARROOM COORDINATION]",
              "TYPE: approval-request",
              `ID: ${request.id}`,
              `FROM: ${request.from}`,
              `TO: ${request.to}`,
              `PATH: ${request.path}`,
              `STATUS: ${request.status}`,
              "",
              `REASON: ${request.reason || "(none)"}`,
              "",
              "Review this coordination request before approving it."
            ].join("\n")
          );

          return sendJson(
            res,
            201,
            request
          );
        } catch (error) {
          return sendJson(res, 400, {
            error: String(error),
          });
        }
      }

      if (
        req.method === "POST" &&
        url.pathname ===
          "/coordination/approve"
      ) {
        const body = await readBody(req);

        const {
          id,
          by,
        } = body;

        if (!id || !by) {
          return sendJson(res, 400, {
            error:
              "id and by are required",
          });
        }

        try {
          const request =
            approveCoordinationRequest(
              id,
              by
            );

          await bestEffortNotify(
            request.approvedBy,
            request.from,
            [
              "[WARROOM COORDINATION]",
              "TYPE: approval-granted",
              `ID: ${request.id}`,
              `FROM: ${request.approvedBy}`,
              `TO: ${request.from}`,
              `PATH: ${request.path}`,
              `STATUS: ${request.status}`,
              "",
              "The shared-path coordination request has been approved.",
              "The approval remains subject to War Room single-use enforcement."
            ].join("\n")
          );

          return sendJson(
            res,
            200,
            request
          );
        } catch (error) {
          return sendJson(res, 400, {
            error: String(error),
          });
        }
      }

      if (
        req.method === "GET" &&
        url.pathname === "/coordination"
      ) {
        const status =
          url.searchParams.get("status");

        const division =
          url.searchParams.get("division");

        const requests =
          listCoordinationRequests(
            status,
            division
          );

        return sendJson(res, 200, {
          coordinationFile:
            getCoordinationFile(),
          requests,
        });
      }

      const match = url.pathname.match(
        /^\/messages\/(frontend|backend)$/
      );

      if (req.method === "GET" && match) {
        const division = match[1];

        const limit = Number(
          url.searchParams.get("limit") ?? 10
        );

        const messages =
          await getMessages(
            division,
            limit
          );

        return sendJson(res, 200, {
          division,
          messages,
        });
      }

      return sendJson(res, 404, {
        error: "not found",
      });

    } catch (error) {
      return sendJson(res, 500, {
        error: String(error),
      });
    }
  }
);

server.listen(
  runtime.bridgePort,
  "127.0.0.1",
  () => {
    console.log(
      `War Room Bridge v1 listening on http://127.0.0.1:${runtime.bridgePort}`
    );

    console.log(
      `War Room state: ${STATE_FILE}`
    );
  }
);
