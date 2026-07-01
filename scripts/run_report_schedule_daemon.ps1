[CmdletBinding()]
param(
  [string]$NodePath = "",
  [string]$RepoRoot = "",
  [string]$EnvFile = "",
  [switch]$Once,
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

function Resolve-AbsolutePath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $resolved = Resolve-Path -LiteralPath $Path -ErrorAction Stop
  return $resolved.Path
}

function Write-LogLine {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $Path -Value "[$timestamp] $Message"
}

function Repair-LocalPostgresService {
  param(
    [Parameter(Mandatory = $true)][string]$ServiceName
  )

  try {
    $service = Get-Service -Name $ServiceName -ErrorAction Stop
    Write-LogLine -Path $stdoutLog -Message "Reiniciando servico local $ServiceName antes de iniciar o worker."

    if ($service.Status -eq "Running") {
      Restart-Service -Name $ServiceName -Force -ErrorAction Stop
    } else {
      Start-Service -Name $ServiceName -ErrorAction Stop
    }

    Start-Sleep -Seconds 3
    $updatedService = Get-Service -Name $ServiceName -ErrorAction Stop
    Write-LogLine -Path $stdoutLog -Message "Servico local $ServiceName ficou com status $($updatedService.Status)."
  } catch {
    $message = if ($_.Exception.Message) { $_.Exception.Message } else { "Falha ao reiniciar o servico local $ServiceName" }
    Write-LogLine -Path $stderrLog -Message $message
  }
}

function Import-EnvFile {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [switch]$Override
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  foreach ($line in Get-Content -LiteralPath $Path) {
    $trimmed = $line.Trim()

    if (-not $trimmed -or $trimmed.StartsWith("#")) {
      continue
    }

    if ($trimmed -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
      continue
    }

    $name = $Matches[1]
    $value = $Matches[2].Trim()

    if ($value.StartsWith('"') -and $value.EndsWith('"') -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    } elseif ($value.StartsWith("'") -and $value.EndsWith("'") -and $value.Length -ge 2) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ($Override -or [string]::IsNullOrEmpty([Environment]::GetEnvironmentVariable($name))) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Resolve-NodeExecutable {
  param([string]$PreferredPath)

  if ($PreferredPath) {
    if ($PreferredPath -match "[\\/]" -or $PreferredPath -like "*:*") {
      if (Test-Path -LiteralPath $PreferredPath) {
        return (Resolve-Path -LiteralPath $PreferredPath -ErrorAction Stop).Path
      }
    } else {
      $command = Get-Command $PreferredPath -ErrorAction SilentlyContinue
      if ($command) {
        if ($command.Source) {
          return $command.Source
        }

        return $command.Path
      }
    }
  }

  $command = Get-Command node.exe -ErrorAction SilentlyContinue
  if ($command) {
    if ($command.Source) {
      return $command.Source
    }

    return $command.Path
  }

  foreach ($candidate in @(
    "C:\Program Files\nodejs\node.exe",
    "C:\Program Files (x86)\nodejs\node.exe"
  )) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate -ErrorAction Stop).Path
    }
  }

  throw "Nao foi possivel localizar o executavel do Node.js. Informe -NodePath ou instale o Node no caminho padrao."
}

$resolvedRepoRoot = Resolve-AbsolutePath -Path $RepoRoot
$resolvedEnvFile = Resolve-AbsolutePath -Path $EnvFile
$runnerScript = Join-Path $resolvedRepoRoot "scripts\run_weekly_doctor_reports_daemon.mts"
$aliasLoader = Join-Path $resolvedRepoRoot "tests\alias-loader.mjs"

if (-not (Test-Path -LiteralPath $runnerScript)) {
  throw "Runner TypeScript nao encontrado em $runnerScript"
}

if (-not (Test-Path -LiteralPath $aliasLoader)) {
  throw "Alias loader nao encontrado em $aliasLoader"
}

Import-EnvFile -Path (Join-Path $resolvedRepoRoot ".env")
Import-EnvFile -Path $resolvedEnvFile -Override

Set-Location -LiteralPath $resolvedRepoRoot

$stdoutLog = Join-Path $resolvedRepoRoot ".codex-report-daemon.out.log"
$stderrLog = Join-Path $resolvedRepoRoot ".codex-report-daemon.err.log"
$nodeExecutable = Resolve-NodeExecutable -PreferredPath $NodePath
$env:PRISMA_CLIENT_ENGINE_TYPE = "binary"
$env:NODE_NO_WARNINGS = "1"
$null = Repair-LocalPostgresService -ServiceName "postgresql-x64-18"
$argumentList = @(
  "--loader",
  "./tests/alias-loader.mjs",
  "./scripts/run_weekly_doctor_reports_daemon.mts"
) + $AdditionalArgs

if ($Once) {
  $argumentList += "--once"
}

Write-LogLine -Path $stdoutLog -Message "Daemon launcher iniciado em $resolvedRepoRoot usando $nodeExecutable."
Write-LogLine -Path $stdoutLog -Message "Env file: $resolvedEnvFile"
Write-LogLine -Path $stdoutLog -Message "Iniciando daemon do agendador..."

try {
  & $nodeExecutable @argumentList 1>> $stdoutLog 2>> $stderrLog
  $exitCode = $LASTEXITCODE
  Write-LogLine -Path $stdoutLog -Message "Daemon finalizado com exit code $exitCode."
  exit $exitCode
} catch {
  $message = if ($_.Exception.Message) { $_.Exception.Message } else { "Falha inesperada no launcher do daemon" }
  Write-LogLine -Path $stderrLog -Message $message

  if ($Once) {
    throw
  }

  exit 1
}
