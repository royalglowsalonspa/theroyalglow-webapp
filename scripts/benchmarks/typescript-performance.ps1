[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('before', 'after')]
  [string]$Label,

  [ValidateSet('typecheck', 'build', 'all')]
  [string]$Suite = 'all',

  [ValidateRange(1, 20)]
  [int]$TypecheckIterations = 3,

  [ValidateRange(1, 10)]
  [int]$BuildIterations = 1,

  [string]$OutputPath,

  [string]$RepositoryRoot,

  [switch]$RequireClean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$repoRoot = if ([string]::IsNullOrWhiteSpace($RepositoryRoot)) {
  $scriptRepoRoot
} else {
  (Resolve-Path $RepositoryRoot).Path
}
$bunPath = (Get-Command bun -ErrorAction Stop).Source
$nodePath = (Get-Command node -ErrorAction Stop).Source
$sampleIntervalMilliseconds = 100
$initialGitStatus = @(& git -C $repoRoot status --short)
if ($RequireClean -and $initialGitStatus.Count -gt 0) {
  throw "Benchmark target must start clean: $($initialGitStatus -join ', ')"
}
$initialCommit = (& git -C $repoRoot rev-parse HEAD 2>&1 | Out-String).Trim()
$initialTree = (& git -C $repoRoot rev-parse 'HEAD^{tree}' 2>&1 | Out-String).Trim()
$initialLockSha256 = (Get-FileHash (Join-Path $repoRoot 'bun.lock') -Algorithm SHA256).Hash.ToLowerInvariant()
$initialPackageSha256 = (Get-FileHash (Join-Path $repoRoot 'package.json') -Algorithm SHA256).Hash.ToLowerInvariant()
$initialTsconfigSha256 = (Get-FileHash (Join-Path $repoRoot 'tsconfig.json') -Algorithm SHA256).Hash.ToLowerInvariant()

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $scriptRepoRoot "knowledge-base\benchmarks\typescript-7\$Label.windows-x64.json"
} elseif (-not [IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $scriptRepoRoot $OutputPath
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

function Get-Percentile95 {
  param([double[]]$Values)

  if ($Values.Count -eq 0) {
    return $null
  }

  $sorted = @($Values | Sort-Object)
  $index = [math]::Ceiling($sorted.Count * 0.95) - 1
  return [math]::Round($sorted[[math]::Max(0, $index)], 3)
}

function Get-CompilerDiagnostic {
  param(
    [string]$Output,
    [string]$Name
  )

  $escapedName = [regex]::Escape($Name)
  $match = [regex]::Match($Output, "(?m)^${escapedName}:\s*([0-9.,]+)([A-Za-z]*)\s*$")
  if (-not $match.Success) {
    return $null
  }

  $value = [double]::Parse($match.Groups[1].Value.Replace(',', ''), [Globalization.CultureInfo]::InvariantCulture)
  return [pscustomobject]@{
    value = $value
    unit = $match.Groups[2].Value
  }
}

function Get-DescendantProcessIds {
  param(
    [int]$RootProcessId,
    [Collections.Generic.HashSet[int]]$KnownProcessIds
  )

  $rows = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)
  [void]$KnownProcessIds.Add($RootProcessId)

  do {
    $added = $false
    foreach ($row in $rows) {
      $childId = [int]$row.ProcessId
      $parentId = [int]$row.ParentProcessId
      if ($KnownProcessIds.Contains($parentId) -and $KnownProcessIds.Add($childId)) {
        $added = $true
      }
    }
  } while ($added)

  return @($KnownProcessIds)
}

function Remove-GeneratedOutputs {
  param([string[]]$RelativePaths)

  foreach ($relativePath in $RelativePaths) {
    $absolutePath = Join-Path $repoRoot $relativePath
    if (Test-Path $absolutePath) {
      Remove-Item $absolutePath -Recurse -Force
    }
  }
}

function Invoke-MeasuredProcess {
  param(
    [string]$Name,
    [string[]]$Arguments,
    [hashtable]$Environment,
    [string[]]$CleanupPaths,
    [int]$Iteration
  )

  Remove-GeneratedOutputs -RelativePaths $CleanupPaths

  $stdoutPath = [IO.Path]::GetTempFileName()
  $stderrPath = [IO.Path]::GetTempFileName()
  $knownProcessIds = [Collections.Generic.HashSet[int]]::new()
  $cpuSecondsByProcess = @{}
  $peakWorkingSetBytes = [long]0
  $peakPrivateBytes = [long]0
  $sampleCount = 0
  $idleSamplesAfterExit = 0
  $stopwatch = [Diagnostics.Stopwatch]::StartNew()

  try {
    $startInfo = @{
      FilePath = $bunPath
      ArgumentList = $Arguments
      WorkingDirectory = $repoRoot
      NoNewWindow = $true
      PassThru = $true
      RedirectStandardOutput = $stdoutPath
      RedirectStandardError = $stderrPath
    }
    if ($Environment.Count -gt 0) {
      $startInfo.Environment = $Environment
    }

    $process = Start-Process @startInfo

    while ($true) {
      $process.Refresh()
      $processIds = Get-DescendantProcessIds -RootProcessId $process.Id -KnownProcessIds $knownProcessIds
      $aggregateWorkingSetBytes = [long]0
      $aggregatePrivateBytes = [long]0
      $liveProcessCount = 0

      foreach ($processId in $processIds) {
        $sample = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $sample) {
          continue
        }

        $liveProcessCount += 1
        $aggregateWorkingSetBytes += [long]$sample.WorkingSet64
        $aggregatePrivateBytes += [long]$sample.PrivateMemorySize64
        $cpuSeconds = [double]$sample.CPU
        if (-not $cpuSecondsByProcess.ContainsKey($processId) -or $cpuSeconds -gt $cpuSecondsByProcess[$processId]) {
          $cpuSecondsByProcess[$processId] = $cpuSeconds
        }
      }

      $peakWorkingSetBytes = [math]::Max($peakWorkingSetBytes, $aggregateWorkingSetBytes)
      $peakPrivateBytes = [math]::Max($peakPrivateBytes, $aggregatePrivateBytes)
      $sampleCount += 1

      if ($process.HasExited) {
        if ($liveProcessCount -eq 0) {
          $idleSamplesAfterExit += 1
        } else {
          $idleSamplesAfterExit = 0
        }
        if ($idleSamplesAfterExit -ge 2) {
          break
        }
      }

      Start-Sleep -Milliseconds $sampleIntervalMilliseconds
    }

    $process.WaitForExit()
    $stopwatch.Stop()
    $stdout = Get-Content $stdoutPath -Raw -ErrorAction SilentlyContinue
    $stderr = Get-Content $stderrPath -Raw -ErrorAction SilentlyContinue
    if ($null -eq $stdout) { $stdout = '' }
    if ($null -eq $stderr) { $stderr = '' }
    $combinedOutput = "$stdout`n$stderr"

    $totalCpuSeconds = [double](($cpuSecondsByProcess.Values | Measure-Object -Sum).Sum)
    $wallSeconds = $stopwatch.Elapsed.TotalSeconds
    $logicalProcessorCount = [Environment]::ProcessorCount
    $compilerMemory = Get-CompilerDiagnostic -Output $combinedOutput -Name 'Memory used'
    $compilerTotalTime = Get-CompilerDiagnostic -Output $combinedOutput -Name 'Total time'
    $compilerCheckTime = Get-CompilerDiagnostic -Output $combinedOutput -Name 'Check time'
    $compilerParseTime = Get-CompilerDiagnostic -Output $combinedOutput -Name 'Parse time'

    $compilerMemoryMb = $null
    if ($null -ne $compilerMemory) {
      $compilerMemoryMb = if ($compilerMemory.unit -eq 'K') {
        [math]::Round($compilerMemory.value / 1024, 3)
      } elseif ($compilerMemory.unit -eq 'M') {
        [math]::Round($compilerMemory.value, 3)
      } else {
        $compilerMemory.value
      }
    }

    $result = [ordered]@{
      iteration = $Iteration
      exitCode = $process.ExitCode
      wallSeconds = [math]::Round($wallSeconds, 3)
      cpuSeconds = [math]::Round($totalCpuSeconds, 3)
      aggregateCoreUtilizationPercent = if ($wallSeconds -gt 0) {
        [math]::Round(($totalCpuSeconds / $wallSeconds) * 100, 2)
      } else { 0 }
      normalizedHostCpuPercent = if ($wallSeconds -gt 0 -and $logicalProcessorCount -gt 0) {
        [math]::Round(($totalCpuSeconds / ($wallSeconds * $logicalProcessorCount)) * 100, 2)
      } else { 0 }
      peakWorkingSetMb = [math]::Round($peakWorkingSetBytes / 1MB, 3)
      peakPrivateMemoryMb = [math]::Round($peakPrivateBytes / 1MB, 3)
      samples = $sampleCount
      compilerDiagnostics = [ordered]@{
        memoryMb = $compilerMemoryMb
        parseSeconds = if ($null -ne $compilerParseTime) { $compilerParseTime.value } else { $null }
        checkSeconds = if ($null -ne $compilerCheckTime) { $compilerCheckTime.value } else { $null }
        totalSeconds = if ($null -ne $compilerTotalTime) { $compilerTotalTime.value } else { $null }
      }
    }

    if ($process.ExitCode -ne 0) {
      $failureOutput = $combinedOutput.Trim()
      if ($failureOutput.Length -gt 4000) {
        $failureOutput = $failureOutput.Substring($failureOutput.Length - 4000)
      }
      $result.failureOutput = $failureOutput
    }

    Write-Host ("{0} iteration {1}: exit={2}, wall={3}s, CPU={4}s, peak RSS={5} MB" -f `
      $Name, $Iteration, $process.ExitCode, $result.wallSeconds, $result.cpuSeconds, $result.peakWorkingSetMb)

    return [pscustomobject]$result
  } finally {
    Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
  }
}

function New-Scenario {
  param(
    [string]$Name,
    [ValidateSet('typecheck', 'build')]
    [string]$Kind,
    [string[]]$Arguments,
    [int]$Iterations,
    [hashtable]$Environment = @{},
    [string[]]$CleanupPaths = @()
  )

  return [pscustomobject]@{
    name = $Name
    kind = $Kind
    command = 'bun'
    arguments = $Arguments
    iterations = $Iterations
    environmentKeys = @($Environment.Keys | Sort-Object)
    environment = $Environment
    cleanupPaths = $CleanupPaths
  }
}

$ciBuildEnvironment = @{
  SKIP_ENV_VALIDATION = '1'
  BETTER_AUTH_SECRET = 'ci-build-only-placeholder-not-used-at-runtime-000'
  DATABASE_URL = ''
  DATABASE_URL_UNPOOLED = ''
  NEXT_PUBLIC_CMS_URL = ''
  NODE_OPTIONS = '--max-old-space-size=4096'
}

$cmsBuildEnvironment = @{
  PAYLOAD_SECRET = 'ci-build-only-placeholder-not-used-at-runtime-000'
  DATABASE_URL = 'postgresql://build:build@127.0.0.1:9/build'
  PAYLOAD_PUBLIC_SERVER_URL = 'http://localhost:3002'
  WEB_APP_URL = 'http://localhost:3000'
  NODE_OPTIONS = '--max-old-space-size=4096'
}

$scenarios = [Collections.Generic.List[object]]::new()
if ($Suite -in @('typecheck', 'all')) {
  $scenarios.Add((New-Scenario -Name 'workspace-typecheck' -Kind 'typecheck' -Iterations $TypecheckIterations -Arguments @(
    'x', 'turbo', 'run', 'typecheck', '--force', '--output-logs=errors-only', '--', '--incremental', 'false'
  )))

  foreach ($appName in @('web', 'admin', 'cms', 'invoicing')) {
    $scenarios.Add((New-Scenario -Name "$appName-typecheck" -Kind 'typecheck' -Iterations $TypecheckIterations -Arguments @(
      'x', 'tsc', '--project', "apps/$appName/tsconfig.json", '--noEmit', '--incremental', 'false',
      '--extendedDiagnostics', '--pretty', 'false'
    )))
  }
}

if ($Suite -in @('build', 'all')) {
  $scenarios.Add((New-Scenario -Name 'web-build' -Kind 'build' -Iterations $BuildIterations `
    -Arguments @('run', '--filter=@rgss/web', 'build') `
    -Environment $ciBuildEnvironment `
    -CleanupPaths @('apps/web/.next')))
  $scenarios.Add((New-Scenario -Name 'admin-build' -Kind 'build' -Iterations $BuildIterations `
    -Arguments @('run', '--filter=@rgss/admin', 'build') `
    -Environment $ciBuildEnvironment `
    -CleanupPaths @('apps/admin/.next')))
  $scenarios.Add((New-Scenario -Name 'cms-build' -Kind 'build' -Iterations $BuildIterations `
    -Arguments @('run', '--filter=@rgss/cms', 'build') `
    -Environment $cmsBuildEnvironment `
    -CleanupPaths @('apps/cms/.next')))
  $scenarios.Add((New-Scenario -Name 'invoicing-build' -Kind 'build' -Iterations $BuildIterations `
    -Arguments @('run', '--filter=@rgss/invoicing', 'build') `
    -CleanupPaths @('apps/invoicing/dist')))
}

