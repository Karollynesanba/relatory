import { logIntegrationEvent } from "@/lib/integration-monitoring"
import type {
  EvolutionGroup,
  EvolutionInstance,
} from "@/types/evolution.types"

const DEFAULT_EVOLUTION_API_TIMEOUT_MS = 15_000
const EVOLUTION_CONNECTED_STATUSES = new Set([
  "open",
  "connected",
  "online",
  "active",
  "ready",
])

type EvolutionSendTextResponse = {
  key?: {
    id?: string
    remoteJid?: string
  }
  status?: string
  messageTimestamp?: string
}

type EvolutionSendMediaResponse = EvolutionSendTextResponse

type EvolutionConfig = ReturnType<typeof getEvolutionConfig>

type EvolutionInstanceResponseItem = {
  name?: string
  instanceName?: string
  status?: string
  connectionStatus?: string
  instance?: {
    instanceName?: string
    status?: string
    state?: string
    connectionStatus?: string
  }
}

type EvolutionCatalog = {
  config: EvolutionConfig
  connected: boolean
  instances: EvolutionInstance[]
  groups: EvolutionGroup[]
  partialErrors: string[]
}

type EvolutionCatalogOptions = {
  groupInstances?: string[]
  participantPhone?: string | null
}

function getRequiredEnv(name: "EVOLUTION_API_URL" | "EVOLUTION_API_KEY" | "EVOLUTION_INSTANCE") {
  const value = normalizeEnvValue(process.env[name])

  if (!value) {
    throw new Error(`Configuração ausente: ${name}`)
  }

  return value
}

