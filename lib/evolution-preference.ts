import { prisma } from "@/lib/prisma"
import {
  getMetaTokenPresetFromStoredToken,
  type MetaTokenPreset,
} from "@/lib/meta-token"
import { resolveEvolutionInstanceFromIdentity } from "@/lib/evolution-identity"

function normalizeInstanceName(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null
}

export function getDefaultEvolutionInstance() {
  return normalizeInstanceName(process.env.EVOLUTION_INSTANCE)
}

const META_PRESET_TO_EVOLUTION_INSTANCE: Record<MetaTokenPreset, string> = {
  ISAQUE: "Isaque - GreatGo",
  BRAYTON: "Brayton - GreatGo",
}

type EvolutionProfileSource =
  | string
  | null
  | undefined
  | {
      id: string
      name?: string | null
      email?: string | null
      evolutionInstance?: string | null
      metaAccessToken?: string | null
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

function resolveUserEvolutionInstanceFromProfile(profile: {
  name?: string | null
  email?: string | null
  evolutionInstance?: string | null
  metaAccessToken?: string | null
} | null) {
  const identityInstance = resolveEvolutionInstanceFromIdentity(
    profile?.name,
    profile?.email
  )

  if (identityInstance) {
    return identityInstance
  }

  const explicitInstance = normalizeInstanceName(profile?.evolutionInstance)

  if (explicitInstance) {
    return explicitInstance
  }

  const preset = getMetaTokenPresetFromStoredToken(profile?.metaAccessToken ?? null)
  const presetInstance = getEvolutionInstanceForMetaPreset(preset)

  if (presetInstance) {
    return presetInstance
  }

  return getDefaultEvolutionInstance()
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
