import { after, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { getCurrentUser, isAdmin } from "@/lib/authorization"
import { loadEvolutionCatalog } from "@/lib/evolution-api"
import { prisma } from "@/lib/prisma"
import {
  getHistoryStatusFilter,
  mapReportToHistoryRow,
  mapScheduleToHistoryRow,
} from "@/lib/report-domain"
import { runDueReportScheduleSweep } from "@/lib/report-schedule-fallback"
import { resolveUserEvolutionInstance } from "@/lib/evolution-preference"
import { logError } from "@/lib/safe-logger"

const HISTORY_GROUP_LOOKUP_TIMEOUT_MS = 5_000
const HISTORY_REPORT_LIMIT = 500

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
) {
  return await Promise.race([
    promise,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs)
    }),
  ])
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: "NÃ£o autorizado" }, { status: 401 })
    }
    const userEvolutionInstance = await resolveUserEvolutionInstance(user.id)

    after(() => {
      void runDueReportScheduleSweep({
        source: "history-route",
        limit: 10,
      }).catch((error) => {
        logError("history.sweep", error)
      })
    })

    const { searchParams } = new URL(request.url)
    const status = getHistoryStatusFilter(searchParams.get("status"))
    const clientId = searchParams.get("clientId")

    const where: Prisma.ReportWhereInput = {
    }

    if (status) {
      where.status = status
    }

    if (clientId) {
      where.clientId = clientId
    }

    if (!isAdmin(user)) {
      where.client = {
        managerId: user.id,
      }
    }

    const clientWhere: Prisma.ClientWhereInput = {
      reportSchedule: {
        isNot: null,
      },
    }

    if (!isAdmin(user)) {
      clientWhere.managerId = user.id
    }

    if (clientId) {
      clientWhere.id = clientId
    }

    const reportsPromise = prisma.report.findMany({
      where,
      orderBy: { generatedAt: "desc" },
      take: HISTORY_REPORT_LIMIT,
      include: {
        client: {
          select: {
            name: true,
            company: true,
            whatsappGroupId: true,
          },
        },
        sendLogs: {
          select: {
            attemptNumber: true,
            sentAt: true,
            errorMessage: true,
          },
          orderBy: { attemptNumber: "desc" },
        },
      },
    })

    const clientsWithSchedulesPromise = prisma.client.findMany({
      where: clientWhere,
      select: {
        id: true,
        name: true,
        company: true,
        whatsappGroupId: true,
        reportSchedule: true,
        reports: {
          orderBy: {
            generatedAt: "desc",
          },
          take: 5,
          select: {
            generatedAt: true,
          },
        },
      },
    })

    const groupsPromise = withTimeout(
      userEvolutionInstance
        ? loadEvolutionCatalog({ groupInstances: [userEvolutionInstance] }).then(
            (catalog) => catalog.groups
          )
        : Promise.resolve([]),
      HISTORY_GROUP_LOOKUP_TIMEOUT_MS,
      []
    ).catch((error) => {
      logError("history.groups", error)
      return []
    })

    const [reports, clientsWithSchedules, groups] = await Promise.all([
      reportsPromise,
      clientsWithSchedulesPromise,
      groupsPromise,
    ])

    const groupNameById = new Map(
      groups
        .filter((group) => Boolean(group.id))
        .map((group) => [group.id, group.subject])
    )

    const historyRows = [
      ...reports.map((report) => ({
        row: mapReportToHistoryRow(report),
        sortAt: report.generatedAt,
      })),
      ...clientsWithSchedules.flatMap((client) => {
        if (!client.reportSchedule) {
          return []
        }

        const hasReportAfterSchedule = client.reports.some(
          (report) =>
            report.generatedAt.getTime() >= client.reportSchedule!.createdAt.getTime()
        )

        if (hasReportAfterSchedule) {
          return []
        }

        const groupId =
          client.reportSchedule.groupId?.trim() || client.whatsappGroupId || null
        const groupName = groupId ? groupNameById.get(groupId) ?? null : null

        return [
          {
            row: mapScheduleToHistoryRow(
              client.reportSchedule,
              {
                name: client.name,
                company: client.company,
                whatsappGroupId: client.whatsappGroupId,
              },
              groupName
            ),
            sortAt: client.reportSchedule.createdAt,
          },
        ]
      }),
    ]
      .sort((left, right) => right.sortAt.getTime() - left.sortAt.getTime())
      .map(({ row }) => ({
        ...row,
        groupName: row.groupId
          ? groupNameById.get(row.groupId) ?? row.groupName
          : row.groupName,
      }))

    return NextResponse.json(historyRows)
  } catch (error) {
    logError("history.get", error)
    return NextResponse.json(
      {
        error: "Falha ao carregar histÃ³rico",
        detail:
          "NÃ£o foi possÃ­vel recuperar o histÃ³rico de relatÃ³rios neste momento.",
      },
      { status: 500 }
    )
  }
}