function normalizeEnvValue(value: string | undefined) {
  if (!value) {
    return ""
  }

  return value.trim().replace(/^["']|["']$/g, "")
}

function maskWhatsAppDestination(number: string) {
  const normalized = number.trim()

  if (normalized.length <= 6) {
    return "[REDACTED]"
  }

  return `${normalized.slice(0, 4)}***${normalized.slice(-2)}`
}

function parseEvolutionDestination(value: string) {
  const normalized = value.trim()
  const separatorIndex = normalized.indexOf("::")

  if (separatorIndex < 0) {
    return {
      destination: normalized,
      instance: null,
    }
  }

  const instance = normalizeEvolutionInstanceName(
    normalized.slice(0, separatorIndex)
  )
  const destination = normalized.slice(separatorIndex + 2).trim()

  return {
    destination,
    instance: instance || null,
  }
}

function buildEvolutionRequestHeaders(apiKey: string) {
  return {
    "Content-Type": "application/json",
    apikey: apiKey,
  }
}

function getEvolutionApiTimeoutMs() {
  const parsed = Number.parseInt(process.env.EVOLUTION_API_TIMEOUT_MS ?? "", 10)

  if (!Number.isFinite(parsed) || parsed < 1_000) {
    return DEFAULT_EVOLUTION_API_TIMEOUT_MS
  }

  return parsed
}

function normalizeEvolutionError(
  error: unknown,
  timeoutMs: number,
  path: string
) {
  if (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  ) {
    return new Error(
      `Tempo limite ao consultar a Evolution API (${timeoutMs} ms) em ${path}`
    )
  }

  return error
}

function dedupeStrings(values: string[]) {
  return [...new Set(values.filter(Boolean))]
}

function normalizeEvolutionInstanceName(
  value: string | undefined | null
) {
  return typeof value === "string" ? value.trim() : ""
}

function normalizeEvolutionInstanceKey(
  value: string | undefined | null
) {
  return normalizeEvolutionInstanceName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ")
}

function resolveEvolutionInstanceAlias(
  requestedInstance: string | undefined | null,
  instances: EvolutionInstance[]
) {
  const requestedKey = normalizeEvolutionInstanceKey(requestedInstance)

  if (!requestedKey) {
    return null
  }

  const matchingInstance = instances.find(
    (instance) => normalizeEvolutionInstanceKey(instance.name) === requestedKey
  )

  return matchingInstance?.name ?? normalizeEvolutionInstanceName(requestedInstance)
}

export function findEvolutionInstanceMatch(
  requestedInstance: string | undefined | null,
  instances: EvolutionInstance[]
) {
  const requestedKey = normalizeEvolutionInstanceKey(requestedInstance)

  if (!requestedKey) {
    return null
  }

  return (
    instances.find(
      (instance) => normalizeEvolutionInstanceKey(instance.name) === requestedKey
    ) ?? null
  )
}

function normalizeEvolutionInstanceStatus(
  value: string | undefined | null
) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return normalized ? normalized.toLowerCase() : null
}

function isEvolutionInstanceConnected(status: string | null | undefined) {
  if (status === null) {
    return true
  }

  if (typeof status !== "string") {
    return false
  }

  return EVOLUTION_CONNECTED_STATUSES.has(status)
}

function readEvolutionInstanceCandidate(
  value: EvolutionInstanceResponseItem,
  primaryInstance: string
) {
  const instancePayload =
    typeof value.instance === "object" && value.instance !== null
      ? value.instance
      : null
  const name = normalizeEvolutionInstanceName(
    instancePayload?.instanceName ?? value.instanceName ?? value.name
  )

  if (!name) {
    return null
  }

  return {
    name,
    status: normalizeEvolutionInstanceStatus(
      instancePayload?.connectionStatus ??
        instancePayload?.status ??
        instancePayload?.state ??
        value.connectionStatus ??
        value.status
    ),
    isPrimary: name === primaryInstance,
  } satisfies EvolutionInstance
}

async function fetchEvolutionJson<T>(
  params: Pick<EvolutionConfig, "apiUrl" | "apiKey"> & {
    path: string
    method?: "GET" | "POST" | "PUT"
    body?: string
    timeoutMs?: number
  }
) {
  const timeoutMs = params.timeoutMs ?? getEvolutionApiTimeoutMs()

  try {
    const response = await fetch(
      `${params.apiUrl.replace(/\/+$/, "")}${params.path}`,
      {
        method: params.method ?? "GET",
        headers: buildEvolutionRequestHeaders(params.apiKey),
        body: params.body,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      }
    )
    const data = (await response.json().catch(() => null)) as
      | T
      | { error?: string; message?: string }
      | null

    if (!response.ok) {
      throw new Error(
        (data &&
          typeof data === "object" &&
          (("error" in data && typeof data.error === "string" && data.error) ||
            ("message" in data && typeof data.message === "string" && data.message))) ||
          "Falha ao consultar a Evolution API"
      )
    }

    return data
  } catch (error) {
    throw normalizeEvolutionError(error, timeoutMs, params.path)
  }
}

function isEvolutionSendTextResponse(
  value: EvolutionSendTextResponse | { error?: string; message?: string } | null
): value is EvolutionSendTextResponse {
  return Boolean(
    value &&
      (("status" in value && typeof value.status === "string") ||
        ("messageTimestamp" in value &&
          typeof value.messageTimestamp === "string") ||
        ("key" in value && typeof value.key === "object"))
  )
}

export async function sendWhatsAppText(params: {
  number: string
  text: string
  instance?: string | null
  resolvedInstance?: string | null
}) {
  const parsedDestination = parseEvolutionDestination(params.number)
  const startedAt = Date.now()
  const maskedNumber = maskWhatsAppDestination(parsedDestination.destination)
  const apiUrl = getRequiredEnv("EVOLUTION_API_URL").replace(/\/+$/, "")
  const apiKey = getRequiredEnv("EVOLUTION_API_KEY")
  const timeoutMs = getEvolutionApiTimeoutMs()
  const instance =
    params.resolvedInstance ??
    (await resolveEvolutionInstanceForDestination(
      parsedDestination.destination,
      params.instance ?? parsedDestination.instance
    ))
  let response: Response | null = null
  let data:
    | EvolutionSendTextResponse
    | { error?: string; message?: string }
    | null = null

  const encodedInstance = encodeURIComponent(instance)

  try {
    response = await fetch(`${apiUrl}/message/sendText/${encodedInstance}`, {
      method: "POST",
      headers: {
        ...buildEvolutionRequestHeaders(apiKey),
      },
      body: JSON.stringify({
        number: parsedDestination.destination,
        text: params.text,
        delay: 1200,
        linkPreview: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })

    data = (await response.json().catch(() => ({}))) as
      | EvolutionSendTextResponse
      | { error?: string; message?: string }

    if (!response.ok) {
      throw new Error(
        ("error" in data && typeof data.error === "string" && data.error) ||
          ("message" in data && typeof data.message === "string" && data.message) ||
          "Falha ao enviar mensagem pela Evolution API"
      )
    }

    logIntegrationEvent({
      integration: "whatsapp",
      action: "send-text",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: {
        destination: maskedNumber,
        statusCode: response.status,
        deliveryStatus: isEvolutionSendTextResponse(data) ? data.status ?? null : null,
        messageId:
          isEvolutionSendTextResponse(data) && data.key
            ? data.key.id ?? null
            : null,
      },
    })

    return data
  } catch (error) {
    const normalizedError = normalizeEvolutionError(
      error,
      timeoutMs,
      `/message/sendText/${encodedInstance}`
    )

    logIntegrationEvent({
      integration: "whatsapp",
      action: "send-text",
      status: "failure",
      durationMs: Date.now() - startedAt,
      details: {
        destination: maskedNumber,
        statusCode: response?.status ?? null,
        deliveryStatus:
          data && "status" in data && typeof data.status === "string"
            ? data.status
            : null,
      },
      error: normalizedError,
    })

    throw normalizedError
  }
}

export async function sendWhatsAppDocument(params: {
  number: string
  fileName: string
  contentBase64: string
  caption?: string | null
  instance?: string | null
  resolvedInstance?: string | null
}) {
  const parsedDestination = parseEvolutionDestination(params.number)
  const startedAt = Date.now()
  const maskedNumber = maskWhatsAppDestination(parsedDestination.destination)
  const apiUrl = getRequiredEnv("EVOLUTION_API_URL").replace(/\/+$/, "")
  const apiKey = getRequiredEnv("EVOLUTION_API_KEY")
  const timeoutMs = getEvolutionApiTimeoutMs()
  const instance =
    params.resolvedInstance ??
    (await resolveEvolutionInstanceForDestination(
      parsedDestination.destination,
      params.instance ?? parsedDestination.instance
    ))
  let response: Response | null = null
  let data:
    | EvolutionSendMediaResponse
    | { error?: string; message?: string }
    | null = null

  const encodedInstance = encodeURIComponent(instance)

  try {
    response = await fetch(`${apiUrl}/message/sendMedia/${encodedInstance}`, {
      method: "POST",
      headers: {
        ...buildEvolutionRequestHeaders(apiKey),
      },
      body: JSON.stringify({
        number: parsedDestination.destination,
        mediatype: "document",
        mimetype: "application/pdf",
        fileName: params.fileName,
        media: params.contentBase64,
        caption: params.caption ?? undefined,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })

    data = (await response.json().catch(() => ({}))) as
      | EvolutionSendMediaResponse
      | { error?: string; message?: string }

    if (!response.ok) {
      throw new Error(
        ("error" in data && typeof data.error === "string" && data.error) ||
          ("message" in data && typeof data.message === "string" && data.message) ||
          "Falha ao enviar PDF pela Evolution API"
      )
    }

    logIntegrationEvent({
      integration: "whatsapp",
      action: "send-document",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: {
        destination: maskedNumber,
        statusCode: response.status,
        fileName: params.fileName,
      },
    })

    return data
  } catch (error) {
    const normalizedError = normalizeEvolutionError(
      error,
      timeoutMs,
      `/message/sendMedia/${encodedInstance}`
    )

    logIntegrationEvent({
      integration: "whatsapp",
      action: "send-document",
      status: "failure",
      durationMs: Date.now() - startedAt,
      details: {
        destination: maskedNumber,
        statusCode: response?.status ?? null,
        fileName: params.fileName,
      },
      error: normalizedError,
    })

    throw normalizedError
  }
}

type EvolutionGroupResponseItem = {
  id?: string
  remoteJid?: string
  subject?: string
  pushName?: string
  subjectOwner?: string
  size?: number
  participants?: unknown[]
  announce?: boolean
  unreadCount?: number
  isSaved?: boolean
}

type EvolutionGroupResponseEnvelope = {
  groups?: unknown
  data?: unknown
  response?: {
    groups?: unknown
    data?: unknown
  }
}

export function getEvolutionConfig() {
  const apiUrl = normalizeEnvValue(process.env.EVOLUTION_API_URL)
  const apiKey = normalizeEnvValue(process.env.EVOLUTION_API_KEY)
  const instance = normalizeEnvValue(process.env.EVOLUTION_INSTANCE)

  return {
    apiUrl,
    apiKey,
    instance,
    configured: Boolean(apiUrl && apiKey && instance),
  }
}

export async function listEvolutionInstances() {
  const startedAt = Date.now()
  const config = getEvolutionConfig()
  const timeoutMs = getEvolutionApiTimeoutMs()

  if (!config.apiUrl || !config.apiKey) {
    return config.instance
      ? [
          {
            name: config.instance,
            status: null,
            isPrimary: true,
          } satisfies EvolutionInstance,
        ]
      : []
  }

  let response: Response | null = null

  try {
    response = await fetch(`${config.apiUrl.replace(/\/+$/, "")}/instance/fetchInstances`, {
      method: "GET",
      headers: buildEvolutionRequestHeaders(config.apiKey),
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    })

    const data = (await response.json().catch(() => [])) as
      | EvolutionInstanceResponseItem[]
      | { error?: string; message?: string }

    if (!response.ok || !Array.isArray(data)) {
      throw new Error(
        (typeof data === "object" &&
          data !== null &&
          (("error" in data && typeof data.error === "string" && data.error) ||
            ("message" in data && typeof data.message === "string" && data.message))) ||
          "Falha ao listar instâncias na Evolution API"
      )
    }

    const instances = new Map<string, EvolutionInstance>()

    for (const item of data) {
      const parsedInstance = readEvolutionInstanceCandidate(item, config.instance)

      if (!parsedInstance) {
        continue
      }

      const existing = instances.get(parsedInstance.name)
      instances.set(parsedInstance.name, {
        name: parsedInstance.name,
        status: parsedInstance.status ?? existing?.status ?? null,
        isPrimary: parsedInstance.isPrimary || existing?.isPrimary === true,
      })
    }

    const normalizedInstances = [...instances.values()].sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return left.isPrimary ? -1 : 1
      }

      return left.name.localeCompare(right.name, "pt-BR")
    })

    logIntegrationEvent({
      integration: "whatsapp",
      action: "list-instances",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: {
        primaryInstance: config.instance || null,
        statusCode: response.status,
        instancesCount: normalizedInstances.length,
      },
    })

    return normalizedInstances
  } catch (error) {
    const normalizedError = normalizeEvolutionError(
      error,
      timeoutMs,
      "/instance/fetchInstances"
    )

    logIntegrationEvent({
      integration: "whatsapp",
      action: "list-instances",
      status: "failure",
      durationMs: Date.now() - startedAt,
      details: {
        primaryInstance: config.instance || null,
        statusCode: response?.status ?? null,
      },
      error: normalizedError,
    })

    throw normalizedError
  }
}

function buildGroupFetchTargets(
  config: EvolutionConfig,
  instances: EvolutionInstance[],
  preferredInstances?: string[]
) {
  if (preferredInstances?.length) {
    return dedupeStrings(
      preferredInstances.map((instance) =>
        resolveEvolutionInstanceAlias(instance, instances) ?? instance
      )
    )
  }

  const preferredTargets = instances
    .filter((instance) => {
      if (instance.isPrimary) {
        return true
      }

      return isEvolutionInstanceConnected(instance.status)
    })
    .map((instance) => instance.name)

  if (preferredTargets.length > 0) {
    return dedupeStrings(preferredTargets)
  }

  return dedupeStrings(config.instance ? [config.instance] : [])
}

function normalizeInstanceKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

function normalizeEvolutionGroupId(group: EvolutionGroupResponseItem) {
  return typeof group.id === "string"
    ? group.id.trim()
    : typeof group.remoteJid === "string"
      ? group.remoteJid.trim()
      : ""
}

function normalizePhoneDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "")
}

