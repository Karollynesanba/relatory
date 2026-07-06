import { Prisma } from "@prisma/client"
import type { Client, User } from "@prisma/client"
import {
  buildMetaTimeRange,
  getMetaCampaigns,
  getMetaInsights,
  MetaApiError,
} from "@/lib/meta-api"
import {
  getStoredMetaTokenHealth,
  type MetaTokenOwner,
} from "@/lib/meta-token-status"
import { getMetaAccessTokenFromEnv } from "@/lib/meta-token"
import { prisma } from "@/lib/prisma"
import {
  aggregateCampaignInsights,
  filterReportCampaignsByClientCampaigns,
} from "@/lib/report-campaign-filters"
import {
  buildPendingReportJobPayload,
  buildReferenceWeekDate,
  buildStoredReportPayload,
  parsePendingReportJobPayload,
  serializeStoredReportPayload,
  parseStoredReportPayload,
} from "@/lib/report-domain"
import { resolveReportAutomationWindow } from "@/lib/report-automation"
import { logWarn } from "@/lib/safe-logger"
import type {
  PendingReportSendOptions,
  ReportAction,
  ReportClient,
  ReportGenerationResponse,
  ReportPayload,
  ReportPresentationOptions,
} from "@/types/report.types"

type ReportUser = Pick<User, "id" | "metaAccessToken" | "metaTokenExpiresAt">

type ClientWithManager = Pick<
  Client,
  "id" | "name" | "company" | "adAccountId" | "managerId"
> & {
  manager: Pick<User, "id" | "metaAccessToken" | "metaTokenExpiresAt"> | null
}

type ReportFiltersInput = {
  since: string
  until: string
  objective: string
}

type QueueReportGenerationParams = {
  clientId: string
  filters: ReportFiltersInput
  requestedByUserId: string
  enqueueSendOnComplete?: boolean
  scheduledSendAt?: string | null
  sendOptions?: PendingReportSendOptions | null
  presentation?: ReportPresentationOptions | null
  source?: "manual" | "schedule" | "weekly"
}

