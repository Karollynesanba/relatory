"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Header } from "@/components/layout/header"
import { buildReportPdfFileName } from "@/lib/report-pdf-shared"
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  Minus,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react"

type EditableField = {
  id: string
  label: string
  value: string
  type: "text" | "date"
  hidden: boolean
}

type MetricItem = {
  id: string
  label: string
  value: string
  hidden: boolean
}

type CampaignItem = {
  id: string
  name: string
  status: string
  leads: string
  clicks: string
  impressions: string
  spend: string
  hidden: boolean
}

type SectionVisibility = {
  general: boolean
  mainMetrics: boolean
  advancedMetrics: boolean
  campaigns: boolean
}

type ReportDraft = {
  generalFields: EditableField[]
  mainMetrics: MetricItem[]
  advancedMetrics: MetricItem[]
  campaigns: CampaignItem[]
  sections: SectionVisibility
}

type Feedback = {
  tone: "success" | "error" | "neutral"
  message: string
} | null

type WorkspacePayload = {
  reportId: string | null
  savedAt: string
  draft: ReportDraft
}

type SavedReportRecord = {
  id: string
  title: string
  draft: ReportDraft
  createdAt: string
  updatedAt: string
}

const WORKSPACE_KEY = "greatgo-report-builder-workspace-v1"
const RECORDS_KEY = "greatgo-report-builder-records-v1"

const DEFAULT_DRAFT: ReportDraft = {
  generalFields: [
    {
      id: "client-name",
      label: "Nome do cliente",
      value: "Patricia Great",
      type: "text",
      hidden: false,
    },
    {
      id: "platform",
      label: "Plataforma",
      value: "FACEBOOK",
      type: "text",
      hidden: false,
    },
    {
      id: "report-title",
      label: "Título do relatório",
      value: "Visão Geral",
      type: "text",
      hidden: false,
    },
    {
      id: "report-type",
      label: "Tipo do relatório",
      value: "META Ads",
      type: "text",
      hidden: false,
    },
    {
      id: "start-date",
      label: "Data inicial",
      value: "2026-07-13",
      type: "date",
      hidden: false,
    },
    {
      id: "end-date",
      label: "Data final",
      value: "2026-07-19",
      type: "date",
      hidden: false,
    },
    {
      id: "objective",
      label: "Objetivo",
      value: "Leads",
      type: "text",
      hidden: false,
    },
    {
      id: "account-id",
      label: "Identificação da conta",
      value: "act_123",
      type: "text",
      hidden: false,
    },
  ],
  mainMetrics: [
    {
      id: "spend",
      label: "Investimento",
      value: "R$ 554,17",
      hidden: false,
    },
    {
      id: "reach",
      label: "Alcance",
      value: "95.625",
      hidden: false,
    },
    {
      id: "clicks",
      label: "Cliques",
      value: "596",
      hidden: false,
    },
    {
      id: "ctr",
      label: "Taxa de cliques",
      value: "0,46%",
      hidden: false,
    },
  ],
  advancedMetrics: [
    {
      id: "cpc",
      label: "Custo por clique",
      value: "0,93",
      hidden: false,
    },
    {
      id: "conversations-started",
      label: "Conversas iniciadas",
      value: "2",
      hidden: false,
    },
    {
      id: "conversation-rate",
      label: "Taxa de conversa",
      value: "0,34",
      hidden: false,
    },
  ],
  campaigns: [
    {
      id: "campaign-1",
      name: "Campanha 1",
      status: "Ativa",
      leads: "0",
      clicks: "0",
      impressions: "0",
      spend: "R$ 0,00",
      hidden: false,
    },
  ],
  sections: {
    general: true,
    mainMetrics: true,
    advancedMetrics: true,
    campaigns: true,
  },
}

