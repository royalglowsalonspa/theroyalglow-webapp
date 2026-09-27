[CmdletBinding()]
param(
  [string]$BeforeTypecheck = 'knowledge-base\benchmarks\typescript-7\before.windows-x64.json',
  [string]$AfterTypecheck = 'knowledge-base\benchmarks\typescript-7\after.windows-x64.json',
  [string]$BeforeBuild = 'knowledge-base\benchmarks\typescript-7\before-build.windows-x64.json',
  [string]$AfterBuild = 'knowledge-base\benchmarks\typescript-7\after-build.windows-x64.json',
  [string]$OutputPath = 'knowledge-base\benchmarks\typescript-7\comparison.windows-x64.json'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Resolve-RepositoryPath {
  param([string]$Path)

  if ([IO.Path]::IsPathRooted($Path)) {
    return $Path
  }
  return Join-Path $repoRoot $Path
}

function Read-BenchmarkReport {
  param([string]$Path)

  $resolvedPath = Resolve-RepositoryPath -Path $Path
  return Get-Content -Path $resolvedPath -Raw | ConvertFrom-Json
}

function Get-Median {
  param([double[]]$Values)

  if ($Values.Count -eq 0) {
    return $null
  }
  $sorted = @($Values | Sort-Object)
  $middle = [math]::Floor($sorted.Count / 2)
  if ($sorted.Count % 2 -eq 1) {
    return [math]::Round($sorted[$middle], 3)
  }
  return [math]::Round(($sorted[$middle - 1] + $sorted[$middle]) / 2, 3)
}

function Get-Change {
  param(
    [double]$Before,
    [double]$After
  )

  return [ordered]@{
    before = [math]::Round($Before, 3)
    after = [math]::Round($After, 3)
    changePercent = if ($Before -ne 0) {
      [math]::Round((($After - $Before) / $Before) * 100, 2)
    } else { $null }
  }
}

function Get-CompilerMemoryMedian {
  param([object]$Scenario)

  $values = @(
    $Scenario.runs |
      ForEach-Object { $_.compilerDiagnostics.memoryMb } |
      Where-Object { $null -ne $_ } |
      ForEach-Object { [double]$_ }
  )
  return Get-Median -Values $values
}

function Compare-ReportPair {
  param(
    [object]$Before,
    [object]$After
  )

  $afterByName = @{}
  foreach ($scenario in $After.scenarios) {
    $afterByName[$scenario.name] = $scenario
  }

  $comparisons = [Collections.Generic.List[object]]::new()
  foreach ($beforeScenario in $Before.scenarios) {
    if (-not $afterByName.ContainsKey($beforeScenario.name)) {
      throw "Missing after scenario: $($beforeScenario.name)"
    }
    $afterScenario = $afterByName[$beforeScenario.name]
    $beforeWall = [double]$beforeScenario.summary.medianWallSeconds
    $afterWall = [double]$afterScenario.summary.medianWallSeconds
    $beforeCompilerMemory = Get-CompilerMemoryMedian -Scenario $beforeScenario
    $afterCompilerMemory = Get-CompilerMemoryMedian -Scenario $afterScenario

    $comparison = [ordered]@{
      name = $beforeScenario.name
      kind = $beforeScenario.kind
      speedup = if ($afterWall -ne 0) { [math]::Round($beforeWall / $afterWall, 2) } else { $null }
      wallSeconds = Get-Change -Before $beforeWall -After $afterWall
      cpuSeconds = Get-Change `
        -Before ([double]$beforeScenario.summary.medianCpuSeconds) `
        -After ([double]$afterScenario.summary.medianCpuSeconds)
      peakWorkingSetMb = Get-Change `
        -Before ([double]$beforeScenario.summary.medianPeakWorkingSetMb) `
        -After ([double]$afterScenario.summary.medianPeakWorkingSetMb)
    }

    if ($null -ne $beforeCompilerMemory -and $null -ne $afterCompilerMemory) {
      $comparison.compilerMemoryMb = Get-Change `
        -Before ([double]$beforeCompilerMemory) `
        -After ([double]$afterCompilerMemory)
    }

    $comparisons.Add([pscustomobject]$comparison)
  }
  return @($comparisons)
}

$beforeTypecheckReport = Read-BenchmarkReport -Path $BeforeTypecheck
$afterTypecheckReport = Read-BenchmarkReport -Path $AfterTypecheck
$beforeBuildReport = Read-BenchmarkReport -Path $BeforeBuild
$afterBuildReport = Read-BenchmarkReport -Path $AfterBuild

if (-not $beforeTypecheckReport.git.initialClean -or -not $afterTypecheckReport.git.initialClean) {
  throw 'Before/after typecheck reports must start from clean benchmark targets.'
}
if ($beforeTypecheckReport.host.processor -ne $afterTypecheckReport.host.processor) {
  throw 'Before/after typecheck reports were captured on different processors.'
}
if ($beforeTypecheckReport.toolchain.bun -ne $afterTypecheckReport.toolchain.bun) {
  throw 'Before/after typecheck reports used different Bun versions.'
}
if ($beforeTypecheckReport.toolchain.turbo -ne $afterTypecheckReport.toolchain.turbo) {
  throw 'Before/after typecheck reports used different Turborepo versions.'
}

$report = [ordered]@{
  schemaVersion = 1
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  baselineCompiler = $beforeTypecheckReport.toolchain.typescript
  migratedCompiler = $afterTypecheckReport.toolchain.typescript
  host = $afterTypecheckReport.host
  methodology = [ordered]@{
    formula = 'changePercent = ((after - before) / before) * 100; speedup = before wall / after wall'
    negativeChangeIsImprovement = $true
    typecheckSummary = 'Median of three uncached runs.'
    buildSummary = 'One cold run; directional only because framework and bundler work dominate.'
  }
  sources = @($BeforeTypecheck, $AfterTypecheck, $BeforeBuild, $AfterBuild)
  scenarios = @(
    Compare-ReportPair -Before $beforeTypecheckReport -After $afterTypecheckReport
    Compare-ReportPair -Before $beforeBuildReport -After $afterBuildReport
  )
}

$resolvedOutputPath = Resolve-RepositoryPath -Path $OutputPath
New-Item -ItemType Directory -Path (Split-Path $resolvedOutputPath -Parent) -Force | Out-Null
$report | ConvertTo-Json -Depth 10 | Set-Content -Path $resolvedOutputPath -Encoding utf8
Write-Host "Comparison report: $resolvedOutputPath"
