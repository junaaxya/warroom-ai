import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { routeTaskIntent } = require("./task-router.cjs");
const {
  delegateAndWait,
  MAX_TASK_WAIT_SLICE_MS,
} = require("./managed-delegation-wait.cjs");
const {
  updateProjectPolicy,
} = require("./project-policy-update.cjs");
const { safeRedactorForState } = require("./secret-redactor.cjs");

const execFileAsync = promisify(execFile);
const MAX_TASK_WAIT_OVERALL_MS = 120000;

const MODULE_DIR =
  path.dirname(
    fileURLToPath(import.meta.url)
  );

const INSTALL_DIR =
  process.env.WARROOM_INSTALL_DIR ||
  path.resolve(
    MODULE_DIR,
    ".."
  );

const WARROOM_BIN =
  process.env.WARROOM_BIN ||
  path.join(
    INSTALL_DIR,
    "bin",
    "warroom"
  );

const WARROOM_HOME =
  process.env.WARROOM_HOME ||
  path.join(
    os.homedir(),
    ".warroom"
  );

const ACTIVE_FILE =
  process.env.WARROOM_ACTIVE_FILE ||
  path.join(
    WARROOM_HOME,
    "active-project.json"
  );

const ALIASES_FILE =
  path.join(
    WARROOM_HOME,
    "aliases.json"
  );

const server = new McpServer({
  name: "warroom-supervisor",
  version: "0.1.0",
});

async function bridgeRequest(
  requestPath,
  options = {}
) {
  const response = await fetch(
    `${currentBridgeUrl()}${requestPath}`,
    options
  );

  const text = await response.text();

  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    throw new Error(
      `War Room Bridge HTTP ${response.status}: ${text}`
    );
  }

  return data;
}

function toolResult(data) {
  const redactor = runtimeRedactor();
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(redactor.redactValue(data), null, 2),
      },
    ],
  };
}

function toolError(error) {
  const redactor = runtimeRedactor();
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          redactor.redactText(error instanceof Error
            ? error.message
            : String(error)),
      },
    ],
  };
}

function loadJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function loadActive() {
  if (!fs.existsSync(ACTIVE_FILE)) {
    throw new Error(
      `No active War Room project. Run: warroom use <project|alias|.>`
    );
  }

  const active =
    loadJson(ACTIVE_FILE);

  if (
    !active.project ||
    !active.state_file ||
    !active.handoff_file
  ) {
    throw new Error(
      `Invalid active project file: ${ACTIVE_FILE}`
    );
  }

  return active;
}

function loadState() {
  const active =
    loadActive();

  return loadJson(
    active.state_file
  );
}

function runtimeRedactor() {
  try {
    return safeRedactorForState(loadState());
  } catch {
    return safeRedactorForState({});
  }
}

function loadHandoff() {
  const active =
    loadActive();

  if (
    !fs.existsSync(
      active.handoff_file
    )
  ) {
    throw new Error(
      `Handoff file missing: ${active.handoff_file}`
    );
  }

  return loadJson(
    active.handoff_file
  );
}

function saveHandoff(
  handoff
) {
  const active =
    loadActive();

  const file =
    active.handoff_file;

  const tmp =
    `${file}.tmp-${process.pid}`;

  fs.writeFileSync(
    tmp,
    JSON.stringify(
      runtimeRedactor().redactValue(handoff),
      null,
      2
    ) + "\n",
    {
      mode: 0o600,
    }
  );

  fs.renameSync(
    tmp,
    file
  );
}

function currentBridgeUrl() {
  const state =
    loadState();

  const host =
    state.bridge?.host ||
    "127.0.0.1";

  const port =
    state.bridge?.port;

  if (!port) {
    throw new Error(
      "Active project state has no bridge.port"
    );
  }

  return `http://${host}:${port}`;
}

