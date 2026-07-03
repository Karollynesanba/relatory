import { assert, test } from "./test-helpers.mjs"
import {
  aggregateCampaignInsights,
  filterReportCampaignsByClientCampaigns,
  getActiveClientCampaignIds,
} from "@/lib/report-campaign-filters"

const campaigns = [
  {
    id: "1001",
    name: "Great - Campanha A",
    status: "ACTIVE",
    insights: {
      data: [
        {
          spend: "100",
          impressions: "1000",
          reach: "600",
          clicks: "50",
          ctr: "5",
          cpc: "2",
          cpm: "100",
          actions: [{ action_type: "lead", value: "3" }],
          action_values: [{ action_type: "lead", value: "150" }],
        },
      ],
    },
  },
  {
    id: "2002",
    name: "Outra campanha",
    status: "ACTIVE",
    insights: {
      data: [
        {
          spend: "40",
          impressions: "400",
          reach: "220",
          clicks: "20",
          ctr: "5",
          cpc: "2",
          cpm: "100",
          actions: [{ action_type: "lead", value: "1" }],
          action_values: [{ action_type: "lead", value: "40" }],
        },
      ],
    },
  },
]

test("getActiveClientCampaignIds retorna somente campanhas ativas", () => {
  const ids = getActiveClientCampaignIds([
    { campaignIdMeta: "1001", isActive: true },
    { campaignIdMeta: "2002", isActive: false },
    { campaignIdMeta: " ", isActive: true },
  ])

  assert.equal(ids.has("1001"), true)
  assert.equal(ids.has("2002"), false)
  assert.equal(ids.has(""), false)
})

test("filterReportCampaignsByClientCampaigns filtra campanhas fora da Great", () => {
  const filtered = filterReportCampaignsByClientCampaigns(campaigns, [
    { campaignIdMeta: "1001", isActive: true },
    { campaignIdMeta: "2002", isActive: false },
  ])

  assert.equal(filtered.length, 1)
  assert.equal(filtered[0].id, "1001")
})

test("aggregateCampaignInsights soma apenas as campanhas filtradas", () => {
  const aggregated = aggregateCampaignInsights([campaigns[0]])

  assert.equal(aggregated.spend, "100")
  assert.equal(aggregated.impressions, "1000")
  assert.equal(aggregated.reach, "600")
  assert.equal(aggregated.clicks, "50")
  assert.equal(aggregated.actions?.[0]?.action_type, "lead")
  assert.equal(aggregated.actions?.[0]?.value, "3")
  assert.equal(aggregated.action_values?.[0]?.value, "150")
})