const PAGE_WIDTH = 840

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  return `report-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function cloneDraft(draft: ReportDraft): ReportDraft {
  return JSON.parse(JSON.stringify(draft)) as ReportDraft
}

function readJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null
  }

  const raw = window.localStorage.getItem(key)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function formatDisplayDate(value: string) {
  if (!value) {
    return "--/--/----"
  }

  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) {
    return "--/--/----"
  }

  return date.toLocaleDateString("pt-BR")
}

function parseLooseNumber(value: string) {
  const normalized = value
    .trim()
    .replace(/[R$\s]/g, "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^0-9.-]/g, "")

  return Number(normalized)
}

function isValueValid(value: string) {
  return value.trim().length > 0
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = []

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size))
  }

  return chunks
}

function fieldValueMap(fields: EditableField[]) {
  return fields.reduce<Record<string, string>>((accumulator, field) => {
    accumulator[field.id] = field.value
    return accumulator
  }, {})
}

function setFieldValue(
  fields: EditableField[],
  fieldId: string,
  value: string
) {
  return fields.map((field) =>
    field.id === fieldId ? { ...field, value } : field
  )
}

function toggleFieldHidden(fields: EditableField[], fieldId: string) {
  return fields.map((field) =>
    field.id === fieldId ? { ...field, hidden: !field.hidden } : field
  )
}

function setMetricValue(metrics: MetricItem[], metricId: string, value: string) {
  return metrics.map((metric) =>
    metric.id === metricId ? { ...metric, value } : metric
  )
}

function setMetricLabel(metrics: MetricItem[], metricId: string, label: string) {
  return metrics.map((metric) =>
    metric.id === metricId ? { ...metric, label } : metric
  )
}

function toggleMetricHidden(metrics: MetricItem[], metricId: string) {
  return metrics.map((metric) =>
    metric.id === metricId ? { ...metric, hidden: !metric.hidden } : metric
  )
}

function setCampaignValue(
  campaigns: CampaignItem[],
  campaignId: string,
  key: keyof Omit<CampaignItem, "id" | "hidden">,
  value: string
) {
  return campaigns.map((campaign) =>
    campaign.id === campaignId ? { ...campaign, [key]: value } : campaign
  )
}

function toggleCampaignHidden(campaigns: CampaignItem[], campaignId: string) {
  return campaigns.map((campaign) =>
    campaign.id === campaignId
      ? { ...campaign, hidden: !campaign.hidden }
      : campaign
  )
}

function duplicateCampaign(campaigns: CampaignItem[], campaignId: string) {
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId)
  if (index < 0) {
    return campaigns
  }

  const original = campaigns[index]
  const copy: CampaignItem = {
    ...original,
    id: makeId(),
    name: `${original.name} - copia`,
  }

  return [
    ...campaigns.slice(0, index + 1),
    copy,
    ...campaigns.slice(index + 1),
  ]
}

function moveCampaign(campaigns: CampaignItem[], campaignId: string, delta: number) {
  const index = campaigns.findIndex((campaign) => campaign.id === campaignId)
  const nextIndex = index + delta

  if (index < 0 || nextIndex < 0 || nextIndex >= campaigns.length) {
    return campaigns
  }

  const next = [...campaigns]
  const [item] = next.splice(index, 1)
  next.splice(nextIndex, 0, item)
  return next
}

function validateDraft(draft: ReportDraft) {
  const fields = fieldValueMap(draft.generalFields)
  const requiredFields = [
    { id: "client-name", label: "Nome do cliente" },
    { id: "platform", label: "Plataforma" },
    { id: "report-title", label: "Título do relatório" },
    { id: "report-type", label: "Tipo do relatório" },
    { id: "start-date", label: "Data inicial" },
    { id: "end-date", label: "Data final" },
    { id: "objective", label: "Objetivo" },
    { id: "account-id", label: "Identificação da conta" },
  ]

  for (const field of requiredFields) {
    if (!isValueValid(fields[field.id])) {
      return `Preencha o campo "${field.label}".`
    }
  }

  const startDate = fields["start-date"]
  const endDate = fields["end-date"]
  if (startDate > endDate) {
    return "A data inicial precisa ser menor ou igual à data final."
  }

  for (const metric of [...draft.mainMetrics, ...draft.advancedMetrics]) {
    if (!isValueValid(metric.label)) {
      return "Todos os campos de métrica precisam ter um nome."
    }
    if (!isValueValid(metric.value) || Number.isNaN(parseLooseNumber(metric.value))) {
      return `O valor de "${metric.label}" precisa ser numérico.`
    }
  }

  for (const campaign of draft.campaigns) {
    if (!isValueValid(campaign.name)) {
      return "Cada campanha precisa ter um nome."
    }
    if (!isValueValid(campaign.status)) {
      return `Informe o status de "${campaign.name}".`
    }

    const numericFields = [
      { label: "Leads", value: campaign.leads },
      { label: "Cliques", value: campaign.clicks },
      { label: "Impressões", value: campaign.impressions },
      { label: "Gasto", value: campaign.spend },
    ]

    for (const numericField of numericFields) {
      if (
        !isValueValid(numericField.value) ||
        Number.isNaN(parseLooseNumber(numericField.value))
      ) {
        return `O campo "${numericField.label}" da campanha "${campaign.name}" precisa ser numérico.`
      }
    }
  }

  return null
}

function formatCurrencyLike(value: string) {
  if (!value) {
    return "-"
  }

  return value
}

function buildPreviewTitle(draft: ReportDraft) {
  const fields = fieldValueMap(draft.generalFields)
  const platform = fields.platform || "Relatório"
  const title = fields["report-title"] || "Visão Geral"
  return `${platform} - ${title}`
}

function buildPreviewPeriod(draft: ReportDraft) {
  const fields = fieldValueMap(draft.generalFields)
  return `Período: ${formatDisplayDate(fields["start-date"])} a ${formatDisplayDate(fields["end-date"])}`
}

function PreviewPageShell({
  pageNumber,
  totalPages,
  children,
}: {
  pageNumber: number
  totalPages: number
  children: React.ReactNode
}) {
  return (
    <article
      data-preview-page
      className="flex h-[1188px] w-[840px] flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.08)]"
    >
      {children}
      <div className="mt-auto flex items-center justify-end border-t border-slate-100 px-8 py-3 text-[11px] font-medium text-slate-500">
        Página {pageNumber} de {totalPages}
      </div>
    </article>
  )
}

function TagButton({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[#f2c9cd] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#df4d56] shadow-sm">
      {label}
    </span>
  )
}

function PageHeader({
  draft,
}: {
  draft: ReportDraft
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-8 py-7">
      <div>
        <p className="text-[19px] font-bold tracking-[-0.03em] text-slate-950">
          {buildPreviewTitle(draft)}
        </p>
        <p className="mt-1 text-[12px] text-[#6b86d8]">{buildPreviewPeriod(draft)}</p>
      </div>
      <span className="inline-flex rounded-full bg-[#eef2fb] px-3 py-1 text-[11px] font-semibold text-slate-500">
        Prévia fiel ao PDF
      </span>
    </div>
  )
}

function MetricCard({
  metric,
  accent,
}: {
  metric: MetricItem
  accent: string
}) {
  return (
    <div className="relative rounded-[20px] border border-[#dce6f5] bg-white px-4 py-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.28)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <span className={`mt-1 h-2.5 w-2.5 rounded-full ${accent}`} />
        <TagButton label="Excluir" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {metric.label}
      </p>
      <p className="mt-2 text-[24px] font-bold tracking-[-0.03em] text-slate-900">
        {metric.value}
      </p>
    </div>
  )
}

function InfoFieldCard({ field }: { field: EditableField }) {
  return (
    <div className="rounded-[18px] border border-[#dce6f5] bg-white px-3 py-3 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]">
      <div className="mb-3 flex items-start justify-between gap-2">
        <TagButton label="Excluir" />
      </div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {field.label}
      </p>
      <p className="mt-2 text-[14px] font-semibold text-slate-900">
        {field.value || "-"}
      </p>
    </div>
  )
}

function CampaignTable({
  campaigns,
}: {
  campaigns: CampaignItem[]
}) {
  return (
    <section className="rounded-[24px] border border-[#dce6f5] bg-white p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.26)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
            Performance por campanha
          </h2>
          <p className="text-[12px] text-slate-500">
            Campanhas consideradas neste relatório.
          </p>
        </div>
        <TagButton label="Excluir seção" />
      </div>

      <div className="overflow-hidden rounded-[18px] border border-[#e5edf8]">
        <div className="grid grid-cols-[1.6fr_0.7fr_0.55fr_0.55fr_0.65fr_0.75fr] gap-2 border-b border-[#e5edf8] bg-[#f8fbff] px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          <span>Campanha</span>
          <span>Status</span>
          <span>Leads</span>
          <span>Cliques</span>
          <span>Impressões</span>
          <span>Gasto</span>
        </div>
        {campaigns.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            Nenhuma campanha visível nesta seção.
          </div>
        ) : (
          <div className="divide-y divide-[#edf3fb]">
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="grid grid-cols-[1.6fr_0.7fr_0.55fr_0.55fr_0.65fr_0.75fr] gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-semibold text-slate-900">{campaign.name}</p>
                </div>
                <div className="text-slate-600">{campaign.status}</div>
                <div className="text-slate-600">{campaign.leads}</div>
                <div className="text-slate-600">{campaign.clicks}</div>
                <div className="text-slate-600">{campaign.impressions}</div>
                <div className="font-medium text-slate-900">{campaign.spend}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function SummaryPage({
  draft,
  totalPages,
  sectionVisible,
}: {
  draft: ReportDraft
  totalPages: number
  sectionVisible: boolean
}) {
  const fields = draft.generalFields.filter((field) => !field.hidden)
  const fieldCards = fields.map((field) => field)

  return (
    <PreviewPageShell pageNumber={2} totalPages={totalPages}>
      <PageHeader draft={draft} />

      <div className="px-8 py-6">
        {sectionVisible ? (
          <section className="rounded-[24px] border border-[#dce6f5] bg-white p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.24)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
                  Informações do relatório
                </h2>
                <p className="text-[12px] text-slate-500">
                  Dados complementares do documento.
                </p>
              </div>
              <TagButton label="Remover seção" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {fieldCards.map((field) => (
                <InfoFieldCard key={field.id} field={field} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </PreviewPageShell>
  )
}

function OverviewPage({
  draft,
  pageNumber,
  totalPages,
  campaigns,
  showCampaignContinuation,
  sectionVisibility,
}: {
  draft: ReportDraft
  pageNumber: number
  totalPages: number
  campaigns: CampaignItem[]
  showCampaignContinuation: boolean
  sectionVisibility: SectionVisibility
}) {
  const mainMetrics = draft.mainMetrics.filter((metric) => !metric.hidden)
  const advancedMetrics = draft.advancedMetrics.filter((metric) => !metric.hidden)
  const accents = ["bg-[#5b78db]", "bg-[#18a6a6]", "bg-[#f8a84b]", "bg-[#64b56d]"]

  return (
    <PreviewPageShell pageNumber={pageNumber} totalPages={totalPages}>
      <PageHeader draft={draft} />

      <div className="flex-1 space-y-5 px-8 py-6">
        {sectionVisibility.mainMetrics ? (
          <section>
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
                  Visão geral
                </h2>
                <p className="text-[12px] text-slate-500">
                  Os quatro blocos principais do relatório.
                </p>
              </div>
              <TagButton label="Excluir seção" />
            </div>

            <div className="grid grid-cols-4 gap-3">
              {mainMetrics.map((metric, index) => (
                <MetricCard
                  key={metric.id}
                  metric={metric}
                  accent={accents[index % accents.length]}
                />
              ))}
            </div>
          </section>
        ) : null}

        {sectionVisibility.advancedMetrics ? (
          <section className="rounded-[24px] border border-[#dce6f5] bg-white p-5 shadow-[0_18px_34px_-26px_rgba(15,23,42,0.24)]">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
                  Visão geral e métricas avançadas
                </h2>
                <p className="text-[12px] text-slate-500">
                  Consolidado da conta no período selecionado.
                </p>
              </div>
              <TagButton label="Remover seção" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              {advancedMetrics.map((metric) => (
                <div
                  key={metric.id}
                  className="rounded-[18px] border border-[#dce6f5] bg-[#fbfdff] px-4 py-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.2)]"
                >
                  <div className="mb-3 flex items-start justify-end gap-2">
                    <TagButton label="Excluir" />
                  </div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {metric.label}
                  </p>
                  <p className="mt-2 text-[20px] font-bold tracking-[-0.03em] text-slate-900">
                    {metric.value}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {sectionVisibility.campaigns ? (
          <>
            <CampaignTable campaigns={campaigns} />

            {showCampaignContinuation ? (
              <div className="rounded-[20px] border border-dashed border-[#dce6f5] px-4 py-3 text-[12px] text-slate-500">
                Continuação da tabela em páginas adicionais.
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </PreviewPageShell>
  )
}

function SectionCard({
  title,
  description,
  children,
  sectionVisible,
  onToggleSection,
}: {
  title: string
  description: string
  children: React.ReactNode
  sectionVisible: boolean
  onToggleSection: () => void
}) {
  return (
    <section className="rounded-[26px] border border-[#d9e3f5] bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.18)]">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
            {title}
          </h2>
          <p className="text-[12px] text-slate-500">{description}</p>
        </div>
        <button
          type="button"
          onClick={onToggleSection}
          className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
            sectionVisible
              ? "border-[#f2c9cd] bg-white text-[#df4d56] hover:bg-[#fff6f7]"
              : "border-[#c9d9f3] bg-[#eef4ff] text-[#4663d8] hover:bg-[#e7efff]"
          }`}
        >
          {sectionVisible ? "Excluir seção" : "Restaurar seção"}
        </button>
      </div>
      <div className={sectionVisible ? "" : "opacity-50"}>
        {children}
      </div>
    </section>
  )
}

