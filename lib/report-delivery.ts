import { buildReportPdfBufferWithFallback } from "@/lib/report-pdf-fallback"
import { buildStandardReportPdfBuffer } from "@/lib/report-pdf-standard"
import { buildReportPdfFileName } from "@/lib/report-pdf-shared"
import {
  buildWhatsAppReportMessage,
} from "@/lib/report-message"
import { parseStoredReportPayload } from "@/lib/report-domain"
import {
  resolveEvolutionInstanceForDestination,
  sendWhatsAppDocument,
  sendWhatsAppText,
} from "@/lib/evolution-api"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/safe-logger"
import { normalizeWhatsAppGroupId } from "@/lib/whatsapp-group"
import type {
  PendingReportSource,
  ReportSendMode,
  ReportStatusValue,
} from "@/types/report.types"

export type ReportSendAuthorization =
  | {
      type: "manual-whatsapp-button"
    }
  | {
      type: "scheduled-automation"
      source: PendingReportSource
    }

type SendPersistedReportOptions = {
  mode?: ReportSendMode
  message?: string | null
  pdfBase64?: string | null
  pdfFileName?: string | null
  groupId?: string | null
  instance?: string | null
  pdfStrategy?: "auto" | "preview" | "standard"
  deferReportStatusUpdate?: boolean
  preventDuplicateSends?: boolean
  authorization: ReportSendAuthorization
}

type SendPersistedReportResult = {
  reportId: string
  status: ReportStatusValue
  mode: ReportSendMode
  duplicatePrevented?: boolean
  duplicateReason?: "already-sent" | "in-flight"
}

function parseWhatsAppGroupTarget(value: string | null | undefined) {
  const rawValue = value?.trim()

  if (!rawValue) {
    return null
  }

  const separatorIndex = rawValue.indexOf("::")
  const instance =
    separatorIndex >= 0 ? rawValue.slice(0, separatorIndex).trim() : null
  const groupId =
    separatorIndex >= 0
      ? rawValue.slice(separatorIndex + 2).trim()
      : rawValue
  const normalizedGroupId = normalizeWhatsAppGroupId(groupId)

  if (!normalizedGroupId) {
    return null
  }

  return {
    groupId: normalizedGroupId,
    instance: instance || null,
  }
}

function resolveReportMessage(params: {
  reportId: string
  payload: NonNullable<ReturnType<typeof parseStoredReportPayload>>
  message?: string | null
}) {
  const customMessage = params.message?.trim()

  if (customMessage) {
    return customMessage
  }

  return buildWhatsAppReportMessage({
    reportId: params.reportId,
    payload: params.payload,
  })
}

export function isAutomaticSendAllowed(source: PendingReportSource) {
  return source === "schedule" || source === "weekly"
}

export function assertReportSendAuthorized(
  authorization: ReportSendAuthorization
) {
  if (authorization.type === "manual-whatsapp-button") {
    return
  }

  if (!isAutomaticSendAllowed(authorization.source)) {
    throw new Error(
      "Envio automatico bloqueado: so e permitido para relatorios agendados."
    )
  }
}

