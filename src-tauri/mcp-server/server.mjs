#!/usr/bin/env node

/**
 * Ani-Mime MCP Server
 *
 * Zero-dependency MCP server that bridges Claude Code to the Ani-Mime desktop pet.
 * Implements JSON-RPC 2.0 over stdio (MCP protocol).
 *
 * Tools:
 *   pet_say    — Make the pet say something via speech bubble
 *   pet_react  — Trigger a temporary reaction animation
 *   pet_status — Get the pet's current status
 */

import { createInterface } from "node:readline";
import http from "node:http";

const PORT = process.env.ANI_MIME_PORT || 1234;
const BASE = `http://127.0.0.1:${PORT}`;

const PROTOCOL_VERSION = "2024-11-05";

const TOOLS = [
  {
    name: "pet_say",
    description:
      "Make the desktop pet say something via a speech bubble. " +
      "Use this to communicate fun messages, celebrate milestones, " +
      "or react to what's happening in the coding session. " +
      "The pet will show the message for a few seconds then dismiss it.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "The message the pet should say (keep it short and fun)",
        },
        duration_secs: {
          type: "number",
          description: "How long to show the bubble (default: 7 seconds)",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "pet_react",
    description:
      "Trigger a temporary reaction animation on the desktop pet. " +
      "The pet will play the reaction for a few seconds then return to normal. " +
      "Use this to express emotions about code quality, build results, or milestones.",
    inputSchema: {
      type: "object",
      properties: {
        reaction: {
          type: "string",
          enum: ["celebrate", "nervous", "confused", "excited", "sleep"],
          description:
            "The reaction to play: " +
            "celebrate (barking/jumping), " +
            "nervous (alert/sniffing), " +
            "confused (looking around), " +
            "excited (barking/happy), " +
            "sleep (dozing off)",
        },
        duration_secs: {
          type: "number",
          description:
            "How long to show the reaction (default: 3 seconds)",
        },
      },
      required: ["reaction"],
    },
  },
  {
    name: "pet_status",
    description:
      "Get the current status of the desktop pet — what it's doing, " +
      "how long it's been active, who's visiting, and nearby peers. " +
      "Use this to check on the pet or adapt your behavior based on the user's activity.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  },
];

// --- HTTP helpers ---

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const data = JSON.stringify(body);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(data),
      },
    };
    const req = http.request(opts, (res) => {
      let buf = "";
      res.on("data", (chunk) => (buf += chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    http
      .get(url, (res) => {
        let buf = "";
        res.on("data", (chunk) => (buf += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
      })
      .on("error", reject);
  });
}

// --- JSON-RPC helpers ---

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

function result(id, res) {
  send({ jsonrpc: "2.0", id, result: res });
}

function rpcError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

// --- Tool handlers ---

async function callTool(name, args) {
  switch (name) {
    case "pet_say": {
      const res = await httpPost("/mcp/say", {
        message: args.message,
        duration_secs: args.duration_secs ?? 7,
      });
      if (res.status === 200) {
        return {
          content: [
            { type: "text", text: `Pet says: "${args.message}"` },
          ],
        };
      }
      return {
        content: [{ type: "text", text: `Failed (${res.status}): ${res.body}` }],
        isError: true,
      };
    }

    case "pet_react": {
      const res = await httpPost("/mcp/react", {
        reaction: args.reaction,
        duration_secs: args.duration_secs ?? 3,
      });
      if (res.status === 200) {
        return {
          content: [
            { type: "text", text: `Pet is reacting: ${args.reaction}` },
          ],
        };
      }
      return {
        content: [{ type: "text", text: `Failed (${res.status}): ${res.body}` }],
        isError: true,
      };
    }

    case "pet_status": {
      const res = await httpGet("/mcp/pet-status");
      if (res.status === 200) {
        return {
          content: [{ type: "text", text: res.body }],
        };
      }
      return {
        content: [{ type: "text", text: `Failed (${res.status}): ${res.body}` }],
        isError: true,
      };
    }

    default:
      return {
        content: [{ type: "text", text: `Unknown tool: ${name}` }],
        isError: true,
      };
  }
}

// --- Message dispatcher ---

async function handleMessage(msg) {
  // Notifications (no id) — just acknowledge
  if (msg.id === undefined) return;

  switch (msg.method) {
    case "initialize":
      result(msg.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "ani-mime", version: "1.0.0" },
      });
      break;

    case "ping":
      result(msg.id, {});
      break;

    case "tools/list":
      result(msg.id, { tools: TOOLS });
      break;

    case "tools/call":
      try {
        const res = await callTool(
          msg.params.name,
          msg.params.arguments || {}
        );
        result(msg.id, res);
      } catch (err) {
        result(msg.id, {
          content: [
            {
              type: "text",
              text: `Error: ${err.message}. Is ani-mime running?`,
            },
          ],
          isError: true,
        });
      }
      break;

    default:
      rpcError(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}

// --- Main: read stdin line by line ---

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", async (line) => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    await handleMessage(msg);
  } catch (err) {
    process.stderr.write(`[ani-mime-mcp] parse error: ${err.message}\n`);
  }
});

// Graceful shutdown
process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
