"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
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
import { SendReportComposer } from "@/components/reports/send-report-composer"
import { ErrorState } from "@/components/shared/error-state"
import { LoadingSkeleton } from "@/components/shared/loading-skeleton"
import { buildReportSendPreview } from "@/lib/report-message"
import { buildReportPdfFileName } from "@/lib/report-pdf-shared"
import {
  pollSavedReportUntilReady,
  saveSavedReportMessage,
  sendReportToWhatsApp,
} from "@/lib/report-client"
import { logError } from "@/lib/safe-logger"
import type { ReportSendMode, SavedReportResponse } from "@/types/report.types"

function isActiveCampaign(campaign: { status?: string | null }) {
  return campaign.status === "ACTIVE"
}

export default function ReportPreviewPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const reportPollSequenceRef = useRef(0)
  const initialSendModeRef = useRef<ReportSendMode>("PDF_AND_MESSAGE")
  const initialSendMessageRef = useRef("")
  const [savedReport, setSavedReport] = useState<SavedReportResponse | null>(null)
  const [selectedCampaignIds, setSelectedCampaignIds] = useState<string[]>([])
  const [insightsEnabled, setInsightsEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)
  const [savingMessage, setSavingMessage] = useState(false)
  const [actionFeedback, setActionFeedback] = useState("")
  const [sendMode, setSendMode] = useState<ReportSendMode>("PDF_AND_MESSAGE")
  const [sendMessage, setSendMessage] = useState("")
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)

  const sleep = useCallback(
    (milliseconds: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, milliseconds)
      }),
    []
  )

  const loadReport = useCallback(
    async (reportId: string, sequence: number) => {
      await pollSavedReportUntilReady({
        reportId,
        sequence,
        getCurrentSequence: () => reportPollSequenceRef.current,
        sleep,
        onUpdate: (report) => {
          setSavedReport(report)
          setSelectedCampaignIds(
            report.payload?.campaigns
              .filter(isActiveCampaign)
              .map((campaign) => campaign.id) ?? []
          )
          if (report.payload) {
            setInsightsEnabled(report.payload.presentation?.insightsEnabled ?? true)
            const previewMessage = buildReportSendPreview({
              reportId: report.id,
              payload: report.payload,
            })

            setSendMessage(previewMessage)
            initialSendModeRef.current = "PDF_AND_MESSAGE"
            initialSendMessageRef.current = previewMessage
          }

          if (!report.payload && report.status !== "FAILED") {
            setActionFeedback(
              "Relatório em processamento na fila. Atualizando automaticamente."
            )
            return
          }

          setActionFeedback("")
        },
      })
    },
    [sleep]
  )

  useEffect(() => {
    const reportId = Array.isArray(params.id) ? params.id[0] : params.id
    const sequence = reportPollSequenceRef.current + 1
    reportPollSequenceRef.current = sequence

    if (!reportId) {
      setError("Relatório inválido")
      setLoading(false)
      return
    }

    setLoading(true)
    setError("")
    setActionFeedback("")

    void loadReport(reportId, sequence)
      .catch((fetchError: unknown) => {
        if (sequence !== reportPollSequenceRef.current) {
          return
        }

        setSavedReport(null)
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Não foi possível carregar o relatório"
        )
      })
      .finally(() => {
        if (sequence === reportPollSequenceRef.current) {
          setLoading(false)
        }
      })
  }, [loadReport, params.id])

  function toggleCampaign(id: string) {
    setSelectedCampaignIds((current) =>
      current.includes(id)
        ? current.filter((campaignId) => campaignId !== id)
        : [...current, id]
    )
  }

  async function handleSendReport() {
    if (!savedReport?.payload) {
      return
    }

    const wasChanged =
      sendMode !== initialSendModeRef.current ||
      sendMessage.trim() !== initialSendMessageRef.current.trim()

    setSending(true)
    setError("")
    setActionFeedback("")

    try {
      await sendReportToWhatsApp(savedReport.id, {
        mode: sendMode,
        message: sendMode === "PDF_ONLY" ? undefined : sendMessage,
      })
      initialSendModeRef.current = sendMode
      initialSendMessageRef.current = sendMessage
      setActionFeedback(
        wasChanged
          ? "Envio alterado e enviado com sucesso."
          : "Envio concluído com o formato selecionado."
      )
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Não foi possível enviar o relatório"
      )
    } finally {
      setSending(false)
    }
  }

  async function handleDownloadPdf() {
    if (!savedReport?.payload) {
      return
    }

    setGenerating(true)
    setError("")

    try {
      const response = await fetch(`/api/reports/${savedReport.id}/pdf`, {
        cache: "no-store",
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(
          (body as { error?: string } | null)?.error ??
            `Não foi possível gerar o PDF (${response.status})`
        )
      }

      const blob = await response.blob()
      const contentDisposition = response.headers.get("content-disposition")
      const match = contentDisposition?.match(/filename="?([^"]+)"?/i)
      const fileName =
        match?.[1] ??
        `${buildReportPdfFileName({
          clientName: savedReport.payload.client.name,
          startDate: savedReport.payload.filters.since,
          endDate: savedReport.payload.filters.until,
        })}.pdf`

      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement("a")
      anchor.href = objectUrl
      anchor.download = fileName
      anchor.rel = "noreferrer"
      anchor.click()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch (pdfError) {
      logError("dashboard.report-preview.download", pdfError, {
        reportId: savedReport.id,
      })
      setError("Não foi possível gerar o PDF do relatório")
    } finally {
      setGenerating(false)
    }
  }

  async function handleSaveMessage() {
    if (!savedReport?.payload) {
      return
    }

    setSavingMessage(true)
    setError("")
    setActionFeedback("")

    try {
      const response = await saveSavedReportMessage(savedReport.id, sendMessage)
      const savedMessage = response.message ?? ""

      setSendMessage(savedMessage)
      initialSendMessageRef.current = savedMessage
      setActionFeedback(
        savedMessage
          ? "Mensagem salva com sucesso."
          : "Mensagem removida e salva com sucesso."
      )
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a mensagem"
      )
    } finally {
      setSavingMessage(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="print:hidden">
          <Header
            title="Relatório salvo"
            subtitle="Carregando relatório persistido"
          />
        </div>
        <LoadingSkeleton label="Carregando relatório salvo..." />
      </div>
    )
  }

  if (!savedReport) {
    return (
      <div>
        <div className="print:hidden">
          <Header
            title="Relatório salvo"
            subtitle="Não foi possível abrir este relatório"
          />
        </div>
        <div className="p-8">
          <ErrorState
            title="Relatório indisponível"
            message={error || "Relatório não encontrado"}
            action={
              <button
                onClick={() => router.push("/dashboard/history")}
                className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 transition hover:bg-red-100"
              >
                <ChevronLeft className="h-4 w-4" />
                Voltar para o histórico
              </button>
            }
          />
        </div>
      </div>
    )
  }

  if (!savedReport.payload) {
    const isCancelled = savedReport.status === "CANCELLED"

    return (
      <div>
        <div className="print:hidden">
          <Header
            title="Relatório salvo"
            subtitle={isCancelled ? "Envio cancelado" : "Aguardando processamento do job"}
          />
        </div>
        <div className="p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            {isCancelled ? (
              <p>{savedReport.errorMessage || "O envio foi cancelado com sucesso."}</p>
            ) : savedReport.status === "FAILED" ? (
              <p>{savedReport.errorMessage || "Não foi possível gerar este relatório."}</p>
            ) : (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-[#C1121F]" />
                <p>Relatório em fila. Esta página atualiza automaticamente.</p>
              </div>
            )}
            <button
              onClick={() => router.push("/dashboard/history")}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar para o histórico
            </button>
          </div>
        </div>
      </div>
    )
  }

  const { payload } = savedReport
  const hasSendChanges =
    sendMode !== initialSendModeRef.current ||
    sendMessage.trim() !== initialSendMessageRef.current.trim()
  const hasMessageChanges =
    sendMessage.trim() !== initialSendMessageRef.current.trim()

  return (
    <>
      <div className="print:hidden">
        <Header
          title="Relatório salvo"
          subtitle={`${payload.client.name} · ${payload.filters.since} até ${payload.filters.until}`}
        />
      </div>

      <div className="flex flex-col xl:h-[calc(100vh-72px)] xl:flex-row print:block">
        <aside className="w-full flex-shrink-0 overflow-y-auto border-b border-gray-100 bg-white p-4 sm:p-5 xl:w-[300px] xl:border-b-0 xl:border-r print:hidden">
          <button
            onClick={() => router.push("/dashboard/history")}
            className="mb-5 flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Voltar para o histórico
          </button>

          <div className="mb-5 rounded-2xl border border-gray-100 bg-gray-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              Cliente
            </p>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {payload.client.name}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {payload.client.company ?? "Marca não informada"}
            </p>
          </div>

          <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
              Filtros salvos
            </p>
            <div className="mt-3 space-y-2 text-sm text-gray-600">
              <p>De: {payload.filters.since}</p>
              <p>Até: {payload.filters.until}</p>
              <p>Objetivo: {payload.filters.objective}</p>
              <p>
                Gerado em:{" "}
                {new Date(savedReport.generatedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          </div>

          {payload.campaigns.length ? (
            <div className="mb-5">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Campanhas
              </label>
              <CampaignSelector
                campaigns={payload.campaigns}
                selectedCampaignIds={selectedCampaignIds}
                onToggleCampaign={toggleCampaign}
              />
            </div>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <div
              onClick={() => setInsightsEnabled(!insightsEnabled)}
              className={`relative h-5 w-10 cursor-pointer rounded-full transition ${
                insightsEnabled ? "bg-[#C1121F]" : "bg-gray-300"
              }`}
            >
              <div
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                  insightsEnabled ? "left-5" : "left-0.5"
                }`}
              />
            </div>
            Insights automáticos
          </label>
        </aside>

        <section className="min-h-0 flex-1 overflow-y-auto bg-[#eef1f6] print:overflow-visible print:bg-white">
          <div className="px-4 py-5 pb-28 sm:px-6 sm:py-6 md:px-8 md:py-8 print:px-0 print:py-0">
            {actionFeedback ? (
              <div className="mb-6 rounded-2xl border border-green-100 bg-green-50 px-5 py-4 text-sm text-green-700 print:hidden">
                {actionFeedback}
              </div>
            ) : null}

            {error ? (
              <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-sm text-red-600 print:hidden">
                {error}
              </div>
            ) : null}

            <div className="mb-4 flex items-center justify-between gap-3 print:hidden">
              <div
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  hasSendChanges
                    ? "bg-[#FFF1F2] text-[#C1121F]"
                    : "bg-green-50 text-green-700"
                }`}
              >
                {hasSendChanges ? "Envio alterado" : "Envio sem alterações"}
              </div>
              <span className="text-xs text-gray-400">
                Você pode ajustar o formato antes de enviar.
              </span>
            </div>

            <div className="mb-6">
              <SendReportComposer
                mode={sendMode}
                message={sendMessage}
                disabled={sending}
                onModeChange={setSendMode}
                onMessageChange={setSendMessage}
              />
            </div>

            <ReportPreview
              client={payload.client}
              reportData={payload}
              startDate={payload.filters.since}
              endDate={payload.filters.until}
              objective={payload.filters.objective}
              selectedCampaignIds={selectedCampaignIds}
              insightsEnabled={insightsEnabled}
              metricVisibility={payload.presentation?.metrics}
              customTitle={payload.presentation?.customTitle}
              executiveSummary={payload.presentation?.executiveSummary}
              closingNotes={payload.presentation?.closingNotes}
              sectionVisibility={payload.presentation?.sections}
            />
          </div>

          <div className="sticky bottom-0 z-10 flex flex-col gap-3 border-t border-gray-200 bg-white/95 px-4 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6 md:px-8 print:hidden">
            <button
              onClick={() => router.push("/dashboard/history")}
              className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                onClick={() => void handleSaveMessage()}
                disabled={!hasMessageChanges || savingMessage}
                className="flex items-center gap-2 rounded-xl border border-[#C1121F]/20 bg-[#FFF5F6] px-4 py-2.5 text-sm font-semibold text-[#C1121F] transition hover:bg-[#FFEDEE] disabled:opacity-60"
              >
                {savingMessage ? "Salvando..." : "Salvar mensagem"}
              </button>
              <button
                onClick={() => setScheduleModalOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50"
              >
                <Calendar className="h-4 w-4" />
                Agendar envio
              </button>
              <button
                onClick={() => void handleSendReport()}
                disabled={sending}
                className="flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-60"
              >
                <Send className="h-4 w-4" />
                {sending ? "Enviando..." : "Enviar por WhatsApp"}
              </button>
              <button
                onClick={() => void handleDownloadPdf()}
                disabled={generating}
                className="flex items-center gap-2 rounded-xl bg-[#C1121F] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#A50F1A] disabled:opacity-60"
              >
                <Download className="h-4 w-4" />
                {generating ? "Gerando PDF..." : "Salvar relatório em PDF"}
              </button>
            </div>
          </div>
        </section>
      </div>

      <ReportScheduleModal
        open={scheduleModalOpen}
        clientId={payload.client.id}
        clientName={payload.client.name}
        defaultFilters={{
          since: payload.filters.since,
          until: payload.filters.until,
          objective: payload.filters.objective,
        }}
        defaultSendMode={sendMode}
        defaultMessage={sendMessage}
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
