---
inclusion: always
---

## Knowledge Graphs: graphify + code-review-graph

This project uses **two complementary knowledge graph tools** for codebase intelligence:

### code-review-graph (MCP — primary for AI agents)

The MCP server `code-review-graph` provides 30+ tools directly accessible to AI agents. **Use these first** for any codebase exploration, code review, or architecture question. The graph lives in `.code-review-graph/` and auto-updates incrementally.

Key use cases:
- `semantic_search_nodes` — find functions/classes by name or keyword
- `query_graph` — trace callers, callees, imports, tests, dependencies
- `detect_changes` — risk-scored code review analysis
- `get_impact_radius` — blast radius of a change
- `get_architecture_overview` — high-level codebase structure

### graphify (CLI — supplementary)

A knowledge graph of this project also lives in `graphify-out/`. Run Graphify through the root Bun script so Windows, Kiro agents, and terminals do not depend on a globally resolvable launcher:
- `bun run graphify -- query "<question>"` — scoped subgraph query
- `bun run graphify -- path "<A>" "<B>"` — find connection between two concepts
- `bun run graphify -- explain "<concept>"` — explain a concept in context

The script uses `py -m graphify`, bypassing stale Windows `.exe` launchers and PATH inheritance. If the Python package is missing, run `bun run graphify:install` (pinned to `graphifyy==0.8.26`). Bare `graphify ...` is optional and may require restarting Kiro/PowerShell after PATH changes.

Read `GRAPH_REPORT.md` only for broad architecture review or when neither tool surfaces enough context.

### Priority Order

1. **code-review-graph MCP tools** (structural, incremental, token-efficient)
2. **graphify CLI** (when MCP tools don't cover it)
3. **Grep/Glob/Read** (last resort for file-level scanning)
