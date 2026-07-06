"use client"

import Link from "next/link"
import { useCallback, useEffect, useRef, useState } from "react"
import {
  Calendar,
  ChevronLeft,
  Download,
  Loader2,
  Send,
} from "lucide-react"
import { CampaignSelector } from "@/components/clients/campaign-selector"
import { Header } from "@/components/layout/header"
import { ReportPreview } from "@/components/reports/report-preview"
import { ReportScheduleModal } from "@/components/reports/report-schedule-modal"
import { ReportSchedulesPanel } from "@/components/reports/report-schedules-panel"
import { ReportTemplateEditor } from "@/components/reports/report-template-editor"
import { SendReportComposer } from "@/components/reports/send-report-composer"
import { EmptyState } from "@/components/shared/empty-state"
import { ErrorState } from "@/components/shared/error-state"
import { LoadingSkeleton } from "@/components/shared/loading-skeleton"
import { StatusBadge } from "@/components/shared/status-badge"
import {
  FilterLabel,
  FilterSearchInput,
} from "@/components/ui/filter-controls"
import { fetchJsonOrThrow } from "@/lib/api-client"
import { formatLocalDateInput } from "@/lib/date-input"
import { buildReportSendPreview } from "@/lib/report-message"
import { buildReportPdfFileName } from "@/lib/report-pdf-shared"
import {
  pollSavedReportUntilReady,
  requestQueuedReport,
  saveSavedReportMessage,
  sendReportToWhatsApp,
} from "@/lib/report-client"
import {
  loadReportTemplate,
  saveReportTemplate,
} from "@/lib/report-template-storage"
import { logError } from "@/lib/safe-logger"
import type { ClientListItem } from "@/types/client.types"
import type {
  ReportMetricKey,
  ReportMetricVisibility,
  ReportObjectiveValue,
  ReportPayload,
  ReportSectionKey,
  ReportSectionVisibility,
  ReportSendMode,
  ReportTemplateDraft,
  SavedReportResponse,
} from "@/types/report.types"

const colors = [
  "bg-red-500",
  "bg-red-600",
  "bg-rose-500",
  "bg-rose-600",
  "bg-pink-600",
  "bg-[#C1121F]",
]

const DEFAULT_TEMPLATE_NAME = "Template padrão"