function resolveProjectAlias(
  alias
) {
  if (!fs.existsSync(ALIASES_FILE)) {
    throw new Error(
      `Alias registry missing: ${ALIASES_FILE}`
    );
  }

  const aliases =
    loadJson(ALIASES_FILE);

  const project =
    aliases[alias];

  if (!project) {
    throw new Error(
      `Unknown War Room project alias: ${alias}`
    );
  }

  if (
    !fs.existsSync(project) ||
    !fs.statSync(project).isDirectory()
  ) {
    throw new Error(
      `Alias points to missing project: ${project}`
    );
  }

  return fs.realpathSync(project);
}

function safeProjectPath(
  project,
  relativePath
) {
  const root =
    path.resolve(project);

  const target =
    path.resolve(
      root,
      relativePath
    );

  if (
    target !== root &&
    !target.startsWith(
      root + path.sep
    )
  ) {
    throw new Error(
      `Path escapes project root: ${relativePath}`
    );
  }

  return target;
}

function readProjectText(
  project,
  relativePath,
  maxChars = 20000
) {
  const target =
    safeProjectPath(
      project,
      relativePath
    );

  if (
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile()
  ) {
    return null;
  }

  const text =
    fs.readFileSync(
      target,
      "utf8"
    );

  if (
    text.length <= maxChars
  ) {
    return text;
  }

  return (
    text.slice(
      0,
      maxChars
    ) +
    "\\n...[truncated]"
  );
}

function inspectProjectTree(
  project,
  maxDepth = 3,
  maxEntries = 300
) {
  const ignored =
    new Set([
      ".git",
      "node_modules",
      ".next",
      "dist",
      ".gradle",
      ".kotlin",
      ".codegraph",
    ]);

  const entries = [];

  function walk(
    directory,
    relative,
    depth
  ) {
    if (
      depth > maxDepth ||
      entries.length >= maxEntries
    ) {
      return;
    }

    const children =
      fs.readdirSync(
        directory,
        {
          withFileTypes: true,
        }
      );

    children.sort(
      (a, b) =>
        a.name.localeCompare(
          b.name
        )
    );

    for (
      const child of children
    ) {
      if (
        entries.length >=
        maxEntries
      ) {
        return;
      }

      if (
        ignored.has(
          child.name
        )
      ) {
        continue;
      }

      const childRelative =
        relative
          ? `${relative}/${child.name}`
          : child.name;

      entries.push({
        path:
          childRelative,
        type:
          child.isDirectory()
            ? "directory"
            : child.isFile()
              ? "file"
              : "other",
      });

      if (
        child.isDirectory()
      ) {
        walk(
          path.join(
            directory,
            child.name
          ),
          childRelative,
          depth + 1
        );
      }
    }
  }

  walk(
    project,
    "",
    1
  );

  return entries;
}

server.registerTool(
  "warroom_status",
  {
    description:
      "Check the health and reachability of the local War Room frontend and backend OpenCode divisions.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return toolResult(
        await bridgeRequest("/status")
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_project_context",
  {
    description:
      "Read the War Room project root, ownership rules, shared paths, and coordination policy. Does not expose runtime credentials.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const state = loadState();

      return toolResult({
        project: state.project,
        ownership:
          state.ownership ?? {},
        shared:
          state.shared ?? {},
        divisions: {
          frontend: {
            role: "frontend",
            write:
              state.ownership?.frontend?.write ?? [],
            denyWrite:
              state.ownership?.frontend?.deny_write ?? [],
          },
          backend: {
            role: "backend",
            write:
              state.ownership?.backend?.write ?? [],
            denyWrite:
              state.ownership?.backend?.deny_write ?? [],
          },
        },
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

async function sendTo(
  to,
  message
) {
  return bridgeRequest(
    "/send",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        from: "supervisor",
        to,
        message,
      }),
    }
  );
}

async function delegateTask(
  division,
  instruction
) {
  return bridgeRequest(
    "/tasks",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        division,
        instruction,
      }),
    }
  );
}

async function taskStatus(taskId) {
  return bridgeRequest(
    `/tasks/${encodeURIComponent(taskId)}`
  );
}

async function taskWait(
  taskId,
  timeoutMs
) {
  const params = new URLSearchParams();
  params.set("timeoutMs", String(timeoutMs));

  return bridgeRequest(
    `/tasks/${encodeURIComponent(taskId)}/wait?${params.toString()}`
  );
}

