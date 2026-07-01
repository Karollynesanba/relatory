import { getServerSession } from "next-auth"
import type { Prisma } from "@prisma/client"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { logWarn } from "@/lib/safe-logger"

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

type UserWithEmail<T extends Prisma.UserSelect> = Prisma.UserGetPayload<{
  select: T & { email: true }
}>

async function findUserByNormalizedEmail<T extends Prisma.UserSelect>(
  email: string,
  select: T
): Promise<UserWithEmail<T> | null> {
  try {
    const normalizedEmail = normalizeEmail(email)

    const users = (await prisma.user.findMany({
      select: {
        ...(select as Prisma.UserSelect),
        email: true,
      },
    })) as Array<UserWithEmail<T>>

    return (
      users.find(
        (user) => normalizeEmail((user as { email: string }).email) === normalizedEmail
      ) ?? null
    )
  } catch (error) {
    logWarn("session-user.lookup-failed", {
      email,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    })
    return null
  }
}

export async function findUserForSession<T extends Prisma.UserSelect>(params: {
  sessionUser: Session["user"] | undefined
  select: T
}) {
  const sessionUser = params.sessionUser

  if (!sessionUser) {
    return null
  }

  const sessionUserId =
    typeof sessionUser.id === "string" && sessionUser.id.trim()
      ? sessionUser.id.trim()
      : ""
  const sessionUserEmail =
    typeof sessionUser.email === "string" && sessionUser.email.trim()
      ? normalizeEmail(sessionUser.email)
      : ""

  if (sessionUserEmail) {
    const userByEmail = await findUserByNormalizedEmail(sessionUserEmail, params.select)

    if (userByEmail) {
      return userByEmail
    }
  }

  if (!sessionUserId) {
    return null
  }

  try {
    return await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: params.select,
    })
  } catch (error) {
    logWarn("session-user.lookup-by-id-failed", {
      userId: sessionUserId,
      error: error instanceof Error ? error.message : "Erro desconhecido",
    })
    return null
  }
}

export async function getSessionUser<T extends Prisma.UserSelect>(select: T) {
  const { authOptions } = await import("@/lib/auth")
  const session = await getServerSession(authOptions)

  if (!session?.user) {
    return {
      session: null,
      user: null,
    }
  }

  const user = await findUserForSession({
    sessionUser: session.user,
    select,
  })

  return {
    session,
    user,
  }
}
