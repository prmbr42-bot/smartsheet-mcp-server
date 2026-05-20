import { z } from "zod";
import { smartsheetGet, smartsheetPost, smartsheetDelete, handleApiError, } from "../services/smartsheet.js";
export function registerDiscussionAttachmentTools(server) {
    // ── list_sheet_discussions ────────────────────────────────────────────────
    server.registerTool("smartsheet_list_sheet_discussions", {
        title: "List Sheet Discussions",
        description: `Retrieve all discussions on a sheet (both sheet-level and row-level discussions).
Returns discussion titles, comment counts, last activity, and comment text.

Args:
  - sheet_id (number): Target sheet ID
  - include_comments (boolean, optional): Include comment text in response (default true)
  - page_size (number, optional): Results per page (default 100)
  - page (number, optional): Page number (default 1)

Returns: Array of discussions with comments.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            include_comments: z.boolean().optional().default(true),
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
            const include = [];
            if (params.include_comments)
                include.push("comments");
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/discussions`, {
                include: include.join(",") || undefined,
                pageSize: params.page_size,
                page: params.page,
            });
            const output = {
                totalCount: result.totalCount,
                discussions: result.data.map((d) => ({
                    id: d.id,
                    title: d.title,
                    commentCount: d.commentCount,
                    lastCommentedAt: d.lastCommentedAt,
                    comments: d.comments?.map((c) => ({
                        id: c.id,
                        text: c.text,
                        createdBy: c.createdBy?.email,
                        createdAt: c.createdAt,
                    })),
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
    // ── list_row_discussions ──────────────────────────────────────────────────
    server.registerTool("smartsheet_list_row_discussions", {
        title: "List Row Discussions",
        description: `Retrieve all discussions attached to a specific row in a sheet.

Args:
  - sheet_id (number): Target sheet ID
  - row_id (number): Target row ID
  - include_comments (boolean, optional): Include comment text (default true)

Returns: Discussions and comments on the specified row.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            row_id: z.number().int().positive(),
            include_comments: z.boolean().optional().default(true),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const include = params.include_comments ? "comments" : undefined;
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/rows/${params.row_id}/discussions`, include ? { include } : {});
            const output = {
                rowId: params.row_id,
                totalCount: result.totalCount,
                discussions: result.data.map((d) => ({
                    id: d.id,
                    title: d.title,
                    commentCount: d.commentCount,
                    lastCommentedAt: d.lastCommentedAt,
                    comments: d.comments?.map((c) => ({
                        id: c.id,
                        text: c.text,
                        createdBy: c.createdBy?.email,
                        createdAt: c.createdAt,
                    })),
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
    // ── create_sheet_discussion ───────────────────────────────────────────────
    server.registerTool("smartsheet_create_sheet_discussion", {
        title: "Create Sheet Discussion",
        description: `Create a new discussion (with initial comment) at the sheet level in Smartsheet.

Args:
  - sheet_id (number): Target sheet ID
  - comment_text (string): Initial comment text for the discussion

Returns: New discussion ID and comment ID.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            comment_text: z
                .string()
                .min(1)
                .max(4000)
                .describe("Text for the initial comment"),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetPost(`/sheets/${params.sheet_id}/discussions`, {
                comment: { text: params.comment_text },
            });
            const output = {
                message: result.message,
                discussionId: result.result?.id,
                firstCommentId: result.result?.comments?.[0]?.id,
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
    // ── create_row_discussion ─────────────────────────────────────────────────
    server.registerTool("smartsheet_create_row_discussion", {
        title: "Create Row Discussion",
        description: `Create a new discussion (with initial comment) on a specific row in a sheet.

Args:
  - sheet_id (number): Target sheet ID
  - row_id (number): Target row ID
  - comment_text (string): Initial comment text

Returns: New discussion ID and comment ID.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            row_id: z.number().int().positive(),
            comment_text: z.string().min(1).max(4000),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetPost(`/sheets/${params.sheet_id}/rows/${params.row_id}/discussions`, { comment: { text: params.comment_text } });
            const output = {
                message: result.message,
                discussionId: result.result?.id,
                firstCommentId: result.result?.comments?.[0]?.id,
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
    // ── add_comment ───────────────────────────────────────────────────────────
    server.registerTool("smartsheet_add_comment", {
        title: "Add Comment to Discussion",
        description: `Add a reply comment to an existing discussion on a sheet.

Args:
  - sheet_id (number): Target sheet ID
  - discussion_id (number): Target discussion ID
  - comment_text (string): Text of the comment to add

Returns: New comment ID and creation timestamp.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            discussion_id: z.number().int().positive(),
            comment_text: z.string().min(1).max(4000),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetPost(`/sheets/${params.sheet_id}/discussions/${params.discussion_id}/comments`, { text: params.comment_text });
            const output = {
                message: result.message,
                commentId: result.result?.id,
                createdAt: result.result?.createdAt,
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
    // ── delete_comment ────────────────────────────────────────────────────────
    server.registerTool("smartsheet_delete_comment", {
        title: "Delete Comment",
        description: `Permanently delete a comment from a discussion on a sheet.
Only the comment author can delete their own comments. This action is IRREVERSIBLE.

Args:
  - sheet_id (number): Sheet ID containing the comment
  - comment_id (number): Comment ID to delete

Returns: Deletion confirmation.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            comment_id: z.number().int().positive(),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetDelete(`/sheets/${params.sheet_id}/comments/${params.comment_id}`);
            const output = { message: result.message, commentId: params.comment_id };
            return {
                content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
                structuredContent: output,
            };
        }
        catch (error) {
            return { content: [{ type: "text", text: handleApiError(error) }] };
        }
    });
    // ── list_attachments ──────────────────────────────────────────────────────
    server.registerTool("smartsheet_list_attachments", {
        title: "List Sheet Attachments",
        description: `List all attachments on a Smartsheet sheet (both sheet-level and row-level).
Returns attachment name, type, size, and temporary download URL.

Args:
  - sheet_id (number): Target sheet ID
  - page_size (number, optional): Results per page (default 100)
  - page (number, optional): Page number (default 1)

Returns: Array of attachment metadata with download URLs (URLs expire after a short period).`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
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
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/attachments`, {
                pageSize: params.page_size,
                page: params.page,
            });
            const output = {
                totalCount: result.totalCount,
                attachments: result.data.map((a) => ({
                    id: a.id,
                    name: a.name,
                    attachmentType: a.attachmentType,
                    mimeType: a.mimeType,
                    sizeInKb: a.sizeInKb,
                    parentType: a.parentType,
                    parentId: a.parentId,
                    createdAt: a.createdAt,
                    createdBy: a.createdBy?.email,
                    url: a.url,
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
    // ── list_row_attachments ──────────────────────────────────────────────────
    server.registerTool("smartsheet_list_row_attachments", {
        title: "List Row Attachments",
        description: `List all attachments on a specific row in a Smartsheet sheet.

Args:
  - sheet_id (number): Target sheet ID
  - row_id (number): Target row ID

Returns: Array of attachment metadata for the row.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            row_id: z.number().int().positive(),
        }),
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetGet(`/sheets/${params.sheet_id}/rows/${params.row_id}/attachments`);
            const output = {
                rowId: params.row_id,
                totalCount: result.totalCount,
                attachments: result.data.map((a) => ({
                    id: a.id,
                    name: a.name,
                    attachmentType: a.attachmentType,
                    mimeType: a.mimeType,
                    sizeInKb: a.sizeInKb,
                    url: a.url,
                    createdAt: a.createdAt,
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
    // ── attach_url_to_row ─────────────────────────────────────────────────────
    server.registerTool("smartsheet_attach_url_to_row", {
        title: "Attach URL to Row",
        description: `Attach a URL link to a specific row in a Smartsheet sheet.
Creates a hyperlink attachment that appears in the row's attachment panel.

Args:
  - sheet_id (number): Target sheet ID
  - row_id (number): Target row ID
  - url (string): URL to attach
  - name (string): Display name for the attachment
  - description (string, optional): Description text

Returns: New attachment ID and metadata.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            row_id: z.number().int().positive(),
            url: z.string().url().describe("URL to attach"),
            name: z.string().min(1).max(255).describe("Display name"),
            description: z.string().max(1000).optional(),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetPost(`/sheets/${params.sheet_id}/rows/${params.row_id}/attachments`, {
                name: params.name,
                description: params.description,
                attachmentType: "LINK",
                url: params.url,
            });
            const output = {
                message: result.message,
                attachmentId: result.result?.id,
                name: result.result?.name,
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
    // ── delete_attachment ─────────────────────────────────────────────────────
    server.registerTool("smartsheet_delete_attachment", {
        title: "Delete Attachment",
        description: `Permanently delete an attachment from a Smartsheet sheet.
This action is IRREVERSIBLE. Verify the attachment ID before proceeding.

Args:
  - sheet_id (number): Sheet ID containing the attachment
  - attachment_id (number): Attachment ID to delete

Returns: Deletion confirmation.`,
        inputSchema: z.object({
            sheet_id: z.number().int().positive(),
            attachment_id: z.number().int().positive(),
        }),
        annotations: {
            readOnlyHint: false,
            destructiveHint: true,
            idempotentHint: false,
            openWorldHint: false,
        },
    }, async (params) => {
        try {
            const result = await smartsheetDelete(`/sheets/${params.sheet_id}/attachments/${params.attachment_id}`);
            const output = {
                message: result.message,
                attachmentId: params.attachment_id,
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
}
