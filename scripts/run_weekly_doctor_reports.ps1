[CmdletBinding()]
param(
  [string]$NodePath = "",
  [string]$RepoRoot = "",
  [string]$EnvFile = "",
  [string[]]$AdditionalArgs = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not $RepoRoot) {
  $RepoRoot = Join-Path $scriptDirectory ".."
}

if (-not $EnvFile) {
  $EnvFile = Join-Path (Join-Path $scriptDirectory "..") ".env.local"
}

if (-not $NodePath) {
  $NodePath = "node"
}

function Resolve-AbsolutePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  return $resolved.Path
}

$resolvedRepoRoot = Resolve-AbsolutePath -Path $RepoRoot
$resolvedEnvFile = Resolve-AbsolutePath -Path $EnvFile
$runnerScript = Join-Path $resolvedRepoRoot "scripts\run_weekly_doctor_reports.mts"
$aliasLoader = Join-Path $resolvedRepoRoot "tests\alias-loader.mjs"
$runnerScriptArgument = "./scripts/run_weekly_doctor_reports.mts"
$aliasLoaderArgument = "./tests/alias-loader.mjs"

if (-not (Test-Path -LiteralPath $runnerScript)) {
  throw "Runner TypeScript nao encontrado em $runnerScript"
}

if (-not (Test-Path -LiteralPath $aliasLoader)) {
  throw "Alias loader nao encontrado em $aliasLoader"
}

$logsDirectory = Join-Path $resolvedRepoRoot "automacao\relatorios-doutores\logs"
New-Item -ItemType Directory -Path $logsDirectory -Force | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stdoutLog = Join-Path $logsDirectory "weekly-report-task-$timestamp.log"
$stderrLog = Join-Path $logsDirectory "weekly-report-task-$timestamp.err.log"
$env:PRISMA_CLIENT_ENGINE_TYPE = "binary"
$env:NODE_NO_WARNINGS = "1"

$argumentList = @(
  "--loader",
  $aliasLoaderArgument,
  $runnerScriptArgument,
  "--env-file",
  $resolvedEnvFile
) + $AdditionalArgs

Write-Host "Executando automacao semanal dos relatorios..."
Write-Host "Repositorio: $resolvedRepoRoot"
Write-Host "Env file: $resolvedEnvFile"
Write-Host "Stdout log: $stdoutLog"
Write-Host "Stderr log: $stderrLog"

$previousLocation = Get-Location
Set-Location -LiteralPath $resolvedRepoRoot

try {
  function Quote-CmdArgument {
    param([Parameter(Mandatory = $true)][string]$Value)

    return '"' + ($Value -replace '"', '\"') + '"'
  }

  $quotedArguments = $argumentList | ForEach-Object { Quote-CmdArgument -Value $_ }
  $nodeCommand =
    (Quote-CmdArgument -Value $NodePath) + ' ' +
    ($quotedArguments -join ' ') +
    ' 1> ' + (Quote-CmdArgument -Value $stdoutLog) +
    ' 2> ' + (Quote-CmdArgument -Value $stderrLog)

  $command = @(
    'set "PRISMA_CLIENT_ENGINE_TYPE=binary"'
    '&& set "NODE_NO_WARNINGS=1"'
    '&& ' + $nodeCommand
  ) -join ' '

  & cmd.exe /c $command
  $exitCode = $LASTEXITCODE
} finally {
  Set-Location -LiteralPath $previousLocation
}

if ($exitCode -ne 0) {
  Write-Error "A automacao terminou com falha. Veja $stderrLog e $stdoutLog"
}

exit $exitCode
