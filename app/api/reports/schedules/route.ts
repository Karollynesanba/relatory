import type { Prisma } from "@prisma/client"
import { NextResponse } from "next/server"
import {
  getCurrentUser,
  scopeSharedReportClientWhere,
} from "@/lib/authorization"
import { loadEvolutionCatalog } from "@/lib/evolution-api"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { prisma } from "@/lib/prisma"
import { parsePendingReportJobPayload } from "@/lib/report-domain"
import { serializeReportSchedule } from "@/lib/report-schedule"
import { logError } from "@/lib/safe-logger"
import type {
  ReportScheduleListItem,
  ReportScheduleStatusValue,
} from "@/types/report.types"

type ClientWithSchedule = Prisma.ClientGetPayload<{
  select: {
    id: true
    name: true
    company: true
    status: true
    whatsappGroupId: true
    reportSchedule: true
    reports: {
      orderBy: {
        generatedAt: "desc"
      }
      take: 5
      select: {
        id: true
        status: true
        generatedAt: true
        payloadJson: true
        sendLogs: {
          orderBy: {
            attemptNumber: "desc"
          }
          take: 5
          select: {
            status: true
            sentAt: true
            errorMessage: true
            attemptNumber: true
          }
        }
      }
    }
  }
}> 

function normalizeGroupId(groupId: string | null | undefined) {
  if (!groupId) {
    return null
  }

  const trimmed = groupId.trim()
  if (!trimmed) {
    return null
  }

  const separatorIndex = trimmed.indexOf("::")

  if (separatorIndex < 0) {
    return trimmed
  }

  return trimmed.slice(separatorIndex + 2).trim() || null
}

function findRelatedReport(client: ClientWithSchedule) {
  const schedule = client.reportSchedule

  if (!schedule) {
    return null
  }

  if (!schedule.lastRunAt) {
    return client.reports[0] ?? null
  }

  const lastRunAtMs = schedule.lastRunAt.getTime()
  const fiveMinutesMs = 5 * 60 * 1000

  return (
    client.reports.find((report) => {
      const reportTimeMs = report.generatedAt.getTime()

      return reportTimeMs >= lastRunAtMs - fiveMinutesMs
    }) ?? client.reports[0] ?? null
  )
}

function deriveScheduleStatus(client: ClientWithSchedule): Pick<
  ReportScheduleListItem,
  | "status"
  | "statusLabel"
  | "statusDetail"
  | "lastReportId"
  | "lastReportGeneratedAt"
  | "lastSendAttemptAt"
  | "lastSendError"
