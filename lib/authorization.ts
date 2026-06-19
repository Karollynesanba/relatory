import type { Prisma, User } from "@prisma/client"
import { getSessionUser } from "@/lib/session-user"
import { getBootstrapLoginAccount } from "@/lib/auth-accounts"
import { logError, logInfo, logWarn } from "@/lib/safe-logger"

type Role = "ADMIN" | "MANAGER"

export type AuthenticatedUser = Pick<
  User,
  | "id"
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
      email: true,
      role: true,
      passwordHash: true,
      metaAccessToken: true,
      metaTokenExpiresAt: true,
      evolutionInstance: true,
    })

    if (!session?.user?.email) {
      logWarn("auth.current-user.no-session")
      return null
    }

    logInfo("auth.current-user.loaded", {
      email: session.user.email,
      found: Boolean(user),
      userId: user?.id ?? null,
      role: user?.role ?? null,
    })

    if (user) {
      return user as AuthenticatedUser
    }

    const bootstrapAccount = getBootstrapLoginAccount(session.user.email)

    if (bootstrapAccount) {
      logWarn("auth.current-user.bootstrap-fallback", {
        email: session.user.email,
        accountId: bootstrapAccount.id,
      })

      return {
        id: session.user.id || bootstrapAccount.id,
        email: bootstrapAccount.email,
        role: bootstrapAccount.role,
        passwordHash: "",
        metaAccessToken: null,
        metaTokenExpiresAt: null,
        evolutionInstance: null,
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
