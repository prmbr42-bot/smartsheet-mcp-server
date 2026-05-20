# Smartsheet MCP Server

A production-ready **Model Context Protocol (MCP) server** that gives AI agents full read/write access to Smartsheet — equivalent to the native Claude MCP, but deployable as a remote HTTP endpoint for **Microsoft 365 Copilot** declarative agents and **Copilot Studio**.

---

## Tools Exposed

| Tool | Description | Read-only |
|------|-------------|-----------|
| `smartsheet_list_sheets` | List all accessible sheets | ✅ |
| `smartsheet_get_sheet` | Read sheet data (columns + rows + cells) with filters & pagination | ✅ |
| `smartsheet_get_columns` | Get column definitions and IDs for a sheet | ✅ |
| `smartsheet_add_rows` | Add rows with cell values and hierarchy placement | ❌ |
| `smartsheet_update_rows` | Update existing row cells, lock/unlock rows | ❌ |
| `smartsheet_delete_rows` | Permanently delete rows | ❌ |
| `smartsheet_add_columns` | Add new columns with type/options | ❌ |
| `smartsheet_get_report` | Read paginated report data | ✅ |
| `smartsheet_list_reports` | List all accessible reports | ✅ |
| `smartsheet_list_workspaces` | List workspaces | ✅ |
| `smartsheet_browse_workspace` | Browse all contents of a workspace | ✅ |
| `smartsheet_browse_folder` | Browse folder contents | ✅ |
| `smartsheet_list_dashboards` | List all dashboards (Sights) | ✅ |
| `smartsheet_list_sheet_discussions` | Get all discussions on a sheet | ✅ |
| `smartsheet_list_row_discussions` | Get discussions on a specific row | ✅ |
| `smartsheet_create_sheet_discussion` | Start a new sheet-level discussion | ❌ |
| `smartsheet_create_row_discussion` | Start a new row-level discussion | ❌ |
| `smartsheet_add_comment` | Reply to an existing discussion | ❌ |
| `smartsheet_delete_comment` | Delete a comment (own comments only) | ❌ |
| `smartsheet_list_attachments` | List all attachments on a sheet | ✅ |
| `smartsheet_list_row_attachments` | List attachments on a row | ✅ |
| `smartsheet_attach_url_to_row` | Attach a URL link to a row | ❌ |
| `smartsheet_delete_attachment` | Permanently delete an attachment | ❌ |
| `smartsheet_search` | Full-text search across all Smartsheet assets | ✅ |
| `smartsheet_search_sheet` | Full-text search within one sheet | ✅ |
| `smartsheet_get_cell_history` | Audit trail — all historic values of a cell | ✅ |
| `smartsheet_get_sheet_version` | Check if a sheet was modified (lightweight) | ✅ |

---

## Prerequisites

- Node.js 18+
- A **Smartsheet API token** — generate one at: *Account → Apps & Integrations → API Access*
- For M365 Copilot deployment: an Azure App Service or Azure Container Apps to host the HTTP server

---

## Local Development (stdio — Claude Desktop or Copilot Studio local)

```bash
npm install
npm run build

# Set your token
export SMARTSHEET_API_TOKEN=your_token_here

# Run in stdio mode (default)
npm start
```

