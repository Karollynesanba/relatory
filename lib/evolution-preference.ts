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

type EvolutionProfileSource =
  | string
  | null
  | undefined
  | {
      id: string
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
      evolutionInstance: true,
      metaAccessToken: true,
    },
  })

  return resolveUserEvolutionInstanceFromProfile(user)
}

function resolveUserEvolutionInstanceFromProfile(profile: {
  evolutionInstance: string | null
  metaAccessToken: string | null
} | null) {
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
