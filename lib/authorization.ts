import type { Prisma, User } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { getSessionUser } from "@/lib/session-user"
import { getBootstrapLoginAccount } from "@/lib/auth-accounts"
import { resolveEvolutionInstanceForUser } from "@/lib/evolution-identity"
import { logError, logInfo, logWarn } from "@/lib/safe-logger"

type Role = "ADMIN" | "MANAGER"

export type AuthenticatedUser = Pick<
  User,
  | "id"
  | "name"
  | "email"
  | "role"
  | "passwordHash"
  | "metaAccessToken"
  | "metaTokenExpiresAt"
  | "evolutionInstance"
> & {
}

const DEFAULT_SHARED_CLIENT_EMAILS = [
  "cl.andrade99@gmail.com",
  "luiz46340@gmail.com",
]

function parseSharedReportManagerIds(
  value: string | undefined = process.env.REPORT_SHARED_MANAGER_IDS
) {
  return new Set(
    (value ?? "")
      .split(/[,\n;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean)
  )
}

const SHARED_REPORT_MANAGER_IDS = parseSharedReportManagerIds()

function parseSharedReportManagerEmails(
  value: string | undefined = process.env.REPORT_SHARED_MANAGER_EMAILS
) {
  return new Set(
    [
      ...DEFAULT_SHARED_CLIENT_EMAILS,
      ...(value ?? "")
        .split(/[,\n;]+/)
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    ]
  )
}

const SHARED_REPORT_MANAGER_EMAILS = parseSharedReportManagerEmails()

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function hasSharedReportAccess(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">
) {
  return (
    SHARED_REPORT_MANAGER_IDS.has(user.id) ||
    SHARED_REPORT_MANAGER_EMAILS.has(normalizeEmail(user.email))
  )
}

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  try {
    const { session, user } = await getSessionUser({
      id: true,
      name: true,
      email: true,
      role: true,
      passwordHash: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
      evolutionInstance: true,
    })

    if (!session?.user?.email) {
      logWarn("auth.current-user.no-session")
      const fallbackUser = await prisma.user.findFirst({
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          passwordHash: true,
          metaAccessToken: true,
          metaTokenExpiresAt: true,
          evolutionInstance: true,
        },
      })

      if (!fallbackUser) {
        return null
      }

      const identityEvolutionInstance = resolveEvolutionInstanceForUser(fallbackUser)
      const resolvedEvolutionInstance =
        identityEvolutionInstance ?? fallbackUser.evolutionInstance

      return {
        ...fallbackUser,
        evolutionInstance: resolvedEvolutionInstance ?? fallbackUser.evolutionInstance,
      }
    }

    logInfo("auth.current-user.loaded", {
      email: session.user.email,
      found: Boolean(user),
      userId: user?.id ?? null,
      role: user?.role ?? null,
    })

    if (user) {
      const identityEvolutionInstance = resolveEvolutionInstanceForUser(user)
      const resolvedEvolutionInstance =
        identityEvolutionInstance ?? user.evolutionInstance

      if (resolvedEvolutionInstance && resolvedEvolutionInstance !== user.evolutionInstance) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: {
              evolutionInstance: resolvedEvolutionInstance,
            },
          })
        } catch (error) {
          logWarn("auth.current-user.sync-evolution-instance-failed", {
            userId: user.id,
            error: error instanceof Error ? error.message : "Erro desconhecido",
          })
        }
      }

      return {
        ...(user as AuthenticatedUser),
        evolutionInstance: resolvedEvolutionInstance ?? user.evolutionInstance,
      }
    }

    const bootstrapAccount = getBootstrapLoginAccount(session.user.email)

    if (bootstrapAccount) {
      logWarn("auth.current-user.bootstrap-fallback", {
        email: session.user.email,
        accountId: bootstrapAccount.id,
      })

      const ensuredBootstrapUser = await prisma.user.upsert({
        where: { email: bootstrapAccount.email },
        update: {
          name: bootstrapAccount.name,
          role: bootstrapAccount.role,
          evolutionInstance:
            resolveEvolutionInstanceForUser({
              name: bootstrapAccount.name,
              email: bootstrapAccount.email,
            }) ?? null,
        },
        create: {
          id: bootstrapAccount.id,
          email: bootstrapAccount.email,
          name: bootstrapAccount.name,
          passwordHash: "",
          role: bootstrapAccount.role,
          evolutionInstance:
            resolveEvolutionInstanceForUser({
              name: bootstrapAccount.name,
              email: bootstrapAccount.email,
            }) ?? null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          passwordHash: true,
          metaAccessToken: true,
          metaTokenExpiresAt: true,
          evolutionInstance: true,
        },
      })

      return {
        ...ensuredBootstrapUser,
      }
    }

    return user
  } catch (error) {
    logError("auth.current-user.failed", error)
    throw error
  }
}

export function isAdmin(userOrRole: Pick<AuthenticatedUser, "role"> | Role) {
  const role = typeof userOrRole === "string" ? userOrRole : userOrRole.role

  return role === "ADMIN"
}

export function getRoleLabel(role: Role) {
  return role === "ADMIN" ? "Administrador" : "Gestor"
}

export function canAccessClient(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  managerId: string | null
) {
  return isAdmin(user) || hasSharedReportAccess(user) || managerId === user.id
}

export function canAccessReportClient(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  managerId: string | null
) {
  if (canAccessClient(user, managerId)) {
    return true
  }

  if (user.role !== "MANAGER" || !managerId) {
    return false
  }

  return SHARED_REPORT_MANAGER_IDS.has(managerId)
}

export function canManageUserProfile(
  user: Pick<AuthenticatedUser, "role">,
  target: Pick<User, "role">
) {
  return isAdmin(user) && target.role === "MANAGER"
}

export function scopeClientWhere(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  where: Prisma.ClientWhereInput = {}
): Prisma.ClientWhereInput {
  if (isAdmin(user) || hasSharedReportAccess(user)) {
    return where
  }

  return {
    AND: [where, { managerId: user.id }],
  }
}

export function scopeReportClientWhere(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  where: Prisma.ReportWhereInput = {}
): Prisma.ReportWhereInput {
  if (isAdmin(user) || hasSharedReportAccess(user)) {
    return where
  }

  const sharedManagerIds = Array.from(SHARED_REPORT_MANAGER_IDS)

  if (!sharedManagerIds.length) {
    return {
      AND: [where, { client: { managerId: user.id } }],
    }
  }

  return {
    AND: [
      where,
      {
        OR: [
          { client: { managerId: user.id } },
          { client: { managerId: { in: sharedManagerIds } } },
        ],
      },
    ],
  }
}

export function scopeSharedReportClientWhere(
  user: Pick<AuthenticatedUser, "id" | "role" | "email">,
  where: Prisma.ClientWhereInput = {}
): Prisma.ClientWhereInput {
  if (isAdmin(user) || hasSharedReportAccess(user)) {
    return where
  }

  const sharedManagerIds = Array.from(SHARED_REPORT_MANAGER_IDS)

  if (!sharedManagerIds.length) {
    return {
      AND: [where, { managerId: user.id }],
    }
  }

  return {
    AND: [
      where,
      {
        OR: [{ managerId: user.id }, { managerId: { in: sharedManagerIds } }],
      },
    ],
  }
}
