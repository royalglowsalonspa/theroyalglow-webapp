# Verifies the Payload MCP endpoint: auth enforcement, exposed tool surface,
# and a live read. Entirely READ-ONLY — safe to run against any environment.
#
# Usage (from apps/cms, with the dev server running):
#   bunx next dev --webpack -p 3002       # Turbopack is blocked on this machine
#   .\scripts\verify-mcp.ps1 -ApiKey <key>
#
# Expected results:
#   no Authorization header            -> HTTP 401
#   invalid API key                    -> HTTP 401
#   valid key -> tools/list            -> 11 tools, every name starts with "find"
#   valid key -> findService           -> HTTP 200 with a document count
#   valid key -> updateService         -> "Tool updateService not found"
#   valid key -> findUsers             -> "Tool findUsers not found"
param(
  [string]$ApiKey = $env:PAYLOAD_MCP_API_KEY,
  [string]$Url = 'http://127.0.0.1:3002/api/mcp'
)

$base = @{
  'Content-Type' = 'application/json'
  'Accept'       = 'application/json, text/event-stream'
}
$authed = $base + @{ 'Authorization' = "Bearer $ApiKey" }

function Send-Mcp([hashtable]$Headers, [string]$Body) {
  try {
    $res = Invoke-WebRequest -Uri $Url -Method Post -Headers $Headers -Body $Body -UseBasicParsing
    return @{ Status = $res.StatusCode; Content = $res.Content }
  }
  catch {
    return @{ Status = $_.Exception.Response.StatusCode.value__; Content = '' }
  }
}

$init = '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"verify","version":"1.0.0"}}}'

Write-Output '--- auth enforcement ---'
Write-Output "no Authorization header : HTTP $((Send-Mcp $base $init).Status) (expect 401)"
$badKey = $base + @{ 'Authorization' = 'Bearer not-a-real-key' }
Write-Output "invalid API key         : HTTP $((Send-Mcp $badKey $init).Status) (expect 401)"

Write-Output '--- exposed tool surface ---'
$list = Send-Mcp $authed '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
$names = [regex]::Matches($list.Content, '"name":"(\w+)","description"') |
  ForEach-Object { $_.Groups[1].Value } |
  Sort-Object -Unique
Write-Output "tool count              : $($names.Count) (expect 11)"
$writeTools = $names | Where-Object { $_ -notlike 'find*' }
Write-Output "non-find tools          : $(if ($writeTools) { $writeTools -join ', ' } else { 'none (correct)' })"
Write-Output "tools                   : $($names -join ', ')"

Write-Output '--- live read + withheld capabilities ---'
$read = Send-Mcp $authed '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"findService","arguments":{"limit":2}}}'
Write-Output "findService             : HTTP $($read.Status)"
foreach ($tool in 'updateService', 'deleteService', 'createService', 'findUsers') {
  $body = '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"' + $tool + '","arguments":{}}}'
  $res = Send-Mcp $authed $body
  $blocked = $res.Content -match 'not found'
  Write-Output "$($tool.PadRight(23)): $(if ($blocked) { 'blocked (correct)' } else { 'REACHABLE — INVESTIGATE' })"
}
