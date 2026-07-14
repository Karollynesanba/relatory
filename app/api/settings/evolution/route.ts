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
import type { EvolutionGroup, EvolutionInstance } from "@/types/evolution.types"

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

function mergeEvolutionGroupsById(
  groupsList: EvolutionGroup[][]
): EvolutionGroup[] {
  const merged = new Map<string, EvolutionGroup>()

  for (const groups of groupsList) {
    for (const group of groups) {
      if (!merged.has(group.id)) {
        merged.set(group.id, group)
      }
    }
  }

  return [...merged.values()]
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
    const includeParticipants =
      requestUrl.searchParams.get("includeParticipants") === "1" ||
      requestUrl.searchParams.get("includeParticipants") === "true"
    const previewInstance = normalizeEvolutionInstancePreference(
      requestUrl.searchParams.get("previewInstance")
    )
    const selectedInstance =
      (await resolveUserEvolutionInstance(user.id)) ??
      normalizeEvolutionInstancePreference(user.evolutionInstance ?? null)
    const config = getEvolutionConfig()
    const effectiveGroupInstance = previewInstance || selectedInstance || null

    if (!effectiveGroupInstance) {
      return NextResponse.json<EvolutionSettingsResponse>({
        configured: true,
        connected: false,
        instance: config.instance || null,
        selectedInstance: null,
        previewInstance: null,
        detail:
          "Sua conta nao possui uma instancia Evolution configurada. Configure a sua instancia para visualizar os grupos.",
        groups: [],
        instances: [],
      })
    }

    const preferredGroupInstances = [effectiveGroupInstance]

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
        groupInstances: preferredGroupInstances,
        includeParticipants,
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
      let participantCatalogGroups: EvolutionGroup[] = []
      if (participantPhone.length > 0) {
        try {
          participantCatalogGroups = (
            await loadEvolutionCatalog({
              groupInstances: preferredGroupInstances,
              participantPhone: participantPhone || null,
              includeParticipants: true,
            })
          ).groups
        } catch (error) {
          logError("settings.evolution.participant", error)
        }
      }

      let groups =
        participantPhone.length > 0
          ? mergeEvolutionGroupsById([participantCatalogGroups, catalog.groups])
          : catalog.groups
      const scopedGroups = groups
      let detail = ""

      if (participantPhone.length > 0 && scopedGroups.length === 0) {
        detail = `Nenhum grupo encontrado para o n\u00famero ${requestedPhone}.`
      }

      if (!detail) {
        detail =
          scopedGroups.length > 0
            ? participantPhone
              ? `${groups.length} grupo(s) disponível(is), incluindo os vinculados ao número ${requestedPhone}.`
              : `${groups.length} grupo(s) encontrado(s) nas inst\u00e2ncias conectadas.`
            : participantPhone
              ? `Nenhum grupo encontrado para o n\u00famero ${requestedPhone}.`
              : `Nenhum grupo encontrado nas inst\u00e2ncias conectadas.`
      }

      return NextResponse.json<EvolutionSettingsResponse>({
        configured: true,
        connected:
          groups.length > 0 || isEvolutionInstanceConnected(matchedGroupInstance?.status),
        instance: resolvedSelectedInstance || config.instance || null,
        selectedInstance: resolvedSelectedInstance,
        previewInstance: resolvedPreviewInstance || resolvedGroupInstance || null,
        detail:
          catalog.partialErrors.length > 0
            ? `${detail} Algumas inst\u00e2ncias n\u00e3o puderam ser consultadas nesta atualiza\u00e7\u00e3o.`
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

    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name ?? user.email,
        role: user.role,
        evolutionInstance: matchedInstance?.name ?? selectedInstance,
      },
      create: {
        email: user.email,
        name: user.name ?? user.email,
        passwordHash: user.passwordHash ?? "",
        role: user.role,
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
