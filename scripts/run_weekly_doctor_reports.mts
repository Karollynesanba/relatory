import fs from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import type { prisma as PrismaClientInstance } from "@/lib/prisma"
import { config as loadDotenv } from "dotenv"

process.env.PRISMA_CLIENT_ENGINE_TYPE ||= "binary"
import {
  buildAutomationReferenceWeekDate,
  buildAutomationReferenceWeekLabel,
  loadReportAutomationSettings,
  maskAutomationGroupId,
  resolveReportAutomationWindow,
} from "@/lib/report-automation"

type AutomationUser = {
  id: string
  email: string
  role: "ADMIN" | "MANAGER"
  metaAccessToken: string | null
  metaTokenExpiresAt: Date | null
}

type EligibleClient = {
  id: string
  name: string
  company: string | null
  email: string | null
  adAccountId: string | null
  whatsappGroupId: string | null
  managerId: string | null
  manager: {
    id: string
    metaAccessToken: string | null
    metaTokenExpiresAt: Date | null
  } | null
}

type RuntimePrisma = typeof PrismaClientInstance

type Runtime = {
  ensureAdminUser: () => Promise<unknown>
  prisma: RuntimePrisma
  generateLiveReportPayload(params: {
    user: AutomationUser
    client: EligibleClient
    filters: {
      since: string
      until: string
      objective: string
    }
  }): Promise<unknown>
  persistGeneratedReport(params: {
    clientId: string
    payload: unknown
    filters: {
      since: string
      until: string
      objective: string
    }
  }): Promise<{ reportId: string }>
  sendPersistedReportNow(
    reportId: string,
    options: {
      mode: "PDF_AND_MESSAGE" | "PDF_ONLY" | "MESSAGE_ONLY"
      groupId: string | null
      authorization: {
        type: "scheduled-automation"
        source: "weekly"
      }
    }
  ): Promise<unknown>
}

type JsonLinePayload = Record<string, unknown>

class AutomationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AutomationError"
  }
}

class JsonLineLogger {
  private readonly outputPath: string

  constructor(outputPath: string) {
    this.outputPath = outputPath
  }

  async log(level: "INFO" | "ERROR", event: string, payload: JsonLinePayload) {
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...payload,
    })

    await fs.mkdir(path.dirname(this.outputPath), { recursive: true })
    await fs.appendFile(this.outputPath, `${line}\n`, "utf8")
  }
}

export type WeeklyDoctorReportsCliArgs = {
  dryRun: boolean
  since?: string
  until?: string
  clientIds: string[]
  maxClients?: number
  allActive: boolean
  allowDuplicateWeek: boolean
  envFile?: string
}

export function loadEnvironment(repoRoot: string, envFilePath?: string) {
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

export function getRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
}

function parseCliArgs(): WeeklyDoctorReportsCliArgs {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: false,
    options: {
      "dry-run": {
        type: "boolean",
        default: false,
      },
      since: {
        type: "string",
      },
      until: {
        type: "string",
      },
      "client-id": {
        type: "string",
        multiple: true,
      },
      "max-clients": {
        type: "string",
      },
      "all-active": {
        type: "boolean",
        default: false,
      },
      "allow-duplicate-week": {
        type: "boolean",
        default: false,
      },
      "env-file": {
        type: "string",
      },
    },
  })

  const maxClientsRaw = parsed.values["max-clients"]
  let maxClients: number | undefined

  if (maxClientsRaw) {
    const parsedMaxClients = Number.parseInt(maxClientsRaw, 10)

    if (!Number.isFinite(parsedMaxClients) || parsedMaxClients < 1) {
      throw new AutomationError("--max-clients precisa ser maior que zero.")
    }

    maxClients = parsedMaxClients
  }

  return {
    dryRun: parsed.values["dry-run"],
    since: parsed.values.since,
    until: parsed.values.until,
    clientIds: parsed.values["client-id"] ?? [],
    maxClients,
    allActive: parsed.values["all-active"],
    allowDuplicateWeek: parsed.values["allow-duplicate-week"],
    envFile: parsed.values["env-file"],
  }
}

async function loadRuntime(): Promise<Runtime> {
  const [{ ensureAdminUser }, { prisma }, { sendPersistedReportNow }, reportService] =
    await Promise.all([
      import("@/lib/admin-user"),
      import("@/lib/prisma"),
      import("@/lib/report-delivery"),
      import("@/lib/report-service"),
    ])

  return {
    ensureAdminUser,
    prisma,
    generateLiveReportPayload: reportService.generateLiveReportPayload,
    persistGeneratedReport: reportService.persistGeneratedReport,
    sendPersistedReportNow,
  }
}

