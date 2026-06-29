"use client"

import type { LucideIcon } from "lucide-react"
import {
  ArrowUpRight,
  BarChart2,
  DollarSign,
  Eye,
  MousePointer,
  Target,
  TrendingUp,
  Users,
} from "lucide-react"
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts"
import {
  findBestCampaignByObjective,
  formatCurrency,
  formatInteger,
  formatPercentage,
  parseReportNumber,
  resolveMessageMetric,
  resolveObjectiveMetric,
} from "@/lib/report-metrics"
import { cn } from "@/lib/utils"
import type {
  ReportClient,
  ReportBreakdownRow,
  ReportMetricVisibility,
  ReportObjectiveValue,
  ReportPayload,
  ReportSectionVisibility,
} from "@/types/report.types"

const MAX_PDF_CAMPAIGN_ROWS = 8

type ReportPreviewProps = {
  client: ReportClient
  reportData: ReportPayload
  startDate: string
  endDate: string
  objective: ReportObjectiveValue | string
  selectedCampaignIds: string[]
  insightsEnabled: boolean
  metricVisibility?: ReportMetricVisibility
  customTitle?: string
  executiveSummary?: string
  closingNotes?: string
  sectionVisibility?: ReportSectionVisibility
  variant?: "screen" | "pdf"
}

type MetricCard = {
  label: string
  value: string
  icon: LucideIcon
  accent: string
}

type InsightCard = {
  title: string
  value: string
  accent: string
}

type CampaignRow = {
  id: string
  name: string
  objective: string
  status: string
  statusAccent: string
  metricValue: string
  clicks: string
  impressions: string
  spend: string
}

function formatPeriod(date: string) {
  if (!date) {
    return "-"
  }

  return new Date(`${date}T00:00:00`).toLocaleDateString("pt-BR")
}

function ReportHeader({
  client,
  startDate,
  endDate,
  customTitle,
  executiveSummary,
  isPdf,
}: {
  client: ReportClient
  startDate: string
  endDate: string
  customTitle?: string
  executiveSummary?: string
  isPdf: boolean
}) {
  return (
    <div
      className={cn(
        "border-b border-slate-200 bg-white text-slate-900",
        isPdf ? "px-10 py-8" : "px-5 py-6 sm:px-8 sm:py-7 md:px-10 md:py-8"
      )}
    >
      <div
        className={cn(
          "gap-6",
          isPdf
            ? "flex items-start justify-between"
            : "flex flex-col items-start justify-between md:flex-row"
        )}
      >
        <div>
          <p className="text-[28px] font-black tracking-tight text-slate-900">
            {client.name}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {customTitle?.trim() || "FACEBOOK - Visão Geral"}
          </p>
        </div>
        <div
          className={cn(
            "w-full md:w-auto",
            isPdf ? "text-right" : "text-left md:text-right"
          )}
        >
          <p className="text-sm font-semibold text-slate-900">
            {client.company ?? "Marca não informada"}
          </p>
          <p className="mt-2 inline-flex rounded-full bg-[#F5F7FA] px-3 py-1 text-xs font-semibold text-slate-500">
            Período: {formatPeriod(startDate)} - {formatPeriod(endDate)}
          </p>
        </div>
      </div>

      {executiveSummary?.trim() ? (
        <div className="mt-5 rounded-3xl border border-[#DCE6F3] bg-[#F7FAFF] px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5D7290]">
            Resumo executivo
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {executiveSummary.trim()}
          </p>
        </div>
      ) : null}
    </div>
  )
}

