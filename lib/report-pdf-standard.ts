import { jsPDF } from "jspdf"
import {
  formatCurrency,
  formatInteger,
  formatPercentage,
  parseReportNumber,
  resolveMessageMetric,
  resolveObjectiveMetric,
} from "@/lib/report-metrics"
import type {
  ReportMetricVisibility,
  ReportSectionVisibility,
  StoredReportPayload,
} from "@/types/report.types"

const PAGE = {
  width: 210,
  height: 297,
  margin: 10,
}

const COLORS = {
  pageBackground: [246, 247, 251] as const,
  white: [255, 255, 255] as const,
  text: [15, 23, 42] as const,
  muted: [100, 116, 139] as const,
  border: [226, 232, 240] as const,
  surface: [248, 250, 252] as const,
  red: [193, 18, 31] as const,
  blueBg: [239, 246, 255] as const,
  blueText: [37, 99, 235] as const,
  purpleBg: [245, 243, 255] as const,
  purpleText: [124, 58, 237] as const,
  tealBg: [240, 253, 250] as const,
  tealText: [13, 148, 136] as const,
  orangeBg: [255, 247, 237] as const,
  orangeText: [234, 88, 12] as const,
  greenBg: [240, 253, 244] as const,
  greenText: [22, 163, 74] as const,
  yellowBg: [254, 249, 195] as const,
  yellowText: [161, 98, 7] as const,
} as const

type Rgb = readonly [number, number, number]

type MetricCard = {
  label: string
  value: string
  accentBg: Rgb
  accentText: Rgb
}

type CampaignRow = {
  name: string
  objective: string
  status: string
  metricValue: string
  clicks: string
  impressions: string
  spend: string
}

const MAX_CAMPAIGN_ROWS_FIRST_PAGE = 8

const DEFAULT_SECTIONS: ReportSectionVisibility = {
  overview: true,
  advancedMetrics: true,
  chart: true,
  campaignTable: true,
  topAds: true,
  gender: true,
  insights: true,
  summary: true,
  notes: true,
}

const DEFAULT_METRICS: ReportMetricVisibility = {
  spend: true,
  impressions: true,
  reach: true,
  clicks: true,
  ctr: true,
  cpc: true,
  cpm: true,
  conversationsStarted: true,
  costPerConversation: true,
  conversationRate: true,
}

function setFill(pdf: jsPDF, color: Rgb) {
  pdf.setFillColor(color[0], color[1], color[2])
}

function setDraw(pdf: jsPDF, color: Rgb) {
  pdf.setDrawColor(color[0], color[1], color[2])
}

function setText(pdf: jsPDF, color: Rgb) {
  pdf.setTextColor(color[0], color[1], color[2])
}

