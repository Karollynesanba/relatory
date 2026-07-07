import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEventHandler,
  type ReactNode,
} from "react"
import { Mail, Phone, RefreshCw, Users } from "lucide-react"
import { fetchJsonOrThrow } from "@/lib/api-client"
import {
  EvolutionGroupCombobox,
  buildEvolutionGroupValue,
  normalizeEvolutionGroupId,
} from "@/components/shared/evolution-group-combobox"
import type { ClientFormValues } from "@/types/client.types"
import type { EvolutionSettingsResponse } from "@/types/evolution.types"

type SharedClientFields = Pick<
  ClientFormValues,
  "email" | "phone" | "notes" | "whatsappGroupId"
>

type ClientFormProps = {
  title: string
  description: string
  leadFields?: ReactNode
  values: SharedClientFields
  onChange: ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>
  onValueChange?: (name: keyof SharedClientFields, value: string) => void
}

function normalizePhoneDigits(value: string) {
  return value.replace(/\D/g, "")
}

export function ClientForm({
  title,
  description,
  leadFields,
  values,
  onChange,
  onValueChange,
}: ClientFormProps) {
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)
  const [groupsError, setGroupsError] = useState("")
  const [groupsResponse, setGroupsResponse] = useState<EvolutionSettingsResponse | null>(
    null
  )
  const loadEvolutionGroups = useCallback(async () => {
    setIsLoadingGroups(true)
    setGroupsError("")

    try {
      const response = await fetchJsonOrThrow<EvolutionSettingsResponse>(
        "/api/settings/evolution?includeParticipants=1",
        { cache: "no-store" },
        "Não foi possível carregar os grupos da Evolution"
      )

      setGroupsResponse(response)
    } catch (error) {
      setGroupsError(
        error instanceof Error
          ? error.message
          : "Não foi possível carregar os grupos da Evolution"
      )
      setGroupsResponse(null)
    } finally {
      setIsLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    void loadEvolutionGroups()
  }, [loadEvolutionGroups])

  const availableGroups = groupsResponse?.groups ?? []
  const manualGroupValue = normalizeEvolutionGroupId(values.whatsappGroupId)
  const matchedGroup = useMemo(() => {
    const normalizedManualValue = manualGroupValue.trim().toLowerCase()

    if (!normalizedManualValue || availableGroups.length === 0) {
      return null
    }

    return (
      availableGroups.find((group) => {
        const groupId = group.id.trim().toLowerCase()
        const groupValue = buildEvolutionGroupValue(group).trim().toLowerCase()
        const groupSubject = group.subject.trim().toLowerCase()
        const groupInstance = group.instance.trim().toLowerCase()

        return (
          groupId === normalizedManualValue ||
          groupValue === normalizedManualValue ||
          groupSubject.includes(normalizedManualValue) ||
          groupInstance.includes(normalizedManualValue) ||
          groupId.includes(normalizedManualValue) ||
          groupValue.includes(normalizedManualValue)
        )
      }) ?? null
    )
  }, [availableGroups, manualGroupValue])

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
      <h2 className="mb-1 text-lg font-bold text-gray-900">{title}</h2>
      <p className="mb-8 text-sm text-gray-400">{description}</p>

      <div className="space-y-5">
        {leadFields}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            E-mail de contato
          </label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="email"
              value={values.email}
              onChange={onChange}
              type="email"
              placeholder="contato@empresa.com.br"
              maxLength={160}
              className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#C1121F]"
            />
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Telefone
          </label>
          <div className="relative">
            <Phone className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              name="phone"
              value={values.phone}
              onChange={onChange}
              type="tel"
              placeholder="(11) 99999-9999"
              maxLength={25}
              className="w-full rounded-xl border border-gray-200 py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#C1121F]"
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Use entre 10 e 15 dígitos, com ou sem máscara.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            ID do Grupo WhatsApp
          </label>
          <div className="mb-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Grupos da Evolution
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadEvolutionGroups()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#C1121F] hover:underline"
              >
                <RefreshCw className={`h-3 w-3 ${isLoadingGroups ? "animate-spin" : ""}`} />
                Atualizar
              </button>
            </div>

            {normalizePhoneDigits(values.phone).length >= 10 ? (
              <p className="mb-2 text-xs text-gray-500">
                Mostrando os grupos da Evolution para seleção manual deste cliente.
              </p>
            ) : null}

            {isLoadingGroups ? (
              <p className="text-xs text-gray-400">Carregando grupos das instâncias...</p>
            ) : groupsError ? (
              <p className="text-xs text-red-500">{groupsError}</p>
            ) : !groupsResponse?.configured ? (
              <p className="text-xs text-gray-500">
                Evolution não configurada neste ambiente.
              </p>
            ) : !groupsResponse.connected ? (
              <p className="text-xs text-red-500">
                {groupsResponse.detail ?? "Não foi possível consultar os grupos."}
              </p>
            ) : availableGroups.length === 0 ? (
              <p className="text-xs text-gray-500">
                Nenhum grupo encontrado nas instâncias conectadas.
              </p>
            ) : (
              <>
                <p className="mb-2 text-xs text-gray-500">
                  {groupsResponse.instances.length} instância(s) detectada(s) nesta integração.
                </p>
                <EvolutionGroupCombobox
                  groups={availableGroups}
                  value={values.whatsappGroupId}
                  onChange={(nextValue) =>
                    onValueChange?.("whatsappGroupId", nextValue)
                  }
                  emptyLabel="Selecione um grupo para preencher o campo"
                  placeholder="Pesquisar grupo pelo nome..."
                  dataCy="client-whatsapp-group-select"
                />
              </>
            )}
          </div>
          <input
            name="whatsappGroupId"
            value={manualGroupValue}
            onChange={onChange}
            type="text"
            placeholder="120363407411420148@g.us"
            maxLength={120}
            className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C1121F]"
          />
          <p className="mt-2 text-xs text-gray-400">
            Aceita IDs de grupo antigos e novos da Evolution, como `120363407411420148@g.us`.
          </p>
          {manualGroupValue && matchedGroup ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Grupo encontrado
              </p>
              <p className="mt-1 text-sm font-semibold text-emerald-950">
                {matchedGroup.subject}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {matchedGroup.instance} · {matchedGroup.id}
              </p>
              <button
                type="button"
                onClick={() =>
                  onValueChange?.("whatsappGroupId", matchedGroup.id)
                }
                className="mt-3 inline-flex items-center rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Usar este grupo
              </button>
            </div>
          ) : null}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            Observações
          </label>
          <textarea
            name="notes"
            value={values.notes}
            onChange={onChange}
            placeholder="Notas internas sobre este cliente..."
            rows={4}
            maxLength={1000}
            className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C1121F]"
          />
        </div>
      </div>
    </div>
  )
}