function MetricsGrid({
  cards,
  isPdf,
}: {
  cards: MetricCard[]
  isPdf: boolean
}) {
  if (!cards.length) {
    return null
  }

  return (
    <section
      className={cn(
        "gap-4",
        isPdf
          ? "grid grid-cols-5"
          : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 print:grid-cols-5"
      )}
    >
      {cards.map((item) => (
        <div
          key={item.label}
          className="rounded-3xl border border-gray-100 bg-white px-5 py-5 shadow-sm print:break-inside-avoid"
        >
          <div
            className={`mb-4 flex h-10 w-10 items-center justify-center rounded-2xl ${item.accent}`}
          >
            <item.icon className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.18em] text-gray-400">
            {item.label}
          </p>
          <p className="mt-2 text-[26px] font-medium tracking-tight text-gray-900">
            {item.value}
          </p>
        </div>
      ))}
    </section>
  )
}

function AdvancedMetricsSection({
  cards,
  isPdf,
}: {
  cards: MetricCard[]
  isPdf: boolean
}) {
  if (!cards.length) {
    return null
  }

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 print:break-inside-avoid">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">
          Visão geral e métricas avançadas
        </h2>
        <p className="text-sm text-gray-500">
          Consolidado da conta no período selecionado.
        </p>
      </div>

      <div
        className={cn(
          "gap-4",
          isPdf
            ? "grid grid-cols-5"
            : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 print:grid-cols-5"
        )}
      >
        {cards.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl bg-gray-50 px-4 py-4 text-center"
          >
            <item.icon className="mx-auto mb-2 h-4 w-4 text-[#C1121F]" />
            <p className="text-xs uppercase tracking-[0.16em] text-gray-400">
              {item.label}
            </p>
            <p className="mt-2 text-xl font-bold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ChartSection({
  chartData,
  objectiveLabel,
  isPdf,
}: {
  chartData: Array<{ day: string; invest: number; clicks: number; results: number }>
  objectiveLabel: string
  isPdf: boolean
}) {
  if (chartData.length === 0) {
    return null
  }

  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 print:break-inside-avoid">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Evolucao por período</h2>
        <p className="text-sm text-gray-500">
          Comportamento diario de investimento, cliques e{" "}
          {objectiveLabel.toLowerCase()}.
        </p>
      </div>

      <div
        className={cn(
          "gap-4",
          isPdf
            ? "grid grid-cols-3"
            : "grid grid-cols-1 xl:grid-cols-3 print:grid-cols-3"
        )}
      >
        {[
          { label: "Investimento", key: "invest", color: "#C1121F" },
          { label: "Cliques", key: "clicks", color: "#8B5CF6" },
          { label: objectiveLabel, key: "results", color: "#14B87A" },
        ].map((chart) => (
          <div
            key={chart.key}
            className="rounded-2xl bg-gray-50 p-4 print:break-inside-avoid"
          >
            <p className="mb-3 text-sm font-semibold text-gray-700">
              {chart.label}
            </p>
            <ResponsiveContainer width="100%" height={140}>
              <LineChart data={chartData}>
                <XAxis
                  dataKey="day"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 10, fill: "#94A3B8" }}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    borderRadius: 12,
                    borderColor: "#E5E7EB",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={chart.key}
                  stroke={chart.color}
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ))}
      </div>
    </section>
  )
}

