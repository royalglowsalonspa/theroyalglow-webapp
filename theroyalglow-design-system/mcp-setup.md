# MCP Server Setup

Reference material for configuring required MCP servers. This file is subordinate to `agents.md` in the source-of-truth hierarchy. Agents should only load this file when MCP setup is needed (first session, dependency failure, or user request).

---

## Configure shadCN MCP Server

The shadCN MCP server allows agents to browse, search, and install components from shadcn-compatible registries. If the server is not connected, the agent must provide the following setup instructions to the user.

**Source:** `https://ui.shadcn.com/docs/mcp`

**For Kiro**, add the following to `.kiro/settings/mcp.json` (workspace-level) or `~/.kiro/settings/mcp.json` (user-level):

```json
{
  "mcpServers": {
    "shadcn": {
      "command": "npx",
      "args": ["shadcn@latest", "mcp"]
    }
  }
}
```

**Prerequisites:**
- Node.js and npm must be installed (npx is included with npm)
- A valid `components.json` must exist in the project root (run `npx shadcn@latest init` if missing)

**Agent behavior:**
- The agent MUST NOT automatically add MCP server configuration without explicit user approval
- The agent must present the configuration snippet and ask the user to confirm before writing to any MCP config file
- After configuration is added, the user must restart their MCP client or reconnect the server for changes to take effect
