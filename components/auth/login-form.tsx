"use client"

import Image from "next/image"
import { getSession, signIn } from "next-auth/react"
import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Eye, EyeOff, Loader2, Lock, Mail } from "lucide-react"
import { ThemeToggle } from "@/components/theme/theme-toggle"
import { withTimeout } from "@/lib/async"
import { loginSchema } from "@/lib/validations/auth.schema"
import { z } from "zod"

type LoginFormData = z.infer<typeof loginSchema>

const DEFAULT_REDIRECT_PATH = "/dashboard"

function normalizeCallbackUrl(rawCallbackUrl: string) {
  if (!rawCallbackUrl) {
    return DEFAULT_REDIRECT_PATH
  }

  if (rawCallbackUrl.startsWith("/")) {
    return rawCallbackUrl
  }

  try {
    const parsed = new URL(rawCallbackUrl)

    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`
    }
  } catch {
    // Fallback abaixo.
  }

  return DEFAULT_REDIRECT_PATH
}

function getLoginErrorMessage(error: string | undefined) {
  if (!error) {
    return "Não foi possível concluir o login."
  }

  if (error === "CredentialsSignin") {
    return "E-mail ou senha inválidos."
  }

  if (error === "AccessDenied") {
    return "Seu acesso foi recusado. Verifique suas permissões."
  }

  return "Não foi possível entrar agora. Tente novamente em instantes."
}

type LoginFormProps = {
  initialCallbackUrl: string
}

export default function LoginForm({ initialCallbackUrl }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const callbackUrl = normalizeCallbackUrl(initialCallbackUrl)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  async function onSubmit(data: LoginFormData) {
    let shouldResetLoading = true

    setIsLoading(true)
    setError("")

    try {
      const result = await withTimeout(
        signIn("credentials", {
          email: data.email,
          password: data.password,
          redirect: false,
          callbackUrl,
        }),
        15_000,
        "A autenticação demorou mais do que o esperado. Tente novamente."
      )

      if (!result) {
        throw new Error("Não houve resposta da autenticação.")
      }

      if (!result.ok || result.status !== 200) {
        if (result.error === "AccessDenied") {
          setError("Seu acesso foi recusado. Verifique suas permissões.")
        } else {
          setError("E-mail ou senha inválidos.")
        }
        return
      }

      if (result.error) {
        setError(getLoginErrorMessage(result.error))
        return
      }

      const session = await withTimeout(
        getSession(),
        5_000,
        "O login foi aceito, mas a sessão não ficou disponível a tempo."
      )

      if (!session?.user?.email) {
        throw new Error(
          "A autenticação foi concluída, mas a sessão não ficou disponível."
        )
      }

      const destination = normalizeCallbackUrl(result.url ?? callbackUrl)
      shouldResetLoading = false
      window.location.assign(destination)
    } catch (submitError) {
      const message =
        submitError instanceof Error
          ? submitError.message
          : "Ocorreu um erro inesperado ao entrar."

      setError(message)
    } finally {
      if (shouldResetLoading) {
        setIsLoading(false)
      }
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--color-app-background)] px-4 py-4 text-[color:var(--color-app-text)] sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(223,37,49,0.18),transparent_28%),radial-gradient(circle_at_bottom_right,rgba(255,255,255,0.05),transparent_34%)]" />

      <div className="absolute right-4 top-4 z-20 sm:right-6 sm:top-6">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl items-center justify-center">
        <div className="glass-card w-full max-w-[760px] rounded-[36px] px-6 py-8 sm:px-10 sm:py-10">
          <div className="mx-auto flex max-w-[600px] flex-col items-center text-center">
            <div className="flex h-24 w-24 items-center justify-center">
              <Image
                src="/logo.png"
                alt="GreatGo"
                width={96}
                height={96}
                className="h-24 w-24 object-contain brightness-0 invert"
                priority
              />
            </div>

            <p className="mt-2 text-sm font-semibold uppercase tracking-[0.28em] text-[color:var(--color-app-text-faint)]">
              GreatGo
            </p>
            <h1 className="mt-2 text-[42px] font-semibold tracking-[-0.06em] text-[color:var(--color-app-text)] sm:text-[48px]">
              Um painel mais claro para acompanhar clientes, mídia e relatórios.
            </h1>
            <h2 className="mt-3 text-[18px] font-medium text-[color:var(--color-app-text-soft)]">
              Entrar na plataforma
            </h2>
            <p className="mt-2 text-[18px] font-medium text-[color:var(--color-app-text-soft)]">
              Use sua conta cadastrada para acessar o painel operacional, clientes e integrações.
            </p>

            <div className="mt-5 rounded-full border border-[color:var(--color-app-border)] bg-[var(--color-app-surface-muted)] px-5 py-2 text-[18px] font-medium text-[#df2531] backdrop-blur-xl">
              Acesso para usuários cadastrados
            </div>
          </div>

          {error ? (
            <div className="mx-auto mt-8 max-w-[600px] rounded-[24px] border border-[#df2531]/15 bg-[rgba(223,37,49,0.08)] px-4 py-3 text-sm text-[#df2531]">
              {error}
            </div>
          ) : null}

          <form onSubmit={handleSubmit(onSubmit)} className="mx-auto mt-10 max-w-[600px] space-y-6">
            <div>
              <label className="mb-2 block text-[18px] font-medium text-[color:var(--color-app-text-muted)]">
                E-mail
              </label>
              <div
                className={
                  `glass-input flex items-center rounded-[24px] px-4 py-4 transition ` +
                  `${errors.email ? "border-[#df2531] ring-1 ring-[#df2531]" : "border-[color:var(--color-app-border)]"}`
                }
              >
                <Mail className="mr-4 h-5 w-5 shrink-0 text-[color:var(--color-app-text-faint)]" />
                <input
                  {...register("email")}
                  type="email"
                  placeholder="seuemail@empresa.com"
                  className="w-full bg-transparent text-[18px] text-[color:var(--color-app-text-muted)] placeholder:text-[color:var(--color-app-text-faint)] focus:outline-none"
                />
              </div>
              {errors.email ? <p className="mt-2 text-xs text-red-500">{errors.email.message}</p> : null}
            </div>

            <div>
              <label className="mb-2 block text-[18px] font-medium text-[color:var(--color-app-text-muted)]">
                Senha
              </label>
              <div className="glass-input flex items-center rounded-[24px] px-4 py-4 transition focus-within:ring-1 focus-within:ring-[#df2531]">
                <Lock className="mr-4 h-5 w-5 shrink-0 text-[color:var(--color-app-text-faint)]" />
                <input
                  {...register("password")}
                  type={showPassword ? "text" : "password"}
                  placeholder="*******"
                  className="w-full bg-transparent text-[18px] text-[color:var(--color-app-text-muted)] placeholder:text-[color:var(--color-app-text-faint)] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  className="ml-3 text-[color:var(--color-app-text-faint)] transition hover:text-[color:var(--color-app-text-muted)]"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password ? (
                <p className="mt-2 text-xs text-red-500">{errors.password.message}</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#df2531] px-5 py-4 text-[26px] font-semibold text-white shadow-[0_18px_36px_-24px_rgba(223,37,49,0.7)] transition hover:bg-[#c81f2a] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Entrando...
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </div>
      </div>

      <div className="absolute bottom-4 left-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-[rgba(255,255,255,0.05)] text-lg font-medium text-white shadow-[0_8px_20px_-10px_rgba(0,0,0,0.6)]">
        N
      </div>
    </main>
  )
}