function InsightsSection({
  insights,
  isPdf,
}: {
  insights: InsightCard[]
  isPdf: boolean
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6 print:break-inside-avoid">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-gray-900">Insights automáticos</h2>
        <p className="text-sm text-gray-500">
          Destaques gerados com base nos dados carregados para este relatório.
        </p>
      </div>

      <div
        className={cn(
          "gap-4",
          isPdf
            ? "grid grid-cols-5"
            : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 print:grid-cols-5"
        )}
      >
        {insights.map((insight) => (
          <div
            key={insight.title}
            className={`rounded-2xl border px-4 py-4 ${insight.accent}`}
          >
            <p className="text-xs uppercase tracking-[0.16em]">{insight.title}</p>
            <p className="mt-3 text-sm font-semibold leading-6">{insight.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function SummarySection({
  summary,
  isPdf,
}: {
  summary: Array<{ label: string; value: string }>
  isPdf: boolean
}) {
  return (
    <section className="rounded-3xl border border-gray-100 bg-white px-5 py-4 shadow-sm sm:px-6 print:break-inside-avoid">
      <div
        className={cn(
          "gap-3",
          isPdf
            ? "grid grid-cols-4"
            : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 print:grid-cols-4"
        )}
      >
        {summary.map((item) => (
          <div key={item.label}>
            <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
              {item.label}
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function ScreenCampaignSection({
  rows,
  objectiveLabel,
}: {
  rows: CampaignRow[]
  objectiveLabel: string
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-6 py-5">
        <h2 className="text-lg font-bold text-gray-900">Performance por campanha</h2>
        <p className="text-sm text-gray-500">
          Campanhas consideradas no relatório e seus principais numeros.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-12 text-center text-sm text-gray-400">
          Nenhuma campanha selecionada para exibir nesta versão do relatório.
        </div>
      ) : (
        <>
          <div className="divide-y divide-gray-100 lg:hidden print:hidden">
            {rows.map((row) => (
              <article key={row.id} className="space-y-4 px-5 py-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                    <p className="mt-1 text-xs text-gray-400">{row.objective}</p>
                  </div>
                  <span
                    className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.statusAccent}`}
                  >
                    {row.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: objectiveLabel, value: row.metricValue },
                    { label: "Cliques", value: row.clicks },
                    { label: "Impressões", value: row.impressions },
                    { label: "Gasto", value: row.spend },
                  ].map((item) => (
                    <div
                      key={`${row.id}-${item.label}`}
                      className="rounded-2xl bg-gray-50 px-4 py-3"
                    >
                      <p className="text-[11px] uppercase tracking-[0.16em] text-gray-400">
                        {item.label}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-gray-900">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>

          <table className="hidden w-full lg:table print:table">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {[
                  "Campanha",
                  "Status",
                  objectiveLabel,
                  "Cliques",
                  "Impressões",
                  "Gasto",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        {row.name}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">{row.objective}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.statusAccent}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {row.metricValue}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{row.clicks}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {row.impressions}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {row.spend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function ManualNotesSection({ closingNotes }: { closingNotes?: string }) {
  if (!closingNotes?.trim()) {
    return null
  }

  return (
    <section className="rounded-3xl border border-[#DCE6F3] bg-[#F8FBFF] p-5 shadow-sm sm:p-6 print:break-inside-avoid">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">Observações finais</h2>
        <p className="text-sm text-slate-500">
          Contexto adicional para o cliente sobre o envio.
        </p>
      </div>
      <p className="whitespace-pre-wrap text-sm leading-7 text-slate-600">
        {closingNotes.trim()}
      </p>
    </section>
  )
}

function translateGenderLabel(value: string) {
  const normalized = value.trim().toLowerCase()

  if (normalized === "female") {
    return "Mulheres"
  }

  if (normalized === "male") {
    return "Homens"
  }

  if (normalized === "unknown") {
    return "Não informado"
  }

  return value
}

function BreakdownSection({
  title,
  rows,
}: {
  title: string
  rows: ReportBreakdownRow[]
}) {
  if (!rows.length) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm print:break-inside-avoid">
      <div className="border-b border-gray-100 px-6 py-5">
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {["Segmento", "Cliques", "Alcance", "Impressões", "Conversas iniciadas"].map(
              (header) => (
                <th
                  key={header}
                  className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400"
                >
                  {header}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const conversations = resolveMessageMetric({
              actions: row.actions,
              clicks: row.clicks,
              spend: row.spend,
            }).value

            return (
              <tr key={`${title}-${row.dimension}`} className="border-b border-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {title === "Gênero" ? translateGenderLabel(row.dimension) : row.dimension}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(row.clicks))}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(row.reach))}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(row.impressions))}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {formatInteger(conversations)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function TopAdsSection({
  ads,
}: {
  ads: NonNullable<ReportPayload["topAds"]>
}) {
  if (!ads.length) {
    return null
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm print:break-inside-avoid">
      <div className="border-b border-gray-100 px-6 py-5">
        <h2 className="text-lg font-bold text-gray-900">Principais anúncios</h2>
        <p className="text-sm text-gray-500">
          Anúncios com maior volume de impressões no período selecionado.
        </p>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/80">
            {[
              "Anúncio",
              "Alcance",
              "Impressões",
              "Cliques",
              "Conversas iniciadas",
            ].map((header) => (
              <th
                key={header}
                className="px-6 py-4 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ads.map((ad) => {
            const conversations = resolveMessageMetric({
              actions: ad.actions,
              clicks: ad.clicks,
              spend: ad.spend,
            }).value

            return (
              <tr key={ad.id} className="border-b border-gray-50">
                <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                  {ad.name}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(ad.reach))}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(ad.impressions))}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">
                  {formatInteger(parseReportNumber(ad.clicks))}
                </td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">
                  {formatInteger(conversations)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}

function PdfPageShell({
  pageNumber,
  totalPages,
  children,
}: {
  pageNumber: number
  totalPages: number
  children: React.ReactNode
}) {
  return (
    <section
      data-report-pdf-page
      className="flex h-[1622px] w-[1120px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] print:h-auto print:w-full print:break-after-page print:rounded-none print:shadow-none"
    >
      <div className="flex-1">{children}</div>
      <div className="border-t border-slate-200/80 bg-white px-10 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        Página {pageNumber} de {totalPages}
      </div>
    </section>
  )
}

function PdfCampaignSection({
  rows,
  objectiveLabel,
  hiddenRowsCount,
}: {
  rows: CampaignRow[]
  objectiveLabel: string
  hiddenRowsCount: number
}) {
  return (
    <section className="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-5 py-4">
        <h2 className="text-base font-bold text-gray-900">
          Performance por campanha
        </h2>
        <p className="mt-1 text-xs leading-5 text-gray-500">
          {hiddenRowsCount > 0
            ? `Exibindo ${rows.length} de ${rows.length + hiddenRowsCount} campanhas para manter o PDF em duas páginas.`
            : "Campanhas consideradas no relatório e seus principais numeros."}
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10 text-center text-sm text-gray-400">
          Nenhuma campanha selecionada para exibir nesta versão do relatório.
        </div>
      ) : (
        <>
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[34%]" />
              <col className="w-[13%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80">
                {[
                  "Campanha",
                  "Status",
                  objectiveLabel,
                  "Cliques",
                  "Impressões",
                  "Gasto",
                ].map((header) => (
                  <th
                    key={header}
                    className="px-3 py-2.5 text-left text-[9px] font-semibold uppercase tracking-[0.14em] text-gray-400"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 align-top">
                  <td className="px-3 py-2.5">
                    <div>
                      <p className="text-[12px] font-semibold leading-4 text-gray-900 break-words">
                        {row.name}
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-gray-400 break-words">
                        {row.objective}
                      </p>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-[10px] font-semibold ${row.statusAccent}`}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-[12px] leading-4 text-gray-600">
                    {row.metricValue}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] leading-4 text-gray-600">{row.clicks}</td>
                  <td className="px-3 py-2.5 text-[12px] leading-4 text-gray-600">{row.impressions}</td>
                  <td className="px-3 py-2.5 text-[12px] font-medium leading-4 text-gray-900">
                    {row.spend}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hiddenRowsCount > 0 ? (
            <div className="border-t border-gray-100 bg-slate-50 px-5 py-3 text-xs font-medium text-slate-500">
              +{hiddenRowsCount} campanha(s) omitida(s) nesta versão resumida do PDF.
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

export function ReportPreview({
  client,
  reportData,
  startDate,
  endDate,
  objective,
  selectedCampaignIds,
  insightsEnabled,
  metricVisibility,
  customTitle,
  executiveSummary,
  closingNotes,
  sectionVisibility,
  variant = "screen",
}: ReportPreviewProps) {
  const isPdf = variant === "pdf"
  const presentation = reportData.presentation
  const visibleSections: ReportSectionVisibility = sectionVisibility ?? presentation?.sections ?? {
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
  const visibleMetrics: ReportMetricVisibility = metricVisibility ?? presentation?.metrics ?? {
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
  const resolvedCustomTitle = customTitle ?? presentation?.customTitle
  const resolvedExecutiveSummary = executiveSummary ?? presentation?.executiveSummary
  const resolvedClosingNotes = closingNotes ?? presentation?.closingNotes
  const shouldShowInsights = visibleSections.insights && insightsEnabled
  const accountInsights = reportData.accountInsights ?? {}
  const spend = parseReportNumber(accountInsights.spend)
  const impressions = parseReportNumber(accountInsights.impressions)
  const reach = parseReportNumber(accountInsights.reach)
  const clicks = parseReportNumber(accountInsights.clicks)
  const ctr = parseReportNumber(accountInsights.ctr)
  const cpc = parseReportNumber(accountInsights.cpc)
  const cpm = parseReportNumber(accountInsights.cpm)
  const objectiveMetric = resolveObjectiveMetric(accountInsights, objective)
  const messageMetric = resolveMessageMetric(accountInsights)

  const selectedCampaigns = reportData.campaigns.filter(
    (campaign) =>
      campaign.status === "ACTIVE" && selectedCampaignIds.includes(campaign.id)
  )

  const chartData = (reportData.dailyInsights ?? []).map((day) => ({
    day: day.date_start?.slice(5) ?? "-",
    invest: parseReportNumber(day.spend),
    clicks: parseReportNumber(day.clicks),
    results: resolveObjectiveMetric(day, objective).value,
  }))

  const bestCampaign = findBestCampaignByObjective(selectedCampaigns, objective)
  const bestCampaignMetric = resolveObjectiveMetric(
    bestCampaign?.insights?.data?.[0],
    objective
  )
  const activeCampaignCount = selectedCampaigns.filter(
    (campaign) => campaign.status === "ACTIVE"
  ).length
  const performanceCards: MetricCard[] = [
    {
      label: "Investimento",
      value: formatCurrency(spend),
      icon: DollarSign,
      accent: "bg-blue-50 text-blue-600",
    },
    {
      label: "Impressões",
      value: formatInteger(impressions),
      icon: Eye,
      accent: "bg-purple-50 text-purple-600",
    },
    {
      label: "Alcance",
      value: formatInteger(reach),
      icon: Users,
      accent: "bg-teal-50 text-teal-600",
    },
    {
      label: "Cliques",
      value: formatInteger(clicks),
      icon: MousePointer,
      accent: "bg-orange-50 text-orange-600",
    },
    {
      label: "Taxa de cliques",
      value: formatPercentage(ctr),
      icon: TrendingUp,
      accent: "bg-green-50 text-green-600",
    },
  ].filter((card) => {
    const metricMap: Record<string, keyof ReportMetricVisibility> = {
      Investimento: "spend",
      Impressoes: "impressions",
      Alcance: "reach",
      Cliques: "clicks",
      "Taxa de cliques": "ctr",
    }

    return visibleMetrics[metricMap[card.label]]
  })

  const advancedMetrics: MetricCard[] = [
    {
      label: "Custo por clique",
      value: formatCurrency(cpc),
      icon: ArrowUpRight,
      accent: "",
    },
    {
      label: "Custo por mil impressões",
      value: formatCurrency(cpm),
      icon: BarChart2,
      accent: "",
    },
    {
      label: "Conversas iniciadas",
      value: formatInteger(messageMetric.value),
      icon: Target,
      accent: "",
    },
    {
      label: "Custo por conversa",
      value:
        messageMetric.costPerResult !== null
          ? formatCurrency(messageMetric.costPerResult)
          : "-",
      icon: DollarSign,
      accent: "",
    },
    {
      label: messageMetric.efficiencyLabel ?? "Taxa de conversa",
      value:
        messageMetric.efficiencyValue !== null
          ? formatPercentage(messageMetric.efficiencyValue)
          : "-",
      icon: TrendingUp,
      accent: "",
    },
  ].filter((card) => {
    const metricMap: Record<string, keyof ReportMetricVisibility> = {
      "Custo por clique": "cpc",
      "Custo por mil impressões": "cpm",
      "Conversas iniciadas": "conversationsStarted",
      "Custo por conversa": "costPerConversation",
      [messageMetric.efficiencyLabel ?? "Taxa de conversa"]: "conversationRate",
    }

    return visibleMetrics[metricMap[card.label]]
  })

  const automaticInsights: InsightCard[] = [
    {
      title: "Melhor campanha",
      value:
        bestCampaign && bestCampaignMetric.value > 0
          ? `${bestCampaign.name} (${formatInteger(bestCampaignMetric.value)} ${bestCampaignMetric.label.toLowerCase()})`
          : bestCampaign?.name ?? "Sem dados suficientes",
      accent: "bg-yellow-50 text-yellow-700 border-yellow-100",
    },
    {
      title: "Conta analisada",
      value:
        client.adAccountId ?? reportData.client?.adAccountId ?? "Não informada",
      accent: "bg-blue-50 text-blue-700 border-blue-100",
    },
    {
      title: "Investimento total",
      value: formatCurrency(spend),
      accent: "bg-green-50 text-green-700 border-green-100",
    },
    {
      title: "Campanhas selecionadas",
      value: `${selectedCampaigns.length} campanha(s)`,
      accent: "bg-red-50 text-red-700 border-red-100",
    },
    {
      title: "Campanhas ativas",
      value: `${activeCampaignCount} ativa(s)`,
      accent: "bg-indigo-50 text-indigo-700 border-indigo-100",
    },
  ]

  const campaignSummary = [
    {
      label: "Período",
      value: `${formatPeriod(startDate)} até ${formatPeriod(endDate)}`,
    },
    {
      label: "Objetivo monitorado",
      value: objectiveMetric.label,
    },
    {
      label: "Campanhas ativas",
      value: `${activeCampaignCount} de ${selectedCampaigns.length}`,
    },
    {
      label: "Conta analisada",
      value:
        client.adAccountId ?? reportData.client?.adAccountId ?? "Não informada",
    },
  ]

  const campaignRows: CampaignRow[] = selectedCampaigns.map((campaign) => {
    const insight = campaign.insights?.data?.[0] ?? {}
    const campaignMetric = resolveObjectiveMetric(insight, objective)

    return {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective ?? "Sem objetivo informado",
      status: campaign.status === "ACTIVE" ? "Ativa" : campaign.status,
      statusAccent:
        campaign.status === "ACTIVE"
          ? "bg-green-50 text-green-600"
          : "bg-gray-100 text-gray-500",
      metricValue: formatInteger(campaignMetric.value),
      clicks: formatInteger(parseReportNumber(insight.clicks)),
      impressions: formatInteger(parseReportNumber(insight.impressions)),
      spend: formatCurrency(parseReportNumber(insight.spend)),
    }
  })

  if (!isPdf) {
    return (
      <div className="mx-auto w-full max-w-[1120px] overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)] print:w-[190mm] print:max-w-none print:rounded-none print:shadow-none">
        <ReportHeader
          client={client}
          startDate={startDate}
          endDate={endDate}
          customTitle={resolvedCustomTitle}
          executiveSummary={resolvedExecutiveSummary}
          isPdf={false}
        />

        <div className="space-y-5 bg-[#f6f7fb] px-4 py-5 sm:px-6 sm:py-6 md:px-10 md:py-8">
          {visibleSections.overview ? (
            <MetricsGrid cards={performanceCards} isPdf={false} />
          ) : null}
          {visibleSections.advancedMetrics ? (
            <AdvancedMetricsSection cards={advancedMetrics} isPdf={false} />
          ) : null}
          {visibleSections.chart ? (
            <ChartSection
              chartData={chartData}
              objectiveLabel={objectiveMetric.label}
              isPdf={false}
            />
          ) : null}
          {visibleSections.campaignTable ? (
            <ScreenCampaignSection
              rows={campaignRows}
              objectiveLabel={objectiveMetric.label}
            />
          ) : null}
          {visibleSections.topAds ? (
            <TopAdsSection ads={reportData.topAds ?? []} />
          ) : null}
          {visibleSections.gender ? (
            <BreakdownSection
              title="Gênero"
              rows={reportData.genderBreakdown ?? []}
            />
          ) : null}
          {shouldShowInsights ? (
            <InsightsSection insights={automaticInsights} isPdf={false} />
          ) : null}
          {visibleSections.summary ? (
            <SummarySection summary={campaignSummary} isPdf={false} />
          ) : null}
          {visibleSections.notes ? (
            <ManualNotesSection closingNotes={resolvedClosingNotes} />
          ) : null}
        </div>
      </div>
    )
  }

  const pdfCampaignRows = campaignRows.slice(0, MAX_PDF_CAMPAIGN_ROWS)
  const hiddenPdfCampaignRows = Math.max(campaignRows.length - pdfCampaignRows.length, 0)
  const hasSecondaryPage =
    (visibleSections.chart && chartData.length > 0) ||
    (visibleSections.topAds && Boolean(reportData.topAds?.length)) ||
    (visibleSections.gender && Boolean(reportData.genderBreakdown?.length)) ||
    (shouldShowInsights && automaticInsights.length > 0) ||
    (visibleSections.summary && campaignSummary.length > 0) ||
    (visibleSections.notes && Boolean(resolvedClosingNotes?.trim()))
  const totalPages = 1 + (hasSecondaryPage ? 1 : 0)

  let pageNumber = 1

  return (
    <div className="mx-auto flex w-[1120px] flex-col gap-6 bg-transparent">
      <PdfPageShell pageNumber={pageNumber++} totalPages={totalPages}>
        <div className="flex h-full flex-col bg-[#f6f7fb]">
          <ReportHeader
            client={client}
            startDate={startDate}
            endDate={endDate}
            customTitle={resolvedCustomTitle}
            executiveSummary={resolvedExecutiveSummary}
            isPdf
          />

          <div className="flex-1 space-y-4 px-10 py-8">
            {visibleSections.overview ? <MetricsGrid cards={performanceCards} isPdf /> : null}
            {visibleSections.advancedMetrics ? (
              <AdvancedMetricsSection cards={advancedMetrics} isPdf />
            ) : null}
            {visibleSections.campaignTable ? (
              <PdfCampaignSection
                rows={pdfCampaignRows}
                objectiveLabel={objectiveMetric.label}
                hiddenRowsCount={hiddenPdfCampaignRows}
              />
            ) : null}
          </div>
        </div>
      </PdfPageShell>

      {hasSecondaryPage ? (
        <PdfPageShell pageNumber={pageNumber++} totalPages={totalPages}>
          <div className="flex h-full flex-col bg-[#f6f7fb] px-10 py-8">
            <div className="space-y-5">
              {visibleSections.chart ? (
                <ChartSection
                  chartData={chartData}
                  objectiveLabel={objectiveMetric.label}
                  isPdf
                />
              ) : null}
              {visibleSections.summary ? (
                <SummarySection summary={campaignSummary} isPdf />
              ) : null}
              {visibleSections.topAds ? (
                <TopAdsSection ads={reportData.topAds ?? []} />
              ) : null}
              {visibleSections.gender ? (
                <BreakdownSection
                  title="Gênero"
                  rows={reportData.genderBreakdown ?? []}
                />
              ) : null}
              {shouldShowInsights ? (
                <InsightsSection insights={automaticInsights} isPdf />
              ) : null}
              {visibleSections.notes ? (
                <ManualNotesSection closingNotes={resolvedClosingNotes} />
              ) : null}
            </div>
          </div>
        </PdfPageShell>
      ) : null}
    </div>
  )
}
