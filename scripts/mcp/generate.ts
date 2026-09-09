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
 *                file for every supported tool: Kiro, Claude Code, Codex,
 *                VS Code, Cursor, and OpenCode. Each tool has a different file path,
 *                root JSON key, and ${VAR} substitution syntax — this script
 *                is the single place that knows all six shapes so nobody
 *                has to hand-maintain six near-duplicate configuration files.
 *
 * Responsibilities :
 * - Parse scripts/mcp/sources.json (the only file a human should edit)
 * - Translate each server entry into each tool's native schema
 * - Resolve the <WORKSPACE_ROOT> placeholder per tool
 *   (${workspaceFolder}/${CLAUDE_PROJECT_DIR} where one exists, absolute
 *   path for Kiro, portable relative "." + cwd for Codex/OpenCode)
 * - Never write a literal secret — env values are always ${VAR}-style
 *   references to a project-suffixed OS environment variable
 *
 * Features / Functionality :
 * - Outputs: .kiro/settings/mcp.json, .mcp.json, .codex/config.toml, .vscode/mcp.json,
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
 * - NEVER hand-edit the six generated files — they are overwritten
 *   wholesale (except opencode.json's non-mcp keys) on every run.
 * - See knowledge-base/mcp-setup.md for the full design rationale, the
 *   per-tool substitution syntax table, and setup instructions for a new
 *   collaborator's machine.
 ************************************************************/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const SCRIPT_DIR = import.meta.dirname
const REPO_ROOT = join(SCRIPT_DIR, '..', '..')
const SOURCES_PATH = join(SCRIPT_DIR, 'sources.json')

type EnvEntry = { key: string; fromEnvVar?: string; literal?: string; header?: string }
type ServerDef = {
  name: string
  transport: 'local' | 'remote'
  openCodeTransport?: 'local' | 'remote'
  command?: string
  args?: string[]
  url?: string
  env: EnvEntry[]
  autoApprove: string[]
}
export type SourcesFile = { servers: ServerDef[] }
type Tool = 'kiro' | 'claude' | 'codex' | 'vscode' | 'cursor' | 'opencode'

// ─── Shared helpers ────────────────────────────────────────────────

/** Per-tool resolution of the <WORKSPACE_ROOT> placeholder used in args. */
function workspacePlaceholderFor(tool: Tool): string {
  switch (tool) {
    case 'claude':
      // Claude Code's own documented portable project-root variable. The
      // ":-." default is required by their docs when used outside a
      // plugin-provided config.
      return `\${CLAUDE_PROJECT_DIR:-.}`
    case 'codex':
      return '.'
    case 'vscode':
    case 'cursor':
      // Both documented to support ${workspaceFolder} natively.
      return `\${workspaceFolder}`
    case 'kiro':
      // Kiro documents no portable workspace variable inside
      // command/args, so fall back to this machine's resolved absolute
      // path. Re-running this generator on another collaborator's clone
      // recomputes the correct path for their machine.
      return REPO_ROOT
    case 'opencode':
      // OpenCode supports a portable `cwd` on local MCP servers (relative
      // paths resolve from the workspace directory), so the --repo arg can
      // stay relative (".") and the committed opencode.json carries no
      // machine-specific absolute path. See buildOpenCode below.
      return '.'
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

function tomlString(value: string): string {
  return JSON.stringify(value)
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
        // Claude expands arguments before the child process receives its env map.
        args: resolveArgs(s, 'claude')?.map((arg) => {
          let out = arg
          for (const entry of s.env) {
            if (entry.fromEnvVar) {
              out = out.replaceAll(`\${${entry.key}}`, `\${${entry.fromEnvVar}}`)
            }
          }
          return out
        }),
        ...(envNonEmpty(s.env) ? { env: buildEnvBlock(s.env, (v) => `\${${v}}`) } : {}),
      }
    } else {
      mcpServers[s.name] = { type: 'http', url: s.url }
    }
  }
  return { mcpServers }
}

