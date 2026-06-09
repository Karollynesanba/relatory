"use client"

import { useEffect, useMemo, useState } from "react"
import { Calendar, Clock3, Loader2, RefreshCw, Repeat, Users, X } from "lucide-react"
import {
  EvolutionGroupCombobox,
  normalizeEvolutionGroupId,
} from "@/components/shared/evolution-group-combobox"
import {
  disableClientSavedReportSchedule,
  loadClientReportSchedule,
  loadEvolutionSettings,
  saveClientReportSchedule,
  saveMultipleClientReportSchedules,
} from "@/lib/report-client"
import {
  REPORT_SCHEDULE_WEEKDAYS,
  formatScheduleTime,
} from "@/lib/report-schedule-shared"
import { formatLocalDateInput } from "@/lib/date-input"
import type {
  ReportObjectiveValue,
  ReportScheduleFrequency,
  ReportSchedulePayload,
  ReportScheduleResponse,
  ReportSendMode,
} from "@/types/report.types"
import type { EvolutionSettingsResponse } from "@/types/evolution.types"

type ReportScheduleModalProps = {
  open: boolean
  clientId?: string | null
  clientIds?: string[]
  clientName?: string | null
  clientNames?: string[]
  defaultFilters: {
    since: string
    until: string
    objective: ReportObjectiveValue | string
  }
  defaultSendMode: ReportSendMode
  defaultMessage: string
  defaultGroupId?: string | null
  onClose: () => void
  onSaved?: (result: {
    schedules: ReportScheduleResponse[]
    clientCount: number
  }) => void
  onDisabled?: () => void
}

function getTodayDate() {
  return formatLocalDateInput(new Date())
}

function getInitialTime() {
  const now = new Date()
  now.setMinutes(now.getMinutes() + 5)

  return {
    hour: now.getHours(),
    minute: now.getMinutes(),
  }
}

function buildInitialForm(props: Pick<
  ReportScheduleModalProps,
  "defaultSendMode" | "defaultMessage" | "defaultGroupId"
>) {
  const initialTime = getInitialTime()

  return {
    frequency: "WEEKLY" as ReportScheduleFrequency,
    weekday: 1,
    scheduledDate: getTodayDate(),
    hour: initialTime.hour,
    minute: initialTime.minute,
    sendMode: props.defaultSendMode,
    message: props.defaultMessage,
    groupId: props.defaultGroupId ?? "",
  }
}

