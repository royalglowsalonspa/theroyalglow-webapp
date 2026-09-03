/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 01-09-2026 & Updated - 01-09-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : scripts/mcp/generate
 * Scope        : Tooling — cross-IDE MCP server config generation
 *
 * Description  : Reads the single canonical MCP server registry
 *                (scripts/mcp/sources.json) and emits the native MCP config
 *                file for every supported tool: Kiro, Claude Code, VS Code,
 *                Cursor, and OpenCode. Each tool has a different file path,
 *                root JSON key, and ${VAR} substitution syntax — this script
 *                is the single place that knows all five shapes so nobody
 *                has to hand-maintain five near-duplicate JSON files.
 *
 * Responsibilities :
 * - Parse scripts/mcp/sources.json (the only file a human should edit)
 * - Translate each server entry into each tool's native schema
 * - Resolve the <WORKSPACE_ROOT> placeholder per tool (absolute path where
 *   no portable variable exists, ${workspaceFolder}/${CLAUDE_PROJECT_DIR}
 *   where one does)
 * - Never write a literal secret — env values are always ${VAR}-style
 *   references to a project-suffixed OS environment variable
 *
 * Features / Functionality :
 * - Outputs: .kiro/settings/mcp.json, .mcp.json, .vscode/mcp.json,
 *   .cursor/mcp.json, opencode.json
 * - Preserves any non-MCP keys already present in opencode.json (that file
 *   is shared with general OpenCode config, unlike the other four which are
 *   MCP-only files)
 * - Drops autoApprove/disabled for tools that don't support a per-server
 *   pre-approval concept in the JSON file itself (Claude Code, Cursor,
 *   VS Code, OpenCode all gate approval through their own UI/CLI instead)
 *
 * Tech Stack   : TypeScript, Bun (global fs — zero deps)
 * Layer        : Tooling script (standalone — no app runtime dependency)
 *
 * Dependencies : node:fs, node:path
 *
 * Notes        :
 * - Run with `bun run mcp:generate` after editing sources.json.
 * - NEVER hand-edit the five generated files — they are overwritten
 *   wholesale (except opencode.json's non-mcp keys) on every run.
 * - See knowledge-base/mcp-setup.md for the full design rationale, the
 *   per-tool substitution syntax table, and setup instructions for a new
 *   collaborator's machine.
 ************************************************************/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const SCRIPT_DIR = import.meta.dirname
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const SOURCES_PATH = join(SCRIPT_DIR, 'sources.json')

type EnvEntry = { key: string; fromEnvVar?: string; literal?: string }
type ServerDef = {
  name: string
  transport: 'local' | 'remote'
  command?: string
  args?: string[]
  url?: string
  env: EnvEntry[]
  autoApprove: string[]
}
type SourcesFile = { servers: ServerDef[] }
type Tool = 'kiro' | 'claude' | 'vscode' | 'cursor' | 'opencode'

const sources: SourcesFile = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'))

// ─── Shared helpers ────────────────────────────────────────────────

/** Per-tool resolution of the <WORKSPACE_ROOT> placeholder used in args. */
function workspacePlaceholderFor(tool: Tool): string {
  switch (tool) {
    case 'claude':
      // Claude Code's own documented portable project-root variable. The
      // ":-." default is required by their docs when used outside a
      // plugin-provided config.
      return '${CLAUDE_PROJECT_DIR:-.}'
    case 'vscode':
    case 'cursor':
      // Both documented to support ${workspaceFolder} natively.
      return '${workspaceFolder}'
    case 'kiro':
    case 'opencode':
      // Neither documented to support a portable workspace variable inside
      // command/args, so fall back to this machine's resolved absolute
      // path. Re-running this generator on another collaborator's clone
      // recomputes the correct path for their machine.
      return REPO_ROOT
  }
}

function resolveArgs(s: ServerDef, tool: Tool): string[] | undefined {
  if (!s.args) return undefined
  const placeholder = workspacePlaceholderFor(tool)
  return s.args.map((a) => a.replaceAll('<WORKSPACE_ROOT>', placeholder))
}

function envNonEmpty(env: EnvEntry[]): boolean {
  return env.length > 0
}

function buildEnvBlock(env: EnvEntry[], varSyntax: (v: string) => string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const e of env) {
    out[e.key] = e.literal ?? varSyntax(e.fromEnvVar as string)
  }
  return out
}

function readJsonIfExists(path: string): Record<string, unknown> {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

function writeJson(path: string, data: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`wrote ${path.replace(REPO_ROOT, '.')}`)
}

// ─── Per-tool builders ─────────────────────────────────────────────

