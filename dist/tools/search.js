import { z } from "zod";
import { smartsheetGet, handleApiError, truncateIfNeeded, } from "../services/smartsheet.js";
import { CHARACTER_LIMIT } from "../constants.js";
export function registerSearchTools(server) {
    // ── search ────────────────────────────────────────────────────────────────
    server.registerTool("smartsheet_search", {
        title: "Search Smartsheet",
        description: `Search across all accessible Smartsheet assets (sheets, reports, dashboards, rows, cells, discussions).
Returns matching objects with their type, ID, and parent context.
Use this to find sheets by name, locate rows containing specific text, or discover resources.

Args:
  - query (string): Search text (minimum 2 characters)
  - scope (string[], optional): Limit to specific object types: 
    "cellData", "comments", "folderNames", "reportNames", "sheetNames", "sightNames", "summaryFields", "workspaceNames"
  - include_favorites (boolean, optional): Include favorite resources in results
  - page_size (number, optional): Max results (default 100)

Returns: Matching objects with IDs, types, and parent context.`,
        inputSchema: z.object({
            query: z.string().min(2).max(500).describe("Search text"),
            scope: z
                .array(z.enum([
                "cellData",
                "comments",
                "folderNames",
                "reportNames",
                "sheetNames",
                "sightNames",
                "summaryFields",
                "workspaceNames",
            ]))
                .optional()
                .describe("Limit search to specific object types"),
            page_size: z
                .number()
                .int()
                .min(1)
                .max(100)
                .default(100)
                .describe("Max results"),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true,
        },
    }, async (params) => {
        try {
            const queryParams = {
                query: params.query,
                pageSize: params.page_size,
            };
            if (params.scope?.length)
                queryParams.scopes = params.scope.join(",");
            const result = await smartsheetGet("/search", queryParams);
            const output = {
                totalCount: result.totalCount,
                query: params.query,
                results: result.results.map((r) => ({
                    objectType: r.objectType,
                    objectId: r.objectId,
                    parentObjectType: r.parentObjectType,
                    parentObjectId: r.parentObjectId,
                    parentObjectName: r.parentObjectName,
                    text: r.text,
                })),
            };
            return {
                content: [
                    {
                        type: "text",
                        text: truncateIfNeeded(JSON.stringify(output, null, 2), CHARACTER_LIMIT),
                    },
                ],
                structuredContent: output,
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ── search_sheet ──────────────────────────────────────────────────────────
    server.registerTool("smartsheet_search_sheet", {
        title: "Search Within Sheet",
        description: `Search for text within a specific Smartsheet sheet.
Searches cell values, formulas, comments, and summary fields within one sheet.

Args:
  - sheet_id (number): Sheet ID to search within
  - query (string): Text to search for

Returns: Matching rows and cells within the sheet.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            query: z.string().min(1).max(500),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetGet(`/search/sheets/${params.sheet_id}`, {
                query: params.query,
            });
            const output = {
                sheetId: params.sheet_id,
                totalCount: result.totalCount,
                query: params.query,
                results: result.results.map((r) => ({
                    objectType: r.objectType,
                    objectId: r.objectId,
                    parentObjectType: r.parentObjectType,
                    parentObjectId: r.parentObjectId,
                    text: r.text,
                    contextData: r.contextData,
                })),
            };
            return {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
                structuredContent: output,
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ── get_cell_history ──────────────────────────────────────────────────────
    server.registerTool("smartsheet_get_cell_history", {
        title: "Get Cell History",
        description: `Retrieve the full modification history for a specific cell in a Smartsheet sheet.
Shows all previous values, who changed the value, and when each change occurred.
Useful for audit trails and tracking project status changes over time.

Args:
  - sheet_id (number): Target sheet ID
  - row_id (number): Target row ID
  - column_id (number): Target column ID
  - page_size (number, optional): History entries per page (default 100)
  - page (number, optional): Page number (default 1)

Returns: Chronological list of cell value changes with timestamps and user info.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            row_id: z.number().int().positive(),
            column_id: z.number().int().positive(),
            page_size: z.number().int().min(1).max(100).default(100),
            page: z.number().int().min(1).default(1),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/rows/${params.row_id}/columns/${params.column_id}/history`, { pageSize: params.page_size, page: params.page });
            const output = {
                sheetId: params.sheet_id,
                rowId: params.row_id,
                columnId: params.column_id,
                totalCount: result.totalCount,
                totalPages: result.totalPages,
                history: result.data.map((h) => ({
                    value: h.value,
                    displayValue: h.displayValue,
                    modifiedAt: h.modifiedAt,
                    modifiedBy: h.modifiedBy?.email,
                })),
            };
            return {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
                structuredContent: output,
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ── get_sheet_version ─────────────────────────────────────────────────────
    server.registerTool("smartsheet_get_sheet_version", {
        title: "Get Sheet Version",
        description: `Get the current version number of a sheet without loading all row data.
Use this to efficiently detect whether a sheet has been modified since last read,
without pulling the full sheet payload.

Args:
  - sheet_id (number): Target sheet ID

Returns: Current version number and last modification timestamp.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/version`);
            const output = { sheetId: params.sheet_id, version: result.version };
            return {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
                structuredContent: output,
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
}
