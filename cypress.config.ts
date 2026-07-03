import { defineConfig } from "cypress"
import { encode } from "next-auth/jwt"

const TEST_NEXTAUTH_SECRET = "codex-cypress-nextauth-secret-20260701"

export default defineConfig({
  allowCypressEnv: true,

  e2e: {
    baseUrl: "http://localhost:3000",
    pageLoadTimeout: 180000,
    responseTimeout: 180000,
    defaultCommandTimeout: 15000,
    setupNodeEvents(on, config) {
      on("task", {
        async buildNextAuthSession({
          email,
          name,
          role,
        }: {
          email?: string
          name?: string
          role?: "ADMIN" | "MANAGER"
        }) {
          const normalizedEmail = (email ?? "admin@greatgo.com").trim().toLowerCase()
          const token = await encode({
            secret: TEST_NEXTAUTH_SECRET,
            maxAge: 60 * 60 * 24 * 30,
            token: {
              sub: normalizedEmail,
              id: normalizedEmail,
              email: normalizedEmail,
              name: name ?? "Admin GreatGo",
              role: role ?? "ADMIN",
            },
          })

          return { token }
        },
      })

      return config
    },
  },
})
