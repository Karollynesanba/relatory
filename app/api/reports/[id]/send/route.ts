import { NextResponse } from "next/server"
import { canAccessClient, getCurrentUser } from "@/lib/authorization"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { parseStoredReportPayload } from "@/lib/report-domain"
import { sendPersistedReportNow } from "@/lib/report-delivery"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/safe-logger"
import type { ReportSendRequest } from "@/types/report.types"
import type { Prisma } from "@prisma/client"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "Não autorizado" }, { status: 401 })
    }

    const { id } = await params
    const report = await prisma.report.findUnique({
      where: { id },
      include: {
        client: {
          select: {
            id: true,
            name: true,
            managerId: true,
            whatsappGroupId: true,
            reportSchedule: {
              select: {
                groupId: true,
              },
            },
          },
        },
        sendLogs: {
          select: {
            attemptNumber: true,
          },
          orderBy: {
            attemptNumber: "desc",
          },
          take: 1,
        },
      },
    })

    if (!report) {
      return NextResponse.json(
        { error: "Relatório não encontrado" },
        { status: 404 }
      )
    }

    if (!canAccessClient(user, report.client.managerId)) {
      return NextResponse.json(
        { error: "Acesso negado a este relatório" },
        { status: 403 }
      )
    }

    const payload = parseStoredReportPayload(report.payloadJson)

    if (!payload) {
      return NextResponse.json(
        { error: "Relatório ainda esta em processamento" },
        { status: 409 }
      )
    }

    const body = (await request.json().catch(() => ({}))) as ReportSendRequest
    if (body.presentation) {
      await prisma.report.update({
        where: { id: report.id },
        data: {
          payloadJson: {
            ...(report.payloadJson as Record<string, unknown>),
            presentation: body.presentation,
          } as Prisma.InputJsonValue,
        },
      })
    }

    const targetGroupId =
      body.groupId?.trim() ||
      report.client.reportSchedule?.groupId?.trim() ||
      report.client.whatsappGroupId?.trim()
    const evolutionInstance = await resolveUserEvolutionInstance(user)

    if (!targetGroupId) {
      return NextResponse.json(
        { error: "Cliente sem grupo de WhatsApp configurado" },
        { status: 400 }
      )
    }

    const delivery = await sendPersistedReportNow(report.id, {
      mode: body.mode,
      message: body.message,
      pdfBase64: body.pdfBase64,
      pdfFileName: body.pdfFileName,
      groupId: targetGroupId,
      instance: evolutionInstance,
      authorization: {
        type: "manual-whatsapp-button",
      },
    })

    return NextResponse.json(
      {
        ok: true,
        queued: false,
        reportId: report.id,
        jobId: null,
        status: delivery.status,
      },
      { status: 200 }
    )
  } catch (error) {
    logError("reports.send.unhandled", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
