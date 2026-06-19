import { getAdminBootstrapCredentials } from "@/lib/admin-user"
import { hashPassword, verifyPassword } from "@/lib/password"
import { prisma } from "@/lib/prisma"

export type AuthRole = "ADMIN" | "MANAGER"
export const DEFAULT_LOGIN_PASSWORD = "123456"

export type AuthLoginAccount = {
  id: string
  name: string
  email: string
  role: AuthRole
  password: string
}

function readEnvValue(value: string | undefined) {
  const normalizedValue = value?.trim()
  return normalizedValue ? normalizedValue : ""
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function readBootstrapPassword(
  env: Record<string, string | undefined>,
  name: string
) {
  return readEnvValue(env[name]) || DEFAULT_LOGIN_PASSWORD
}

function getManagerLoginAccounts(
  env: Record<string, string | undefined> = process.env
): AuthLoginAccount[] {
  const email = normalizeEmail(readEnvValue(env.DEV_BYPASS_AUTH_EMAIL))
  const password = readEnvValue(env.DEV_BYPASS_AUTH_PASSWORD) || DEFAULT_LOGIN_PASSWORD
  const name = readEnvValue(env.DEV_BYPASS_AUTH_NAME) || "Gestor"
  const accounts: AuthLoginAccount[] = []

  if (email) {
    accounts.push({
      id: `manager-${email}`,
      name,
      email,
      role: "MANAGER",
      password,
    })
  }

  accounts.push({
    id: "brayton-maycon",
    name: "Brayton Maycon",
    email: "braytonmaycon5@gmail.com",
    role: "ADMIN",
    password: DEFAULT_LOGIN_PASSWORD,
  })

  accounts.push({
    id: "kaua-anderson",
    name: "Kaua Anderson",
    email: "kauaanderson1919@gmail.com",
    role: "ADMIN",
    password: readBootstrapPassword(env, "KAUA_BOOTSTRAP_PASSWORD"),
  })

  return accounts
}

export function getAuthLoginAccounts(
  env: Record<string, string | undefined> = process.env
): AuthLoginAccount[] {
  const adminCredentials = getAdminBootstrapCredentials(env)

  const accounts: AuthLoginAccount[] = [
    ...(adminCredentials
      ? [
          {
            id: "admin",
            name: adminCredentials.name,
            email: adminCredentials.email,
            role: "ADMIN",
            password: adminCredentials.password,
          } satisfies AuthLoginAccount,
        ]
      : []),
    ...getManagerLoginAccounts(env),
  ]

  return accounts.filter((account, index, current) => {
    return (
      current.findIndex(
        (entry) => normalizeEmail(entry.email) === normalizeEmail(account.email)
      ) === index
    )
  })
}

export function getBootstrapLoginAccount(
  email: string,
  env: Record<string, string | undefined> = process.env
) {
  const normalizedEmail = normalizeEmail(email)

  return (
    getAuthLoginAccounts(env).find(
      (account) => normalizeEmail(account.email) === normalizedEmail
    ) ?? null
  )
}

export async function ensureBootstrapLoginAccount(
  email: string,
  env: Record<string, string | undefined> = process.env
) {
  const account = getBootstrapLoginAccount(email, env)

  if (!account) {
    return null
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizeEmail(account.email) },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
    },
  })

  if (
    existingUser?.role === account.role &&
    existingUser.passwordHash &&
    verifyPassword(account.password, existingUser.passwordHash)
  ) {
    return existingUser
  }

  const passwordHash = hashPassword(account.password)
  const userName = existingUser?.name ?? account.name

  return prisma.user.upsert({
    where: { email: normalizeEmail(account.email) },
    update: {
      name: userName,
      passwordHash,
      role: account.role,
    },
    create: {
      email: normalizeEmail(account.email),
      name: userName,
      passwordHash,
      role: account.role,
    },
  })
}
