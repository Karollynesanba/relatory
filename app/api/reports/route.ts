import { after, NextResponse } from "next/server"
import {
  getCurrentUser,
  scopeClientWhere,
} from "@/lib/authorization"
import { prisma } from "@/lib/prisma"
import { processQueuedReportSafely } from "@/lib/report-processing"
import {
  generateLiveReportPayload,
  queueReportGeneration,
} from "@/lib/report-service"
import { logError } from "@/lib/safe-logger"
import {
  getReportValidationMessage,
  reportQuerySchema,
  reportRequestSchema,
} from "@/lib/validations/report.schema"
import type { ApiErrorResponse } from "@/types/api.types"
import type { QueuedReportResponse } from "@/types/report.types"

export const maxDuration = 300

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Não autorizado" },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const parsedQuery = reportQuerySchema.safeParse({
      clientId: searchParams.get("clientId"),
      since: searchParams.get("since"),
      until: searchParams.get("until"),
      objective: searchParams.get("objective"),
    })

    if (!parsedQuery.success) {
      return NextResponse.json<ApiErrorResponse>(
        { error: getReportValidationMessage(parsedQuery.error) },
        { status: 400 }
      )
    }

    const { clientId, since, until, objective } = parsedQuery.data
    const client = await prisma.client.findFirst({
      where: scopeClientWhere(user, { id: clientId }),
      include: { manager: true },
    })

    if (!client) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Acesso negado a este cliente" },
        { status: 403 }
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

    return NextResponse.json(payload)
  } catch (error) {
    logError("reports.get", error)
    return NextResponse.json<ApiErrorResponse>(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Não autorizado" },
        { status: 401 }
      )
    }

    const parsedBody = reportRequestSchema.safeParse(await request.json())

    if (!parsedBody.success) {
      return NextResponse.json<ApiErrorResponse>(
        { error: getReportValidationMessage(parsedBody.error) },
        { status: 400 }
      )
    }

    const { clientId, since, until, objective, presentation } = parsedBody.data
    const client = await prisma.client.findFirst({
      where: scopeClientWhere(user, { id: clientId }),
      include: { manager: true },
    })

    if (!client) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "Acesso negado a este cliente" },
        { status: 403 }
      )
    }

    const report = await queueReportGeneration({
      clientId,
      filters: {
        since,
        until,
        objective,
      },
      requestedByUserId: user.id,
      presentation,
    })

    after(() => processQueuedReportSafely(report.id))

    return NextResponse.json<QueuedReportResponse>(
      {
        reportId: report.id,
        status: report.status,
        generatedAt: report.generatedAt.toISOString(),
        referenceWeek: report.referenceWeek.toISOString(),
        queued: true,
      },
      { status: 202 }
    )
  } catch (error) {
    logError("reports.post", error)
    return NextResponse.json<ApiErrorResponse>(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
