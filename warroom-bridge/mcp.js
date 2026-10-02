import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import fs from "node:fs";

const BRIDGE_URL =
  process.env.WARROOM_BRIDGE_URL || "http://127.0.0.1:7777";

const WARROOM_DIVISION =
  process.env.WARROOM_DIVISION;

const WARROOM_STATE =
  process.env.WARROOM_STATE;

if (!WARROOM_STATE) {
  throw new Error(
    "[warroom] WARROOM_STATE is required for division MCP"
  );
}

function loadWarroomState() {
  return JSON.parse(
    fs.readFileSync(WARROOM_STATE, "utf8")
  );
}

const server = new McpServer({
  name: "warroom",
  version: "0.1.0",
});

async function bridgeRequest(path, options = {}) {
  const response = await fetch(`${BRIDGE_URL}${path}`, options);
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
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function toolError(error) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text:
          error instanceof Error
            ? error.message
            : String(error),
      },
    ],
  };
}

server.registerTool(
  "warroom_context",
  {
    description:
      "Return the current division identity, project root, ownership rules, forbidden write paths, shared paths, and collaboration policy.",
    inputSchema: z.object({}),
  },
  async () => {
    try {
      const division = WARROOM_DIVISION;

      if (!["frontend", "backend"].includes(division)) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      const state = loadWarroomState();
      const otherDivision =
        division === "frontend"
          ? "backend"
          : "frontend";

      return toolResult({
        division,
        otherDivision,
        project: state.project,
        ownership:
          state.ownership?.[division] ?? {},
        shared:
          state.shared ?? {},
        stateFile: WARROOM_STATE,
      });
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_status",
  {
    description:
      "Check the status of the War Room bridge and frontend/backend OpenCode divisions.",
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
  "warroom_send",
  {
    description:
      "Send a direct engineering message from the current War Room division to another division.",
    inputSchema: z.object({
      to: z.enum(["frontend", "backend"]),
      message: z.string().min(1),
    }),
  },
  async ({ to, message }) => {
    try {
      const from = WARROOM_DIVISION;

      if (!["frontend", "backend"].includes(from)) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      if (from === to) {
        throw new Error(
          "Cannot send a War Room message to your own division"
        );
      }

      return toolResult(
        await bridgeRequest("/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from,
            to,
            message,
          }),
        })
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_messages",
  {
    description:
      "Read recent messages from a frontend or backend OpenCode session.",
    inputSchema: z.object({
      division: z.enum(["frontend", "backend"]),
      limit: z.number().int().min(1).max(50).default(10),
    }),
  },
  async ({ division, limit }) => {
    try {
      return toolResult(
        await bridgeRequest(
          `/messages/${division}?limit=${limit}`
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_task_complete",
  {
    description:
      "Complete a managed War Room task assigned to this division. Use only the task ID and capability included in its task envelope.",
    inputSchema: z.object({
      taskId: z.string().min(1).max(128),
      capability: z.string().min(32).max(256),
      outcome: z.enum(["completed", "failed", "blocked"]),
      result: z.string().min(1).max(4000),
    }),
  },
  async ({ taskId, capability, outcome, result }) => {
    try {
      const division = WARROOM_DIVISION;

      if (!["frontend", "backend"].includes(division)) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      const state = loadWarroomState();
      const projectId = state.project_id;
      const opencodeSession = state[division]?.session;

      if (!projectId || !opencodeSession) {
        throw new Error(
          "War Room state lacks task completion identity"
        );
      }

      return toolResult(
        await bridgeRequest("/task/complete", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            taskId,
            capability,
            outcome,
            result,
            division,
          }),
        })
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_coordination_request",
  {
    description:
      "Request approval from the other War Room division before making a semantic change to a shared path.",
    inputSchema: z.object({
      path: z.string().min(1),
      reason: z.string().optional(),
    }),
  },
  async ({ path: targetPath, reason }) => {
    try {
      const from = WARROOM_DIVISION;

      if (!["frontend", "backend"].includes(from)) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      return toolResult(
        await bridgeRequest(
          "/coordination/request",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              from,
              path: targetPath,
              reason: reason ?? "",
            }),
          }
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

server.registerTool(
  "warroom_coordination_approve",
  {
    description:
      "Approve a pending shared-path coordination request addressed to the current War Room division.",
    inputSchema: z.object({
      id: z.string().min(1),
    }),
  },
  async ({ id }) => {
    try {
      const by = WARROOM_DIVISION;

      if (!["frontend", "backend"].includes(by)) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      return toolResult(
        await bridgeRequest(
          "/coordination/approve",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              id,
              by,
            }),
          }
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
      "List shared-path coordination requests involving the current War Room division.",
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
    }),
  },
  async ({ status }) => {
    try {
      const division =
        WARROOM_DIVISION;

      if (
        !["frontend", "backend"].includes(
          division
        )
      ) {
        throw new Error(
          "WARROOM_DIVISION must be frontend or backend"
        );
      }

      const params =
        new URLSearchParams();

      params.set(
        "division",
        division
      );

      if (status) {
        params.set(
          "status",
          status
        );
      }

      return toolResult(
        await bridgeRequest(
          `/coordination?${params.toString()}`
        )
      );
    } catch (error) {
      return toolError(error);
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