function buildCodex(servers: ServerDef[]): string {
  const lines: string[] = []
  for (const s of servers) {
    lines.push(`[mcp_servers.${tomlString(s.name)}]`)
    if (s.transport === 'remote') {
      lines.push(`url = ${tomlString(s.url as string)}`)
      const bearer = s.env.find((e) => e.header === 'Authorization' && e.fromEnvVar)
      if (bearer?.fromEnvVar) lines.push(`bearer_token_env_var = ${tomlString(bearer.fromEnvVar)}`)
    } else {
      lines.push(`command = ${tomlString(s.command as string)}`)
      if (s.name === 'code-review-graph') lines.push('cwd = "."')
      lines.push('args = [')
      const args = (resolveArgs(s, 'codex') ?? []).map((arg) => {
        let out = arg
        for (const e of s.env) {
          if (e.fromEnvVar) out = out.replaceAll(`\${${e.key}}`, `\${${e.fromEnvVar}}`)
        }
        return out
      })
      for (const arg of args) lines.push(`    ${tomlString(arg)},`)
      lines.push(']')
      const inherited = [...new Set(s.env.flatMap((e) => (e.fromEnvVar ? [e.fromEnvVar] : [])))]
      if (inherited.length > 0) {
        lines.push(`env_vars = [${inherited.map(tomlString).join(', ')}]`)
      }
      const literals = s.env.filter((e) => e.literal !== undefined)
      if (literals.length > 0) {
        lines.push('')
        lines.push(`[mcp_servers.${tomlString(s.name)}.env]`)
        for (const e of literals) {
          lines.push(`${e.key} = ${tomlString(e.literal as string)}`)
        }
      }
    }
    lines.push('')
  }
  return lines.join('\n')
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
//
// Two OpenCode-specific translations happen here and nowhere else:
// 1. Shell-style "${KEY}" inside args (e.g. "--header",
//    "Authorization:Bearer ${GITHUB_PAT}") is rewritten to OpenCode-native
//    "{env:FROM}" where FROM is that server's fromEnvVar (the _RGSS-suffixed
//    OS variable). It must be the OS variable: OpenCode interpolates command
//    args from the parent process env, which has GITHUB_PAT_RGSS but not
//    GITHUB_PAT, so referencing the child key expands to an empty string
//    (seen as "Bearer " with nothing after it in `opencode mcp list`).
//    The `environment` block separately maps KEY <- {env:FROM} so the
//    spawned process also carries KEY.
// 2. code-review-graph gets a portable relative "--repo" (".") plus
//    "cwd": "." (resolves from the workspace directory) instead of a
//    machine-specific absolute path, so the committed file works on any
//    clone.
function toOpenCodeArg(a: string, s: ServerDef): string {
  let out = a
  for (const e of s.env) {
    if (e.fromEnvVar) out = out.replaceAll(`\${${e.key}}`, `{env:${e.fromEnvVar}}`)
  }
  return out
}

function buildOpenCode(servers: ServerDef[], existing: Record<string, unknown>) {
  const mcp: Record<string, unknown> = {}
  for (const s of servers) {
    // A server may override its transport for OpenCode only
    // (openCodeTransport). Used where OpenCode's native remote + headers
    // works but the shared local wrapper does not — e.g. github, where
    // mcp-remote hijacks the session into an uncompletable OAuth flow
    // while a direct Bearer POST succeeds.
    const transport = s.openCodeTransport ?? s.transport
    if (transport === 'local') {
      const args = (resolveArgs(s, 'opencode') ?? []).map((a) => toOpenCodeArg(a, s))
      mcp[s.name] = {
        type: 'local',
        command: [s.command, ...args],
        // Portable workspace root: run from the project directory and
        // reference the repo relatively. Only code-review-graph needs it
        // (it is the sole server using <WORKSPACE_ROOT>).
        ...(s.name === 'code-review-graph' ? { cwd: '.' } : {}),
        ...(envNonEmpty(s.env) ? { environment: buildEnvBlock(s.env, (v) => `{env:${v}}`) } : {}),
        // Cold node/npx handshakes on Windows measure ~18-19s; the default
        // 30s budget trips under concurrent startup of all servers.
        timeout: 60000,
        enabled: true,
      }
    } else {
      // Remote servers carrying env entries with a `header` field (currently
      // only neon) are emitted with an OpenCode-native `headers` block:
      // "<Header>: Bearer {env:FROM}". The other four tools' remote schemas
      // carry no headers, so they get a bare url and authenticate via their
      // own OAuth UI instead.
      const headers: Record<string, string> = {}
      for (const e of s.env) {
        if (e.header) headers[e.header] = `Bearer {env:${e.fromEnvVar ?? e.key}}`
      }
      const hasHeaders = Object.keys(headers).length > 0
      mcp[s.name] = {
        type: 'remote',
        url: s.url,
        ...(hasHeaders ? { headers } : {}),
        // NOTE: no "oauth": false here on purpose. Static Bearer headers
        // alone do not connect these endpoints from OpenCode (upstream
        // header-remote issue: the client fails before/without using them),
        // so OAuth must stay enabled and the user completes
        // `opencode mcp auth <name>` once — exactly how mintlify-admin and
        // the mcp-remote-cached servers already connect. The headers stay
        // emitted per the official docs as fallback/documentation.
        enabled: true,
      }
    }
  }
  const prevExperimental =
    existing.experimental && typeof existing.experimental === 'object'
      ? (existing.experimental as Record<string, unknown>)
      : {}
  return {
    ...existing,
    $schema: 'https://opencode.ai/config.json',
    // Same 60s budget globally so connection probing matches per-server.
    experimental: { ...prevExperimental, mcp_timeout: 60000 },
    mcp,
  }
}

// ─── Main ───────────────────────────────────────────────────────────

export function renderMcpConfigs(
  servers: ServerDef[],
  existingOpenCode: Record<string, unknown> = {},
): Record<string, string> {
  const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  return {
    '.kiro/settings/mcp.json': json(buildKiro(servers)),
    '.mcp.json': json(buildClaudeCode(servers)),
    '.codex/config.toml': buildCodex(servers),
    '.vscode/mcp.json': json(buildVSCode(servers)),
    '.cursor/mcp.json': json(buildCursor(servers)),
    'opencode.json': json(buildOpenCode(servers, existingOpenCode)),
  }
}

export function generatedConfigMatches(file: string, actual: string, expected: string): boolean {
  const parse = file.endsWith('.toml') ? Bun.TOML.parse : JSON.parse
  return isDeepStrictEqual(parse(actual), parse(expected))
}

function main(): void {
  const { servers }: SourcesFile = JSON.parse(readFileSync(SOURCES_PATH, 'utf8'))
  const existingOpenCode = readJsonIfExists(join(REPO_ROOT, 'opencode.json'))
  for (const [file, content] of Object.entries(renderMcpConfigs(servers, existingOpenCode))) {
    const path = join(REPO_ROOT, file)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content, 'utf8')
    console.log(`wrote ${file}`)
  }

  console.log(`\n${servers.length} servers x 6 tools generated.`)
  console.log('Reminder: edit scripts/mcp/sources.json, never the generated files.')
}

if (import.meta.main) main()