function normalizeScheduledSendAt(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function buildQueuedReportPendingJob(params: QueueReportGenerationParams) {
  return {
    queuedAt: new Date().toISOString(),
    scheduledSendAt: normalizeScheduledSendAt(params.scheduledSendAt),
    requestedByUserId: params.requestedByUserId,
    source: params.source ?? "manual",
    filters: params.filters,
    enqueueSendOnComplete: params.enqueueSendOnComplete ?? false,
    sendOptions: params.sendOptions ?? null,
    presentation: params.presentation ?? null,
  }
}

function sameSendOptions(
  left: PendingReportSendOptions | null | undefined,
  right: PendingReportSendOptions | null | undefined
) {
  return (
    (left?.mode ?? null) === (right?.mode ?? null) &&
    (left?.message ?? null) === (right?.message ?? null) &&
    (left?.groupId ?? null) === (right?.groupId ?? null)
  )
}

function sameReportFilters(
  left:
    | {
        since: string
        until: string
        objective: string
      }
    | null
    | undefined,
  right: {
    since: string
    until: string
    objective: string
  }
) {
  return (
    left?.since === right.since &&
    left?.until === right.until &&
    left?.objective === right.objective
  )
}

export function shouldReuseExistingReportByFilters(
  existing:
    | {
        status: "PENDING" | "SENT" | "FAILED" | "CANCELLED"
        payloadJson: unknown
      }
    | null,
  candidateFilters: {
    since: string
    until: string
    objective: string
  }
) {
  if (
    !existing ||
    existing.status === "PENDING" ||
    existing.status === "FAILED" ||
    existing.status === "CANCELLED"
  ) {
    return false
  }

  const existingStoredPayload = parseStoredReportPayload(
    existing.payloadJson as Prisma.JsonValue | null
  )
  const existingPendingJob = parsePendingReportJobPayload(
    existing.payloadJson as Prisma.JsonValue | null
  )
  const existingFilters =
    existingStoredPayload?.filters ?? existingPendingJob?.filters ?? null

  return sameReportFilters(existingFilters, candidateFilters)
}

export function shouldReuseAutomatedQueuedReport(
  existing:
    | {
        status: "PENDING" | "SENT" | "FAILED" | "CANCELLED"
        payloadJson: unknown
      }
    | null,
  candidate: ReturnType<typeof buildQueuedReportPendingJob>
) {
  if (!existing || candidate.source === "manual") {
    return false
  }

  if (existing.status === "SENT") {
    return true
  }

  if (existing.status !== "PENDING") {
    return false
  }

  const existingPendingJob = parsePendingReportJobPayload(
    existing.payloadJson as Parameters<typeof parsePendingReportJobPayload>[0]
  )

  if (!existingPendingJob || existingPendingJob.source !== candidate.source) {
    return false
  }

  return (
    existingPendingJob.filters.since === candidate.filters.since &&
    existingPendingJob.filters.until === candidate.filters.until &&
    existingPendingJob.filters.objective === candidate.filters.objective &&
    existingPendingJob.enqueueSendOnComplete === candidate.enqueueSendOnComplete &&
    (existingPendingJob.scheduledSendAt ?? null) ===
      (candidate.scheduledSendAt ?? null) &&
    sameSendOptions(existingPendingJob.sendOptions, candidate.sendOptions)
  )
}

function buildClientPayload(client: ClientWithManager): ReportClient {
  return {
    id: client.id,
    name: client.name,
    company: client.company,
    adAccountId: client.adAccountId,
  }
}

function isActiveMetaCampaign(campaign: { status?: string | null }) {
  return campaign.status === "ACTIVE"
}

function buildMetaTokenOwners(user: ReportUser, client: ClientWithManager) {
  return [
    {
      id: client.manager?.id ?? user.id,
      metaAccessToken: client.manager?.metaAccessToken ?? null,
      metaTokenExpiresAt: client.manager?.metaTokenExpiresAt ?? null,
    },
    {
      id: user.id,
      metaAccessToken: user.metaAccessToken,
      metaTokenExpiresAt: user.metaTokenExpiresAt,
    },
  ] satisfies MetaTokenOwner[]
}

function isMetaPermissionError(error: unknown) {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()

  return (
    error instanceof MetaApiError
    && (
      message.includes("ads_management")
      || message.includes("ads_read")
      || message.includes("ad account owner has not grant")
      || message.includes("permissions-and-features")
    )
  )
}

async function resolveMetaTokenCandidates(user: ReportUser, client: ClientWithManager) {
  const owners = buildMetaTokenOwners(user, client)
  const candidates: Array<{
    ownerId: string | null
    token: string
    source: "database" | "environment"
  }> = []
  const seen = new Set<string>()

  for (let index = 0; index < owners.length; index += 1) {
    const owner = owners[index]

    if (!owner.metaAccessToken?.trim()) {
      continue
    }

    const health = await getStoredMetaTokenHealth({
      storedToken: owner.metaAccessToken,
      storedExpiresAt: owner.metaTokenExpiresAt,
      forceRemote: index > 0,
    })

    if (!health.ok || !health.token) {
      continue
    }

    if (seen.has(health.token)) {
      continue
    }

    seen.add(health.token)
    candidates.push({
      ownerId: owner.id,
      token: health.token,
      source: "database",
    })
  }

  const environmentToken = getMetaAccessTokenFromEnv()

  if (environmentToken && !seen.has(environmentToken)) {
    candidates.push({
      ownerId: null,
      token: environmentToken,
      source: "environment",
    })
  }

  if (!candidates.length) {
    throw new Error("Token META nÃ£o configurado")
  }

  return candidates
}

async function buildLiveReportPayloadWithToken(params: {
  client: ClientWithManager
  filters: ReportFiltersInput
  token: string
}) {
  const { client, filters, token } = params
  const timeRange = buildMetaTimeRange(filters.since, filters.until)
  const campaignFields = [
    "id",
    "name",
    "status",
    "objective",
    "insights{spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values}",
  ].join(",")
  const filtering =
    filters.objective !== "ALL"
      ? JSON.stringify([
          {
            field: "objective",
            operator: "IN",
            value: [filters.objective],
          },
        ])
      : undefined

  const [
    campaigns,
    campaignInsights,
    accountInsights,
    dailyInsights,
    topAds,
    genderBreakdown,
  ] = await Promise.all([
    getMetaCampaigns({
      adAccountId: client.adAccountId!,
      token,
      fields: campaignFields,
      limit: 50,
      timeRange,
      filtering,
    }),
    getMetaInsights({
      objectId: client.adAccountId!,
      token,
      fields:
        "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values",
      timeRange,
      level: "campaign",
    }),
    getMetaInsights({
      objectId: client.adAccountId!,
      token,
      fields:
        "spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values",
      timeRange,
      level: "account",
    }),
    getMetaInsights({
      objectId: client.adAccountId!,
      token,
      fields: "spend,impressions,clicks,actions",
      timeRange,
      timeIncrement: 1,
    }),
    getMetaInsights({
      objectId: client.adAccountId!,
      token,
      fields: "ad_id,ad_name,spend,impressions,reach,clicks,actions",
      timeRange,
      level: "ad",
      limit: 20,
    }),
    getMetaInsights({
      objectId: client.adAccountId!,
      token,
      fields: "spend,impressions,reach,clicks,actions",
      timeRange,
      breakdowns: "gender",
      limit: 20,
    }),
  ])

  const campaignInsightsById = new Map(
    campaignInsights
      .filter((insight) => Boolean(insight.campaign_id?.trim()))
      .map((insight) => [insight.campaign_id?.trim() ?? "", insight])
  )

  const reportCampaigns = campaigns as ReportPayload["campaigns"]

  const campaignsWithInsights = reportCampaigns
    .filter((campaign) => Boolean(campaign.id?.trim()))
    .map((campaign) => ({
      ...campaign,
      insights: {
        data: [
          campaignInsightsById.get(campaign.id?.trim() ?? "") ??
            campaign.insights?.data?.[0] ??
            {},
        ],
      },
    }))

  const campaignsMatchingObjective =
    filters.objective === "ALL"
      ? campaignsWithInsights
      : campaignsWithInsights.filter(
          (campaign) => campaign.objective === filters.objective
        )

  const activeCampaigns = await prisma.clientCampaign.findMany({
    where: {
      clientId: client.id,
      isActive: true,
    },
    select: {
      campaignIdMeta: true,
      isActive: true,
    },
  })

  const resolvedCampaigns = filterReportCampaignsByClientCampaigns(
    campaignsMatchingObjective as ReportPayload["campaigns"],
    activeCampaigns
  )

  const resolvedAccountInsights = (accountInsights[0] ??
    aggregateCampaignInsights(resolvedCampaigns)) as NonNullable<
    ReportPayload["accountInsights"]
  >

  return {
    campaigns: resolvedCampaigns,
    accountInsights: resolvedAccountInsights,
    dailyInsights,
    topAds,
    genderBreakdown,
  }
}

export async function generateLiveReportPayload(params: {
  user: ReportUser
  client: ClientWithManager
  filters: ReportFiltersInput
}): Promise<ReportPayload> {
  const { user, client, filters } = params

  if (!client.adAccountId) {
    throw new Error("Cliente sem conta META configurada")
  }

  const candidates = await resolveMetaTokenCandidates(user, client)
  let lastError: unknown = null
  let resolvedPayload: Awaited<
    ReturnType<typeof buildLiveReportPayloadWithToken>
  > | null = null

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]

    try {
      resolvedPayload = await buildLiveReportPayloadWithToken({
        client,
        filters,
        token: candidate.token,
      })
      lastError = null
      break
    } catch (error) {
      lastError = error

      if (!isMetaPermissionError(error) || index === candidates.length - 1) {
        throw error
      }

      logWarn("report-service.meta-token-fallback", {
        clientId: client.id,
        adAccountId: client.adAccountId,
        candidateOwnerId: candidate.ownerId,
        candidateSource: candidate.source,
        reason: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (lastError) {
    throw lastError
  }

  if (!resolvedPayload) {
    throw new Error("NÃ£o foi possÃ­vel gerar o relatÃ³rio com os tokens META disponÃ­veis")
  }

  return {
    client: buildClientPayload(client),
    campaigns: (resolvedPayload.campaigns as ReportPayload["campaigns"]).filter(
      isActiveMetaCampaign
    ),
    accountInsights: resolvedPayload.accountInsights,
    dailyInsights: resolvedPayload.dailyInsights as ReportPayload["dailyInsights"],
    topAds: resolvedPayload.topAds
      .slice()
      .sort(
        (left, right) =>
          Number.parseFloat(right.impressions ?? "0") -
          Number.parseFloat(left.impressions ?? "0")
      )
      .slice(0, 5)
      .map((ad) => ({
        id: ad.ad_id ?? crypto.randomUUID(),
        name: ad.ad_name ?? "Anúncio sem nome",
        impressions: ad.impressions,
        reach: ad.reach,
        clicks: ad.clicks,
        spend: ad.spend,
        actions: ad.actions as ReportAction[] | undefined,
      })),
    genderBreakdown: resolvedPayload.genderBreakdown.map((row) => ({
      dimension: row.gender ?? "não informado",
      spend: row.spend,
      impressions: row.impressions,
      reach: row.reach,
      clicks: row.clicks,
      actions: row.actions as ReportAction[] | undefined,
    })),
  }
}

export async function persistGeneratedReport(params: {
  clientId: string
  payload: ReportPayload
  filters: ReportFiltersInput
}): Promise<ReportGenerationResponse> {
  const generatedAt = new Date()
  const referenceWeek = buildReferenceWeekDate(params.filters.since)
  const storedPayload = buildStoredReportPayload(
    params.payload,
    params.filters,
    generatedAt
  )
  const report = await prisma.report.upsert({
    where: {
      clientId_referenceWeek: {
        clientId: params.clientId,
        referenceWeek,
      },
    },
    create: {
      clientId: params.clientId,
      referenceWeek,
      status: "PENDING",
      payloadJson: serializeStoredReportPayload(storedPayload),
    },
    update: {
      generatedAt,
      status: "PENDING",
      payloadJson: serializeStoredReportPayload(storedPayload),
    },
  })

  return {
    ...params.payload,
    reportId: report.id,
    generatedAt: report.generatedAt.toISOString(),
    referenceWeek: report.referenceWeek.toISOString(),
  }
}

export async function queueReportGeneration(params: QueueReportGenerationParams) {
  const referenceWeek = buildReferenceWeekDate(params.filters.since)
  const pendingJob = buildQueuedReportPendingJob(params)

  return prisma.$transaction(async (tx) => {
    const existing = await tx.report.findUnique({
      where: {
        clientId_referenceWeek: {
          clientId: params.clientId,
          referenceWeek,
        },
      },
      select: {
        id: true,
        clientId: true,
        referenceWeek: true,
        generatedAt: true,
        status: true,
        payloadJson: true,
      },
    })

    if (shouldReuseExistingReportByFilters(existing, pendingJob.filters)) {
      if (!existing) {
        throw new Error("Falha ao reaproveitar o relatorio existente.")
      }

      return existing
    }

    if (shouldReuseAutomatedQueuedReport(existing, pendingJob)) {
      if (!existing) {
        throw new Error("Falha ao reaproveitar o relatorio pendente.")
      }

      return existing
    }

    if (existing) {
      return tx.report.update({
        where: {
          id: existing.id,
        },
        data: {
          generatedAt: new Date(),
          status: "PENDING",
          payloadJson: buildPendingReportJobPayload(pendingJob),
        },
      })
    }

    return tx.report.create({
      data: {
        clientId: params.clientId,
        referenceWeek,
        status: "PENDING",
        payloadJson: buildPendingReportJobPayload(pendingJob),
      },
    })
  })
}

export function buildLastCompletedWeekRange(
  timezone = "UTC",
  referenceDate = new Date()
) {
  return resolveReportAutomationWindow({
    timezone,
    referenceDate,
  })
}
