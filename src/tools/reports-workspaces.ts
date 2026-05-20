import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  smartsheetGet,
  handleApiError,
  truncateIfNeeded,
} from "../services/smartsheet.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type {
  SmartsheetReport,
  SmartsheetWorkspace,
  SmartsheetFolder,
  SmartsheetPaginatedResponse,
} from "../types.js";

export function registerReportWorkspaceTools(server: McpServer): void {
  // ── get_report ────────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_get_report",
    {
      title: "Get Report Data",
      description: `Retrieve data from a Smartsheet report by ID.
Reports aggregate rows from multiple sheets. Returns columns, rows, and cell values
just like a sheet, but the rows may originate from different source sheets.
Supports pagination since reports can have very large row counts.

Args:
  - report_id (number): The numeric Smartsheet report ID
  - page_size (number, optional): Rows per page (default 100, max 500)
  - page (number, optional): Page number (default 1)
  - level (number, optional): Hierarchy level (0 = all, 1 = summary only)

Returns: Report metadata, columns, and rows with source sheet context.`,
      inputSchema: z.object({
        report_id: z.number().int().positive().describe("Smartsheet report ID"),
        page_size: z.number().int().min(1).max(500).default(100),
        page: z.number().int().min(1).default(1),
        level: z
          .number()
          .int()
          .min(0)
          .max(2)
          .optional()
          .describe("Hierarchy depth (0=all rows, 1=summary rows only)"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = {
          pageSize: params.page_size,
          page: params.page,
        };
        if (params.level !== undefined) queryParams.level = params.level;

        const report = await smartsheetGet<SmartsheetReport>(
          `/reports/${params.report_id}`,
          queryParams
        );

        const output = {
          id: report.id,
          name: report.name,
          accessLevel: report.accessLevel,
          permalink: report.permalink,
          totalRowCount: report.totalRowCount,
          modifiedAt: report.modifiedAt,
          columnCount: report.columns?.length ?? 0,
          rowCount: report.rows?.length ?? 0,
          columns: report.columns?.map((c) => ({
            id: c.id,
            title: c.title,
            type: c.type,
            index: c.index,
          })),
          rows: report.rows?.map((r) => ({
            id: r.id,
            rowNumber: r.rowNumber,
            parentId: r.parentId,
            modifiedAt: r.modifiedAt,
            cells: r.cells.map((cell) => ({
              columnId: cell.columnId,
              value: cell.value,
              displayValue: cell.displayValue,
            })),
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
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── list_reports ──────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_list_reports",
    {
      title: "List All Reports",
      description: `List all reports the authenticated user has access to.
Returns report name, ID, permalink, access level, and modification timestamps.

Args:
  - page_size (number, optional): Results per page (default 100, max 100)
  - page (number, optional): Page number (default 1)
  - modified_since (string, optional): ISO 8601 date — only reports modified after this date

Returns: Array of report summaries with IDs.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(100),
        page: z.number().int().min(1).default(1),
        modified_since: z.string().optional(),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = {
          pageSize: params.page_size,
          page: params.page,
        };
        if (params.modified_since)
          queryParams.modifiedSince = params.modified_since;

        const result = await smartsheetGet<
          SmartsheetPaginatedResponse<SmartsheetReport>
        >("/reports", queryParams);

        const output = {
          totalCount: result.totalCount,
          pageNumber: result.pageNumber,
          totalPages: result.totalPages,
          reports: result.data.map((r) => ({
            id: r.id,
            name: r.name,
            accessLevel: r.accessLevel,
            permalink: r.permalink,
            modifiedAt: r.modifiedAt,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── list_workspaces ───────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_list_workspaces",
    {
      title: "List Workspaces",
      description: `List all Smartsheet workspaces the authenticated user has access to.
Returns workspace name, ID, access level, and child resource counts.

Args:
  - page_size (number, optional): Results per page (default 100)
  - page (number, optional): Page number (default 1)

Returns: Array of workspace summaries with IDs.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(100),
        page: z.number().int().min(1).default(1),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await smartsheetGet<
          SmartsheetPaginatedResponse<SmartsheetWorkspace>
        >("/workspaces", {
          pageSize: params.page_size,
          page: params.page,
        });

        const output = {
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          pageNumber: result.pageNumber,
          workspaces: result.data.map((w) => ({
            id: w.id,
            name: w.name,
            accessLevel: w.accessLevel,
            permalink: w.permalink,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── browse_workspace ──────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_browse_workspace",
    {
      title: "Browse Workspace Contents",
      description: `Get the full contents of a workspace: all sheets, reports, folders, and dashboards.
Use this to discover what resources exist in a workspace before accessing them.

Args:
  - workspace_id (number): Smartsheet workspace ID
  - load_all (boolean, optional): If true, include nested folder contents

Returns: Workspace contents tree with IDs for all sheets, reports, folders, dashboards.`,
      inputSchema: z.object({
        workspace_id: z.number().int().positive(),
        load_all: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include nested folder contents"),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = {};
        if (params.load_all) queryParams.loadAll = true;

        const workspace = await smartsheetGet<SmartsheetWorkspace>(
          `/workspaces/${params.workspace_id}`,
          queryParams
        );

        const output = {
          id: workspace.id,
          name: workspace.name,
          accessLevel: workspace.accessLevel,
          sheets: (workspace.sheets ?? []).map((s) => ({
            id: s.id,
            name: s.name,
            permalink: s.permalink,
          })),
          reports: (workspace.reports ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            permalink: r.permalink,
          })),
          dashboards: (workspace.dashboards ?? []).map((d) => ({
            id: d.id,
            name: d.name,
            permalink: d.permalink,
          })),
          folders: (workspace.folders ?? []).map((f) => ({
            id: f.id,
            name: f.name,
            sheetCount: f.sheets?.length ?? 0,
            folderCount: f.folders?.length ?? 0,
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
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── browse_folder ─────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_browse_folder",
    {
      title: "Browse Folder Contents",
      description: `Get the contents of a Smartsheet folder: sheets, reports, sub-folders, and dashboards.

Args:
  - folder_id (number): Smartsheet folder ID
  - load_all (boolean, optional): Include nested sub-folder contents

Returns: Folder contents with IDs for all child resources.`,
      inputSchema: z.object({
        folder_id: z.number().int().positive(),
        load_all: z.boolean().optional().default(false),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = {};
        if (params.load_all) queryParams.loadAll = true;

        const folder = await smartsheetGet<SmartsheetFolder>(
          `/folders/${params.folder_id}`,
          queryParams
        );

        const output = {
          id: folder.id,
          name: folder.name,
          sheets: (folder.sheets ?? []).map((s) => ({
            id: s.id,
            name: s.name,
          })),
          reports: (folder.reports ?? []).map((r) => ({
            id: r.id,
            name: r.name,
          })),
          folders: (folder.folders ?? []).map((f) => ({
            id: f.id,
            name: f.name,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );

  // ── list_dashboards ───────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_list_dashboards",
    {
      title: "List Dashboards",
      description: `List all Smartsheet dashboards (Sights) the authenticated user has access to.

Args:
  - page_size (number, optional): Results per page (default 100)
  - page (number, optional): Page number (default 1)

Returns: Array of dashboard summaries with IDs and metadata.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(100),
        page: z.number().int().min(1).default(1),
      }),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await smartsheetGet<{
          data: { id: number; name: string; accessLevel?: string; permalink?: string; createdAt?: string; modifiedAt?: string }[];
          totalCount: number;
          pageNumber: number;
          totalPages: number;
        }>("/sights", {
          pageSize: params.page_size,
          page: params.page,
        });

        const output = {
          totalCount: result.totalCount,
          totalPages: result.totalPages,
          pageNumber: result.pageNumber,
          dashboards: result.data.map((d) => ({
            id: d.id,
            name: d.name,
            accessLevel: d.accessLevel,
            permalink: d.permalink,
            modifiedAt: d.modifiedAt,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      } catch (error) {
        return { content: [{ type: "text", text: handleApiError(error) }] };
      }
    }
  );
}
