import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import { randomUUID } from "crypto";
import { registerSheetTools } from "./tools/sheets.js";
import { registerReportWorkspaceTools } from "./tools/reports-workspaces.js";
import { registerDiscussionAttachmentTools } from "./tools/discussions-attachments.js";
import { registerSearchTools } from "./tools/search.js";
import { initSmartsheetClient } from "./services/smartsheet.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectInfo {
    projectSheetId:        string | null;
    projectSheetPermalink: string | null;
    raidSheetId:           string | null;
    raidSheetPermalink:    string | null;
}

interface SmartsheetSheet {
    id:        number;
    name:      string;
    permalink: string;
}

interface SmartsheetFolder {
    id:      number;
    name:    string;
    sheets?: SmartsheetSheet[];
    folders?: SmartsheetFolder[];
}

interface SmartsheetWorkspace {
    id:      number;
    name:    string;
    folders?: SmartsheetFolder[];
}

// ── Server Factory ────────────────────────────────────────────────────────────
function createServer(): McpServer {
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
async function runHTTP(): Promise<void> {
    const app = express();
    app.use(express.json());

    // Session store: maps session ID → transport
    const sessions = new Map<string, StreamableHTTPServerTransport>();

    // ── Project info: workspace folder traversal ──────────────────────────────
    // Walks both EPO workspaces recursively. Finds every project folder by name
    // (P-0077, COM-00086 etc.) and collects the project sheet + RAID log inside.
    // Cache resets on server restart → new projects are auto-discovered.
    let _projCache: { comm: Record<string, ProjectInfo>; bs: Record<string, ProjectInfo> } | null = null;

    async function walkFolder(
        token:    string,
        folderId: number,
        out:      Record<string, ProjectInfo>
    ): Promise<void> {
        try {
            const r = await fetch(
                `https://api.smartsheet.com/2.0/folders/${folderId}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
            );
            if (!r.ok) return;

            const folder = (await r.json()) as SmartsheetFolder;
            const sheets: SmartsheetSheet[] = folder.sheets ?? [];

            // Project folder = name starts with a project ID like P-0077 or COM-00086
            const folderName = (folder.name ?? "").replace(/^_+/, "");
            const pidMatch   = folderName.match(/^([A-Z]+-\d+)/i);

            if (pidMatch && sheets.length) {
                const pid = pidMatch[1].toUpperCase();

                // Prefer sheets whose name starts with "_" as the project sheet
                // (e.g. _P-0077 Nakano Drinking Concentrates), fall back to
                // first non-RAID sheet for folders with extra sheets.
                const raidSheet = sheets.find(s => /raid/i.test(s.name ?? ""));
                const projSheet =
                    sheets.find(s => /^_/.test(s.name ?? "")) ??
                    sheets.find(s => !/raid/i.test(s.name ?? ""));

                out[pid] = {
                    projectSheetId:        projSheet ? String(projSheet.id)        : null,
                    projectSheetPermalink: projSheet ? projSheet.permalink         : null,
                    raidSheetId:           raidSheet ? String(raidSheet.id)        : null,
                    raidSheetPermalink:    raidSheet ? raidSheet.permalink         : null,
                };
            }

            // Recurse into sub-folders in parallel
            if (folder.folders?.length) {
                await Promise.all(folder.folders.map(sf => walkFolder(token, sf.id, out)));
            }
        } catch {
            // Skip inaccessible folders silently
        }
    }

    // Returns project sheet + RAID log info for every project in both EPO
    // workspaces. Result is cached in memory; resets on server restart.
    app.get("/project-info", async (_req: Request, res: Response) => {
        const token = process.env.SMARTSHEET_API_TOKEN;
        if (!token) { res.status(500).json({ error: "SMARTSHEET_API_TOKEN not set" }); return; }
        if (_projCache) { res.json(_projCache); return; }
        try {
            // Traverse each workspace into its OWN map — prevents ID collisions.
            // Both Comm and BS use independent P-XXXX sequences that overlap.
            const commOut: Record<string, ProjectInfo> = {};
            const bsOut:   Record<string, ProjectInfo> = {};

            const workspaces = [
                { wsId: "8580344233387908", out: commOut, label: "Comm" },  // EPO – Commercialization
                { wsId: "8144071119136644", out: bsOut,   label: "BS"   },  // EPO – Business Support
            ];

            await Promise.all(workspaces.map(async ({ wsId, out, label }) => {
                const r = await fetch(
                    `https://api.smartsheet.com/2.0/workspaces/${wsId}`,
                    { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }
                );
                if (!r.ok) {
                    console.error(`[EPO] ${label} workspace fetch failed:`, wsId, r.status);
                    return;
                }
                const ws = (await r.json()) as SmartsheetWorkspace;
                console.log(`[EPO] Traversing ${label} workspace:`, ws.name, "— top folders:", ws.folders?.length ?? 0);
                if (ws.folders?.length) {
                    await Promise.all(ws.folders.map(f => walkFolder(token, f.id, out)));
                }
                console.log(`[EPO] ${label} index:`, Object.keys(out).length, "projects");
            }));

            _projCache = { comm: commOut, bs: bsOut };
            console.log("[EPO] /project-info cache built — Comm:", Object.keys(commOut).length, "| BS:", Object.keys(bsOut).length);
            res.json(_projCache);
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[EPO] /project-info error:", msg);
            res.status(500).json({ error: msg });
        }
    });

    // Clear the project-info cache to force a fresh workspace traversal.
    // Call via:  POST /project-info/refresh
    // Or from DevTools console:
    //   fetch('/project-info/refresh', {method:'POST'}).then(r=>r.json()).then(console.log)
    app.post("/project-info/refresh", (_req: Request, res: Response) => {
        _projCache = null;
        res.json({ ok: true, message: "Cache cleared — next GET /project-info will re-scan" });
    });

    // ── Dashboard static file ─────────────────────────────────────────────────
    app.get("/dashboard", (_req: Request, res: Response) => {
        res.sendFile("/home/site/wwwroot/epo_utilization_standalone.html");
    });

    // ── Generic Smartsheet API proxy ──────────────────────────────────────────
    // Forwards any /api/* request to https://api.smartsheet.com/2.0{path}
    // using the server-side SMARTSHEET_API_TOKEN (never exposed to the browser).
    // Note: Smartsheet /search returns 404 for this service-account token
    // (search scope not granted). All dashboard features avoid the search API.
    app.use("/api", async (req: Request, res: Response) => {
        const token = process.env.SMARTSHEET_API_TOKEN;
        if (!token) { res.status(500).json({ error: "no token" }); return; }
        try {
            const qs = Object.keys(req.query).length
                ? "?" + new URLSearchParams(req.query as Record<string, string>).toString()
                : "";
            const r = await fetch(`https://api.smartsheet.com/2.0${req.path}${qs}`, {
                headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
            });
            res.json(await r.json());
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            res.status(500).json({ error: msg });
        }
    });

    // ── Health check ──────────────────────────────────────────────────────────
    app.get("/health", (_req: Request, res: Response) => {
        res.json({
            status:         "ok",
            server:         "smartsheet-mcp-server",
            version:        "1.0.0",
            activeSessions: sessions.size,
        });
    });

    // ── MCP endpoint ──────────────────────────────────────────────────────────
    app.post("/mcp", async (req: Request, res: Response) => {
        const requestToken = req.headers["x-smartsheet-token"];
        if (requestToken) {
            initSmartsheetClient(requestToken as string);
        }
        const sessionId = req.headers["mcp-session-id"] as string | undefined;

        if (!sessionId) {
            if (!isInitializeRequest(req.body)) {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code:    -32600,
                        message: "Bad Request: expected initialize request to start a session",
                    },
                    id: req.body?.id ?? null,
                });
                return;
            }
            const newSessionId = randomUUID();
            const transport    = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => newSessionId,
                enableJsonResponse: true,
                onsessioninitialized: (sid: string) => {
                    sessions.set(sid, transport);
                },
            });
            transport.onclose = () => {
                sessions.delete(newSessionId);
            };
            const server = createServer();
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
            return;
        }

        const transport = sessions.get(sessionId);
        if (!transport) {
            res.status(404).json({
                jsonrpc: "2.0",
                error: {
                    code:    -32001,
                    message: `Session not found: ${sessionId}. Start a new session by sending an initialize request without Mcp-Session-Id.`,
                },
                id: req.body?.id ?? null,
            });
            return;
        }
        await transport.handleRequest(req, res, req.body);
    });

    app.delete("/mcp", async (req: Request, res: Response) => {
        const sessionId = req.headers["mcp-session-id"] as string | undefined;
        if (sessionId && sessions.has(sessionId)) {
            const transport = sessions.get(sessionId)!;
            await transport.close();
            sessions.delete(sessionId);
            res.status(200).json({ message: "Session terminated" });
        } else {
            res.status(404).json({ message: "Session not found" });
        }
    });

    const port = parseInt(process.env.PORT ?? "3000", 10);
    app.listen(port, () => {
        process.stderr.write(`Smartsheet MCP Server (HTTP) running on http://localhost:${port}/mcp\n`);
    });
}

// ── Transport: stdio ──────────────────────────────────────────────────────────
async function runStdio(): Promise<void> {
    const server    = createServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);
    process.stderr.write("Smartsheet MCP Server (stdio) running\n");
}

// ── Entry Point ───────────────────────────────────────────────────────────────
const transport = process.env.TRANSPORT ?? "stdio";
if (transport === "http") {
    runHTTP().catch(err => {
        process.stderr.write(`Fatal: ${err}\n`);
        process.exit(1);
    });
} else {
    runStdio().catch(err => {
        process.stderr.write(`Fatal: ${err}\n`);
        process.exit(1);
    });
}
