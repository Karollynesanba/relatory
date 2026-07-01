import "@/lib/prisma-runtime-env"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function resolveDatabaseUrl() {
  const rawUrl = process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim()

  if (!rawUrl) {
    return undefined
  }

  try {
    const url = new URL(rawUrl)

    if (
      (url.protocol === "postgresql:" || url.protocol === "postgres:") &&
      !url.searchParams.has("sslmode") &&
      !url.searchParams.has("sslaccept")
    ) {
      url.searchParams.set("sslmode", "require")
      url.searchParams.set("sslaccept", "accept_invalid_certs")
    }

    return url.toString()
  } catch {
    return rawUrl
  }
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query"] : ["warn", "error"],
    datasources: resolveDatabaseUrl()
      ? {
          db: {
            url: resolveDatabaseUrl(),
          },
        }
      : undefined,
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
