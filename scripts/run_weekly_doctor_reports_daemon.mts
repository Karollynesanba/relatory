import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { parseArgs } from "node:util"
import { config as loadDotenv } from "dotenv"
import { REPORT_AUTOMATION_DEFAULT_TIMEZONE } from "@/lib/report-automation"
import { processPendingReportBatch } from "@/lib/report-processing"
import { processDueReportSchedules } from "@/lib/report-schedule"
import { touchReportWorkerHeartbeat } from "@/lib/report-worker-health"

process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary"

type WeeklyDoctorReportsCliArgs = {
  dryRun: boolean
  since?: string
  until?: string
  clientIds: string[]
  maxClients?: number
  allActive: boolean
  allowDuplicateWeek: boolean
  envFile?: string
}

type DaemonCliArgs = {
  dryRun: boolean
  once: boolean
  forceRun: boolean
  envFile?: string
}

type WeeklySchedule = {
  minute: number
  hour: number
  weekday: number
  raw: string
}

type DaemonState = {
  lastAttemptedScheduledDate?: string
  lastAttemptedAt?: string
  lastExitCode?: number
  lastSuccessfulScheduledDate?: string
}

function loadEnvironment(repoRoot: string, envFilePath?: string) {
  loadDotenv({
    path: path.join(repoRoot, ".env"),
    override: false,
    quiet: true,
  })

  loadDotenv({
    path: envFilePath || path.join(repoRoot, ".env.local"),
    override: true,
    quiet: true,
  })
}

function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

const DEFAULT_DAEMON_POLL_SECONDS = 30
const DEFAULT_RETRY_MINUTES = 15
const WEEKDAY_LABEL_TO_NUMBER: Record<string, number> = {
  SUN: 0,
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
}

function parseDaemonCliArgs(): DaemonCliArgs {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    options: {
      "dry-run": {
        type: "boolean",
        default: false,
      },
      once: {
        type: "boolean",
        default: false,
      },
      "force-run": {
        type: "boolean",
        default: false,
      },
      "env-file": {
        type: "string",
      },
    },
  })

  return {
    dryRun: parsed.values["dry-run"],
    once: parsed.values.once,
    forceRun: parsed.values["force-run"],
    envFile: parsed.values["env-file"],
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  if (!value?.trim()) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback
  }

  return parsed
}

function parseCronNumber(rawValue: string, minimum: number, maximum: number) {
  const value = Number.parseInt(rawValue, 10)

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(
      `Campo cron invalido '${rawValue}'. Esperado numero entre ${minimum} e ${maximum}.`
    )
  }

  return value
}

function parseWeeklySchedule(rawCron: string | undefined) {
  const cron = rawCron?.trim() || "0 9 * * 1"
  const [minuteRaw, hourRaw, dayOfMonth, month, weekdayRaw] = cron.split(/\s+/)

  if (!minuteRaw || !hourRaw || !dayOfMonth || !month || !weekdayRaw) {
    throw new Error(
      `REPORT_WEEKLY_CRON precisa ter 5 campos. Valor atual: '${cron}'.`
    )
  }

  if (dayOfMonth !== "*" || month !== "*") {
    throw new Error(
      "O daemon atual suporta apenas cron semanal no formato 'MIN HOUR * * WEEKDAY'."
    )
  }

  const minute = parseCronNumber(minuteRaw, 0, 59)
  const hour = parseCronNumber(hourRaw, 0, 23)
  const weekdayLabel = weekdayRaw.toUpperCase()
  const weekday = Number.isFinite(Number(weekdayLabel))
    ? parseCronNumber(weekdayLabel, 0, 7) % 7
    : WEEKDAY_LABEL_TO_NUMBER[weekdayLabel]

  if (weekday === undefined) {
    throw new Error(
      `Dia da semana invalido em REPORT_WEEKLY_CRON: '${weekdayRaw}'.`
    )
  }

  return {
    minute,
    hour,
    weekday,
    raw: cron,
  } satisfies WeeklySchedule
}

function getZonedParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    weekday: "short",
  })

  const entries = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  ) as Record<string, string>

  const weekday =
    WEEKDAY_LABEL_TO_NUMBER[entries.weekday?.toUpperCase() ?? ""] ?? -1

  return {
    hour: Number.parseInt(entries.hour ?? "0", 10),
    minute: Number.parseInt(entries.minute ?? "0", 10),
    weekday,
    dateKey: `${entries.year}-${entries.month}-${entries.day}`,
  }
}

function isScheduleDueNow(
  now: Date,
  timeZone: string,
  schedule: WeeklySchedule
) {
  const zoned = getZonedParts(now, timeZone)

  if (zoned.weekday !== schedule.weekday) {
    return null
  }

  if (zoned.hour < schedule.hour) {
    return null
  }

  if (zoned.hour === schedule.hour && zoned.minute < schedule.minute) {
    return null
  }

  return zoned.dateKey
}

function createStateFilePath(repoRoot: string) {
  return path.join(
    repoRoot,
    "automacao",
    "relatorios-doutores",
    "state",
    "weekly-report-daemon-state.json"
  )
}

async function loadState(stateFilePath: string): Promise<DaemonState> {
  try {
    const content = await fs.readFile(stateFilePath, "utf8")
    return JSON.parse(content) as DaemonState
  } catch (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : ""

    if (code === "ENOENT") {
      return {}
    }

    throw error
  }
}

async function saveState(stateFilePath: string, state: DaemonState) {
  await fs.mkdir(path.dirname(stateFilePath), { recursive: true })
  await fs.writeFile(stateFilePath, JSON.stringify(state, null, 2), "utf8")
}

function buildRunnerArgs(cliArgs: DaemonCliArgs): WeeklyDoctorReportsCliArgs {
  return {
    dryRun: cliArgs.dryRun,
    since: undefined,
    until: undefined,
    clientIds: [],
    maxClients: undefined,
    allActive: false,
    allowDuplicateWeek: false,
    envFile: cliArgs.envFile,
  }
}

