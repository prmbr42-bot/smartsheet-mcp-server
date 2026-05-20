import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  smartsheetGet,
  smartsheetPost,
  smartsheetPut,
  smartsheetDelete,
  handleApiError,
  truncateIfNeeded,
} from "../services/smartsheet.js";
import { CHARACTER_LIMIT } from "../constants.js";
import type {
  SmartsheetSheet,
  SmartsheetPaginatedResponse,
  SmartsheetRow,
  SmartsheetColumn,
  BulkOperationResult,
} from "../types.js";

export function registerSheetTools(server: McpServer): void {
  // ── get_sheet_summary ────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_get_sheet",
    {
      title: "Get Sheet Data",
      description: `Retrieve sheet data from Smartsheet including columns, rows, and cell values.
Supports optional filtering by column IDs, row IDs, and pagination via rowsModifiedSince.
Use this to read project data, task lists, resource grids, or any tabular data stored in a sheet.

Args:
  - sheet_id (number): The numeric Smartsheet sheet ID
  - column_ids (number[], optional): Limit response to specific column IDs
  - row_ids (number[], optional): Limit response to specific row IDs
  - rows_modified_since (string, optional): ISO 8601 date; return only rows modified after this date
  - page_size (number, optional): Rows per page (default 100, max 500)
  - page (number, optional): Page number (default 1)
  - include_filters (boolean, optional): Include filter definitions in response

Returns: Sheet metadata, columns array, and rows array with cell values.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive().describe("Smartsheet sheet ID"),
        column_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe("Filter to specific column IDs"),
        row_ids: z
          .array(z.number().int().positive())
          .optional()
          .describe("Filter to specific row IDs"),
        rows_modified_since: z
          .string()
          .optional()
          .describe("ISO 8601 datetime — only return rows modified after this"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(500)
          .default(100)
          .describe("Rows per page (default 100, max 500)"),
        page: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Page number (default 1)"),
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
        if (params.column_ids?.length)
          queryParams.columnIds = params.column_ids.join(",");
        if (params.row_ids?.length)
          queryParams.rowIds = params.row_ids.join(",");
        if (params.rows_modified_since)
          queryParams.rowsModifiedSince = params.rows_modified_since;

        const sheet = await smartsheetGet<SmartsheetSheet>(
          `/sheets/${params.sheet_id}`,
          queryParams
        );

        const output = {
          id: sheet.id,
          name: sheet.name,
          permalink: sheet.permalink,
          totalRowCount: sheet.totalRowCount,
          accessLevel: sheet.accessLevel,
          modifiedAt: sheet.modifiedAt,
          columnCount: sheet.columns?.length ?? 0,
          rowCount: sheet.rows?.length ?? 0,
          columns: sheet.columns?.map((c) => ({
            id: c.id,
            title: c.title,
            type: c.type,
            index: c.index,
            primary: c.primary,
          })),
          rows: sheet.rows?.map((r) => ({
            id: r.id,
            rowNumber: r.rowNumber,
            parentId: r.parentId,
            expanded: r.expanded,
            modifiedAt: r.modifiedAt,
            cells: r.cells.map((cell) => ({
              columnId: cell.columnId,
              value: cell.value,
              displayValue: cell.displayValue,
              formula: cell.formula,
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

  // ── list_sheets ──────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_list_sheets",
    {
      title: "List All Sheets",
      description: `List all sheets the authenticated user has access to, with pagination support.
Returns sheet name, ID, permalink, access level, and modification timestamps.
Use this to discover available sheets before reading data from a specific one.

Args:
  - page_size (number, optional): Results per page (default 100, max 100)
  - page (number, optional): Page number (default 1)
  - modified_since (string, optional): ISO 8601 date filter

Returns: Array of sheet summaries with IDs and metadata.`,
      inputSchema: z.object({
        page_size: z.number().int().min(1).max(100).default(100),
        page: z.number().int().min(1).default(1),
        modified_since: z.string().optional().describe("ISO 8601 date filter"),
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

        const result = await smartsheetGet<SmartsheetPaginatedResponse<SmartsheetSheet>>(
          "/sheets",
          queryParams
        );

        const output = {
          totalCount: result.totalCount,
          pageNumber: result.pageNumber,
          totalPages: result.totalPages,
          sheets: result.data.map((s) => ({
            id: s.id,
            name: s.name,
            accessLevel: s.accessLevel,
            permalink: s.permalink,
            modifiedAt: s.modifiedAt,
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

  // ── add_rows ─────────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_add_rows",
    {
      title: "Add Rows to Sheet",
      description: `Add one or more rows to a Smartsheet sheet.
Each row specifies cells as columnId/value pairs. Rows can be positioned at top, bottom, 
or relative to a parent/sibling row for hierarchical (indent) structures.

Args:
  - sheet_id (number): Target sheet ID
  - rows (array): Array of row objects, each containing:
    - cells (array): Array of {columnId, value} objects
    - to_top (boolean, optional): Insert at top of sheet
    - to_bottom (boolean, optional): Insert at bottom (default)
    - parent_id (number, optional): Make this a child of this row ID
    - sibling_id (number, optional): Insert as sibling below this row ID
    - expanded (boolean, optional): Whether row is expanded (default true)

Returns: Newly created row IDs and updated sheet version.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive().describe("Target sheet ID"),
        rows: z
          .array(
            z.object({
              cells: z.array(
                z.object({
                  column_id: z
                    .number()
                    .int()
                    .positive()
                    .describe("Column ID to set value on"),
                  value: z
                    .union([z.string(), z.number(), z.boolean(), z.null()])
                    .describe("Cell value"),
                  formula: z
                    .string()
                    .optional()
                    .describe("Formula string (e.g. '=SUM([Col1]1:[Col1]5)')"),
                })
              ),
              to_top: z.boolean().optional(),
              to_bottom: z.boolean().optional(),
              parent_id: z.number().int().positive().optional(),
              sibling_id: z.number().int().positive().optional(),
              expanded: z.boolean().optional().default(true),
            })
          )
          .min(1)
          .describe("Rows to add"),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const payload = params.rows.map((r) => ({
          cells: r.cells.map((c) => ({
            columnId: c.column_id,
            value: c.value,
            ...(c.formula ? { formula: c.formula } : {}),
          })),
          ...(r.to_top !== undefined ? { toTop: r.to_top } : {}),
          ...(r.to_bottom !== undefined ? { toBottom: r.to_bottom } : {}),
          ...(r.parent_id ? { parentId: r.parent_id } : {}),
          ...(r.sibling_id ? { siblingId: r.sibling_id } : {}),
          expanded: r.expanded ?? true,
        }));

        const result = await smartsheetPost<BulkOperationResult>(
          `/sheets/${params.sheet_id}/rows`,
          payload
        );

        const newRows = Array.isArray(result.result) ? result.result : [];
        const output = {
          message: result.message,
          version: result.version,
          addedRowCount: newRows.length,
          rowIds: newRows.map((r: SmartsheetRow) => r.id),
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

  // ── update_rows ───────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_update_rows",
    {
      title: "Update Rows in Sheet",
      description: `Update one or more existing rows in a Smartsheet sheet.
Each row update specifies the row ID and cells to change. Only provided cells are updated;
unspecified cells are left unchanged. Can also lock/unlock rows or change hierarchy.

Args:
  - sheet_id (number): Target sheet ID
  - rows (array): Array of row update objects, each containing:
    - row_id (number): ID of the row to update
    - cells (array): Array of {column_id, value} cells to update
    - locked (boolean, optional): Lock or unlock the row
    - expanded (boolean, optional): Expand or collapse row

Returns: Updated row data and new sheet version.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive().describe("Target sheet ID"),
        rows: z
          .array(
            z.object({
              row_id: z.number().int().positive().describe("Row ID to update"),
              cells: z
                .array(
                  z.object({
                    column_id: z.number().int().positive(),
                    value: z.union([
                      z.string(),
                      z.number(),
                      z.boolean(),
                      z.null(),
                    ]),
                    formula: z.string().optional(),
                  })
                )
                .optional(),
              locked: z.boolean().optional(),
              expanded: z.boolean().optional(),
            })
          )
          .min(1),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const payload = params.rows.map((r) => ({
          id: r.row_id,
          ...(r.cells
            ? {
                cells: r.cells.map((c) => ({
                  columnId: c.column_id,
                  value: c.value,
                  ...(c.formula ? { formula: c.formula } : {}),
                })),
              }
            : {}),
          ...(r.locked !== undefined ? { locked: r.locked } : {}),
          ...(r.expanded !== undefined ? { expanded: r.expanded } : {}),
        }));

        const result = await smartsheetPut<BulkOperationResult>(
          `/sheets/${params.sheet_id}/rows`,
          payload
        );

        const updatedRows = Array.isArray(result.result) ? result.result : [];
        const output = {
          message: result.message,
          version: result.version,
          updatedRowCount: updatedRows.length,
          rowIds: updatedRows.map((r: SmartsheetRow) => r.id),
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

  // ── delete_rows ───────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_delete_rows",
    {
      title: "Delete Rows from Sheet",
      description: `Permanently delete one or more rows from a Smartsheet sheet.
This operation is IRREVERSIBLE. Deleted rows and their cell data are permanently removed.
Confirm row IDs before calling. Child rows are also deleted when parent rows are removed.

Args:
  - sheet_id (number): Target sheet ID
  - row_ids (number[]): Array of row IDs to delete (max 450 per request)
  - ignore_rows_not_found (boolean, optional): If true, silently skip non-existent row IDs

Returns: Confirmation message and updated sheet version.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive(),
        row_ids: z.array(z.number().int().positive()).min(1).max(450),
        ignore_rows_not_found: z.boolean().optional().default(false),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const queryParams: Record<string, unknown> = {
          rowIds: params.row_ids.join(","),
          ignoreRowsNotFound: params.ignore_rows_not_found,
        };

        const result = await smartsheetDelete<BulkOperationResult>(
          `/sheets/${params.sheet_id}/rows?rowIds=${params.row_ids.join(",")}&ignoreRowsNotFound=${params.ignore_rows_not_found}`
        );

        const output = {
          message: result.message,
          version: result.version,
          deletedRowIds: params.row_ids,
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

  // ── get_columns ───────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_get_columns",
    {
      title: "Get Sheet Columns",
      description: `Retrieve all column definitions for a Smartsheet sheet.
Returns column IDs, titles, types (TEXT_NUMBER, DATE, PICKLIST, CHECKBOX, CONTACT_LIST, etc.),
options for dropdown columns, and whether each column is primary.
Use this to get column IDs needed before adding or updating rows.

Args:
  - sheet_id (number): Target sheet ID

Returns: Array of column definitions with IDs, types, and options.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive(),
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
          data: SmartsheetColumn[];
          pageNumber: number;
          totalCount: number;
        }>(`/sheets/${params.sheet_id}/columns`, { includeAll: true });

        const output = {
          totalCount: result.totalCount,
          columns: result.data.map((c) => ({
            id: c.id,
            index: c.index,
            title: c.title,
            type: c.type,
            primary: c.primary,
            options: c.options,
            width: c.width,
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

  // ── add_columns ───────────────────────────────────────────────────────────
  server.registerTool(
    "smartsheet_add_columns",
    {
      title: "Add Columns to Sheet",
      description: `Add one or more new columns to a Smartsheet sheet.
Supported column types: TEXT_NUMBER, DATE, DATETIME, PICKLIST, CHECKBOX, CONTACT_LIST,
DURATION, PREDECESSOR, AUTO_NUMBER, ABSTRACT_DATETIME.
Picklist/dropdown columns require an 'options' array.

Args:
  - sheet_id (number): Target sheet ID
  - columns (array): Column definitions, each with:
    - title (string): Column header text
    - type (string): Column type (TEXT_NUMBER, DATE, PICKLIST, CHECKBOX, CONTACT_LIST, etc.)
    - index (number, optional): 0-based position; appends if omitted
    - options (string[], optional): Dropdown options for PICKLIST columns
    - width (number, optional): Column width in pixels

Returns: Created column definitions with assigned IDs.`,
      inputSchema: z.object({
        sheet_id: z.number().int().positive(),
        columns: z
          .array(
            z.object({
              title: z.string().min(1).max(50),
              type: z
                .enum([
                  "TEXT_NUMBER",
                  "DATE",
                  "DATETIME",
                  "PICKLIST",
                  "CHECKBOX",
                  "CONTACT_LIST",
                  "DURATION",
                  "PREDECESSOR",
                  "AUTO_NUMBER",
                  "ABSTRACT_DATETIME",
                ])
                .describe("Column type"),
              index: z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("0-based insert position"),
              options: z
                .array(z.string())
                .optional()
                .describe("Dropdown options for PICKLIST columns"),
              width: z
                .number()
                .int()
                .min(20)
                .optional()
                .describe("Column width in pixels"),
            })
          )
          .min(1),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const payload = params.columns.map((c) => ({
          title: c.title,
          type: c.type,
          ...(c.index !== undefined ? { index: c.index } : {}),
          ...(c.options ? { options: c.options } : {}),
          ...(c.width ? { width: c.width } : {}),
        }));

        const result = await smartsheetPost<{ result: SmartsheetColumn[] }>(
          `/sheets/${params.sheet_id}/columns`,
          payload
        );

        const output = {
          addedColumnCount: result.result?.length ?? 0,
          columns: result.result?.map((c) => ({
            id: c.id,
            title: c.title,
            type: c.type,
            index: c.index,
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