export async function sendPersistedReportNow(
  reportId: string,
  options?: SendPersistedReportOptions
): Promise<SendPersistedReportResult> {
  if (!options?.authorization) {
    throw new Error("Origem do envio nao informada.")
  }

  assertReportSendAuthorized(options.authorization)

  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          whatsappGroupId: true,
        },
      },
      sendLogs: {
        select: {
          attemptNumber: true,
          status: true,
          sentAt: true,
        },
        orderBy: {
          attemptNumber: "desc",
        },
        take: 5,
      },
    },
  })

  if (!report) {
    throw new Error("Relatório não encontrado para envio")
  }

  const payload = parseStoredReportPayload(report.payloadJson)

  if (!payload) {
    throw new Error("Relatório ainda não foi gerado")
  }

  const targetGroup =
    parseWhatsAppGroupTarget(options?.groupId)
    ?? parseWhatsAppGroupTarget(report.client.whatsappGroupId)

  if (!targetGroup) {
    throw new Error("Cliente sem grupo de WhatsApp configurado")
  }

  const currentStatus = await prisma.report.findUnique({
    where: { id: report.id },
    select: { status: true },
  })

  if (currentStatus?.status === "CANCELLED") {
    throw new Error("Relatório cancelado")
  }

  const mode = options?.mode ?? "PDF_AND_MESSAGE"
  const pdfStrategy = options?.pdfStrategy ?? "auto"
  const preferredInstance = targetGroup.instance ?? options?.instance ?? null
  const resolvedInstance = await resolveEvolutionInstanceForDestination(
    targetGroup.groupId,
    preferredInstance
  )
  const latestSuccessfulSend = report.sendLogs.find(
    (sendLog) => sendLog.status === "OK" && Boolean(sendLog.sentAt)
  )
  const hasPendingSend = report.sendLogs.some(
    (sendLog) => sendLog.status === "PENDING"
  )

  if (options?.preventDuplicateSends) {
    if (currentStatus?.status === "SENT" || latestSuccessfulSend) {
      return {
        reportId: report.id,
        status: "SENT",
        mode,
        duplicatePrevented: true,
        duplicateReason: "already-sent",
      }
    }

    if (hasPendingSend) {
      return {
        reportId: report.id,
        status: "PENDING",
        mode,
        duplicatePrevented: true,
        duplicateReason: "in-flight",
      }
    }
  }

  const attemptNumber = (report.sendLogs[0]?.attemptNumber ?? 0) + 1
  const sendLog = await prisma.sendLog.create({
    data: {
      reportId: report.id,
      channel: "WHATSAPP_GROUP",
      attemptNumber,
      status: "PENDING",
    },
  })

  try {
    const message = resolveReportMessage({
      reportId: report.id,
      payload,
      message: options?.message,
    })

    if (mode === "PDF_AND_MESSAGE" || mode === "PDF_ONLY") {
      const pdfBuffer = options?.pdfBase64
        ? Buffer.from(options.pdfBase64, "base64")
        : pdfStrategy === "standard"
          ? buildStandardReportPdfBuffer({
              reportId: report.id,
              payload,
            })
          : await buildReportPdfBufferWithFallback({
              reportId: report.id,
              payload,
            })

      const fileName =
        options?.pdfFileName?.trim() ||
        `${buildReportPdfFileName({
          clientName: payload.client.name,
          startDate: payload.filters.since,
          endDate: payload.filters.until,
        })}.pdf`

      await sendWhatsAppDocument({
        number: targetGroup.groupId,
        fileName,
        contentBase64: pdfBuffer.toString("base64"),
        instance: preferredInstance,
        resolvedInstance,
      })
    }

    if (mode === "PDF_AND_MESSAGE" || mode === "MESSAGE_ONLY") {
      await sendWhatsAppText({
        number: targetGroup.groupId,
        text: message,
        instance: preferredInstance,
        resolvedInstance,
      })
    }

    if (options?.deferReportStatusUpdate) {
      await prisma.sendLog.update({
        where: { id: sendLog.id },
        data: {
          status: "OK",
          sentAt: new Date(),
          errorMessage: null,
        },
      })

      return {
        reportId: report.id,
        status: "SENT" as const,
        mode,
      }
    }

    const currentStatusAfterSend = await prisma.report.findUnique({
      where: { id: report.id },
      select: { status: true },
    })

    if (currentStatusAfterSend?.status === "CANCELLED") {
      await prisma.sendLog.update({
        where: { id: sendLog.id },
        data: {
          status: "FAILED",
          errorMessage: "Envio cancelado antes da confirmação final.",
        },
      })

      throw new Error("Relatório cancelado")
    }

    const updatedReport = await prisma.report.updateMany({
      where: {
        id: report.id,
        status: {
          not: "CANCELLED",
        },
      },
      data: {
        status: "SENT",
      },
    })

    if (updatedReport.count === 0) {
      await prisma.sendLog.update({
        where: { id: sendLog.id },
        data: {
          status: "FAILED",
          errorMessage: "Envio cancelado antes da confirmação final.",
        },
      })

      throw new Error("Relatório cancelado")
    }

    await prisma.sendLog.update({
      where: { id: sendLog.id },
      data: {
        status: "OK",
        sentAt: new Date(),
        errorMessage: null,
      },
    })

    return {
      reportId: report.id,
      status: "SENT" as const,
      mode,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erro ao enviar relatório"

    if (message === "Relatório cancelado") {
      throw error
    }

    logError("report-delivery.send-now", error, {
      reportId: report.id,
      sendLogId: sendLog.id,
      clientId: report.client.id,
      mode,
    })

    await prisma.$transaction([
      prisma.sendLog.update({
        where: { id: sendLog.id },
        data: {
          status: "FAILED",
          errorMessage: message,
        },
      }),
      prisma.report.updateMany({
        where: {
          id: report.id,
          status: {
            not: "CANCELLED",
          },
        },
        data: {
          status: "FAILED",
        },
      }),
    ])

    throw error
  }
}