function extractParticipantSearchValues(participant: unknown) {
  if (typeof participant === "string") {
    return [participant]
  }

  if (!participant || typeof participant !== "object") {
    return []
  }

  const record = participant as Record<string, unknown>

  return [
    record.id,
    record.jid,
    record.remoteJid,
    record.number,
    record.phone,
    record.phoneNumber,
    record.waId,
    record.user,
  ].filter((value): value is string => typeof value === "string")
}

function groupMatchesParticipantPhone(
  group: { participants?: unknown[] },
  phoneDigits: string
) {
  if (!phoneDigits) {
    return true
  }

  if (!Array.isArray(group.participants) || group.participants.length === 0) {
    return false
  }

  return group.participants.some((participant) =>
    extractParticipantSearchValues(participant).some((value) => {
      const participantDigits = normalizePhoneDigits(value)

      return (
        participantDigits === phoneDigits ||
        participantDigits.endsWith(phoneDigits) ||
        phoneDigits.endsWith(participantDigits)
      )
    })
  )
}

function normalizeEvolutionGroupSubject(group: EvolutionGroupResponseItem) {
  return typeof group.subject === "string" && group.subject.trim()
    ? group.subject.trim()
    : typeof group.pushName === "string" && group.pushName.trim()
      ? group.pushName.trim()
      : "Grupo sem nome"
}