function formatDate(date: string) {
  if (!date) {
    return "-"
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")
}

function roundedCard(pdf: jsPDF, x: number, y: number, width: number, height: number, fill = COLORS.white) {
  setFill(pdf, fill)
  setDraw(pdf, COLORS.border)
  pdf.roundedRect(x, y, width, height, 6, 6, "FD")
}

function pageShell(pdf: jsPDF, pageNumber: number, totalPages: number) {
  setFill(pdf, COLORS.pageBackground)
  pdf.rect(0, 0, PAGE.width, PAGE.height, "F")

  setDraw(pdf, COLORS.border)
  pdf.setLineWidth(0.2)
  pdf.line(PAGE.margin, PAGE.height - 14, PAGE.width - PAGE.margin, PAGE.height - 14)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(9)
  setText(pdf, COLORS.muted)
  pdf.text(
    `Página ${pageNumber} de ${totalPages}`,
    PAGE.width - PAGE.margin,
    PAGE.height - 8,
    { align: "right" }
  )
}

function drawHeader(pdf: jsPDF, payload: StoredReportPayload) {
  roundedCard(pdf, PAGE.margin, PAGE.margin, PAGE.width - PAGE.margin * 2, 34)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(22)
  setText(pdf, COLORS.text)
  pdf.text(payload.client.name, 20, 28)

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(10)
  setText(pdf, COLORS.muted)
  pdf.text(payload.presentation?.customTitle || "FACEBOOK - Visão Geral", 20, 35)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(11)
  setText(pdf, COLORS.text)
  pdf.text(payload.client.company ?? "Marca não informada", PAGE.width - 20, 24, {
    align: "right",
  })

  setFill(pdf, COLORS.surface)
  pdf.roundedRect(PAGE.width - 64, 27, 44, 8, 4, 4, "F")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(8.5)
  setText(pdf, COLORS.muted)
  pdf.text(
    `Período: ${formatDate(payload.filters.since)} - ${formatDate(payload.filters.until)}`,
    PAGE.width - 42,
    32,
    { align: "center" }
  )
}

function drawMetricCard(pdf: jsPDF, x: number, y: number, width: number, height: number, card: MetricCard) {
  roundedCard(pdf, x, y, width, height)

  setFill(pdf, card.accentBg)
  pdf.roundedRect(x + 4, y + 4, 10, 10, 4, 4, "F")

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(12)
  setText(pdf, card.accentText)
  pdf.text("•", x + 9, y + 11, { align: "center" })

  pdf.setFont("helvetica", "normal")
  pdf.setFontSize(8)
  setText(pdf, COLORS.muted)
  pdf.text(card.label.toUpperCase(), x + 4, y + 24)

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(18)
  setText(pdf, COLORS.text)
  pdf.text(card.value, x + 4, y + 36)
}

function drawOverviewCards(pdf: jsPDF, cards: MetricCard[], startY: number) {
  const gap = 3
  const cardWidth = (PAGE.width - PAGE.margin * 2 - gap * 4) / 5

  cards.forEach((card, index) => {
    const x = PAGE.margin + index * (cardWidth + gap)
    drawMetricCard(pdf, x, startY, cardWidth, 42, card)
  })
}

function drawSectionShell(pdf: jsPDF, x: number, y: number, width: number, height: number, title: string, subtitle?: string) {
  roundedCard(pdf, x, y, width, height)
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(14)
  setText(pdf, COLORS.text)
  pdf.text(title, x + 5, y + 11)

  if (subtitle) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(9)
    setText(pdf, COLORS.muted)
    pdf.text(subtitle, x + 5, y + 17)
  }
}

function drawAdvancedMetrics(pdf: jsPDF, cards: MetricCard[], startY: number) {
  drawSectionShell(
    pdf,
    PAGE.margin,
    startY,
    PAGE.width - PAGE.margin * 2,
    56,
    "Visão geral e métricas avançadas",
    "Consolidado da conta no período selecionado."
  )

  const gap = 3
  const cardWidth = (PAGE.width - PAGE.margin * 2 - 10 - gap * 4) / 5
  const baseX = PAGE.margin + 5
  const y = startY + 24

  cards.forEach((card, index) => {
    const x = baseX + index * (cardWidth + gap)
    setFill(pdf, COLORS.surface)
    pdf.roundedRect(x, y, cardWidth, 28, 4, 4, "F")

    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(7.5)
    setText(pdf, COLORS.muted)
    const label = pdf.splitTextToSize(card.label.toUpperCase(), cardWidth - 6)
    pdf.text(label, x + cardWidth / 2, y + 9, { align: "center" })

    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(13)
    setText(pdf, COLORS.text)
    pdf.text(card.value, x + cardWidth / 2, y + 22, { align: "center" })
  })
}

function drawSummary(pdf: jsPDF, items: Array<{ label: string; value: string }>, startY: number) {
  roundedCard(pdf, PAGE.margin, startY, PAGE.width - PAGE.margin * 2, 28)

  const columnWidth = (PAGE.width - PAGE.margin * 2 - 10) / 4
  items.forEach((item, index) => {
    const x = PAGE.margin + 5 + index * columnWidth

    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(7.5)
    setText(pdf, COLORS.muted)
    pdf.text(item.label.toUpperCase(), x, startY + 10)

    pdf.setFont("helvetica", "bold")
    pdf.setFontSize(9)
    setText(pdf, COLORS.text)
    const lines = pdf.splitTextToSize(item.value, columnWidth - 4)
    pdf.text(lines, x, startY + 17)
  })
}

