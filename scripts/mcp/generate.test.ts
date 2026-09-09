import { describe, expect, test } from 'bun:test'
import { generatedConfigMatches, renderMcpConfigs, type SourcesFile } from './generate'

const sources: SourcesFile = {
  servers: [
    {
      name: 'local',
      transport: 'local',
      command: 'mcp-remote',
      args: ['https://example.invalid/mcp'],
      env: [],
      autoApprove: ['read'],
    },
    {
      name: 'remote',
      transport: 'remote',
      url: 'https://example.invalid/remote',
      env: [],
      autoApprove: [],
    },
  ],
}

describe('generated MCP configuration comparison', () => {
  test('Claude credentials resolve with only the documented parent variable set', () => {
    const server = {
      ...sources.servers[0],
      args: ['https://example.invalid/mcp', '--header', `Authorization:Bearer \${TOKEN}`],
      env: [{ key: 'TOKEN', fromEnvVar: 'TOKEN_RGSS' }],
    }
    const config = renderMcpConfigs([server])['.mcp.json']
    const parentEnv: Record<string, string> = { TOKEN_RGSS: 'test-credential' }
    const expanded = config.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, name: string) => {
      if (!(name in parentEnv)) throw new Error(`Missing parent variable: ${name}`)
      return parentEnv[name]
    })
    const parsed = JSON.parse(expanded).mcpServers.local
    expect(parsed.args[2]).toBe('Authorization:Bearer test-credential')
    expect(parsed.env.TOKEN).toBe('test-credential')
  })

  test('accepts JSON formatting and key order changes and TOML comments', () => {
    for (const [file, expected] of Object.entries(renderMcpConfigs(sources.servers))) {
      const actual = file.endsWith('.toml')
        ? `# Local formatting\r\n${expected.replaceAll('\n', '\r\n')}`
        : JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(expected)).reverse()))
      expect(generatedConfigMatches(file, actual, expected)).toBe(true)
    }
  })

  test('detects changed URLs and arguments even with identical server names', () => {
    for (const [file, expected] of Object.entries(renderMcpConfigs(sources.servers))) {
      const actual = expected.replaceAll('example.invalid', 'stale.invalid')
      expect(generatedConfigMatches(file, actual, expected)).toBe(false)
    }
  })

  test('Kiro-only changes leave the five other outputs valid after pull', () => {
    const before = renderMcpConfigs(sources.servers)
    const changed = structuredClone(sources)
    changed.servers[0].autoApprove.push('another-read')
    const after = renderMcpConfigs(changed.servers)
    for (const file of Object.keys(before)) {
      expect(generatedConfigMatches(file, before[file], after[file])).toBe(
        file !== '.kiro/settings/mcp.json',
      )
    }
  })

  test('preserves OpenCode preferences while detecting stale MCP settings', () => {
    const existing = { model: 'example/model', experimental: { custom: true }, mcp: {} }
    const expected = renderMcpConfigs(sources.servers, existing)['opencode.json']
    const parsed = JSON.parse(expected)
    expect(parsed.model).toBe(existing.model)
    expect(parsed.experimental.custom).toBe(true)
    parsed.mcp.local.timeout = 1
    expect(generatedConfigMatches('opencode.json', JSON.stringify(parsed), expected)).toBe(false)
  })

  test('detects extra Codex servers and rejects malformed TOML', () => {
    const expected = renderMcpConfigs(sources.servers)['.codex/config.toml']
    expect(
      generatedConfigMatches(
        '.codex/config.toml',
        `${expected}\n[mcp_servers.extra]\nurl = "https://example.invalid/extra"\n`,
        expected,
      ),
    ).toBe(false)
    expect(() => generatedConfigMatches('.codex/config.toml', '[invalid', expected)).toThrow()
  })
})