async function taskCancel(
  taskId,
  expectedProjectId,
  reason
) {
  return bridgeRequest(
    "/task/cancel",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        taskId,
        expectedProjectId,
        reason,
      }),
    }
  );
}

server.registerTool(
  "warroom_route_task",
  {
    description:
      "Read-only routing decision, not completion proof. inspection_first requires inspection/decomposition before delegation. Direct warroom_delegate_frontend and warroom_delegate_backend remain available when division is already known.",
    inputSchema: z.object({
      instruction: z.string().min(1).max(4000),
    }),
  },
  async ({ instruction }) => toolResult(routeTaskIntent(instruction))
);

server.registerTool(
  "warroom_task_delegate",
  {
    description:
      "Delegate one managed task to a frontend or backend OpenCode division. Prefer warroom_delegate_frontend or warroom_delegate_backend for work requiring a result. If task is submitted, call warroom_task_wait again for completion.",
    inputSchema: z.object({
      division: z.enum([
        "frontend",
        "backend",
      ]),
      instruction: z.string().min(1).max(4000),
    }),
  },
  async ({ division, instruction }) => {
    try {
      return toolResult(
        await delegateTask(
          division,
          instruction
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_delegate_and_wait",
  {
    description:
      "Delegate one managed task, then wait in bounded slices for its explicit callback result. The explicit callback remains completion proof. Timeout does not complete, fail, or cancel task. This tool cannot proactively push result after ChatGPT turn has ended. Direct warroom_delegate_frontend, warroom_delegate_backend, and warroom_task_wait remain available.",
    inputSchema: z.object({
      division: z.enum([
        "frontend",
        "backend",
      ]),
      instruction: z.string().min(1).max(4000),
      timeoutMs: z.number().int().min(1).max(MAX_TASK_WAIT_SLICE_MS).default(MAX_TASK_WAIT_SLICE_MS),
      overallTimeoutMs: z.number().int().min(1).max(MAX_TASK_WAIT_OVERALL_MS).default(MAX_TASK_WAIT_OVERALL_MS),
    }),
  },
  async (input) => {
    try {
      return toolResult(
        await delegateAndWait({
          ...input,
          delegateTask,
          taskWait,
        })
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_delegate_frontend",
  {
    description:
      "Preferred for frontend work requiring a result. If task is submitted, call warroom_task_wait again for completion.",
    inputSchema: z.object({
      instruction: z.string().min(1).max(4000),
    }),
  },
  async ({ instruction }) => {
    try {
      return toolResult(
        await delegateTask(
          "frontend",
          instruction
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_delegate_backend",
  {
    description:
      "Preferred for backend work requiring a result. If task is submitted, call warroom_task_wait again for completion.",
    inputSchema: z.object({
      instruction: z.string().min(1).max(4000),
    }),
  },
  async ({ instruction }) => {
    try {
      return toolResult(
        await delegateTask(
          "backend",
          instruction
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_task_status",
  {
    description:
      "Read managed task status from the active War Room bridge without changing task state.",
    inputSchema: z.object({
      taskId: z.string().min(1).max(128),
    }),
  },
  async ({ taskId }) => {
    try {
      return toolResult(
        await taskStatus(taskId)
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_task_wait",
  {
    description:
      "Wait for managed task completion for at most 25 seconds. Timeout does not mutate task state.",
    inputSchema: z.object({
      taskId: z.string().min(1).max(128),
      timeoutMs: z.number().int().min(0).max(25000).default(25000),
    }),
  },
  async ({ taskId, timeoutMs }) => {
    try {
      return toolResult(
        await taskWait(
          taskId,
          timeoutMs
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_task_cancel",
  {
    description:
      "Explicit operator cancellation for one active managed task. This is not agent completion and only cancels queued or submitted tasks after exact active-project confirmation.",
    inputSchema: z.object({
      taskId: z.string().min(1).max(128),
      expectedProjectId: z.string().min(1).max(128),
      reason: z.string().min(1).max(400),
    }),
  },
  async ({ taskId, expectedProjectId, reason }) => {
    try {
      return toolResult(
        await taskCancel(
          taskId,
          expectedProjectId,
          reason
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_send_frontend",
  {
    description:
      "Fire-and-forget message from the supervisor to the frontend OpenCode division. Delivery is not completion proof; use warroom_delegate_frontend for work requiring a result.",
    inputSchema: z.object({
      message:
        z.string().min(1),
    }),
  },
  async ({ message }) => {
    try {
      return toolResult(
        await sendTo(
          "frontend",
          message
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_send_backend",
  {
    description:
      "Fire-and-forget message from the supervisor to the backend OpenCode division. Delivery is not completion proof; use warroom_delegate_backend for work requiring a result.",
    inputSchema: z.object({
      message:
        z.string().min(1),
    }),
  },
  async ({ message }) => {
    try {
      return toolResult(
        await sendTo(
          "backend",
          message
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_broadcast_plan",
  {
    description:
      "Send the same architecture or implementation plan from the supervisor to both frontend and backend divisions.",
    inputSchema: z.object({
      plan:
        z.string().min(1),
    }),
  },
  async ({ plan }) => {
    try {
      const message = [
        "[SUPERVISOR PLAN]",
        "",
        plan,
      ].join("\n");

      const frontend =
        await sendTo(
          "frontend",
          message
        );

      const backend =
        await sendTo(
          "backend",
          message
        );

      return toolResult({
        delivered: true,
        frontend,
        backend,
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

async function readDivision(
  division,
  limit
) {
  return bridgeRequest(
    `/messages/${division}?limit=${limit}`
  );
}

server.registerTool(
  "warroom_read_frontend",
  {
    description:
      "Read recent messages from the frontend OpenCode session. Legacy messages are fire-and-forget; this read is not completion proof.",
    inputSchema: z.object({
      limit:
        z.number()
          .int()
          .min(1)
          .max(50)
          .default(10),
    }),
  },
  async ({ limit }) => {
    try {
      return toolResult(
        await readDivision(
          "frontend",
          limit
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_read_backend",
  {
    description:
      "Read recent messages from the backend OpenCode session. Legacy messages are fire-and-forget; this read is not completion proof.",
    inputSchema: z.object({
      limit:
        z.number()
          .int()
          .min(1)
          .max(50)
          .default(10),
    }),
  },
  async ({ limit }) => {
    try {
      return toolResult(
        await readDivision(
          "backend",
          limit
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_coordination_list",
  {
    description:
      "Inspect shared-path coordination requests across the War Room. This tool is read-only and does not approve requests.",
    inputSchema: z.object({
      status: z
        .enum([
          "pending",
          "approved",
          "reserved",
          "consumed",
          "expired",
        ])
        .optional(),

      division: z
        .enum([
          "frontend",
          "backend",
        ])
        .optional(),
    }),
  },
  async ({
    status,
    division,
  }) => {
    try {
      const params =
        new URLSearchParams();

      if (status) {
        params.set(
          "status",
          status
        );
      }

      if (division) {
        params.set(
          "division",
          division
        );
      }

      const query =
        params.toString();

      return toolResult(
        await bridgeRequest(
          query
            ? `/coordination?${query}`
            : "/coordination"
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_active_project",
  {
    description:
      "Read which War Room project is currently active for this supervisor.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const active =
        loadActive();

      const state =
        loadState();

      return toolResult({
        project:
          active.project,
        projectName:
          active.project_name,
        stateFile:
          active.state_file,
        handoffFile:
          active.handoff_file,
        bridge: {
          host:
            state.bridge?.host ??
            "127.0.0.1",
          port:
            state.bridge?.port,
        },
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_project_policy_update",
  {
    description:
      "Atomically replace active War Room ownership/shared/protected metadata after verifying expectedProjectId. This changes only active state metadata, preserves runtime identity and sessions, and never modifies project source files.",
    inputSchema: z.object({
      expectedProjectId: z.string().min(1),
      ownership: z.object({
        frontend: z.object({
          write: z.array(z.string()),
          read: z.array(z.string()),
          deny_write: z.array(z.string()),
        }),
        backend: z.object({
          write: z.array(z.string()),
          read: z.array(z.string()),
          deny_write: z.array(z.string()),
        }),
      }),
      shared: z.object({
        paths: z.array(z.string()),
        policy: z.literal("coordinate_before_semantic_change"),
        reservation_ttl_ms: z.number().int(),
      }),
      protected: z.object({
        paths: z.array(z.string()),
      }),
      environment: z.object({
        mode: z.enum(["legacy_inherited", "isolated"]),
        sources: z.array(z.string()),
        allow: z.object({
          frontend: z.array(z.string()),
          backend: z.array(z.string()),
        }),
      }).optional(),
    }),
  },
  async ({
    expectedProjectId,
    ownership,
    shared,
    protected: protectedPolicy,
    environment,
  }) => {
    try {
      return toolResult(
        updateProjectPolicy({
          active: loadActive(),
          expectedProjectId,
          policy: {
            ownership,
            shared,
            protected: protectedPolicy,
            ...(environment !== undefined && { environment }),
          },
        })
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_handoff",
  {
    description:
      "Read the persistent handoff for the active War Room project, including current goal, completed work, issues, decisions, verification, and next action.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      return toolResult(
        loadHandoff()
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_handoff_update",
  {
    description:
      "Update the persistent handoff for the active War Room project. This changes only War Room handoff metadata, never project source files.",
    inputSchema: z.object({
      current_goal:
        z.string().optional(),

      status:
        z.enum([
          "idle",
          "planning",
          "implementing",
          "verifying",
          "blocked",
          "completed",
        ]).optional(),

      completed:
        z.array(
          z.string()
        ).optional(),

      open_issues:
        z.array(
          z.string()
        ).optional(),

      decisions:
        z.array(
          z.string()
        ).optional(),

      verification:
        z.array(
          z.string()
        ).optional(),

      next_action:
        z.string().optional(),
    }),
  },
  async (update) => {
    try {
      const handoff =
        loadHandoff();

      for (
        const [
          key,
          value,
        ] of Object.entries(
          update
        )
      ) {
        if (
          value !== undefined
        ) {
          handoff[key] =
            value;
        }
      }

      handoff.updated_at =
        new Date()
          .toISOString();

      saveHandoff(
        handoff
      );

      return toolResult({
        updated: true,
        handoff,
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_resume",
  {
    description:
      "Resume the active War Room project by reading persistent handoff, project ownership/context, live division status, and recent frontend/backend messages. This tool is read-only.",
    inputSchema: z.object({
      message_limit:
        z.number()
          .int()
          .min(1)
          .max(20)
          .default(5),
    }),
  },
  async ({
    message_limit,
  }) => {
    try {
      const active =
        loadActive();

      const state =
        loadState();

      const handoff =
        loadHandoff();

      const results =
        await Promise.allSettled([
          bridgeRequest(
            "/status"
          ),
          readDivision(
            "frontend",
            message_limit
          ),
          readDivision(
            "backend",
            message_limit
          ),
        ]);

      const unpack = (
        result
      ) => {
        if (
          result.status ===
          "fulfilled"
        ) {
          return {
            ok: true,
            data:
              result.value,
          };
        }

        return {
          ok: false,
          error:
            result.reason
              instanceof Error
              ? result.reason.message
              : String(
                  result.reason
                ),
        };
      };

      return toolResult({
        activeProject: {
          project:
            active.project,
          projectName:
            active.project_name,
          stateFile:
            active.state_file,
          handoffFile:
            active.handoff_file,
        },

        handoff,

        context: {
          ownership:
            state.ownership ??
            {},
          shared:
            state.shared ??
            {},
        },

        live: {
          status:
            unpack(
              results[0]
            ),
          frontend:
            unpack(
              results[1]
            ),
          backend:
            unpack(
              results[2]
            ),
        },
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_onboard_inspect",
  {
    description:
      "Read-only inspection of a registered project alias that has not yet been onboarded into War Room. Reads project structure and selected architecture/rules files so ownership boundaries can be proposed. Makes no project changes.",
    inputSchema: z.object({
      alias:
        z.string()
          .min(1),
    }),
  },
  async ({ alias }) => {
    try {
      const project =
        resolveProjectAlias(
          alias
        );

      let packageJson =
        null;

      const packageText =
        readProjectText(
          project,
          "package.json",
          30000
        );

      if (packageText) {
        try {
          packageJson =
            JSON.parse(
              packageText
            );
        } catch {
          packageJson = {
            parseError: true,
          };
        }
      }

      const detected = {
        nextjs:
          fs.existsSync(
            path.join(
              project,
              "next.config.ts"
            )
          ) ||
          fs.existsSync(
            path.join(
              project,
              "next.config.js"
            )
          ),

        prisma:
          fs.existsSync(
            path.join(
              project,
              "prisma",
              "schema.prisma"
            )
          ),

        androidCompanion:
          fs.existsSync(
            path.join(
              project,
              "android-companion"
            )
          ),

        browserExtension:
          fs.existsSync(
            path.join(
              project,
              "extension-android-bank"
            )
          ),
      };

      return toolResult({
        alias,
        project,
        readOnly: true,

        detected,

        packageJson,

        guidance: {
          agents:
            readProjectText(
              project,
              "AGENTS.md"
            ),

          rules:
            readProjectText(
              project,
              "RULES.md"
            ),

          architecture:
            readProjectText(
              project,
              "ARCHITECTURE.md"
            ),

          flow:
            readProjectText(
              project,
              "FLOW.md"
            ),
        },

        tree:
          inspectProjectTree(
            project
          ),
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_onboard_create",
  {
    description:
      "Create War Room onboarding for a registered project alias using an explicitly approved path-based ownership policy. This operation is asynchronous and idempotent: the first call starts onboarding and returns immediately; later calls report running, completed, or failed status. It does not modify project source files or start the project.",
    inputSchema: z.object({
      alias:
        z.string()
          .min(1),

      ownership:
        z.object({
          frontend:
            z.object({
              write:
                z.array(z.string().min(1)),
              read:
                z.array(z.string().min(1)),
              deny_write:
                z.array(z.string().min(1)),
            }),

          backend:
            z.object({
              write:
                z.array(z.string().min(1)),
              read:
                z.array(z.string().min(1)),
              deny_write:
                z.array(z.string().min(1)),
            }),
        }),

      shared:
        z.object({
          paths:
            z.array(z.string().min(1)),

          policy:
            z.literal(
              "coordinate_before_semantic_change"
            ),

          reservation_ttl_ms:
            z.number()
              .int()
              .positive()
              .default(600000),
        }),

      protected:
        z.object({
          paths:
            z.array(z.string().min(1)),
        }).default({
          paths: [],
        }),

      environment: z.object({
        mode: z.enum(["legacy_inherited", "isolated"]),
        sources: z.array(z.string()),
        allow: z.object({
          frontend: z.array(z.string()),
          backend: z.array(z.string()),
        }),
      }).optional(),
    }),
  },

  async ({
    alias,
    ownership,
    shared,
    protected: protectedPolicy,
    environment,
  }) => {
    try {
      const warroomHome =
        WARROOM_HOME;

      const jobsDir =
        path.join(
          warroomHome,
          "jobs"
        );

      fs.mkdirSync(
        jobsDir,
        {
          recursive: true,
          mode: 0o700,
        }
      );

      const safeAlias =
        alias
          .toLowerCase()
          .replace(
            /[^a-z0-9._-]+/g,
            "-"
          );

      const jobFile =
        path.join(
          jobsDir,
          `onboard-${safeAlias}.json`
        );

      const policyFile =
        path.join(
          jobsDir,
          `onboard-${safeAlias}.policy.json`
        );

      const logFile =
        path.join(
          jobsDir,
          `onboard-${safeAlias}.log`
        );

      function findCompletedState() {
        const projectsDir =
          path.join(
            warroomHome,
            "projects"
          );

        if (!fs.existsSync(projectsDir)) {
          return null;
        }

        for (
          const name
          of fs.readdirSync(projectsDir)
        ) {
          if (!name.endsWith(".json")) {
            continue;
          }

          const filename =
            path.join(
              projectsDir,
              name
            );

          try {
            const state =
              JSON.parse(
                fs.readFileSync(
                  filename,
                  "utf8"
                )
              );

            if (
              state.onboarding?.alias
              !== alias
            ) {
              continue;
            }

            return {
              filename,
              state,
            };
          } catch {
            // Ignore unrelated or malformed files.
          }
        }

        return null;
      }

      function processAlive(pid) {
        if (
          !Number.isInteger(pid)
          || pid <= 0
        ) {
          return false;
        }

        try {
          process.kill(
            pid,
            0
          );
          return true;
        } catch {
          return false;
        }
      }

      function readLogTail() {
        try {
          const text =
            fs.readFileSync(
              logFile,
              "utf8"
            );

          return text
            .split("\n")
            .slice(-80)
            .join("\n")
            .trim();
        } catch {
          return "";
        }
      }

      function completedResult(found) {
        const state =
          found.state;

        return toolResult({
          status: "completed",
          created: true,
          alias,

          project_id:
            state.project_id ?? null,

          state_file:
            found.filename,

          frontend: {
            port:
              state.frontend?.port
              ?? null,
            session:
              state.frontend?.session
              ?? null,
          },

          backend: {
            port:
              state.backend?.port
              ?? null,
            session:
              state.backend?.session
              ?? null,
          },

          bridge: {
            port:
              state.bridge?.port
              ?? null,
          },

          stderr:
            null,

          warning:
            null,
        });
      }

      // Idempotency: if onboarding already succeeded,
      // never start another job.
      const completed =
        findCompletedState();

      if (completed) {
        return completedResult(
          completed
        );
      }

      // Existing job: report status instead of spawning
      // another onboarding process.
      if (fs.existsSync(jobFile)) {
        let job = null;

        try {
          job =
            JSON.parse(
              fs.readFileSync(
                jobFile,
                "utf8"
              )
            );
        } catch {
          // Broken metadata is treated as failed below.
        }

        if (
          job
          && processAlive(job.pid)
        ) {
          return toolResult({
            status: "running",
            started: true,
            alias,
            pid:
              job.pid,
            started_at:
              job.started_at
              ?? null,
            message:
              "War Room onboarding is still running locally. Call warroom_onboard_create again with the same approved payload to check status.",
          });
        }

        // Process is gone. Check state one more time in
        // case it completed between the checks above.
        const finished =
          findCompletedState();

        if (finished) {
          return completedResult(
            finished
          );
        }

        return toolResult({
          status: "failed",
          created: false,
          alias,
          message:
            "The asynchronous onboarding process exited without creating a War Room state file.",
          log_tail:
            readLogTail()
            || null,
        });
      }

      const policy = {
        ownership,
        shared,
        protected:
          protectedPolicy,
        ...(environment !== undefined && { environment }),
      };

      fs.writeFileSync(
        policyFile,
        JSON.stringify(
          policy,
          null,
          2
        ) + "\n",
        {
          mode: 0o600,
        }
      );

      // Start local onboarding completely detached from
      // the ChatGPT connector execution window.
      const logFd =
        fs.openSync(
          logFile,
          "a",
          0o600
        );

      const warroom =
        WARROOM_BIN;

      const child =
        spawn(
          warroom,
          [
            "onboard",
            alias,
            policyFile,
          ],
          {
            detached: true,
            stdio: [
              "ignore",
              logFd,
              logFd,
            ],
            env: {
              ...process.env,
            },
          }
        );

      child.unref();

      fs.closeSync(logFd);

      const job = {
        version: 1,
        alias,
        pid:
          child.pid,
        status:
          "running",
        started_at:
          new Date().toISOString(),
        policy_file:
          policyFile,
        log_file:
          logFile,
      };

      fs.writeFileSync(
        jobFile,
        JSON.stringify(
          job,
          null,
          2
        ) + "\n",
        {
          mode: 0o600,
        }
      );

      return toolResult({
        status: "running",
        started: true,
        alias,
        pid:
          child.pid,
        message:
          "War Room onboarding started asynchronously. Call warroom_onboard_create again with the exact same approved payload to check completion.",
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

const transport =
  new StdioServerTransport();

await server.connect(transport);