function drawCampaignTable(
  pdf: jsPDF,
  rows: CampaignRow[],
  objectiveLabel: string,
  startY: number,
  hiddenRowsCount = 0
) {
  drawSectionShell(
    pdf,
    PAGE.margin,
    startY,
    PAGE.width - PAGE.margin * 2,
    114,
    "Performance por campanha",
    hiddenRowsCount > 0
      ? `Exibindo ${rows.length} de ${rows.length + hiddenRowsCount} campanhas para manter o PDF em duas páginas.`
      : "Campanhas consideradas neste relatório."
  )

  const startX = PAGE.margin + 5
  const headerY = startY + 18
  const columns = [
    { label: "Campanha", width: 62 },
    { label: "Status", width: 22 },
    { label: objectiveLabel, width: 26 },
    { label: "Cliques", width: 20 },
    { label: "Impressões", width: 24 },
    { label: "Gasto", width: 22 },
  ]

  setFill(pdf, COLORS.surface)
  pdf.roundedRect(startX, headerY, 180, 10, 3, 3, "F")
  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(7.5)
  setText(pdf, COLORS.muted)

  let cursorX = startX + 2
  for (const column of columns) {
    pdf.text(column.label.toUpperCase(), cursorX, headerY + 6)
    cursorX += column.width
  }

  let rowY = headerY + 14
  for (const row of rows) {
    setFill(pdf, COLORS.white)
    pdf.roundedRect(startX, rowY - 3.5, 180, 11.5, 3, 3, "F")

    cursorX = startX + 2
    const values = [
      row.name,
      row.status,
      row.metricValue,
      row.clicks,
      row.impressions,
      row.spend,
    ]

    values.forEach((value, index) => {
      pdf.setFont(index === 0 ? "helvetica" : "helvetica", index === 0 ? "bold" : "normal")
      pdf.setFontSize(7.5)
      setText(pdf, index === 0 ? COLORS.text : COLORS.muted)
      const text = index === 0 ? pdf.splitTextToSize(value, columns[index].width - 4)[0] : value
      pdf.text(text, cursorX, rowY + 1)
      cursorX += columns[index].width
    })

    rowY += 12
  }

  if (hiddenRowsCount > 0) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(8)
    setText(pdf, COLORS.muted)
    pdf.text(
      `+${hiddenRowsCount} campanha(s) omitida(s) nesta versão resumida do PDF.`,
      startX,
      Math.min(rowY + 6, PAGE.height - 20)
    )
  }
}

function buildMetricCards(payload: StoredReportPayload) {
  const accountInsights = payload.accountInsights ?? {}
  const metrics = payload.presentation?.metrics ?? DEFAULT_METRICS
  const objectiveMetric = resolveObjectiveMetric(accountInsights, payload.filters.objective)
  const messageMetric = resolveMessageMetric(accountInsights)

  const overview: MetricCard[] = [
    {
      label: "Investimento",
      value: formatCurrency(parseReportNumber(accountInsights.spend)),
      accentBg: COLORS.blueBg,
      accentText: COLORS.blueText,
    },
    {
      label: "Impressões",
      value: formatInteger(parseReportNumber(accountInsights.impressions)),
      accentBg: COLORS.purpleBg,
      accentText: COLORS.purpleText,
    },
    {
      label: "Alcance",
      value: formatInteger(parseReportNumber(accountInsights.reach)),
      accentBg: COLORS.tealBg,
      accentText: COLORS.tealText,
    },
    {
      label: "Cliques",
      value: formatInteger(parseReportNumber(accountInsights.clicks)),
      accentBg: COLORS.orangeBg,
      accentText: COLORS.orangeText,
    },
    {
      label: "Taxa de cliques",
      value: formatPercentage(parseReportNumber(accountInsights.ctr)),
      accentBg: COLORS.greenBg,
      accentText: COLORS.greenText,
    },
  ].filter((card) => {
    const metricMap: Record<string, keyof ReportMetricVisibility> = {
      Investimento: "spend",
      "ImpressÃµes": "impressions",
      Alcance: "reach",
      Cliques: "clicks",
      "Taxa de cliques": "ctr",
    }

    return metrics[metricMap[card.label]]
  })

  const advanced: MetricCard[] = [
    {
      label: "Custo por clique",
      value: formatCurrency(parseReportNumber(accountInsights.cpc)),
      accentBg: COLORS.surface,
      accentText: COLORS.red,
    },
    {
      label: "Custo por mil impressões",
      value: formatCurrency(parseReportNumber(accountInsights.cpm)),
      accentBg: COLORS.surface,
      accentText: COLORS.red,
    },
    {
      label: "Conversas iniciadas",
      value: formatInteger(messageMetric.value),
      accentBg: COLORS.surface,
      accentText: COLORS.red,
    },
    {
      label: "Custo por conversa",
      value:
        messageMetric.costPerResult !== null
          ? formatCurrency(messageMetric.costPerResult)
          : "-",
      accentBg: COLORS.surface,
      accentText: COLORS.red,
    },
    {
      label: messageMetric.efficiencyLabel ?? "Taxa de conversa",
      value:
        messageMetric.efficiencyValue !== null
          ? formatPercentage(messageMetric.efficiencyValue)
          : "-",
      accentBg: COLORS.surface,
      accentText: COLORS.red,
    },
  ].filter((card) => {
    const metricMap: Record<string, keyof ReportMetricVisibility> = {
      "Custo por clique": "cpc",
      "Custo por mil impressÃµes": "cpm",
      "Conversas iniciadas": "conversationsStarted",
      "Custo por conversa": "costPerConversation",
      [messageMetric.efficiencyLabel ?? "Taxa de conversa"]: "conversationRate",
    }

    return metrics[metricMap[card.label]]
  })

  const summary = [
    {
      label: "Período",
      value: `${formatDate(payload.filters.since)} até ${formatDate(payload.filters.until)}`,
    },
    {
      label: "Objetivo",
      value: objectiveMetric.label,
    },
    {
      label: "Conta",
      value: payload.client.adAccountId ?? "Não informada",
    },
    {
      label: "Relatório",
      value: "META Ads",
    },
  ]

  return { overview, advanced, summary, objectiveMetric }
}