$scenarioResults = [Collections.Generic.List[object]]::new()
$hasFailure = $false

foreach ($scenario in $scenarios) {
  $runs = [Collections.Generic.List[object]]::new()
  for ($iteration = 1; $iteration -le $scenario.iterations; $iteration += 1) {
    $run = Invoke-MeasuredProcess `
      -Name $scenario.name `
      -Arguments $scenario.arguments `
      -Environment $scenario.environment `
      -CleanupPaths $scenario.cleanupPaths `
      -Iteration $iteration
    $runs.Add($run)
    if ($run.exitCode -ne 0) {
      $hasFailure = $true
      break
    }
  }

  $successfulRuns = @($runs | Where-Object { $_.exitCode -eq 0 })
  $wallValues = @($successfulRuns | ForEach-Object { [double]$_.wallSeconds })
  $cpuValues = @($successfulRuns | ForEach-Object { [double]$_.cpuSeconds })
  $workingSetValues = @($successfulRuns | ForEach-Object { [double]$_.peakWorkingSetMb })
  $privateMemoryValues = @($successfulRuns | ForEach-Object { [double]$_.peakPrivateMemoryMb })
  $hostCpuValues = @($successfulRuns | ForEach-Object { [double]$_.normalizedHostCpuPercent })
  $scenarioResults.Add([pscustomobject][ordered]@{
    name = $scenario.name
    kind = $scenario.kind
    command = "$($scenario.command) $($scenario.arguments -join ' ')"
    environmentKeys = $scenario.environmentKeys
    cleanupPaths = $scenario.cleanupPaths
    runs = @($runs)
    summary = [ordered]@{
      successfulIterations = $successfulRuns.Count
      medianWallSeconds = Get-Median -Values $wallValues
      p95WallSeconds = Get-Percentile95 -Values $wallValues
      medianCpuSeconds = Get-Median -Values $cpuValues
      medianPeakWorkingSetMb = Get-Median -Values $workingSetValues
      medianPeakPrivateMemoryMb = Get-Median -Values $privateMemoryValues
      medianNormalizedHostCpuPercent = Get-Median -Values $hostCpuValues
    }
  })
}

Push-Location $repoRoot
try {
  $compilerVersion = (& $bunPath x tsc --version 2>&1 | Out-String).Trim()
  $bunVersion = (& $bunPath --version 2>&1 | Out-String).Trim()
  $nodeVersion = (& $nodePath --version 2>&1 | Out-String).Trim()
  $turboVersion = (& $bunPath x turbo --version 2>&1 | Out-String).Trim()
} finally {
  Pop-Location
}
$finalGitStatus = @(& git -C $repoRoot status --short)
$computerSystem = Get-CimInstance Win32_ComputerSystem
$processor = Get-CimInstance Win32_Processor | Select-Object -First 1
$operatingSystem = Get-CimInstance Win32_OperatingSystem

$report = [ordered]@{
  schemaVersion = 1
  label = $Label
  generatedAtUtc = [DateTime]::UtcNow.ToString('o')
  suite = $Suite
  git = [ordered]@{
    commit = $initialCommit
    tree = $initialTree
    initialClean = $initialGitStatus.Count -eq 0
    finalClean = $finalGitStatus.Count -eq 0
    inputHashes = [ordered]@{
      bunLockSha256 = $initialLockSha256
      packageJsonSha256 = $initialPackageSha256
      tsconfigJsonSha256 = $initialTsconfigSha256
    }
  }
  toolchain = [ordered]@{
    typescript = $compilerVersion
    bun = $bunVersion
    node = $nodeVersion
    turbo = $turboVersion
    powershell = $PSVersionTable.PSVersion.ToString()
  }
  host = [ordered]@{
    operatingSystem = $operatingSystem.Caption
    operatingSystemVersion = $operatingSystem.Version
    architecture = $env:PROCESSOR_ARCHITECTURE
    processor = $processor.Name.Trim()
    logicalProcessors = [int]$computerSystem.NumberOfLogicalProcessors
    totalMemoryGb = [math]::Round([double]$computerSystem.TotalPhysicalMemory / 1GB, 2)
  }
  methodology = [ordered]@{
    processTreeSampleIntervalMilliseconds = $sampleIntervalMilliseconds
    typecheckIterations = $TypecheckIterations
    buildIterations = $BuildIterations
    typechecksDisableIncrementalCache = $true
    buildsDeleteFrameworkOutputBeforeEachRun = $true
    turboCacheBypassed = $true
    benchmarkTargetInitiallyClean = $initialGitStatus.Count -eq 0
    workspaceTypecheckScope = 'Ten Turborepo workspace typecheck tasks; specialist drift/synthetic configs are validated separately and excluded from this apples-to-apples performance workload.'
    note = 'CPU and memory include the measured Bun process plus sampled descendants. Monitoring overhead is external and identical between before/after runs.'
  }
  scenarios = @($scenarioResults)
}

$outputDirectory = Split-Path $OutputPath -Parent
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$report | ConvertTo-Json -Depth 12 | Set-Content -Path $OutputPath -Encoding utf8
Write-Host "Benchmark report: $OutputPath"

if ($hasFailure) {
  exit 1
}