function normalizeEvolutionGroupSize(group: EvolutionGroupResponseItem) {
  return typeof group.size === "number"
    ? group.size
    : Array.isArray(group.participants)
      ? group.participants.length
      : typeof group.unreadCount === "number"
        ? group.unreadCount
        : 0
}

function mapEvolutionGroupResponseItem(
  group: EvolutionGroupResponseItem,
  instance: string
) {
  const id = normalizeEvolutionGroupId(group)

  if (!id || !id.endsWith("@g.us")) {
    return null
  }

  return {
    id,
    subject: normalizeEvolutionGroupSubject(group),
    size: normalizeEvolutionGroupSize(group),
    announce: Boolean(group.announce),
    instance,
    participants: Array.isArray(group.participants) ? group.participants : [],
  } satisfies EvolutionGroup
}

function mergeEvolutionGroups(
  groupsByInstance: Array<{ instance: string; groups: EvolutionGroup[] }>
) {
  const merged = new Map<string, EvolutionGroup>()

  for (const entry of groupsByInstance) {
    for (const group of entry.groups) {
      const existing = merged.get(group.id)

      if (!existing) {
        merged.set(group.id, group)
        continue
      }

      merged.set(group.id, {
        id: group.id,
        subject:
          existing.subject !== "Grupo sem nome"
            ? existing.subject
            : group.subject,
        size: Math.max(existing.size, group.size),
        announce: existing.announce || group.announce,
        instance:
          normalizeInstanceKey(existing.instance) === normalizeInstanceKey(group.instance)
            ? existing.instance
            : existing.instance || group.instance,
        participants: existing.participants?.length
          ? existing.participants
          : group.participants ?? [],
      })
    }
  }

  return [...merged.values()]
}