function FieldEditorCard({
  field,
  onChange,
  onToggleHidden,
}: {
  field: EditableField
  onChange: (value: string) => void
  onToggleHidden: () => void
}) {
  return (
    <div
      className={`rounded-[18px] border border-[#dce6f5] bg-[#fbfdff] p-3 ${
        field.hidden ? "opacity-65" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {field.label}
        </p>
        <button
          type="button"
          onClick={onToggleHidden}
          className="rounded-full border border-[#f2c9cd] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#df4d56]"
        >
          {field.hidden ? "Restaurar" : "Excluir"}
        </button>
      </div>
      <input
        type={field.type}
        value={field.value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
      />
    </div>
  )
}

function MetricEditorCard({
  metric,
  onLabelChange,
  onValueChange,
  onToggleHidden,
}: {
  metric: MetricItem
  onLabelChange?: (value: string) => void
  onValueChange: (value: string) => void
  onToggleHidden: () => void
}) {
  return (
    <div
      className={`rounded-[18px] border border-[#dce6f5] bg-[#fbfdff] p-3 ${
        metric.hidden ? "opacity-65" : ""
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <input
          value={metric.label}
          onChange={(event) => onLabelChange?.(event.target.value)}
          disabled={!onLabelChange}
          className="min-w-0 flex-1 bg-transparent text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 outline-none disabled:cursor-default"
        />
        <button
          type="button"
          onClick={onToggleHidden}
          className="rounded-full border border-[#f2c9cd] bg-white px-2.5 py-1 text-[10px] font-semibold text-[#df4d56]"
        >
          {metric.hidden ? "Restaurar" : "Excluir"}
        </button>
      </div>
      <input
        value={metric.value}
        onChange={(event) => onValueChange(event.target.value)}
        className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
      />
    </div>
  )
}

function CampaignEditorCard({
  campaign,
  onChange,
  onToggleHidden,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  campaign: CampaignItem
  onChange: (key: keyof Omit<CampaignItem, "id" | "hidden">, value: string) => void
  onToggleHidden: () => void
  onDuplicate: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <article
      className={`rounded-[22px] border border-[#d8e3f5] bg-[#fbfdff] p-4 ${
        campaign.hidden ? "opacity-65" : ""
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {campaign.name || "Campanha sem nome"}
          </p>
          <p className="mt-1 text-xs text-slate-400">Organize e edite os dados da campanha.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8e3f5] bg-white text-slate-600 transition hover:bg-slate-50"
            aria-label="Mover campanha para cima"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d8e3f5] bg-white text-slate-600 transition hover:bg-slate-50"
            aria-label="Mover campanha para baixo"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDuplicate}
            className="inline-flex items-center gap-2 rounded-full border border-[#cfdcf5] bg-white px-3 py-2 text-sm font-semibold text-[#4663d8] transition hover:bg-[#eef4ff]"
          >
            <Copy className="h-4 w-4" />
            Duplicar
          </button>
          <button
            type="button"
            onClick={onToggleHidden}
            className="inline-flex items-center gap-2 rounded-full border border-[#f2c9cd] bg-white px-3 py-2 text-sm font-semibold text-[#df4d56] transition hover:bg-[#fff6f7]"
          >
            <Trash2 className="h-4 w-4" />
            {campaign.hidden ? "Restaurar" : "Excluir"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Nome da campanha
          </span>
          <input
            value={campaign.name}
            onChange={(event) => onChange("name", event.target.value)}
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Status
          </span>
          <input
            value={campaign.status}
            onChange={(event) => onChange("status", event.target.value)}
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Leads
          </span>
          <input
            value={campaign.leads}
            onChange={(event) => onChange("leads", event.target.value)}
            inputMode="decimal"
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Cliques
          </span>
          <input
            value={campaign.clicks}
            onChange={(event) => onChange("clicks", event.target.value)}
            inputMode="decimal"
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Impressões
          </span>
          <input
            value={campaign.impressions}
            onChange={(event) => onChange("impressions", event.target.value)}
            inputMode="decimal"
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
        <label className="space-y-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            Gasto
          </span>
          <input
            value={campaign.spend}
            onChange={(event) => onChange("spend", event.target.value)}
            className="w-full rounded-2xl border border-[#d8e3f5] bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition focus:border-[#C1121F]/25 focus:ring-4 focus:ring-[#C1121F]/10"
          />
        </label>
      </div>
    </article>
  )
}

export default function ReportBuilderPage() {
  const previewRef = useRef<HTMLDivElement | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [draft, setDraft] = useState<ReportDraft>(cloneDraft(DEFAULT_DRAFT))
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [mobileView, setMobileView] = useState<"editor" | "preview">("editor")
  const [zoom, setZoom] = useState(85)

  useEffect(() => {
    const workspace = readJson<WorkspacePayload>(WORKSPACE_KEY)
    if (workspace) {
      setDraft(workspace.draft)
      setCurrentReportId(workspace.reportId)
      setLastSavedAt(workspace.savedAt)
      setHydrated(true)
      return
    }

    const records = readJson<SavedReportRecord[]>(RECORDS_KEY)
    const lastRecord = records?.at(-1)

    if (lastRecord) {
      setDraft(lastRecord.draft)
      setCurrentReportId(lastRecord.id)
      setLastSavedAt(lastRecord.updatedAt)
    }

    setHydrated(true)
  }, [])

  useEffect(() => {
    if (!hydrated) {
      return
    }

    writeJson(WORKSPACE_KEY, {
      reportId: currentReportId,
      savedAt: lastSavedAt ?? new Date().toISOString(),
      draft,
    } satisfies WorkspacePayload)
  }, [currentReportId, draft, hydrated, lastSavedAt])

  const visibleCampaigns = useMemo(
    () => draft.campaigns.filter((campaign) => !campaign.hidden),
    [draft.campaigns]
  )
  const campaignPages = useMemo(
    () => chunkArray(visibleCampaigns, 4),
    [visibleCampaigns]
  )
  const totalPages = 2 + Math.max(0, campaignPages.length - 1)

  function showFeedback(nextFeedback: Feedback) {
    setFeedback(nextFeedback)
    if (nextFeedback?.tone !== "error") {
      window.setTimeout(() => setFeedback(null), 3500)
    }
  }

  function updateDraft(updater: (current: ReportDraft) => ReportDraft) {
    setDraft((current) => updater(cloneDraft(current)))
  }

  function saveRecords(
    nextId: string,
    nextDraft: ReportDraft,
    feedbackMessage: string
  ) {
    const now = new Date().toISOString()
    const records = readJson<SavedReportRecord[]>(RECORDS_KEY) ?? []
    const existingIndex = records.findIndex((record) => record.id === nextId)

    const nextRecord: SavedReportRecord = {
      id: nextId,
      title: buildPreviewTitle(nextDraft),
      draft: nextDraft,
      createdAt: existingIndex >= 0 ? records[existingIndex].createdAt : now,
      updatedAt: now,
    }

    const nextRecords =
      existingIndex >= 0
        ? records.map((record) => (record.id === nextId ? nextRecord : record))
        : [...records, nextRecord]

    writeJson(RECORDS_KEY, nextRecords)
    setCurrentReportId(nextId)
    setLastSavedAt(now)
    writeJson(WORKSPACE_KEY, {
      reportId: nextId,
      savedAt: now,
      draft: nextDraft,
    } satisfies WorkspacePayload)

    showFeedback({
      tone: "success",
      message: feedbackMessage,
    })
  }

  function handleSave(mode: "create" | "update" | "duplicate") {
    const validationError = validateDraft(draft)
    if (validationError) {
      showFeedback({ tone: "error", message: validationError })
      return
    }

    const nextDraft = cloneDraft(draft)
    let nextId = currentReportId

    if (mode === "duplicate") {
      nextId = makeId()
      nextDraft.generalFields = nextDraft.generalFields.map((field) =>
        field.id === "report-title"
          ? { ...field, value: `${field.value} - cópia` }
          : field
      )
    } else if (mode === "create" || !nextId) {
      nextId = makeId()
    }

    saveRecords(
      nextId,
      nextDraft,
      mode === "duplicate"
        ? "Relatório duplicado e salvo com sucesso."
        : mode === "create" || !currentReportId
          ? "Relatório criado e salvo com sucesso."
          : "Alterações atualizadas com sucesso."
    )
  }

  function handleAddMetric() {
    updateDraft((current) => ({
      ...current,
      advancedMetrics: [
        ...current.advancedMetrics,
        {
          id: makeId(),
          label: "Métrica personalizada",
          value: "0",
          hidden: false,
        },
      ],
    }))
  }

  function handleAddCampaign() {
    updateDraft((current) => ({
      ...current,
      campaigns: [
        ...current.campaigns,
        {
          id: makeId(),
          name: `Campanha ${current.campaigns.length + 1}`,
          status: "Ativa",
          leads: "0",
          clicks: "0",
          impressions: "0",
          spend: "R$ 0,00",
          hidden: false,
        },
      ],
    }))
  }

  async function handleDownloadPdf() {
    if (!previewRef.current) {
      showFeedback({
        tone: "error",
        message: "A prévia ainda não está pronta para exportação.",
      })
      return
    }

    setIsExporting(true)

    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ])

      const pages = Array.from(
        previewRef.current.querySelectorAll<HTMLElement>("[data-preview-page]")
      )

      if (pages.length === 0) {
        throw new Error("Nenhuma página encontrada na prévia.")
      }

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()

      for (let index = 0; index < pages.length; index += 1) {
        const page = pages[index]
        const canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: "#f4f7fb",
          useCORS: true,
        })
        const imgData = canvas.toDataURL("image/png")
        const imgHeight = (canvas.height * pageWidth) / canvas.width

        if (index > 0) {
          pdf.addPage()
        }

        pdf.addImage(imgData, "PNG", 0, 0, pageWidth, Math.min(pageHeight, imgHeight))
      }

      const fields = fieldValueMap(draft.generalFields)
      pdf.save(
        `${buildReportPdfFileName({
          clientName: fields["client-name"] || "relatorio",
          startDate: fields["start-date"] || "2026-01-01",
          endDate: fields["end-date"] || "2026-01-01",
        })}.pdf`
      )
      showFeedback({
        tone: "success",
        message: "PDF gerado com a mesma prévia exibida na tela.",
      })
    } catch (error) {
      showFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível gerar o PDF do relatório.",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <>
      <Header
        title="Relatório"
        subtitle="Edite os campos e acompanhe a prévia em tempo real."
      />

      <div className="flex flex-col gap-4 px-4 pb-5 pt-2 sm:px-6 lg:px-8 xl:h-[calc(100vh-72px)] xl:flex-row xl:gap-5">
        <div className="xl:hidden">
          <div className="flex rounded-[18px] border border-[#d8e3f5] bg-white p-1 shadow-[0_12px_28px_-22px_rgba(15,23,42,0.2)]">
            <button
              type="button"
              onClick={() => setMobileView("editor")}
              className={`flex-1 rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                mobileView === "editor"
                  ? "bg-[#111c3a] text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Editar
            </button>
            <button
              type="button"
              onClick={() => setMobileView("preview")}
              className={`flex-1 rounded-[14px] px-4 py-2 text-sm font-semibold transition ${
                mobileView === "preview"
                  ? "bg-[#111c3a] text-white"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Prévia
            </button>
          </div>
        </div>

        <aside
          className={`${
            mobileView === "preview" ? "hidden" : "block"
          } xl:block xl:w-[425px] xl:shrink-0 xl:overflow-y-auto xl:pr-1`}
        >
          <div className="space-y-4 rounded-[30px] border border-[#d8e3f5] bg-[#f8fbff] p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.25)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[22px] font-black tracking-[-0.04em] text-slate-950">
                  Relatório
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Edite os campos e acompanhe a prévia em tempo real.
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-[#d8e3f5] bg-white px-3 py-1 text-xs font-semibold text-[#4663d8]">
                Autosave: on
              </span>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 xl:grid-cols-4">
              <button
                type="button"
                onClick={() => handleSave("update")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfdcf5] bg-white px-4 py-3 text-sm font-semibold text-[#4663d8] transition hover:bg-[#eef4ff]"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadPdf()}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfdcf5] bg-[#eef4ff] px-4 py-3 text-sm font-semibold text-[#4663d8] transition hover:bg-[#e5edff]"
              >
                <Download className="h-4 w-4" />
                Baixar PDF
              </button>
              <button
                type="button"
                onClick={() => handleSave("duplicate")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#cfdcf5] bg-white px-4 py-3 text-sm font-semibold text-[#4663d8] transition hover:bg-[#eef4ff]"
              >
                <Copy className="h-4 w-4" />
                Duplicar
              </button>
              <button
                type="button"
                onClick={() => handleSave("create")}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#111c3a] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0b142a]"
              >
                <FileText className="h-4 w-4" />
                Criar relatório
              </button>
            </div>

            {feedback ? (
              <div
                className={`rounded-[20px] border px-4 py-3 text-sm ${
                  feedback.tone === "error"
                    ? "border-[#f2c9cd] bg-[#fff6f7] text-[#c43d47]"
                    : "border-[#cfe4d5] bg-[#f4fff7] text-[#1f7a4c]"
                }`}
              >
                <div className="flex items-start gap-2">
                  {feedback.tone === "error" ? (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                  )}
                  <p>{feedback.message}</p>
                </div>
              </div>
            ) : null}

            <SectionCard
              title="Informações gerais"
              description="Remova qualquer dado que você não queira levar para o PDF."
              sectionVisible={draft.sections.general}
              onToggleSection={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: {
                    ...current.sections,
                    general: !current.sections.general,
                  },
                }))
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {draft.generalFields.map((field) => (
                  <FieldEditorCard
                    key={field.id}
                    field={field}
                    onChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        generalFields: setFieldValue(current.generalFields, field.id, value),
                      }))
                    }
                    onToggleHidden={() =>
                      updateDraft((current) => ({
                        ...current,
                        generalFields: toggleFieldHidden(current.generalFields, field.id),
                      }))
                    }
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Métricas principais"
              description="Clique em Excluir para esconder qualquer métrica do PDF."
              sectionVisible={draft.sections.mainMetrics}
              onToggleSection={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: {
                    ...current.sections,
                    mainMetrics: !current.sections.mainMetrics,
                  },
                }))
              }
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {draft.mainMetrics.map((metric) => (
                  <MetricEditorCard
                    key={metric.id}
                    metric={metric}
                    onValueChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        mainMetrics: setMetricValue(current.mainMetrics, metric.id, value),
                      }))
                    }
                    onToggleHidden={() =>
                      updateDraft((current) => ({
                        ...current,
                        mainMetrics: toggleMetricHidden(current.mainMetrics, metric.id),
                      }))
                    }
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Métricas avançadas"
              description="Você pode incluir métricas extras antes de baixar o PDF."
              sectionVisible={draft.sections.advancedMetrics}
              onToggleSection={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: {
                    ...current.sections,
                    advancedMetrics: !current.sections.advancedMetrics,
                  },
                }))
              }
            >
              <div className="mb-3 flex justify-end">
                <button
                  type="button"
                  onClick={handleAddMetric}
                  className="inline-flex items-center gap-2 rounded-full border border-[#cfdcf5] bg-white px-3 py-2 text-sm font-semibold text-[#4663d8] transition hover:bg-[#eef4ff]"
                >
                  <Plus className="h-4 w-4" />
                  Nova métrica
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {draft.advancedMetrics.map((metric) => (
                  <MetricEditorCard
                    key={metric.id}
                    metric={metric}
                    onLabelChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        advancedMetrics: setMetricLabel(
                          current.advancedMetrics,
                          metric.id,
                          value
                        ),
                      }))
                    }
                    onValueChange={(value) =>
                      updateDraft((current) => ({
                        ...current,
                        advancedMetrics: setMetricValue(
                          current.advancedMetrics,
                          metric.id,
                          value
                        ),
                      }))
                    }
                    onToggleHidden={() =>
                      updateDraft((current) => ({
                        ...current,
                        advancedMetrics: toggleMetricHidden(
                          current.advancedMetrics,
                          metric.id
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard
              title="Campanhas"
              description="Adicione, duplique e reorganize campanhas antes de exportar."
              sectionVisible={draft.sections.campaigns}
              onToggleSection={() =>
                updateDraft((current) => ({
                  ...current,
                  sections: {
                    ...current.sections,
                    campaigns: !current.sections.campaigns,
                  },
                }))
              }
            >
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  Adicione, remova, duplique ou mova campanhas.
                </p>
                <button
                  type="button"
                  onClick={handleAddCampaign}
                  className="inline-flex items-center gap-2 rounded-full border border-[#cfdcf5] bg-white px-3 py-2 text-sm font-semibold text-[#4663d8] transition hover:bg-[#eef4ff]"
                >
                  <Plus className="h-4 w-4" />
                  + Nova campanha
                </button>
              </div>

              <div className="space-y-3">
                {draft.campaigns.map((campaign, index) => (
                  <CampaignEditorCard
                    key={campaign.id}
                    campaign={campaign}
                    onChange={(key, value) =>
                      updateDraft((current) => ({
                        ...current,
                        campaigns: setCampaignValue(
                          current.campaigns,
                          campaign.id,
                          key,
                          value
                        ),
                      }))
                    }
                    onToggleHidden={() =>
                      updateDraft((current) => ({
                        ...current,
                        campaigns: toggleCampaignHidden(current.campaigns, campaign.id),
                      }))
                    }
                    onDuplicate={() =>
                      updateDraft((current) => ({
                        ...current,
                        campaigns: duplicateCampaign(current.campaigns, campaign.id),
                      }))
                    }
                    onMoveUp={() =>
                      updateDraft((current) => ({
                        ...current,
                        campaigns: moveCampaign(current.campaigns, campaign.id, -1),
                      }))
                    }
                    onMoveDown={() =>
                      updateDraft((current) => ({
                        ...current,
                        campaigns: moveCampaign(current.campaigns, campaign.id, 1),
                      }))
                    }
                  />
                ))}
              </div>
            </SectionCard>

            <section className="rounded-[26px] border border-[#d9e3f5] bg-white p-4 shadow-[0_18px_40px_-30px_rgba(15,23,42,0.18)]">
              <h2 className="text-[18px] font-bold tracking-[-0.03em] text-slate-950">
                Validações
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Datas, números e campanhas são validados antes de salvar ou exportar.
                Nenhum dado é apagado ao esconder um campo ou seção.
              </p>
            </section>
          </div>
        </aside>

        <section
          className={`${
            mobileView === "editor" ? "hidden" : "block"
          } min-h-0 flex-1 rounded-[30px] border border-[#d8e3f5] bg-[#eef1f6] p-4 shadow-[0_18px_42px_-34px_rgba(15,23,42,0.22)] xl:block xl:h-[calc(100vh-96px)] xl:overflow-hidden`}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-[22px] font-black tracking-[-0.04em] text-slate-950">
                Prévia
              </p>
              <p className="mt-1 text-sm text-slate-500">
                O mesmo componente usado na exportação para manter fidelidade visual.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((current) => Math.max(70, current - 5))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e3f5] bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Diminuir zoom"
              >
                <Minus className="h-4 w-4" />
              </button>
              <span className="inline-flex min-w-[56px] items-center justify-center rounded-full border border-[#d8e3f5] bg-white px-3 py-2 text-sm font-semibold text-slate-500">
                {zoom}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((current) => Math.min(115, current + 5))}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#d8e3f5] bg-white text-slate-500 transition hover:bg-slate-50"
                aria-label="Aumentar zoom"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="h-[calc(100%-64px)] overflow-auto rounded-[28px] border border-[#d8e3f5] bg-white/65 p-5">
            <div className="mx-auto w-fit" ref={previewRef}>
              <div
                style={{
                  width: `${PAGE_WIDTH / (zoom / 100)}px`,
                  transform: `scale(${zoom / 100})`,
                  transformOrigin: "top center",
                }}
                className="mx-auto flex flex-col gap-8"
              >
                <OverviewPage
                  draft={draft}
                  pageNumber={1}
                  totalPages={totalPages}
                  campaigns={campaignPages[0] ?? []}
                  showCampaignContinuation={campaignPages.length > 1}
                  sectionVisibility={draft.sections}
                />

                <SummaryPage
                  draft={draft}
                  totalPages={totalPages}
                  sectionVisible={draft.sections.general}
                />

                {campaignPages.slice(1).map((campaignPage, index) => (
                  <PreviewPageShell
                    key={`campaign-page-${index}`}
                    pageNumber={index + 3}
                    totalPages={totalPages}
                  >
                    <PageHeader draft={draft} />
                    <div className="px-8 py-6">
                      <CampaignTable campaigns={campaignPage} />
                    </div>
                  </PreviewPageShell>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