function buildCampaignRows(payload: StoredReportPayload, objectiveLabel: string) {
  return payload.campaigns
    .filter((campaign) => campaign.status === "ACTIVE")
    .map((campaign) => {
      const insight = campaign.insights?.data?.[0] ?? {}
      const metric = resolveObjectiveMetric(insight, payload.filters.objective)

      return {
        name: campaign.name,
        objective: campaign.objective ?? objectiveLabel,
        status: campaign.status === "ACTIVE" ? "Ativa" : campaign.status,
        metricValue: formatInteger(metric.value),
        clicks: formatInteger(parseReportNumber(insight.clicks)),
        impressions: formatInteger(parseReportNumber(insight.impressions)),
        spend: formatCurrency(parseReportNumber(insight.spend)),
      } satisfies CampaignRow
    })
}

export function buildStandardReportPdfBuffer(params: {
  reportId: string
  payload: StoredReportPayload
}) {
  const { reportId, payload } = params
  const pdf = new jsPDF({
    orientation: "p",
    unit: "mm",
    format: "a4",
    compress: true,
  })

  const sections = payload.presentation?.sections ?? DEFAULT_SECTIONS
  const { overview, advanced, summary, objectiveMetric } = buildMetricCards(payload)
  const campaignRows = buildCampaignRows(payload, objectiveMetric.label)
  const firstPageCampaignRows = campaignRows.slice(0, MAX_CAMPAIGN_ROWS_FIRST_PAGE)
  const totalPages = 2

  pdf.setDocumentProperties({
    title: `Relatório META Ads | ${payload.client.name}`,
    subject: "Relatório de performance META Ads",
    author: "GreatGo",
    creator: "GreatGo",
    keywords: ["greatgo", "meta ads", payload.client.name, reportId].join(", "),
  })

  pageShell(pdf, 1, totalPages)
  drawHeader(pdf, payload)
  if (sections.overview) {
    drawOverviewCards(pdf, overview, 50)
  }
  if (sections.advancedMetrics) {
    drawAdvancedMetrics(pdf, advanced, 98)
  }
  if (sections.campaignTable) {
    drawCampaignTable(
      pdf,
      firstPageCampaignRows,
      objectiveMetric.label,
      160,
      Math.max(campaignRows.length - firstPageCampaignRows.length, 0)
    )
  }

  pdf.addPage()
  pageShell(pdf, 2, totalPages)
  drawHeader(pdf, payload)
  if (sections.summary) {
    drawSummary(pdf, summary, 50)
  }

  return Buffer.from(pdf.output("arraybuffer"))
}