function extractEvolutionGroupItems(data: unknown): EvolutionGroupResponseItem[] | null {
  if (Array.isArray(data)) {
    return data as EvolutionGroupResponseItem[]
  }

  if (!data || typeof data !== "object") {
    return null
  }

  const envelope = data as EvolutionGroupResponseEnvelope
  const candidates = [
    envelope.groups,
    envelope.data,
    envelope.response?.groups,
    envelope.response?.data,
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as EvolutionGroupResponseItem[]
    }
  }

  return null
}

async function fetchEvolutionGroupsForInstance(
  config: EvolutionConfig,
  instance: string,
  includeParticipants = false
) {
  const encodedInstance = encodeURIComponent(instance)
  const data = await fetchEvolutionJson<unknown>({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    path: `/group/fetchAllGroups/${encodedInstance}?getParticipants=${
      includeParticipants ? "true" : "false"
    }`,
    timeoutMs: 45_000,
  })
  const groupsData = extractEvolutionGroupItems(data)

  if (!groupsData) {
    throw new Error("fetchAllGroups retornou resposta inválida")
  }

  const mergedGroups = mergeEvolutionGroups([
    {
      instance,
      groups: groupsData
        .map((group) => mapEvolutionGroupResponseItem(group, instance))
        .filter((group): group is EvolutionGroup => Boolean(group)),
    },
  ])

  if (mergedGroups.length === 0) {
    throw new Error("Nenhum grupo foi retornado pela Evolution API")
  }

  return {
    groups: mergedGroups,
    partialErrors: [] as string[],
  }
}

async function restartEvolutionInstance(
  config: EvolutionConfig,
  instance: string
) {
  const encodedInstance = encodeURIComponent(instance)

  await fetchEvolutionJson<unknown>({
    apiUrl: config.apiUrl,
    apiKey: config.apiKey,
    path: `/instance/restart/${encodedInstance}`,
    method: "PUT",
  })
}

