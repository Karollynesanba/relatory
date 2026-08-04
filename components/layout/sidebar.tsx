"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { FileText, History, LayoutGrid, LogOut, Settings, Users } from "lucide-react"
import { cn } from "@/lib/utils"

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutGrid },
  { label: "Clientes", href: "/dashboard/clients", icon: Users },
  { label: "Relatório", href: "/dashboard/reports/new", icon: FileText },
  { label: "Histórico", href: "/dashboard/history", icon: History },
  { label: "Integrações", href: "/dashboard/settings", icon: Settings },
]

type SidebarProps = {
  width: number
  onResizeStart: () => void
}

export function Sidebar({ width, onResizeStart }: SidebarProps) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const isIconOnly = width < 140

  const roleLabel =
    session?.user?.role === "ADMIN"
      ? "Administrador"
      : session?.user?.role === "MANAGER"
        ? "Gestor"
        : "Não autenticado"

  const initials =
    session?.user?.name
      ?.split(" ")
      .map((name) => name[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() ?? "GG"

  return (
    <aside
      className="sidebar-shell fixed left-0 top-0 z-30 flex h-screen flex-col overflow-hidden rounded-[32px] border"
      style={{ width: `${width}px` }}
    >
      <div className={cn("border-b border-white/10 py-8", isIconOnly ? "px-4" : "px-6")}>
        <Link
          href="/dashboard"
          aria-label="Ir para o dashboard"
          className={cn("flex min-w-0 items-center", isIconOnly ? "justify-center" : "gap-3")}
        >
          <Image
            src="/logo.png"
            alt="Logo GreatGo"
            width={48}
            height={48}
            className="h-12 w-12 shrink-0 object-contain brightness-0 invert"
            priority
          />
          {!isIconOnly ? (
            <p className="text-[28px] font-semibold leading-none tracking-[-0.04em] text-white">
              GreatGo
            </p>
          ) : null}
        </Link>
      </div>

      <nav className={cn("flex-1 py-7", isIconOnly ? "px-2" : "px-6")}>
        {!isIconOnly ? (
          <p className="mb-5 px-1 text-[12px] font-semibold uppercase tracking-[0.34em] text-white/35">
            Menu
          </p>
        ) : null}

        <ul className="space-y-2">
          {navItems.map(({ label, href, icon: Icon }) => {
            const isActive =
              href === "/dashboard" ? pathname === "/dashboard" : pathname.startsWith(href)

            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-label={label}
                  title={isIconOnly ? label : undefined}
                  className={cn(
                    "sidebar-item flex items-center rounded-[24px] text-[15px] font-semibold transition-all duration-150",
                    isIconOnly ? "justify-center px-0 py-3.5" : "gap-4 px-5 py-4",
                    isActive
                      ? "sidebar-item-active text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-white/78 hover:bg-white/8 hover:text-white"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-white" : "text-white/70"
                    )}
                  />
                  {!isIconOnly ? label : null}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>

      <div className="px-4 py-4">
        <div className="sidebar-foot rounded-[24px] border border-white/10 px-4 py-4 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="sidebar-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/15 shadow-[0_10px_20px_-16px_rgba(0,0,0,0.7)]">
                <span className="text-sm font-bold text-white">{initials}</span>
              </div>

              {!isIconOnly ? (
                <div className="min-w-0">
                  <span className="block max-w-[120px] truncate text-[15px] font-semibold leading-tight text-white">
                    {session?.user?.name ?? "Não autenticado"}
                  </span>
                  <span className="block text-[13px] leading-tight text-white/55">
                    {roleLabel}
                  </span>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              title="Sair da conta"
              aria-label="Sair da conta"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/90 text-[#374151] transition hover:bg-white"
            >
              <LogOut className="h-5 w-5 shrink-0" />
            </button>
          </div>
        </div>
      </div>

      <div
        aria-hidden="true"
        data-testid="sidebar-resize-handle"
        className="absolute right-[-8px] top-0 h-full w-4 cursor-col-resize bg-transparent"
        onPointerDown={onResizeStart}
      >
        <div className="absolute inset-y-0 right-1/2 w-px translate-x-1/2 bg-white/12" />
      </div>
    </aside>
  )
}