function shouldWaitForRetry(
  state: DaemonState,
  scheduledDate: string,
  retryMinutes: number,
  now: Date
) {
  if (
    state.lastAttemptedScheduledDate !== scheduledDate
    || state.lastExitCode === undefined
    || state.lastExitCode === 0
    || !state.lastAttemptedAt
  ) {
    return false
  }

  const retryAtMs =
    new Date(state.lastAttemptedAt).getTime() + retryMinutes * 60_000

  return Number.isFinite(retryAtMs) && now.getTime() < retryAtMs
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function tryRunScheduledAutomation(params: {
  cliArgs: DaemonCliArgs
  schedule: WeeklySchedule
  stateFilePath: string
  timeZone: string
  retryMinutes: number
}) {
  const now = new Date()
  const scheduledDate = params.cliArgs.forceRun
    ? getZonedParts(now, params.timeZone).dateKey
    : isScheduleDueNow(now, params.timeZone, params.schedule)

  if (!scheduledDate) {
    return {
      executed: false,
      exitCode: 0,
    }
  }

  const state = await loadState(params.stateFilePath)

  if (
    !params.cliArgs.forceRun
    && state.lastSuccessfulScheduledDate === scheduledDate
  ) {
    return {
      executed: false,
      exitCode: 0,
    }
  }

  if (
    !params.cliArgs.forceRun
    &&
    shouldWaitForRetry(
      state,
      scheduledDate,
      params.retryMinutes,
      now
    )
  ) {
    return {
      executed: false,
      exitCode: 0,
    }
  }

  console.log(
    `[daemon] Iniciando automacao semanal para ${scheduledDate}`
      + ` (${params.timeZone}, cron ${params.schedule.raw})`
      + `${params.cliArgs.dryRun ? " em dry-run" : ""}.`
  )

  state.lastAttemptedScheduledDate = scheduledDate
  state.lastAttemptedAt = now.toISOString()
  await saveState(params.stateFilePath, state)

  const runnerModule = await import(
    new URL("./run_weekly_doctor_reports.mts", import.meta.url).href
  )
  const exitCode = await runnerModule.runWeeklyDoctorReports(
    buildRunnerArgs(params.cliArgs)
  )

  state.lastExitCode = exitCode
  if (exitCode === 0) {
    state.lastSuccessfulScheduledDate = scheduledDate
  }
  await saveState(params.stateFilePath, state)

  console.log(
    `[daemon] Automacao semanal finalizada com exit code ${exitCode}.`
  )

  return {
    executed: true,
    exitCode,
  }
}

async function pingWorkerHeartbeat(lastError?: string | null) {
  try {
    await touchReportWorkerHeartbeat({
      lastError: lastError?.trim() || null,
    })
  } catch (error) {
    console.error(
      `[ERRO] ${
        error instanceof Error
          ? error.message
          : "Falha ao atualizar o heartbeat do worker"
      }`
    )
  }
}

async function main() {
  const repoRoot = getRepoRoot()
  const cliArgs = parseDaemonCliArgs()

  loadEnvironment(repoRoot, cliArgs.envFile)

  const timeZone =
    process.env.REPORT_WEEKLY_TZ?.trim()
    || REPORT_AUTOMATION_DEFAULT_TIMEZONE
  const schedule = parseWeeklySchedule(process.env.REPORT_WEEKLY_CRON)
  const pollSeconds = parsePositiveInt(
    process.env.REPORT_AUTOMATION_DAEMON_POLL_SECONDS,
    DEFAULT_DAEMON_POLL_SECONDS
  )
  const retryMinutes = parsePositiveInt(
    process.env.REPORT_AUTOMATION_DAEMON_RETRY_MINUTES,
    DEFAULT_RETRY_MINUTES
  )
  const stateFilePath = createStateFilePath(repoRoot)

  console.log(
    `[daemon] Scheduler semanal iniciado`
      + ` | timezone=${timeZone}`
      + ` | cron=${schedule.raw}`
      + ` | poll=${pollSeconds}s`
      + ` | retry=${retryMinutes}min`
      + `${cliArgs.dryRun ? " | dry-run" : ""}`
      + `${cliArgs.forceRun ? " | force-run" : ""}`
      + `${cliArgs.once ? " | once" : ""}`
  )

  await pingWorkerHeartbeat()

  while (true) {
    try {
      await processDueReportSchedules({
        retryMinutes,
        dryRun: cliArgs.dryRun,
      })
      await processPendingReportBatch().catch((error) => {
        console.error(
          `[ERRO] ${
            error instanceof Error
              ? error.message
              : "Falha ao processar fila pendente de relatorios"
          }`
        )
      })

      const result = await tryRunScheduledAutomation({
        cliArgs,
        schedule,
        stateFilePath,
        timeZone,
        retryMinutes,
      })

      await processPendingReportBatch().catch((error) => {
        console.error(
          `[ERRO] ${
            error instanceof Error
              ? error.message
              : "Falha ao processar fila apos disparo da automacao"
          }`
        )
      })

      await pingWorkerHeartbeat()

      if (cliArgs.once) {
        return result.exitCode
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha inesperada no daemon da automacao"

      console.error(`[ERRO] ${message}`)
      await pingWorkerHeartbeat(message)

      if (cliArgs.once) {
        return 1
      }
    }

    await sleep(pollSeconds * 1_000)
  }
}

try {
  process.exit(await main())
} catch (error) {
  console.error(
    `[ERRO] ${error instanceof Error ? error.message : "Falha inesperada no daemon da automacao"}`
  )
  await pingWorkerHeartbeat(
    error instanceof Error ? error.message : "Falha inesperada no daemon da automacao"
  )
  process.exit(1)
}
