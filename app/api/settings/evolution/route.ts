import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/authorization"
import {
  getEvolutionConfig,
  loadEvolutionCatalog,
  findEvolutionInstanceMatch,
} from "@/lib/evolution-api"
import {
  normalizeEvolutionInstancePreference,
  resolveUserEvolutionInstance,
} from "@/lib/evolution-preference"
import { prisma } from "@/lib/prisma"
import { logError } from "@/lib/safe-logger"
import type { EvolutionSettingsResponse } from "@/types/evolution.types"
import type { EvolutionInstance } from "@/types/evolution.types"

const EVOLUTION_CONNECTED_STATUSES = new Set([
  "open",
  "connected",
  "online",
  "active",
  "ready",
])

function isEvolutionInstanceConnected(status: string | null | undefined) {
  if (status === null) {
    return true
  }

  if (typeof status !== "string") {
    return false
  }

  return EVOLUTION_CONNECTED_STATUSES.has(status)
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const requestUrl = new URL(request.url)
    const requestedPhone = requestUrl.searchParams.get("phone")?.trim() ?? ""
    const participantPhone = requestedPhone.replace(/\D/g, "")
    const previewInstance = normalizeEvolutionInstancePreference(
      requestUrl.searchParams.get("previewInstance")
    )
    const selectedInstance =
      (await resolveUserEvolutionInstance(user)) ??
      normalizeEvolutionInstancePreference(user.evolutionInstance ?? null)
    const config = getEvolutionConfig()
    const effectiveGroupInstance = previewInstance || selectedInstance || null

    if (!config.configured) {
      return NextResponse.json<EvolutionSettingsResponse>({
        configured: false,
        connected: false,
        instance: config.instance || null,
        selectedInstance,
        previewInstance: effectiveGroupInstance,
        detail:
          "Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE para habilitar o WhatsApp.",
        groups: [],
        instances: [],
      })
    }

    try {
      const catalog = await loadEvolutionCatalog({
        groupInstances: effectiveGroupInstance ? [effectiveGroupInstance] : undefined,
        participantPhone: participantPhone || null,
      })
      const resolvedPreviewInstance =
        findEvolutionInstanceMatch(previewInstance, catalog.instances)?.name ??
        previewInstance
      const resolvedSelectedInstance =
        findEvolutionInstanceMatch(selectedInstance, catalog.instances)?.name ??
        selectedInstance
      const matchedGroupInstance = findEvolutionInstanceMatch(
        effectiveGroupInstance,
        catalog.instances
      )
      const resolvedGroupInstance =
        matchedGroupInstance?.name ?? effectiveGroupInstance
      const groups = resolvedGroupInstance
        ? catalog.groups.filter((group) => group.instance === resolvedGroupInstance)
        : []
      const detail =
        groups.length > 0
          ? participantPhone
            ? `${groups.length} grupo(s) encontrado(s) para o número ${requestedPhone}.`
            : `${groups.length} grupo(s) encontrado(s) na instância ${resolvedGroupInstance}.`
          : participantPhone
            ? `Nenhum grupo encontrado para o número ${requestedPhone}.`
            : `Nenhum grupo encontrado na instância ${resolvedGroupInstance ?? "configurada"}.`

      return NextResponse.json<EvolutionSettingsResponse>({
        configured: true,
        connected:
          groups.length > 0 ||
          isEvolutionInstanceConnected(matchedGroupInstance?.status),
        instance: resolvedSelectedInstance || config.instance || null,
        selectedInstance: resolvedSelectedInstance,
        previewInstance: resolvedPreviewInstance || resolvedGroupInstance || null,
        detail:
          catalog.partialErrors.length > 0
            ? `${detail} Algumas instâncias não puderam ser consultadas nesta atualização.`
            : detail,
        groups,
        instances: catalog.instances,
      })
    } catch (error) {
      return NextResponse.json<EvolutionSettingsResponse>({
        configured: true,
        connected: false,
        instance: selectedInstance || config.instance || null,
        selectedInstance,
        previewInstance: effectiveGroupInstance,
        detail: error instanceof Error ? error.message : "Falha ao consultar a Evolution API.",
        groups: [],
        instances: [],
      })
    }
  } catch (error) {
    logError("settings.evolution.get", error)
    return NextResponse.json({ error: "Erro interno" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Nao autorizado" }, { status: 401 })
    }

    const body = (await request.json().catch(() => ({}))) as {
      selectedInstance?: string | null
    }
    const selectedInstance = normalizeEvolutionInstancePreference(body.selectedInstance ?? null)

    let matchedInstance: EvolutionInstance | null = null
    if (selectedInstance) {
      const catalog = await loadEvolutionCatalog()
      matchedInstance = findEvolutionInstanceMatch(selectedInstance, catalog.instances)
      const isAvailable =
        matchedInstance &&
        isEvolutionInstanceConnected(matchedInstance.status)

      if (!isAvailable) {
        return NextResponse.json(
          { error: "Instancia Evolution nao encontrada ou indisponivel" },
          { status: 400 }
        )
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        evolutionInstance: matchedInstance?.name ?? selectedInstance,
      },
    })

    return NextResponse.json<EvolutionSettingsResponse>({
      configured: true,
      connected: true,
      instance: null,
      selectedInstance: matchedInstance?.name ?? selectedInstance,
      detail: selectedInstance
        ? `Instancia ${selectedInstance} salva para esta conta.`
        : "A preferencia foi removida. O envio volta para a instancia padrao da Evolution.",
      groups: [],
      instances: [],
    })
  } catch (error) {
    logError("settings.evolution.post", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      { status: 500 }
    )
  }
}