export async function loadEvolutionCatalog(
  options?: EvolutionCatalogOptions
): Promise<EvolutionCatalog> {
  const startedAt = Date.now()
  const config = getEvolutionConfig()

  if (!config.configured) {
    throw new Error(
      "Configure EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE para listar os grupos."
    )
  }

  const partialErrors: string[] = []
  let instances: EvolutionInstance[] = []

  try {
    instances = await listEvolutionInstances()
  } catch (error) {
    partialErrors.push(
      error instanceof Error ? error.message : "Falha ao listar instâncias na Evolution API"
    )
    instances = config.instance
      ? [
          {
            name: config.instance,
            status: null,
            isPrimary: true,
          } satisfies EvolutionInstance,
        ]
      : []
  }

  const targets = buildGroupFetchTargets(
    config,
    instances,
    options?.groupInstances
  )
  const participantPhoneDigits = normalizePhoneDigits(options?.participantPhone)
  async function fetchGroupsForTargets(instanceTargets: string[]) {
    const groupResults = await Promise.allSettled(
      instanceTargets.map(async (instance) => ({
        instance,
        groups: await fetchEvolutionGroupsForInstance(
          config,
          instance,
          Boolean(participantPhoneDigits)
        ),
      }))
    )

    const groups: EvolutionGroup[] = []

    groupResults.forEach((result, index) => {
      if (result.status === "fulfilled") {
        groups.push(...result.value.groups.groups)
        partialErrors.push(...result.value.groups.partialErrors)
        return
      }

      const instance = instanceTargets[index]
      partialErrors.push(
        result.reason instanceof Error
          ? `${instance}: ${result.reason.message}`
          : `${instance}: Falha ao listar grupos`
      )
    })

    return groups
  }

  let groups = await fetchGroupsForTargets(targets)

  if (
    groups.length === 0 &&
    options?.groupInstances?.length &&
    instances.length > 0
  ) {
    const fallbackTargets = buildGroupFetchTargets(config, instances, undefined)

    if (
      fallbackTargets.length > 0 &&
      fallbackTargets.join("|") !== targets.join("|")
    ) {
      groups = await fetchGroupsForTargets(fallbackTargets)
      if (groups.length > 0) {
        targets.splice(0, targets.length, ...fallbackTargets)
      }
    }
  }

  if (participantPhoneDigits) {
    groups = groups.filter((group) =>
      groupMatchesParticipantPhone(group, participantPhoneDigits)
    )
  }

  const sortedGroups = groups.sort((left, right) => {
    const subjectComparison = left.subject.localeCompare(right.subject, "pt-BR")

    if (subjectComparison !== 0) {
      return subjectComparison
    }

    return left.instance.localeCompare(right.instance, "pt-BR")
  })
  const hasOpenInstance = instances.some(
    (instance) => isEvolutionInstanceConnected(instance.status)
  )
  const hasGroups = sortedGroups.length > 0

  try {
    logIntegrationEvent({
      integration: "whatsapp",
      action: "list-groups",
      status: "success",
      durationMs: Date.now() - startedAt,
      details: {
        primaryInstance: config.instance,
        instancesCount: instances.length,
        queriedInstances: targets,
        groupsCount: sortedGroups.length,
        partialErrorsCount: partialErrors.length,
      },
    })

    return {
      config,
      connected: hasGroups || hasOpenInstance,
      instances,
      groups: sortedGroups,
      partialErrors,
    }
  } catch (error) {
    logIntegrationEvent({
      integration: "whatsapp",
      action: "list-groups",
      status: "failure",
      durationMs: Date.now() - startedAt,
      details: {
        primaryInstance: config.instance,
        instancesCount: instances.length,
      },
      error,
    })

    throw error
  }
}

export async function listEvolutionGroups() {
  const catalog = await loadEvolutionCatalog()
  return catalog.groups
}

export async function syncEvolutionInstance(instance?: string | null) {
  const config = getEvolutionConfig()
  const targetInstance = normalizeEvolutionInstanceName(instance ?? config.instance)

  if (!config.configured || !targetInstance) {
    return
  }

  await restartEvolutionInstance(config, targetInstance)
}

export async function resolveEvolutionInstanceForDestination(
  destination: string,
  preferredInstance?: string | null
) {
  const configuredInstance = getRequiredEnv("EVOLUTION_INSTANCE")

  const normalizedDestination = destination.trim()

  if (!normalizedDestination.endsWith("@g.us")) {
    const normalizedPreferredInstance =
      normalizeEvolutionInstanceName(preferredInstance)

    if (normalizedPreferredInstance) {
      return normalizedPreferredInstance
    }

    return configuredInstance
  }

  try {
    const catalog = await loadEvolutionCatalog()
    const matchingGroup = catalog.groups.find((group) => group.id === normalizedDestination)

    if (matchingGroup?.instance) {
      return matchingGroup.instance
    }
  } catch {
    // Fallback para a instância padrão quando a consulta de grupos falhar.
  }

  const normalizedPreferredInstance = normalizeEvolutionInstanceName(preferredInstance)

  if (normalizedPreferredInstance) {
    return normalizedPreferredInstance
  }

  return configuredInstance
}