// Kiro: root key "mcpServers", ${VAR} substitution, remote entries are a
// bare "url" with no "type" field, autoApprove/disabled are Kiro-specific
// and meaningful here.
function buildKiro(servers: ServerDef[]) {
  const mcpServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (s.transport === 'local') {
      mcpServers[s.name] = {
        command: s.command,
        args: resolveArgs(s, 'kiro'),
        ...(envNonEmpty(s.env) ? { env: buildEnvBlock(s.env, (v) => `\${${v}}`) } : {}),
        disabled: false,
        autoApprove: s.autoApprove,
      }
    } else {
      mcpServers[s.name] = {
        url: s.url,
        disabled: false,
        autoApprove: s.autoApprove,
      }
    }
  }
  return { mcpServers }
}

// Claude Code: root key "mcpServers", ${VAR} / ${VAR:-default} substitution,
// a remote entry MUST carry an explicit "type" (bare url + no type is a
// configuration error per code.claude.com/docs/en/mcp). No in-file
// autoApprove/disabled — approval is a one-time interactive prompt per
// project-scoped server instead.
function buildClaudeCode(servers: ServerDef[]) {
  const mcpServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (s.transport === 'local') {
      mcpServers[s.name] = {
        command: s.command,
        args: resolveArgs(s, 'claude'),
        ...(envNonEmpty(s.env) ? { env: buildEnvBlock(s.env, (v) => `\${${v}}`) } : {}),
      }
    } else {
      mcpServers[s.name] = { type: 'http', url: s.url }
    }
  }
  return { mcpServers }
}

// VS Code: root key "servers", ${env:VAR} substitution, every entry needs
// an explicit "type" ("stdio" for local, "http" for remote). No in-file
// autoApprove/disabled — tool confirmation is a UI-level setting.
function buildVSCode(servers: ServerDef[]) {
  const vsServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (s.transport === 'local') {
      vsServers[s.name] = {
        type: 'stdio',
        command: s.command,
        args: resolveArgs(s, 'vscode'),
        ...(envNonEmpty(s.env) ? { env: buildEnvBlock(s.env, (v) => `\${env:${v}}`) } : {}),
      }
    } else {
      vsServers[s.name] = { type: 'http', url: s.url }
    }
  }
  return { servers: vsServers }
}

// Cursor: root key "mcpServers", ${env:VAR} substitution (per Cursor forum
// threads — Cursor only expands ${env:VAR}, ${userHome}, ${workspaceFolder},
// ${workspaceFolderBasename}, ${pathSeparator}, NOT bare ${VAR}). Remote
// entries are a bare "url", no "type" field documented as required.
function buildCursor(servers: ServerDef[]) {
  const mcpServers: Record<string, unknown> = {}
  for (const s of servers) {
    if (s.transport === 'local') {
      mcpServers[s.name] = {
        command: s.command,
        args: resolveArgs(s, 'cursor'),
        ...(envNonEmpty(s.env) ? { env: buildEnvBlock(s.env, (v) => `\${env:${v}}`) } : {}),
      }
    } else {
      mcpServers[s.name] = { url: s.url }
    }
  }
  return { mcpServers }
}

// OpenCode: root key "mcp" inside the general opencode.json config file,
// {env:VAR} substitution (no leading $), "command" is ONE array combining
// executable + args (not separate command/args fields), every entry needs
// an explicit "type" ("local"/"remote"). Preserves any other top-level
// config keys already in the file (model, provider, etc.) since this file
// is not MCP-only for this tool.
function buildOpenCode(servers: ServerDef[], existing: Record<string, unknown>) {
  const mcp: Record<string, unknown> = {}
  for (const s of servers) {
    if (s.transport === 'local') {
      mcp[s.name] = {
        type: 'local',
        command: [s.command, ...(resolveArgs(s, 'opencode') ?? [])],
        ...(envNonEmpty(s.env) ? { environment: buildEnvBlock(s.env, (v) => `{env:${v}}`) } : {}),
        enabled: true,
      }
    } else {
      mcp[s.name] = { type: 'remote', url: s.url, enabled: true }
    }
  }
  return {
    ...existing,
    $schema: 'https://opencode.ai/config.json',
    mcp,
  }
}

// ─── Main ───────────────────────────────────────────────────────────

function main(): void {
  const { servers } = sources

  writeJson(join(REPO_ROOT, '.kiro/settings/mcp.json'), buildKiro(servers))
  writeJson(join(REPO_ROOT, '.mcp.json'), buildClaudeCode(servers))
  writeJson(join(REPO_ROOT, '.vscode/mcp.json'), buildVSCode(servers))
  writeJson(join(REPO_ROOT, '.cursor/mcp.json'), buildCursor(servers))

  const openCodePath = join(REPO_ROOT, 'opencode.json')
  const existingOpenCode = readJsonIfExists(openCodePath)
  writeJson(openCodePath, buildOpenCode(servers, existingOpenCode))

  console.log(`\n${servers.length} servers x 5 tools generated.`)
  console.log('Reminder: edit scripts/mcp/sources.json, never the generated files.')
}

main()