> {
  const schedule = client.reportSchedule

  if (!schedule) {
    return {
      status: "SCHEDULED",
      statusLabel: "Agendado",
      statusDetail: null,
      lastReportId: null,
      lastReportGeneratedAt: null,
      lastSendAttemptAt: null,
      lastSendError: null,
    }
  }

  const relatedReport = findRelatedReport(client)
  const pendingJob = relatedReport
    ? parsePendingReportJobPayload(relatedReport.payloadJson)
    : null
  const latestSendLog = relatedReport?.sendLogs[0] ?? null
  const lastSendAttemptAt =
    latestSendLog?.sentAt?.toISOString()
    ?? pendingJob?.lastAttemptAt
    ?? relatedReport?.generatedAt.toISOString()
    ?? null
  const lastSendError =
    latestSendLog?.errorMessage
    ?? pendingJob?.lastError
    ?? schedule.lastError
    ?? null

  let status: ReportScheduleStatusValue = "SCHEDULED"
  let statusLabel = "Agendado"
  let statusDetail =
    schedule.active
      ? `Próximo envio em ${schedule.nextRunAt.toLocaleString("pt-BR")}.`
      : "Aguardando uma nova configuração."

  if (relatedReport?.status === "PENDING" && pendingJob) {
    status = "IN_PROGRESS"
    statusLabel = "Em progresso"
    statusDetail =
      pendingJob.lastError && pendingJob.nextAttemptAt
        ? `Nova tentativa ${pendingJob.kind === "SEND" ? "de envio" : "de geração"} em ${new Date(pendingJob.nextAttemptAt).toLocaleString("pt-BR")}.`
        : pendingJob.kind === "SEND"
          ? "Relatório gerado, preparando envio automático."
          : "Relatório em processamento para envio."
  } else if (latestSendLog?.status === "FAILED" || relatedReport?.status === "FAILED" || schedule.lastError) {
    status = "FAILED"
    statusLabel = "Falhou"
    statusDetail = lastSendError || "O último envio automático falhou."
  } else if (latestSendLog?.status === "PENDING") {
    status = "IN_PROGRESS"
    statusLabel = "Em progresso"
    statusDetail = "Gerando PDF e enviando no WhatsApp."
  } else if (
    latestSendLog?.status === "OK" ||
    (relatedReport?.status === "SENT" && schedule.lastRunAt)
  ) {
    status = "SENT"
    statusLabel = "Enviado"
    statusDetail =
      latestSendLog?.sentAt
        ? `Último envio em ${latestSendLog.sentAt.toLocaleString("pt-BR")}.`
        : schedule.lastRunAt
          ? `Executado em ${schedule.lastRunAt.toLocaleString("pt-BR")}.`
          : "Último envio concluido com sucesso."
  } else if (!schedule.active && schedule.lastRunAt) {
    status = "SENT"
    statusLabel = "Enviado"
    statusDetail = `Executado em ${schedule.lastRunAt.toLocaleString("pt-BR")}.`
  } else if (schedule.active && schedule.nextRunAt.getTime() <= Date.now()) {
    status = "IN_PROGRESS"
    statusLabel = "Em progresso"
    statusDetail = "O horario chegou e a automacao esta processando."
  }

  return {
    status,
    statusLabel,
    statusDetail,
    lastReportId: relatedReport?.id ?? null,
    lastReportGeneratedAt: relatedReport?.generatedAt.toISOString() ?? null,
    lastSendAttemptAt,
    lastSendError,
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }
    const userEvolutionInstance = await resolveUserEvolutionInstance(user.id)

    const clients = await prisma.client.findMany({
      where: scopeSharedReportClientWhere(user, {
        reportSchedule: {
          isNot: null,
        },
      }),
      select: {
        id: true,
        name: true,
        company: true,
        status: true,
        whatsappGroupId: true,
        reportSchedule: true,
        reports: {
          orderBy: {
            generatedAt: "desc",
          },
          take: 5,
          select: {
            id: true,
            status: true,
            generatedAt: true,
            payloadJson: true,
            sendLogs: {
              orderBy: {
                attemptNumber: "desc",
              },
              take: 5,
              select: {
                status: true,
                sentAt: true,
                errorMessage: true,
                attemptNumber: true,
              },
            },
          },
        },
      },
    })

    let groupNameById = new Map<string, string>()

    try {
      const groups = userEvolutionInstance
        ? (await loadEvolutionCatalog({ groupInstances: [userEvolutionInstance] })).groups
        : []
      groupNameById = new Map(
        groups
          .filter((group) => Boolean(group.id))
          .map((group) => [group.id, group.subject])
      )
    } catch (error) {
      logError("reports.schedules.groups", error)
    }

    const schedules: ReportScheduleListItem[] = clients
      .flatMap((client) =>
        client.reportSchedule
          ? [
              {
                clientId: client.id,
                clientName: client.name,
                clientCompany: client.company,
                clientStatus: client.status,
                clientWhatsappGroupId: client.whatsappGroupId,
                clientWhatsappGroupName:
                  groupNameById.get(
                    normalizeGroupId(client.reportSchedule.groupId) ??
                      normalizeGroupId(client.whatsappGroupId) ??
                      ""
                  ) ?? null,
                schedule: serializeReportSchedule(client.reportSchedule),
                ...deriveScheduleStatus(client),
              },
            ]
          : []
      )
      .sort((left, right) => {
        if (left.schedule.active !== right.schedule.active) {
          return left.schedule.active ? -1 : 1
        }

        if (left.status !== right.status) {
          const order: Record<ReportScheduleStatusValue, number> = {
            IN_PROGRESS: 0,
            FAILED: 1,
            SCHEDULED: 2,
            SENT: 3,
          }

          return order[left.status] - order[right.status]
        }

        const leftTime = new Date(
          left.schedule.active ? left.schedule.nextRunAt : left.schedule.updatedAt
        ).getTime()
        const rightTime = new Date(
          right.schedule.active ? right.schedule.nextRunAt : right.schedule.updatedAt
        ).getTime()

        return rightTime - leftTime
      })

    return NextResponse.json({ schedules })
  } catch (error) {
    logError("reports.schedules.get", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}
