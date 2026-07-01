import { NextResponse } from "next/server"
import { canAccessClient, getCurrentUser } from "@/lib/authorization"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { prisma } from "@/lib/prisma"
import { sendPersistedReportNow } from "@/lib/report-delivery"
import {
  generateLiveReportPayload,
  persistGeneratedReport,
} from "@/lib/report-service"
import { logError } from "@/lib/safe-logger"
import {
  getReportValidationMessage,
  reportRequestSchema,
} from "@/lib/validations/report.schema"
import type { ReportSendRequest, ReportSendResponse } from "@/types/report.types"

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
    const requestBody = (await request.json()) as Record<string, unknown> & ReportSendRequest
    const parsedBody = reportRequestSchema.safeParse({
      ...requestBody,
      clientId: id,
    })

    if (!parsedBody.success) {
      return NextResponse.json(
        { error: getReportValidationMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const { clientId, since, until, objective } = parsedBody.data
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      include: { manager: true },
    })

    if (!client) {
      return NextResponse.json({ error: "Cliente não encontrado" }, { status: 404 })
    }

    if (!canAccessClient(user, client.managerId)) {
      return NextResponse.json(
        { error: "Acesso negado a este cliente" },
        { status: 403 }
      )
    }

    if (!client.whatsappGroupId) {
      return NextResponse.json(
        { error: "Cliente sem grupo de WhatsApp configurado" },
        { status: 400 }
      )
    }

    const payload = await generateLiveReportPayload({
      user,
      client,
      filters: {
        since,
        until,
        objective,
      },
    })
    const evolutionInstance = await resolveUserEvolutionInstance(user)
    const savedReport = await persistGeneratedReport({
      clientId,
      payload,
      filters: {
        since,
        until,
        objective,
      },
    })

    await sendPersistedReportNow(savedReport.reportId, {
      mode: requestBody.mode,
      message: requestBody.message,
      instance: evolutionInstance,
      authorization: {
        type: "manual-whatsapp-button",
      },
    })

    return NextResponse.json<ReportSendResponse>({
      ok: true,
      queued: false,
      reportId: savedReport.reportId,
      jobId: null,
      status: "SENT",
    })
  } catch (error) {
    logError("clients.send-report.post", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
