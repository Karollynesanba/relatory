import CredentialsProvider from "next-auth/providers/credentials"
import type { NextAuthOptions } from "next-auth"
import {
  ensureBootstrapLoginAccount,
  getBootstrapLoginAccount,
} from "@/lib/auth-accounts"
import { resolveEvolutionInstanceForUser } from "@/lib/evolution-identity"
import { withTimeout } from "@/lib/async"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import { logError, logInfo, logWarn } from "@/lib/safe-logger"

type Role = "ADMIN" | "MANAGER"

type AuthUser = {
  id: string
  email: string
  name: string
  role: Role
  evolutionInstance: string | null
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

async function findUserByNormalizedEmail(email: string) {
  return prisma.user.findFirst({
    where: {
      email: normalizeEmail(email),
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      passwordHash: true,
      evolutionInstance: true,
    },
  })
}

function buildAuthorizedUser(user: {
  id: string
  email: string
  name: string | null
  role: Role
  evolutionInstance?: string | null
}) {
  const resolvedEvolutionInstance =
    resolveEvolutionInstanceForUser(user) ?? user.evolutionInstance

  return {
    id: user.id,
    email: user.email,
    name: user.name ?? user.email,
    role: user.role,
    evolutionInstance: resolvedEvolutionInstance ?? null,
  } satisfies AuthUser
}

async function authorizeWithCredentials(email: string, password: string) {
  const normalizedEmail = normalizeEmail(email)
  const bootstrapAccount = getBootstrapLoginAccount(normalizedEmail)

  logInfo("auth.authorize.start", {
    email: normalizedEmail,
    bootstrapAccount: bootstrapAccount?.id ?? null,
  })

  let user:
    | Awaited<ReturnType<typeof findUserByNormalizedEmail>>
    | null = null
  let lookupFailed = false

  try {
    user = await findUserByNormalizedEmail(normalizedEmail)
  } catch (error) {
    lookupFailed = true
    logWarn("auth.authorize.user-lookup-failed", {
      email: normalizedEmail,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    })
  }

  if (user && verifyPassword(password, user.passwordHash)) {
    logInfo("auth.authorize.success", {
      email: normalizedEmail,
      userId: user.id,
      role: user.role,
    })

    return buildAuthorizedUser(user)
  }

  if (bootstrapAccount && verifyPassword(password, bootstrapAccount.password)) {
    try {
      const ensuredUser = await ensureBootstrapLoginAccount(normalizedEmail)

      if (ensuredUser) {
        logInfo("auth.authorize.bootstrap-account.provisioned", {
          email: normalizedEmail,
          userId: ensuredUser.id,
          role: ensuredUser.role,
        })

        return buildAuthorizedUser(ensuredUser)
      }
    } catch (error) {
      logWarn("auth.authorize.bootstrap-account.provision-failed", {
        email: normalizedEmail,
        accountId: bootstrapAccount.id,
        error: error instanceof Error ? error.message : "Erro desconhecido",
      })
    }

    logWarn("auth.authorize.bootstrap-account.fallback", {
      email: normalizedEmail,
      accountId: bootstrapAccount.id,
    })

    return buildAuthorizedUser({
      id: bootstrapAccount.id,
      email: bootstrapAccount.email,
      name: bootstrapAccount.name,
      role: bootstrapAccount.role,
      evolutionInstance: null,
    })
  }

  if (lookupFailed) {
    throw new Error("Nao foi possivel validar as credenciais agora.")
  }

  if (!user) {
    logWarn("auth.authorize.user-not-found", {
      email: normalizedEmail,
    })
    return null
  }

  logWarn("auth.authorize.invalid-password", {
    email: normalizedEmail,
    userId: user.id,
  })

  return null
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email?.trim()
        const password = credentials?.password

        if (!email || !password) {
          logWarn("auth.authorize.missing-credentials")
          return null
        }

        try {
          return await withTimeout(
            authorizeWithCredentials(email, password),
            12_000,
            "Tempo esgotado ao validar as credenciais."
          )
        } catch (error) {
          logError("auth.authorize.failed", error, {
            email,
          })
          throw error
        }
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        logInfo("auth.jwt.user-attached", {
          userId: user.id,
          email: user.email,
          role: user.role,
        })
        token.id = user.id
        token.role = user.role
        token.email = user.email
        token.name = user.name
        return token
      }

      if (typeof token.email !== "string" || !token.email.trim()) {
        delete token.id
        delete token.role
        delete token.email
        delete token.name
        logWarn("auth.jwt.missing-email")
        return token
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : ""
        session.user.role = token.role === "ADMIN" ? "ADMIN" : "MANAGER"
        session.user.email = typeof token.email === "string" ? token.email : ""
        session.user.name = typeof token.name === "string" ? token.name : ""
      }

      logInfo("auth.session.ready", {
        hasUser: Boolean(session.user?.email),
        userId: session.user?.id,
        role: session.user?.role,
      })

      return session
    },
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) {
        const destination = `${baseUrl}${url}`
        logInfo("auth.redirect.relative", { destination })
        return destination
      }

      try {
        const targetUrl = new URL(url)
        if (targetUrl.origin === baseUrl) {
          logInfo("auth.redirect.same-origin", {
            destination: targetUrl.toString(),
          })
          return targetUrl.toString()
        }
      } catch {
        logWarn("auth.redirect.invalid-url", { url, baseUrl })
      }

      logWarn("auth.redirect.fallback", { url, baseUrl })
      return `${baseUrl}/dashboard`
    },
  },
  events: {
    async signIn(message) {
      logInfo("auth.event.sign-in", {
        isNewUser: message.isNewUser,
        userId: message.user.id,
        email: message.user.email,
      })
    },
    async signOut(message) {
      logInfo("auth.event.sign-out", {
        session: typeof message.session === "object" ? "present" : "missing",
        tokenEmail:
          typeof message.token?.email === "string" ? message.token.email : null,
      })
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
}