### Claude Desktop config (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "smartsheet": {
      "command": "node",
      "args": ["/absolute/path/to/smartsheet-mcp-server/dist/index.js"],
      "env": {
        "SMARTSHEET_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

---

## Remote HTTP Deployment (for M365 Copilot)

```bash
# Run in HTTP mode
TRANSPORT=http SMARTSHEET_API_TOKEN=your_token_here npm start

# Server listens at http://localhost:3000/mcp
# Health check: GET http://localhost:3000/health
```

### Per-request Token (multi-user / OAuth scenarios)
Each request can pass its own token via header, overriding the server default:
```
X-Smartsheet-Token: user_specific_token
```
This supports SSO scenarios where each M365 user authenticates to Smartsheet with their own credentials.

---

## Deploying to Azure App Service

```bash
# Build the project
npm run build

# Create a zip of the deployable files
zip -r deploy.zip dist/ package.json package-lock.json

# Deploy via Azure CLI
az webapp deploy --resource-group <rg> --name <app-name> --src-path deploy.zip

# Set environment variables in Azure
az webapp config appsettings set \
  --resource-group <rg> \
  --name <app-name> \
  --settings SMARTSHEET_API_TOKEN=your_token TRANSPORT=http
```

Your MCP endpoint will be:
```
https://<app-name>.azurewebsites.net/mcp
```

---

## Wiring into M365 Copilot (Declarative Agent)

### Option A — Copilot Studio (Recommended for EPO/no-code)

1. Open **Copilot Studio** → Create or edit an agent
2. Go to **Actions** → **Add an action** → **Model Context Protocol (MCP)**
3. Enter your server URL: `https://<app-name>.azurewebsites.net/mcp`
4. Select the tools you want the agent to use
5. Configure authentication (API key or OAuth)
6. Publish the agent

> ℹ️ MCP is now **generally available** in Copilot Studio as of mid-2025.

### Option B — VS Code + Microsoft 365 Agents Toolkit (for IT/Dev)

1. Install **Microsoft 365 Agents Toolkit** extension in VS Code
2. **Create a new Declarative Agent** from the toolkit
3. Choose **Add Action → Start with an MCP server**
4. Enter your MCP endpoint URL
5. The toolkit auto-generates the plugin manifest by reading your tool schemas
6. Pick which tools to expose
7. Configure OAuth (Smartsheet supports OAuth 2.0) or API key auth
8. Deploy to your M365 tenant via **Microsoft 365 Admin Center → Copilot → Agents**

### Option C — Direct Manifest (Advanced)

The Agents Toolkit auto-generates `ai-plugin.json` and `openapi.json` from your MCP server's tool list. These files go into the declarative agent's `appPackage/` directory and are uploaded to the Teams App Catalog.

---

## Authentication Options for M365

| Method | When to use |
|--------|-------------|
| **API Key in header** (`X-Smartsheet-Token`) | Single shared service account token; simplest setup |
| **OAuth 2.0 (per user)** | Each user authenticates with their own Smartsheet account; required for per-user audit trails |
| **Managed Identity + Key Vault** | Best practice for production Azure deployments; store token in Key Vault, bind to App Service MSI |

### Smartsheet OAuth App Setup (for per-user auth)
1. Go to [Smartsheet Developer Portal](https://developers.smartsheet.com)
2. Create a new app → Set redirect URI to `https://teams.microsoft.com/api/platform/v1.0/oAuthRedirect`
3. Copy the **Client ID** and **Client Secret**
4. In Agents Toolkit: choose **OAuth (static registration)** and paste these values

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SMARTSHEET_API_TOKEN` | Yes (unless using per-request header) | Smartsheet API Bearer token |
| `TRANSPORT` | No (default: `stdio`) | Set to `http` for remote/Copilot deployments |
| `PORT` | No (default: `3000`) | HTTP listen port |

---

## Known M365 Copilot Limitations

- **Only tools are supported** — MCP resources and prompts are ignored by Copilot
- **Nested object schemas** with `minimum`/`maximum`/`default` on nested properties can fail manifest validation in the Agents Toolkit — strip these if provisioning fails
- **Max 5 tools injected inline** when ≤5 plugins are defined in a declarative agent manifest; above 5, the orchestrator selects dynamically
- **Confirmation prompts**: Read-only tools (annotated `readOnlyHint: true`) don't require user confirmation; write tools do on first call

---

## Project Structure

```
smartsheet-mcp-server/
├── src/
│   ├── index.ts                     # Entry point, transport selection
│   ├── types.ts                     # Smartsheet entity types
│   ├── constants.ts                 # API base URL, limits
│   ├── services/
│   │   └── smartsheet.ts            # API client, auth, error handling
│   └── tools/
│       ├── sheets.ts                # Sheet CRUD, rows, columns
│       ├── reports-workspaces.ts    # Reports, workspaces, folders, dashboards
│       ├── discussions-attachments.ts  # Comments, attachments
│       └── search.ts               # Search, cell history, version check
├── dist/                            # Compiled JS (after npm run build)
├── package.json
├── tsconfig.json
└── README.md
```
