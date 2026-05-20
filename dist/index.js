import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express from "express";
import { randomUUID } from "crypto";
import { registerSheetTools } from "./tools/sheets.js";
import { registerReportWorkspaceTools } from "./tools/reports-workspaces.js";
import { registerDiscussionAttachmentTools } from "./tools/discussions-attachments.js";
import { registerSearchTools } from "./tools/search.js";
import { initSmartsheetClient } from "./services/smartsheet.js";
// ── Server Factory ────────────────────────────────────────────────────────────
// Creates a fresh MCP server instance with all tools registered.
// We create one per session so each session has isolated state.
function createServer() {
    const server = new McpServer({
        name: "smartsheet-mcp-server",
        version: "1.0.0",
    });
    registerSheetTools(server);
    registerReportWorkspaceTools(server);
    registerDiscussionAttachmentTools(server);
    registerSearchTools(server);
    return server;
}
// ── Initialize API client from env at startup ─────────────────────────────────
const envToken = process.env.SMARTSHEET_API_TOKEN;
if (envToken) {
    initSmartsheetClient(envToken);
}
// ── Transport: Streamable HTTP with session management ────────────────────────
// Copilot Studio requires stateful sessions:
//   1. POST /mcp with initialize request  → returns Mcp-Session-Id header
//   2. POST /mcp with initialized notification (same session ID)
//   3. POST /mcp with tools/list (same session ID)
//   4. POST /mcp with tools/call (same session ID)
async function runHTTP() {
    const app = express();
    app.use(express.json());
    // Session store: maps session ID → transport
    const sessions = new Map();
    // Health check
    app.get("/health", (_req, res) => {
        res.json({
            status: "ok",
            server: "smartsheet-mcp-server",
            version: "1.0.0",
            activeSessions: sessions.size,
        });
    });
    app.post("/mcp", async (req, res) => {
        // Per-request token override for multi-tenant scenarios
        const requestToken = req.headers["x-smartsheet-token"];
        if (requestToken) {
            initSmartsheetClient(requestToken);
        }
        const sessionId = req.headers["mcp-session-id"];
        // ── New session: initialize request ──────────────────────────────────────
        if (!sessionId) {
            // Must be an initialize request to start a new session
            if (!isInitializeRequest(req.body)) {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32600,
                        message: "Bad Request: expected initialize request to start a session",
                    },
                    id: req.body?.id ?? null,
                });
                return;
            }
            const newSessionId = randomUUID();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
                enableJsonResponse: true,
                onsessioninitialized: (sid) => {
                    sessions.set(sid, transport);
                },
            });
            // Clean up session when connection closes
            transport.onclose = () => {
                sessions.delete(newSessionId);
            };
            const server = createServer();
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
        }
        // ── Existing session ──────────────────────────────────────────────────────
        const transport = sessions.get(sessionId);
        if (!transport) {
            res.status(404).json({
                jsonrpc: "2.0",
                error: {
                    code: -32001,
                    message: `Session not found: ${sessionId}. Start a new session by sending an initialize request without Mcp-Session-Id.`,
                },
                id: req.body?.id ?? null,
            });
            return;
        }
        await transport.handleRequest(req, res, req.body);
    });
    // Handle session termination (DELETE)
    app.delete("/mcp", async (req, res) => {
        const sessionId = req.headers["mcp-session-id"];
        if (sessionId && sessions.has(sessionId)) {
            const transport = sessions.get(sessionId);
            await transport.close();
            sessions.delete(sessionId);
            res.status(200).json({ message: "Session terminated" });
        }
        else {
            res.status(404).json({ message: "Session not found" });
        }
    });
    const port = parseInt(process.env.PORT ?? "3000", 10);
    app.listen(port, () => {
        process.stderr.write(`Smartsheet MCP Server (HTTP) running on http://localhost:${port}/mcp\n`);
    });
}
// ── Transport: stdio ──────────────────────────────────────────────────────────
async function runStdio() {
    const server = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("Smartsheet MCP Server (stdio) running\n");
}
// ── Entry Point ───────────────────────────────────────────────────────────────
const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
    runHTTP().catch((err) => {
        process.stderr.write(`Fatal: ${err}\n`);
        process.exit(1);
    });
}
else {
    runStdio().catch((err) => {
        process.stderr.write(`Fatal: ${err}\n`);
        process.exit(1);
    });
}
