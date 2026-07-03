import type { ReportAction, ReportCampaign, ReportInsight } from "@/types/report.types"

type ClientCampaignFilter = {
  campaignIdMeta: string
  isActive: boolean
}

function parseNumber(value?: string) {
  return Number.parseFloat(value ?? "0") || 0
}

function sumActionEntries(actions: ReportAction[] | undefined) {
  const totals = new Map<string, number>()

  for (const action of actions ?? []) {
    const actionType = action.action_type?.trim()

    if (!actionType) {
      continue
    }

    totals.set(
      actionType,
      (totals.get(actionType) ?? 0) + parseNumber(action.value)
    )
  }

  return Array.from(totals.entries()).map(([action_type, value]) => ({
    action_type,
    value: String(value),
  }))
}

export function getActiveClientCampaignIds(
  clientCampaigns: ClientCampaignFilter[] | null | undefined
) {
  return new Set(
    (clientCampaigns ?? [])
      .filter((campaign) => campaign.isActive && campaign.campaignIdMeta.trim())
      .map((campaign) => campaign.campaignIdMeta.trim())
  )
}

export function filterReportCampaignsByClientCampaigns(
  campaigns: ReportCampaign[],
  clientCampaigns: ClientCampaignFilter[] | null | undefined
) {
  const activeCampaignIds = getActiveClientCampaignIds(clientCampaigns)

  if (activeCampaignIds.size === 0) {
    return campaigns
  }

  const filteredCampaigns = campaigns.filter((campaign) =>
    activeCampaignIds.has(campaign.id.trim())
  )

  return filteredCampaigns.length > 0 ? filteredCampaigns : campaigns
}

export function aggregateCampaignInsights(campaigns: ReportCampaign[]): ReportInsight {
  const totals = campaigns.reduce(
    (accumulator, campaign) => {
      const insight = campaign.insights?.data?.[0]

      if (!insight) {
        return accumulator
      }

      accumulator.spend += parseNumber(insight.spend)
      accumulator.impressions += parseNumber(insight.impressions)
      accumulator.reach += parseNumber(insight.reach)
      accumulator.clicks += parseNumber(insight.clicks)
      accumulator.actions.push(...(insight.actions ?? []))
      accumulator.actionValues.push(...(insight.action_values ?? []))

      return accumulator
    },
    {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      actions: [] as ReportAction[],
      actionValues: [] as ReportAction[],
    }
  )

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : 0
  const cpc = totals.clicks > 0 ? totals.spend / totals.clicks : 0
  const cpm = totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0

  return {
    spend: String(totals.spend),
    impressions: String(totals.impressions),
    reach: String(totals.reach),
    clicks: String(totals.clicks),
    ctr: String(ctr),
    cpc: String(cpc),
    cpm: String(cpm),
    actions: sumActionEntries(totals.actions),
    action_values: sumActionEntries(totals.actionValues),
  }
}