const DEFAULT_REPORT_SECTIONS: ReportSectionVisibility = {
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

const DEFAULT_REPORT_METRICS: ReportMetricVisibility = {
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

function getColor(name: string) {
  return colors[name.charCodeAt(0) % colors.length]
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
}

function isActiveCampaign(campaign: { status?: string | null }) {
  return campaign.status === "ACTIVE"
}

export default function ReportsPage() {
  const reportPollSequenceRef = useRef(0)
  const autoLoadedReportKeyRef = useRef("")
  const [clients, setClients] = useState<ClientListItem[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [search, setSearch] = useState("")
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null)
  const [selectedClientIds, setSelectedClientIds] = useState<string[]>([])
  const [reportData, setReportData] = useState<ReportPayload | null>(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [loadingReportMessage, setLoadingReportMessage] = useState("")
  const [reportError, setReportError] = useState("")
  const [insightsEnabled, setInsightsEnabled] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [currentReportId, setCurrentReportId] = useState<string | null>(null)
  const [actionFeedback, setActionFeedback] = useState("")
  const [sendMode, setSendMode] = useState<ReportSendMode>("PDF_AND_MESSAGE")
  const [sendMessage, setSendMessage] = useState("")
  const [templateName, setTemplateName] = useState(DEFAULT_TEMPLATE_NAME)
  const [customTitle, setCustomTitle] = useState("FACEBOOK - Visão Geral")
  const [executiveSummary, setExecutiveSummary] = useState("")
  const [closingNotes, setClosingNotes] = useState("")
  const [sectionVisibility, setSectionVisibility] = useState<ReportSectionVisibility>(
    DEFAULT_REPORT_SECTIONS
  )
  const [metricVisibility, setMetricVisibility] = useState<ReportMetricVisibility>(
    DEFAULT_REPORT_METRICS
  )
  const [savedTemplateLabel, setSavedTemplateLabel] = useState<string | null>(null)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [bulkScheduleModalOpen, setBulkScheduleModalOpen] = useState(false)
  const [activeListTab, setActiveListTab] = useState<"clients" | "schedules">(
    "clients"
  )

  const [activePeriod, setActivePeriod] = useState("7d")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [objective, setObjective] = useState<ReportObjectiveValue>("ALL")
  const [selectedCampaigns, setSelectedCampaigns] = useState<string[]>([])

  const sleep = useCallback(
    (milliseconds: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds)
      }),
    []
  )

  const resetCustomization = useCallback(() => {
    setTemplateName(DEFAULT_TEMPLATE_NAME)
    setCustomTitle("FACEBOOK - Visão Geral")
    setExecutiveSummary("")
    setClosingNotes("")
    setSectionVisibility(DEFAULT_REPORT_SECTIONS)
    setMetricVisibility(DEFAULT_REPORT_METRICS)
    setSavedTemplateLabel(null)
  }, [])

  const applyTemplate = useCallback(
    (template: ReportTemplateDraft | null, fallbackMessage?: string) => {
      if (!template) {
        setSavedTemplateLabel(null)
        if (fallbackMessage !== undefined) {
          setSendMessage(fallbackMessage)
        }
        return
      }

      setTemplateName(template.name || DEFAULT_TEMPLATE_NAME)
      setCustomTitle(template.customTitle || "FACEBOOK - Visão Geral")
      setExecutiveSummary(template.executiveSummary || "")
      setClosingNotes(template.closingNotes || "")
      setSectionVisibility(template.sections || DEFAULT_REPORT_SECTIONS)
      setMetricVisibility(template.metrics || DEFAULT_REPORT_METRICS)
      setSendMode(template.sendMode || "PDF_AND_MESSAGE")
      setSendMessage(template.sendMessage || fallbackMessage || "")
      setSavedTemplateLabel(template.name || DEFAULT_TEMPLATE_NAME)
    },
    []
  )

  const applySavedReport = useCallback((savedReport: SavedReportResponse) => {
    if (!savedReport.payload) {
      return false
    }

    const payload: ReportPayload = {
      client: savedReport.payload.client,
      campaigns: savedReport.payload.campaigns,
      accountInsights: savedReport.payload.accountInsights,
      dailyInsights: savedReport.payload.dailyInsights,
      topAds: savedReport.payload.topAds,
      genderBreakdown: savedReport.payload.genderBreakdown,
      presentation: savedReport.payload.presentation,
    }

    setCurrentReportId(savedReport.id)
    setReportData(payload)
    setSelectedCampaigns(
      payload.campaigns.filter(isActiveCampaign).map((campaign) => campaign.id)
    )
    const previewMessage = buildReportSendPreview({
      reportId: savedReport.id,
      payload: savedReport.payload,
    })
    if (savedReport.payload.presentation) {
      const presentation = savedReport.payload.presentation

      setCustomTitle(presentation.customTitle || "FACEBOOK - Visão Geral")
      setExecutiveSummary(presentation.executiveSummary || "")
      setClosingNotes(presentation.closingNotes || "")
      setSectionVisibility(presentation.sections || DEFAULT_REPORT_SECTIONS)
      setMetricVisibility(presentation.metrics || DEFAULT_REPORT_METRICS)
      setInsightsEnabled(presentation.insightsEnabled ?? true)
      setSendMessage(previewMessage)
      setSavedTemplateLabel(null)
    } else {
      const savedTemplate = selectedClient
        ? loadReportTemplate(selectedClient.id)
        : null

      applyTemplate(savedTemplate, previewMessage)
    }

    return true
  }, [applyTemplate, selectedClient])

  const clearCurrentReport = useCallback(() => {
    reportPollSequenceRef.current += 1
    setReportData(null)
    setReportError("")
    setSelectedCampaigns([])
    setCurrentReportId(null)
    setActionFeedback("")
    setLoadingReportMessage("")
    setSendMode("PDF_AND_MESSAGE")
    setSendMessage("")
  }, [])

  const resetWorkspace = useCallback(() => {
    reportPollSequenceRef.current += 1
    autoLoadedReportKeyRef.current = ""
    setSelectedClient(null)
    setSelectedClientIds([])
    setSelectedCampaigns([])
    setSearch("")
    setActiveListTab("clients")
    setActivePeriod("7d")
    setObjective("ALL")
    setScheduleModalOpen(false)
    setBulkScheduleModalOpen(false)
    setLoadingReport(false)
    setLoadingReportMessage("")
    setReportError("")
    setActionFeedback("")
    clearCurrentReport()
    resetCustomization()
  }, [clearCurrentReport, resetCustomization])

  useEffect(() => {
    if (!selectedClient) {
      resetCustomization()
      return
    }

    applyTemplate(loadReportTemplate(selectedClient.id))
  }, [applyTemplate, resetCustomization, selectedClient])

  useEffect(() => {
    const today = new Date()
    if (activePeriod === "custom") {
      return
    }

    const daysByPeriod: Record<string, number> = {
      "7d": 7,
      "30d": 30,
      "90d": 90,
      "180d": 180,
      "365d": 365,
    }

    if (activePeriod === "all") {
      setStartDate("2020-01-01")
      setEndDate(formatLocalDateInput(today))
      return
    }

    const start = new Date(today)
    // Mantém o intervalo inclusivo: 1 semana = 7 dias no total, 1 mês = 30 dias, etc.
    start.setDate(today.getDate() - (daysByPeriod[activePeriod] - 1))
    setStartDate(formatLocalDateInput(start))
    setEndDate(formatLocalDateInput(today))
  }, [activePeriod])

  useEffect(() => {
    void fetchJsonOrThrow<ClientListItem[]>(
      "/api/clients",
      undefined,
      "Erro ao carregar clientes"
    )
      .then((data) => {
        setClients(data)
        setLoadingClients(false)
      })
      .catch(() => {
        setClients([])
        setLoadingClients(false)
      })
  }, [])

  useEffect(() => {
    setSelectedClientIds((current) =>
      current.filter((clientId) => clients.some((client) => client.id === clientId))
    )
  }, [clients])

  const waitForQueuedReport = useCallback(
    async (reportId: string, sequence: number) => {
      const savedReport = await pollSavedReportUntilReady({
        reportId,
        sequence,
        getCurrentSequence: () => reportPollSequenceRef.current,
        sleep,
        fallbackMessage: "Erro ao acompanhar a fila do relatório",
        onUpdate: (nextReport) => {
          setCurrentReportId(nextReport.id)

          if (applySavedReport(nextReport)) {
            setLoadingReportMessage("")
            return
          }

          setLoadingReportMessage(
            "Relatório em fila. Processando dados da META API..."
          )
        },
      })

      if (savedReport?.status === "FAILED") {
        throw new Error(
          savedReport.errorMessage || "Não foi possível gerar o relatório"
        )
      }
    },
    [applySavedReport, sleep]
  )

  const fetchReport = useCallback(async () => {
    if (!selectedClient || !startDate || !endDate) {
      return
    }

    clearCurrentReport()
    setLoadingReport(true)
    setReportError("")
    setActionFeedback("")
    setLoadingReportMessage("Enfileirando relatório...")
    const sequence = reportPollSequenceRef.current

    try {
      const response = await requestQueuedReport({
        clientId: selectedClient.id,
        since: startDate,
        until: endDate,
        objective,
        presentation: {
          customTitle,
          executiveSummary,
          closingNotes,
          sections: sectionVisibility,
          metrics: metricVisibility,
          insightsEnabled,
        },
      })
      setCurrentReportId(response.reportId)
      setLoadingReportMessage("Relatório em fila. Processando dados da META API...")
      await waitForQueuedReport(response.reportId, sequence)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao conectar com a META API"
      clearCurrentReport()
      setReportError(message)
    } finally {
      setLoadingReport(false)
    }
  }, [
    clearCurrentReport,
    closingNotes,
    endDate,
    executiveSummary,
    customTitle,
    objective,
    insightsEnabled,
    metricVisibility,
    selectedClient,
    sectionVisibility,
    startDate,
    waitForQueuedReport,
  ])

  useEffect(() => {
    if (!selectedClient || !startDate || !endDate) {
      return
    }

    const reportKey = `${selectedClient.id}:${startDate}:${endDate}:${objective}`

    if (autoLoadedReportKeyRef.current === reportKey) {
      return
    }

    autoLoadedReportKeyRef.current = reportKey
    void fetchReport()
  }, [endDate, fetchReport, objective, selectedClient, startDate])

  const filteredClients = clients.filter(
    (client) =>
      client.name.toLowerCase().includes(search.toLowerCase()) ||
      (client.company ?? "").toLowerCase().includes(search.toLowerCase())
  )
  const allFilteredSelected =
    filteredClients.length > 0 &&
    filteredClients.every((client) => selectedClientIds.includes(client.id))
  const selectedClients = clients.filter((client) =>
    selectedClientIds.includes(client.id)
  )

  function toggleClientSelection(clientId: string) {
    setSelectedClientIds((current) =>
      current.includes(clientId)
        ? current.filter((id) => id !== clientId)
        : [...current, clientId]
    )
  }

  function handleToggleAllFilteredClients() {
    setSelectedClientIds((current) => {
      if (allFilteredSelected) {
        return current.filter(
          (clientId) => !filteredClients.some((client) => client.id === clientId)
        )
      }

      const next = new Set(current)
      filteredClients.forEach((client) => {
        next.add(client.id)
      })

      return Array.from(next)
    })
  }

  function toggleCampaign(id: string) {
    setSelectedCampaigns((current) =>
      current.includes(id)
        ? current.filter((campaignId) => campaignId !== id)
        : [...current, id]
    )
  }

  function toggleSection(section: ReportSectionKey) {
    setSectionVisibility((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

  function toggleMetric(metric: ReportMetricKey) {
    setMetricVisibility((current) => ({
      ...current,
      [metric]: !current[metric],
    }))
  }

  function handleSaveTemplate() {
    if (!selectedClient) {
      return
    }

    const template: ReportTemplateDraft = {
      name: templateName.trim() || DEFAULT_TEMPLATE_NAME,
      customTitle,
      executiveSummary,
      closingNotes,
      sections: sectionVisibility,
      metrics: metricVisibility,
      sendMode,
      sendMessage,
    }

    saveReportTemplate(selectedClient.id, template)
    setSavedTemplateLabel(template.name)
      setActionFeedback(`Template "${template.name}" salvo para este cliente.`)
  }

  function handleLoadTemplate() {
    if (!selectedClient) {
      return
    }

    const template = loadReportTemplate(selectedClient.id)
    if (!template) {
      setActionFeedback("Ainda não existe template salvo para este cliente.")
      return
    }

    applyTemplate(template, sendMessage)
      setActionFeedback(`Template "${template.name}" carregado.`)
  }

  function buildCurrentPresentation() {
    return {
      customTitle,
      executiveSummary,
      closingNotes,
      sections: sectionVisibility,
      metrics: metricVisibility,
      insightsEnabled,
    }
  }

  async function handleSendReport() {
    if (!currentReportId || !selectedClient) {
      return
    }

    setIsSending(true)
    setReportError("")
    setActionFeedback("")

    try {
      await sendReportToWhatsApp(currentReportId, {
        mode: sendMode,
        message: sendMode === "PDF_ONLY" ? undefined : sendMessage,
        presentation: buildCurrentPresentation(),
      })
      setActionFeedback("Envio concluído com o formato selecionado.")
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "Não foi possível enviar o relatório"
      )
    } finally {
      setIsSending(false)
    }
  }

  async function handleDownloadPdf() {
    if (!currentReportId || !selectedClient) {
      return
    }

    setIsExporting(true)

    try {
      await saveSavedReportMessage(currentReportId, sendMessage, {
        presentation: buildCurrentPresentation(),
      })

      const response = await fetch("/api/reports/" + currentReportId + "/pdf", {
        cache: "no-store",
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          (body as { error?: string } | null)?.error ??
            "Não foi possível gerar o PDF (" + response.status + ")"
        )
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get("content-disposition")
      const match = contentDisposition?.match(/filename="?([^"]+)"?/i)
      const fileName =
        match?.[1] ??
        (buildReportPdfFileName({
          clientName: selectedClient.name,
          startDate,
          endDate,
        }) + ".pdf")

      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.rel = "noreferrer"
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (error) {
      logError("dashboard.reports.download-pdf", error, {
        reportId: currentReportId,
      })
      setReportError("Não foi possível gerar o PDF do relatório")
    } finally {
      setIsExporting(false)
    }
  }

  const shellWidthClass =
    activeListTab === "schedules" ? "max-w-7xl" : "max-w-2xl"

  if (!selectedClient) {
    return (
      <>
        <div className="print:hidden">
          <Header
            title="Relatórios"
            subtitle="Selecione um cliente para visualizar o relatório"
          />
        </div>
        <div className="p-8">
          <div className={`mx-auto w-full ${shellWidthClass}`}>
            {actionFeedback ? (
              <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm text-green-700">
                {actionFeedback}
              </div>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
              <button
                type="button"
                onClick={() => setActiveListTab("clients")}
                data-cy="reports-tab-clients"
                className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                  activeListTab === "clients"
                    ? "bg-[#C1121F] text-white shadow-[0_16px_30px_-22px_rgba(193,18,31,0.9)]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Gerar relatório
              </button>
              <button
                type="button"
                onClick={() => setActiveListTab("schedules")}
                data-cy="reports-tab-schedules"
                className={`rounded-2xl px-4 py-2.5 text-sm font-medium transition ${
                  activeListTab === "schedules"
                    ? "bg-[#C1121F] text-white shadow-[0_16px_30px_-22px_rgba(193,18,31,0.9)]"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Agendamentos
              </button>
              <button
                type="button"
                onClick={() => void resetWorkspace()}
                data-cy="reports-reset-workspace"
                className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
              >
                Reiniciar painel
              </button>
            </div>

            {activeListTab === "clients" ? (
              <>
                <FilterSearchInput
                  type="text"
                  placeholder="Buscar cliente por nome ou empresa..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="mb-4"
                  inputClassName="rounded-[26px] py-3.5"
                />

                {!loadingClients && filteredClients.length > 0 ? (
                  <div className="mb-6 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        Selecionados: {selectedClientIds.length}
                      </p>
                      <p className="text-xs text-slate-500">
                        Marque varios clientes ou todos os filtrados para agendar no
                        mesmo horario.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button
                        type="button"
                        onClick={handleToggleAllFilteredClients}
                        className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                      >
                        {allFilteredSelected
                          ? "Desmarcar filtrados"
                          : "Selecionar todos"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedClientIds([])}
                        disabled={selectedClientIds.length === 0}
                        className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                      >
                        Limpar selecao
                      </button>
                      <button
                        type="button"
                        onClick={() => setBulkScheduleModalOpen(true)}
                        disabled={selectedClientIds.length === 0}
                        className="flex items-center justify-center gap-2 rounded-2xl bg-[#C1121F] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#A50F1A] disabled:opacity-60"
                      >
                        <Calendar className="h-4 w-4" />
                        Agendar selecionados
                      </button>
                    </div>
                  </div>
                ) : null}

                {loadingClients ? (
                  <LoadingSkeleton label="Carregando clientes..." />
                ) : filteredClients.length === 0 ? (
                  <EmptyState
                    title="Nenhum cliente encontrado"
                    description="Ajuste a busca para localizar outro cliente."
                    className="border-none py-20"
                  />
                ) : (
                  <div className="space-y-3">
                    {filteredClients.map((client) => (
                      <div
                        key={client.id}
                        className="flex items-center gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-[#C1121F] hover:shadow-md"
                      >
                        <button
                          type="button"
                          aria-label={`Selecionar ${client.name}`}
                          aria-pressed={selectedClientIds.includes(client.id)}
                          onClick={() => toggleClientSelection(client.id)}
                          className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-[11px] font-bold transition ${
                            selectedClientIds.includes(client.id)
                              ? "border-[#C1121F] bg-[#C1121F] text-white"
                              : "border-slate-300 bg-white text-transparent"
                          }`}
                        >
                          X
                        </button>
                        <button
                          type="button"
                          data-cy={`report-client-${client.id}`}
                          onClick={() => {
                            setSelectedClient(client)
                            clearCurrentReport()
                          }}
                          className="flex min-w-0 flex-1 items-center gap-4 text-left"
                        >
                          <div
                            className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full ${getColor(client.name)}`}
                          >
                            <span className="text-sm font-bold text-white">
                              {getInitials(client.name)}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900">
                              {client.name}
                            </p>
                            <p className="text-xs text-gray-400">
                              {client.company ?? "-"} - {client.email ?? "-"}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <StatusBadge
                              tone={
                                client.status === "ACTIVE" ? "success" : "neutral"
                              }
                            >
                              {client.status === "ACTIVE" ? "Ativo" : "Inativo"}
                            </StatusBadge>
                            <span className="text-sm font-medium text-[#C1121F]">
                              Ver relatório
                            </span>
                          </div>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <ReportSchedulesPanel
                clients={clients}
                onSelectClient={(client) => {
                  setSelectedClient(client)
                  clearCurrentReport()
                }}
              />
            )}
          </div>
        </div>
        <ReportScheduleModal
          open={bulkScheduleModalOpen}
          clientIds={selectedClientIds}
          clientNames={selectedClients.map((client) => client.name)}
          defaultFilters={{
            since: startDate,
            until: endDate,
            objective,
          }}
          defaultSendMode={sendMode}
          defaultMessage={sendMessage}
          onClose={() => setBulkScheduleModalOpen(false)}
          onSaved={({ schedules, clientCount }) => {
            const nextRunAt = schedules[0]?.nextRunAt
            setActionFeedback(
              nextRunAt
                ? `Agendamento salvo para ${clientCount} clientes. Primeiro envio em ${new Date(nextRunAt).toLocaleString("pt-BR")}.`
                : `Agendamento salvo para ${clientCount} clientes.`
            )
            setActiveListTab("schedules")
            setBulkScheduleModalOpen(false)
            setSelectedClientIds([])
          }}
        />
      </>
    )
  }

  return (
    <>
      <div className="print:hidden">
        <Header
          title="Relatório"
          subtitle={`${selectedClient.name} · ${startDate} até ${endDate}`}
        />
      </div>

      <div className="flex flex-col xl:h-[calc(100vh-72px)] xl:flex-row print:block">
        <aside className="w-full flex-shrink-0 overflow-y-auto border-b border-slate-200/80 bg-[#FCFDFE] p-4 sm:p-6 xl:w-[420px] xl:border-b-0 xl:border-r print:hidden">
          <button
            onClick={() => {
              setSelectedClient(null)
              clearCurrentReport()
            }}
            className="mb-6 inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para a lista
          </button>

          <div className="mb-6 flex items-center gap-3 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
            <div
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${getColor(selectedClient.name)}`}
            >
              <span className="text-sm font-bold text-white">
                {getInitials(selectedClient.name)}
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {selectedClient.name}
              </p>
              <p className="text-xs text-gray-400">
                {selectedClient.company ?? "-"}
              </p>
            </div>
          </div>

          <div className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
            <FilterLabel>Período</FilterLabel>
            <div className="mb-4 grid grid-cols-2 gap-2">
              {[
                { label: "1 semana", value: "7d" },
                { label: "1 mês", value: "30d" },
                { label: "3 meses", value: "90d" },
                { label: "6 meses", value: "180d" },
                { label: "1 ano", value: "365d" },
                { label: "Todo o tempo", value: "all" },
              ].map((period) => (
                <button
                  key={period.value}
                  onClick={() => setActivePeriod(period.value)}
                  className={`rounded-2xl border px-3 py-2.5 text-xs font-semibold transition ${
                    activePeriod === period.value
                      ? "border-[#C1121F] bg-[#C1121F] text-white shadow-[0_16px_30px_-22px_rgba(193,18,31,0.9)]"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  {period.label}
                </button>
              ))}
            </div>
            <p className="mb-2 text-xs font-medium text-slate-400">
              Período personalizado
            </p>
            <div className="flex gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value)
                  setActivePeriod("custom")
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition focus:border-[#C1121F]/25 focus:outline-none focus:ring-4 focus:ring-[#C1121F]/10"
              />
              <input
                type="date"
                value={endDate}
                onChange={(event) => {
                  setEndDate(event.target.value)
                  setActivePeriod("custom")
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-700 shadow-[0_10px_30px_-22px_rgba(15,23,42,0.45)] transition focus:border-[#C1121F]/25 focus:outline-none focus:ring-4 focus:ring-[#C1121F]/10"
              />
            </div>
          </div>

          <div className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
            <FilterLabel>Objetivo</FilterLabel>
            <div className="grid gap-2">
              {[
                { label: "Todos", value: "ALL" },
                { label: "Tráfego", value: "LINK_CLICKS" },
                { label: "Conversão", value: "CONVERSIONS" },
                { label: "Mensagens", value: "MESSAGES" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() =>
                    setObjective(option.value as ReportObjectiveValue)
                  }
                  className={`flex items-center justify-between rounded-2xl border px-3.5 py-3 text-sm font-medium transition ${
                    objective === option.value
                      ? "border-[#C1121F]/20 bg-[#FFF5F6] text-[#C1121F]"
                      : "border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:bg-slate-100"
                  }`}
                >
                  <span>{option.label}</span>
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      objective === option.value ? "bg-[#C1121F]" : "bg-slate-300"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {reportData?.campaigns.length ? (
            <div className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
              <FilterLabel>Campanhas</FilterLabel>
              <CampaignSelector
                campaigns={reportData.campaigns}
                selectedCampaignIds={selectedCampaigns}
                onToggleCampaign={toggleCampaign}
              />
            </div>
          ) : null}

          <div className="mb-5">
            <ReportTemplateEditor
              templateName={templateName}
              customTitle={customTitle}
              executiveSummary={executiveSummary}
              closingNotes={closingNotes}
              sections={sectionVisibility}
              metrics={metricVisibility}
              hasSavedTemplate={Boolean(savedTemplateLabel)}
              savedTemplateLabel={savedTemplateLabel}
              onTemplateNameChange={setTemplateName}
              onCustomTitleChange={setCustomTitle}
              onExecutiveSummaryChange={setExecutiveSummary}
              onClosingNotesChange={setClosingNotes}
              onSectionToggle={toggleSection}
              onMetricToggle={toggleMetric}
              onSaveTemplate={handleSaveTemplate}
              onLoadTemplate={handleLoadTemplate}
            />
          </div>

          <div className="mb-5 rounded-[28px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_-30px_rgba(15,23,42,0.35)]">
            <label className="flex items-center justify-between gap-3">
              <span>
                <span className="block text-sm font-semibold text-slate-800">
                  Insights automáticos
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  Gera observações inteligentes junto com o relatório.
                </span>
              </span>
              <div
                onClick={() => setInsightsEnabled(!insightsEnabled)}
                className={`relative h-6 w-11 cursor-pointer rounded-full transition ${
                  insightsEnabled ? "bg-[#C1121F]" : "bg-slate-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                    insightsEnabled ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </div>
            </label>
          </div>

          <button
            onClick={() => void fetchReport()}
            data-cy="reports-apply-filters"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#C1121F] py-3 text-sm font-semibold text-white shadow-[0_18px_40px_-24px_rgba(193,18,31,0.9)] transition hover:bg-[#A50F1A]"
          >
            {loadingReport ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Buscando...
              </>
            ) : (
              "Aplicar filtros"
            )}
          </button>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto bg-[#eef1f6] print:overflow-visible print:bg-white">
          {loadingReport ? (
            <LoadingSkeleton
              label={loadingReportMessage || "Gerando relatório..."}
              className="h-full"
            />
          ) : reportError ? (
            <div className="flex h-full items-center justify-center px-6">
              <ErrorState
                title="Erro ao carregar relatório"
                message={reportError}
                action={
                  <button
                    onClick={() => void fetchReport()}
                    className="text-sm font-medium text-[#C1121F] hover:underline"
                  >
                    Tentar novamente
                  </button>
                }
                className="w-full max-w-lg"
              />
            </div>
          ) : !reportData ? (
            <div className="flex h-full items-center justify-center px-6">
              <EmptyState
                title="Nenhum relatório carregado"
                description='Selecione os filtros e clique em "Aplicar filtros".'
                className="w-full max-w-lg border-none bg-transparent py-20"
              />
            </div>
          ) : (
            <div className="px-4 py-5 pb-28 sm:px-6 sm:py-6 md:px-8 md:py-8 print:px-0 print:py-0">
              {actionFeedback ? (
                <div className="mb-4 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm text-green-700 print:hidden">
                  {actionFeedback}
                </div>
              ) : null}

              {currentReportId ? (
                <div className="mb-5">
                  <SendReportComposer
                    mode={sendMode}
                    message={sendMessage}
                    groupLabel={selectedClient.whatsappGroupId || "Grupo do cliente"}
                    templateName={templateName}
                    disabled={isSending}
                    onModeChange={setSendMode}
                    onMessageChange={setSendMessage}
                  />
                </div>
              ) : null}
              <ReportPreview
                client={selectedClient}
                reportData={reportData}
                startDate={startDate}
                endDate={endDate}
                objective={objective}
                selectedCampaignIds={selectedCampaigns}
                insightsEnabled={insightsEnabled}
                metricVisibility={metricVisibility}
                customTitle={customTitle}
                executiveSummary={executiveSummary}
                closingNotes={closingNotes}
                sectionVisibility={sectionVisibility}
              />
            </div>
          )}

          {reportData ? (
            <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8 print:hidden">
              <button
                onClick={() => {
                  setSelectedClient(null)
                  clearCurrentReport()
                }}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </button>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
                {currentReportId ? (
                  <Link
                    href={`/dashboard/reports/${currentReportId}`}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
                  >
                    Ver relatório salvo
                  </Link>
                ) : null}
                <button
                  onClick={() => setScheduleModalOpen(true)}
                  data-cy="reports-open-schedule"
                  className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
                >
                  <Calendar className="h-4 w-4" />
                  Agendar envio
                </button>
                <button
                  onClick={() => void handleSendReport()}
                  data-cy="reports-send-whatsapp"
                  disabled={!currentReportId || isSending}
                  className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {isSending ? "Enviando..." : "Enviar por WhatsApp"}
                </button>
                <button
                  onClick={() => void handleDownloadPdf()}
                  data-cy="reports-save-pdf"
                  disabled={isExporting}
                  className="flex items-center gap-2 rounded-xl bg-[#C1121F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#A50F1A] disabled:opacity-60"
                >
                  <Download className="h-4 w-4" />
                  {isExporting ? "Gerando PDF..." : "Salvar relatório em PDF"}
                </button>
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <ReportScheduleModal
        open={scheduleModalOpen}
        clientId={selectedClient?.id ?? null}
        clientName={selectedClient?.name ?? null}
        defaultFilters={{
          since: startDate,
          until: endDate,
          objective,
        }}
        defaultSendMode={sendMode}
        defaultMessage={sendMessage}
        defaultGroupId={selectedClient?.whatsappGroupId ?? null}
        onClose={() => setScheduleModalOpen(false)}
        onSaved={({ schedules }) => {
          const schedule = schedules[0]
          if (!schedule) {
            return
          }
          setActionFeedback(
            `Agendamento salvo. Próximo envio em ${new Date(schedule.nextRunAt).toLocaleString("pt-BR")}.`
          )
          setScheduleModalOpen(false)
        }}
        onDisabled={() => {
          setActionFeedback("Agendamento automático desativado com sucesso.")
        }}
      />
    </>
  )
}