async function resolveAutomationUser(runtime: Runtime) {
  await runtime.ensureAdminUser()

  const settings = loadReportAutomationSettings()
  const automationEmail = settings.automationEmail

  if (!automationEmail) {
    throw new AutomationError(
      "Defina REPORT_AUTOMATION_EMAIL ou ADMIN_EMAIL para executar a automacao."
    )
  }

  const user = await runtime.prisma.user.findUnique({
    where: {
      email: automationEmail,
    },
    select: {
      id: true,
      email: true,
      role: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
    },
  })

  if (!user) {
    throw new AutomationError(
      `Usuario tecnico '${automationEmail}' nao foi encontrado.`
    )
  }

  if (user.role !== "ADMIN") {
    throw new AutomationError(
      "O usuario tecnico precisa ter papel ADMIN para executar a automacao."
    )
  }

  return user
}

async function loadEligibleClients(runtime: Runtime) {
  return runtime.prisma.client.findMany({
    where: {
      status: "ACTIVE",
    },
    include: {
      manager: {
        select: {
          id: true,
          metaAccessToken: true,
          metaTokenExpiresAt: true,
        },
      },
    },
    orderBy: {
      name: "asc",
    },
  })
}

function selectClients(params: {
  activeClients: EligibleClient[]
  clientIds: string[]
  connectedOnly: boolean
  maxClients?: number
  allActive: boolean
}) {
  const eligibleClients =
    params.connectedOnly && !params.allActive
      ? params.activeClients.filter((client) =>
          String(client.adAccountId ?? "").trim()
        )
      : params.activeClients

  let selectedClients = eligibleClients

  if (params.clientIds.length > 0) {
    const requestedIds = new Set(
      params.clientIds.map((clientId) => clientId.trim()).filter(Boolean)
    )

    selectedClients = eligibleClients.filter((client) =>
      requestedIds.has(client.id)
    )

    const foundIds = new Set(selectedClients.map((client) => client.id))
    const missingIds = [...requestedIds].filter((clientId) => !foundIds.has(clientId))

    if (missingIds.length > 0) {
      throw new AutomationError(
        `Os seguintes clientIds ativos nao foram encontrados: ${missingIds.join(", ")}`
      )
    }
  }

  if (params.maxClients) {
    selectedClients = selectedClients.slice(0, params.maxClients)
  }

  return {
    eligibleClients,
    selectedClients,
  }
}

async function hasAlreadySentForWeek(
  runtime: Runtime,
  clientId: string,
  referenceWeekDate: Date
) {
  const report = await runtime.prisma.report.findFirst({
    where: {
      clientId,
      status: "SENT",
      referenceWeek: referenceWeekDate,
    },
    select: {
      id: true,
    },
  })

  return Boolean(report)
}

function createRunLogPath(repoRoot: string) {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "")
    .replace("T", "-")

  return path.join(
    repoRoot,
    "automacao",
    "relatorios-doutores",
    "logs",
    `weekly-report-run-${stamp}.jsonl`
  )
}

function printActiveClients(clients: EligibleClient[]) {
  console.log(`Doutores(as) ativos encontrados: ${clients.length}`)

  for (const client of clients) {
    const groupStatus =
      maskAutomationGroupId(client.whatsappGroupId) || "sem grupo configurado"
    console.log(`- ${client.name} | grupo: ${groupStatus}`)
  }
}

