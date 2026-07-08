export type EvolutionIdentityRule = {
  instance: string
  aliases: string[]
}

const EVOLUTION_IDENTITY_RULES: EvolutionIdentityRule[] = [
  {
    instance: "Brayton - GreatGo",
    aliases: ["braytonmaycon5@gmail.com", "brayton maycon", "brayton"],
  },
  {
    instance: "Isaque - GreatGo",
    aliases: ["isaque@greatgo.com", "isaque"],
  },
  {
    instance: "Carlos",
    aliases: ["carlos@greatgo.com", "carlos silva", "carlos"],
  },
  {
    instance: "Jefereson",
    aliases: ["jeferson", "jefereson", "jefferson", "jeff", "jefereson luiz"],
  },
]

function normalizeIdentityText(value: unknown) {
  return typeof value === "string"
    ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    : ""
}

export function resolveEvolutionInstanceFromIdentity(
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