export function ReportScheduleModal(props: ReportScheduleModalProps) {
  const { defaultGroupId, defaultMessage, defaultSendMode, open } = props
  const clientIds = props.clientIds ?? (props.clientId ? [props.clientId] : [])
  const primaryClientId = clientIds[0] ?? null
  const isBatchMode = clientIds.length > 1
  const visibleClientNames = (props.clientNames ?? []).filter(Boolean).slice(0, 4)
  const hiddenClientNamesCount = Math.max(
    clientIds.length - visibleClientNames.length,
    0
  )
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [disabling, setDisabling] = useState(false)
  const [error, setError] = useState("")
  const [schedule, setSchedule] = useState<ReportScheduleResponse | null>(null)
  const [form, setForm] = useState(() => buildInitialForm(props))
  const [isLoadingGroups, setIsLoadingGroups] = useState(false)
  const [groupsError, setGroupsError] = useState("")
  const [groupsResponse, setGroupsResponse] = useState<EvolutionSettingsResponse | null>(
    null
  )

  async function loadGroups() {
    setIsLoadingGroups(true)
    setGroupsError("")

    try {
      const response = await loadEvolutionSettings()
      setGroupsResponse(response)
    } catch (loadError) {
      setGroupsError(
        loadError instanceof Error
          ? loadError.message
          : "Não foi possível carregar os grupos da Evolution."
      )
      setGroupsResponse(null)
    } finally {
      setIsLoadingGroups(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    setForm(
      buildInitialForm({
        defaultGroupId,
        defaultMessage,
        defaultSendMode,
      })
    )
  }, [defaultGroupId, defaultMessage, defaultSendMode, open])

  useEffect(() => {
    if (!open) {
      return
    }

    void loadGroups()
  }, [open])

  useEffect(() => {
    if (!props.open || !primaryClientId || isBatchMode) {
      return
    }

    setLoading(true)
    setError("")

    void loadClientReportSchedule(primaryClientId)
      .then((response) => {
        setSchedule(response.schedule)

        if (!response.schedule) {
          return
        }

        setForm({
          frequency: response.schedule.frequency,
          weekday: response.schedule.weekday ?? 1,
          scheduledDate: response.schedule.scheduledDate ?? getTodayDate(),
          hour: response.schedule.hour,
          minute: response.schedule.minute,
          sendMode: response.schedule.sendMode,
          message: response.schedule.message ?? props.defaultMessage,
          groupId: response.schedule.groupId ?? props.defaultGroupId ?? "",
        })
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Não foi possível carregar o agendamento."
        )
      })
      .finally(() => {
        setLoading(false)
      })
  }, [
    isBatchMode,
    primaryClientId,
    props.defaultGroupId,
    props.defaultMessage,
    props.open,
  ])

  const timeValue = useMemo(
    () => formatScheduleTime(form.hour, form.minute),
    [form.hour, form.minute]
  )
  const availableGroups = groupsResponse?.groups ?? []
  const manualGroupValue = normalizeEvolutionGroupId(form.groupId)

  if (!props.open || !primaryClientId) {
    return null
  }

  async function handleSave() {
    setSaving(true)
    setError("")

    try {
      const payload: ReportSchedulePayload = {
        frequency: form.frequency,
        weekday: form.frequency === "WEEKLY" ? form.weekday : null,
        scheduledDate: form.frequency === "ONCE" ? form.scheduledDate : null,
        hour: form.hour,
        minute: form.minute,
        filtersSince: props.defaultFilters.since,
        filtersUntil: props.defaultFilters.until,
        objective: props.defaultFilters.objective,
        sendMode: form.sendMode,
        message: form.message.trim() || null,
        groupId: form.groupId.trim() || null,
        active: true,
      }

      if (isBatchMode) {
        const schedules = await saveMultipleClientReportSchedules(clientIds, payload)
        props.onSaved?.({
          schedules,
          clientCount: clientIds.length,
        })
        return
      }

      const response = await saveClientReportSchedule(primaryClientId, payload)
      setSchedule(response.schedule)
      props.onSaved?.({
        schedules: [response.schedule],
        clientCount: 1,
      })
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar o agendamento."
      )
    } finally {
      setSaving(false)
    }
  }

  async function handleDisable() {
    setDisabling(true)
    setError("")

    try {
      await disableClientSavedReportSchedule(primaryClientId)
      setSchedule(null)
      props.onDisabled?.()
      props.onClose()
    } catch (disableError) {
      setError(
        disableError instanceof Error
          ? disableError.message
          : "Não foi possível desativar o agendamento."
      )
    } finally {
      setDisabling(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
              {isBatchMode ? "Agendamento em lote" : "Automacao de envio"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-slate-900">
              {isBatchMode ? "Agendar varios envios" : "Agendar envio"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isBatchMode ? (
                <>
                  Aplique a mesma data e horario para{" "}
                  <span className="font-medium text-slate-700">
                    {clientIds.length} clientes selecionados
                  </span>
                  .
                </>
              ) : (
                <>
                  Configure o envio automático do relatório para{" "}
                  <span className="font-medium text-slate-700">
                    {props.clientName || "este cliente"}
                  </span>
                  .
                </>
              )}
            </p>
          </div>
          <button
            onClick={props.onClose}
            data-cy="reports-schedule-close"
            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 overflow-y-auto px-6 py-5">
          {loading && !isBatchMode ? (
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando agendamento atual...
            </div>
          ) : null}

          {schedule?.active && !isBatchMode ? (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
              <p className="font-semibold">Agendamento ativo</p>
              <p className="mt-1">
                Próximo envio: {new Date(schedule.nextRunAt).toLocaleString("pt-BR")}
              </p>
              {schedule.lastError ? (
                <p className="mt-2 text-amber-700">
                  Último erro: {schedule.lastError}
                </p>
              ) : null}
            </div>
          ) : null}

          {error ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-4 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          {isBatchMode ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">
                Clientes selecionados
              </p>
              <p className="mt-1">
                {visibleClientNames.join(", ")}
                {hiddenClientNamesCount > 0
                  ? ` e mais ${hiddenClientNamesCount}`
                  : ""}
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  data-cy="reports-schedule-weekly"
                  onClick={() => setForm((current) => ({ ...current, frequency: "WEEKLY" }))}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    form.frequency === "WEEKLY"
                      ? "border-[#C1121F] bg-[#FFF4F5]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
              <div className="flex items-center gap-3">
                <Repeat className="h-5 w-5 text-[#C1121F]" />
                <div>
                  <p className="font-semibold text-slate-900">Toda semana</p>
                  <p className="text-sm text-slate-500">
                    Escolha um dia fixo da semana e o horario.
                  </p>
                </div>
              </div>
            </button>

                <button
                  type="button"
                  data-cy="reports-schedule-once"
                  onClick={() => setForm((current) => ({ ...current, frequency: "ONCE" }))}
                  className={`rounded-2xl border px-4 py-4 text-left transition ${
                    form.frequency === "ONCE"
                      ? "border-[#C1121F] bg-[#FFF4F5]"
                      : "border-slate-200 hover:bg-slate-50"
                  }`}
                >
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-[#C1121F]" />
                <div>
                  <p className="font-semibold text-slate-900">Somente uma vez</p>
                  <p className="text-sm text-slate-500">
                    Defina um dia especifico e o horario do envio.
                  </p>
                </div>
              </div>
            </button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {form.frequency === "WEEKLY" ? (
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Dia da semana</span>
                <select
                  value={form.weekday}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      weekday: Number(event.target.value),
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
                >
                  {REPORT_SCHEDULE_WEEKDAYS.map((weekday) => (
                    <option key={weekday.value} value={weekday.value}>
                      {weekday.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="space-y-2 text-sm text-slate-700">
                <span className="font-medium">Data do envio</span>
              <input
                type="date"
                data-cy="reports-schedule-date"
                value={form.scheduledDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      scheduledDate: event.target.value,
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
                />
              </label>
            )}

            <label className="space-y-2 text-sm text-slate-700">
              <span className="flex items-center gap-2 font-medium">
                <Clock3 className="h-4 w-4" />
                Horario
              </span>
              <input
                type="time"
                data-cy="reports-schedule-time"
                value={timeValue}
                onChange={(event) => {
                  const [hour, minute] = event.target.value.split(":")
                  setForm((current) => ({
                    ...current,
                    hour: Number(hour),
                    minute: Number(minute),
                  }))
                }}
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Formato do envio</span>
              <select
                data-cy="reports-schedule-send-mode"
                value={form.sendMode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sendMode: event.target.value as ReportSendMode,
                  }))
                }
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
              >
                <option value="PDF_AND_MESSAGE">PDF + mensagem</option>
                <option value="PDF_ONLY">Somente PDF</option>
                <option value="MESSAGE_ONLY">Somente mensagem</option>
              </select>
            </label>

            <label className="space-y-2 text-sm text-slate-700">
              <span className="font-medium">Grupo de WhatsApp</span>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    <Users className="h-4 w-4" />
                    Grupos da Evolution
                  </div>
                  <button
                    type="button"
                    onClick={() => void loadGroups()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#C1121F] transition hover:opacity-80"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isLoadingGroups ? "animate-spin" : ""}`} />
                    Atualizar
                  </button>
                </div>

                {isLoadingGroups ? (
                  <p className="text-xs text-slate-500">
                    Carregando grupos das instâncias conectadas...
                  </p>
                ) : groupsError ? (
                  <p className="text-xs text-rose-600">{groupsError}</p>
                ) : !groupsResponse?.configured ? (
                  <p className="text-xs text-slate-500">
                    Evolution não configurada neste ambiente.
                  </p>
                ) : !groupsResponse.connected ? (
                  <p className="text-xs text-rose-600">
                    {groupsResponse.detail ?? "Não foi possível consultar os grupos."}
                  </p>
                ) : availableGroups.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Nenhum grupo encontrado nas instâncias conectadas.
                  </p>
                ) : (
                  <>
                    <EvolutionGroupCombobox
                      dataCy="reports-schedule-group-select"
                      groups={availableGroups}
                      value={form.groupId}
                      onChange={(nextValue) =>
                        setForm((current) => ({
                          ...current,
                          groupId: nextValue,
                        }))
                      }
                      emptyLabel="Usar grupo padrão do cliente"
                      placeholder="Pesquisar grupo pelo nome..."
                    />
                    <p className="text-xs text-slate-500">
                      {groupsResponse.instances.length} instância(s) detectada(s) nesta integração.
                    </p>
                  </>
                )}
              </div>
              <input
                type="text"
                value={manualGroupValue}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    groupId: event.target.value,
                  }))
                }
                placeholder="Usar grupo padrão do cliente"
                className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
              />
              <p className="text-xs text-slate-500">
                Se preferir, você ainda pode colar manualmente um ID de grupo da Evolution.
              </p>
            </label>
          </div>

          <label className="block space-y-2 text-sm text-slate-700">
            <span className="font-medium">Mensagem do envio</span>
            <textarea
              value={form.message}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  message: event.target.value,
                }))
              }
              rows={5}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 outline-none transition focus:border-[#C1121F]"
            />
          </label>

          <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Base do relatório agendado</p>
            <p className="mt-1">
              Período: {props.defaultFilters.since} até {props.defaultFilters.until}
            </p>
            <p>Objetivo: {props.defaultFilters.objective}</p>
          </div>
        </div>

        <div className="sticky bottom-0 flex flex-col gap-3 border-t border-slate-100 bg-white px-6 py-5 sm:flex-row sm:justify-between">
          <div>
            {schedule?.active && !isBatchMode ? (
              <button
                type="button"
                onClick={() => void handleDisable()}
                data-cy="reports-schedule-disable"
                disabled={disabling}
                className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
              >
                {disabling ? "Desativando..." : "Desativar agendamento"}
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={props.onClose}
              data-cy="reports-schedule-cancel"
              className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              data-cy="reports-schedule-confirm"
              disabled={saving}
              className="rounded-2xl bg-[#C1121F] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#A50F1A] disabled:opacity-60"
            >
              {saving
                ? "Confirmando..."
                : isBatchMode
                  ? "Agendar selecionados"
                  : "Confirmar agendamento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