export async function runWeeklyDoctorReports(
  args: WeeklyDoctorReportsCliArgs
) {
  const repoRoot = getRepoRoot()
  loadEnvironment(repoRoot, args.envFile)
  const runtime = await loadRuntime()

  const settings = loadReportAutomationSettings()
  const window = resolveReportAutomationWindow({
    timezone: settings.timezone,
    since: args.since,
    until: args.until,
  })
  const referenceWeekDate = buildAutomationReferenceWeekDate(window)
  const referenceWeek = buildAutomationReferenceWeekLabel(window)
  const logger = new JsonLineLogger(createRunLogPath(repoRoot))

  await logger.log("INFO", "run_started", {
    timezone: settings.timezone,
    window,
    sendMode: settings.sendMode,
    groupId: maskAutomationGroupId(settings.groupId),
    connectedOnly: settings.connectedOnly && !args.allActive,
    maxClients: args.maxClients ?? settings.maxClients,
    dryRun: args.dryRun,
  })

  const technicalUser = await resolveAutomationUser(runtime)
  await logger.log("INFO", "technical_user_loaded", {
    technicalUser: technicalUser.email,
    technicalUserRole: technicalUser.role,
  })

  const activeClients = await loadEligibleClients(runtime)
  const { eligibleClients, selectedClients } = selectClients({
    activeClients,
    clientIds: args.clientIds,
    connectedOnly: settings.connectedOnly,
    maxClients: args.maxClients ?? settings.maxClients ?? undefined,
    allActive: args.allActive,
  })

  console.log(
    `Janela semanal selecionada: ${window.since} ate ${window.until} (${settings.timezone})`
  )
  printActiveClients(eligibleClients)

  await logger.log("INFO", "active_doctors_loaded", {
    totalActiveDoctors: activeClients.length,
    totalEligibleDoctors: eligibleClients.length,
  })

  if (args.clientIds.length > 0) {
    console.log(
      `Execucao filtrada para ${selectedClients.length} cliente(s) ativo(s).`
    )
  } else if (args.maxClients ?? settings.maxClients) {
    console.log(
      `Execucao limitada aos primeiros ${selectedClients.length} cliente(s) ativo(s).`
    )
  } else if (settings.connectedOnly && !args.allActive) {
    console.log(
      `Execucao configurada para clientes conectados: ${selectedClients.length} elegivel(is).`
    )
  }

  if (args.dryRun) {
    console.log("Dry-run concluido.")
    await logger.log("INFO", "run_finished", {
      summary: {
        processed: selectedClients.length,
        sent: 0,
        skipped: 0,
        failed: 0,
        dryRun: true,
      },
    })
    await runtime.prisma.$disconnect()
    return 0
  }

  let sentCount = 0
  let skippedCount = 0
  let failedCount = 0
  const skipIfAlreadySent =
    settings.skipIfAlreadySent && !args.allowDuplicateWeek

  for (const client of selectedClients) {
    const effectiveGroupId =
      settings.groupId || String(client.whatsappGroupId ?? "").trim() || null
    const maskedGroupId = maskAutomationGroupId(effectiveGroupId)

    await logger.log("INFO", "doctor_started", {
      doctorName: client.name,
      clientId: client.id,
      whatsappGroupId: maskedGroupId,
    })

    try {
      if (!String(client.adAccountId ?? "").trim()) {
        throw new AutomationError("Cliente ativo sem conta META conectada.")
      }

      if (!effectiveGroupId) {
        throw new AutomationError(
          "Cliente ativo sem grupo de WhatsApp configurado."
        )
      }

      if (
        skipIfAlreadySent &&
        (await hasAlreadySentForWeek(runtime, client.id, referenceWeekDate))
      ) {
        skippedCount += 1
        console.log(
          `[SKIP] ${client.name}: envio ja concluido para ${referenceWeek}.`
        )
        await logger.log("INFO", "doctor_skipped", {
          doctorName: client.name,
          clientId: client.id,
          referenceWeek,
          reason: "already-sent",
        })
        continue
      }

      const payload = await runtime.generateLiveReportPayload({
        user: technicalUser,
        client,
        filters: {
          since: window.since,
          until: window.until,
          objective: settings.objective,
        },
      })

      const persistedReport = await runtime.persistGeneratedReport({
        clientId: client.id,
        payload,
        filters: {
          since: window.since,
          until: window.until,
          objective: settings.objective,
        },
      })

      await logger.log("INFO", "report_generated", {
        doctorName: client.name,
        clientId: client.id,
        reportId: persistedReport.reportId,
      })

      await runtime.sendPersistedReportNow(persistedReport.reportId, {
        mode: settings.sendMode,
        groupId: settings.groupId,
        authorization: {
          type: "scheduled-automation",
          source: "weekly",
        },
      })

      sentCount += 1
      console.log(`[OK] ${client.name}: relatorio enviado com sucesso.`)
      await logger.log("INFO", "doctor_sent", {
        doctorName: client.name,
        clientId: client.id,
        reportId: persistedReport.reportId,
        referenceWeek,
        whatsappGroupId: maskedGroupId,
      })
    } catch (error) {
      failedCount += 1
      const message =
        error instanceof Error ? error.message : "Erro ao executar automacao"
      console.log(`[ERRO] ${client.name}: ${message}`)
      await logger.log("ERROR", "doctor_failed", {
        doctorName: client.name,
        clientId: client.id,
        referenceWeek,
        whatsappGroupId: maskedGroupId,
        error: message,
      })
    }
  }

  console.log(
    "Resumo da execucao:"
      + ` processados=${selectedClients.length},`
      + ` enviados=${sentCount},`
      + ` pulados=${skippedCount},`
      + ` falhas=${failedCount}.`
  )

  await logger.log("INFO", "run_finished", {
    summary: {
      processed: selectedClients.length,
      sent: sentCount,
      skipped: skippedCount,
      failed: failedCount,
      dryRun: false,
      referenceWeek,
    },
  })

  await runtime.prisma.$disconnect()
  return failedCount > 0 ? 1 : 0
}

async function main() {
  return runWeeklyDoctorReports(parseCliArgs())
}

function isExecutedDirectly() {
  const executedPath = process.argv[1]

  if (!executedPath) {
    return false
  }

  return import.meta.url === pathToFileURL(executedPath).href
}

if (isExecutedDirectly()) {
  try {
    process.exit(await main())
  } catch (error) {
    console.error(
      `[ERRO] ${error instanceof Error ? error.message : "Falha inesperada na automacao"}`
    )
    process.exit(1)
  }
}
