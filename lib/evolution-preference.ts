import { prisma } from "@/lib/prisma"
import {
  getMetaTokenPresetFromStoredToken,
  type MetaTokenPreset,
} from "@/lib/meta-token"

function normalizeInstanceName(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

const META_PRESET_TO_EVOLUTION_INSTANCE: Record<MetaTokenPreset, string> = {
  ISAQUE: "Isaque",
  BRAYTON: "Brayton",
}

type EvolutionIdentityRule = {
  instance: string
  aliases: string[]
}

const EVOLUTION_IDENTITY_RULES: EvolutionIdentityRule[] = [
  {
    instance: "Brayton",
    aliases: ["braytonmaycon5@gmail.com", "brayton maycon", "brayton"],
  },
  {
    instance: "Isaque",
    aliases: ["isaque@greatgo.com", "isaque"],
  },
  {
    instance: "Carlos",
    aliases: ["carlos@greatgo.com", "carlos silva", "carlos"],
  },
  {
    instance: "Jeff",
    aliases: ["jeff@greatgo.com", "jeff"],
  },
]

type EvolutionProfileSource =
  | string
  | null
  | undefined
  | {
      id: string
      name?: string | null
      email?: string | null
      evolutionInstance: string | null
      metaAccessToken: string | null
    }

export function getEvolutionInstanceForMetaPreset(
  preset: MetaTokenPreset | null | undefined
) {
  if (!preset) {
    return null
  }

  return META_PRESET_TO_EVOLUTION_INSTANCE[preset] ?? null
}

async function resolveUserEvolutionInstanceFromId(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      evolutionInstance: true,
      metaAccessToken: true,
    },
  })

  return resolveUserEvolutionInstanceFromProfile(user)
}

function normalizeIdentityText(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : ""
}

function resolveEvolutionInstanceFromIdentity(
  name: unknown,
  email: unknown
) {
  const haystack = `${normalizeIdentityText(name)} ${normalizeIdentityText(email)}`

  if (!haystack.trim()) {
    return null
  }

  for (const rule of EVOLUTION_IDENTITY_RULES) {
    if (
      rule.aliases.some((alias) => {
        const normalizedAlias = normalizeIdentityText(alias)

        return normalizedAlias ? haystack.includes(normalizedAlias) : false
      })
    ) {
      return rule.instance
    }
  }

  return null
}

function resolveUserEvolutionInstanceFromProfile(profile: {
  name?: string | null
  email?: string | null
  evolutionInstance: string | null
  metaAccessToken: string | null
} | null) {
  const identityInstance = resolveEvolutionInstanceFromIdentity(
    profile?.name,
    profile?.email
  )

  if (identityInstance) {
    return identityInstance
  }

  const preset = getMetaTokenPresetFromStoredToken(profile?.metaAccessToken ?? null)
  const presetInstance = getEvolutionInstanceForMetaPreset(preset)

  if (presetInstance) {
    return presetInstance
  }

  const explicitInstance = normalizeInstanceName(profile?.evolutionInstance)

  if (explicitInstance) {
    return explicitInstance
  }

  return null
}

export async function resolveUserEvolutionInstance(
  userOrId: EvolutionProfileSource
) {
  if (!userOrId) {
    return null
  }

  if (typeof userOrId === "string") {
    return resolveUserEvolutionInstanceFromId(userOrId)
  }

  return resolveUserEvolutionInstanceFromProfile(userOrId)
}

export function normalizeEvolutionInstancePreference(value: unknown) {
  return normalizeInstanceName(value)
}
