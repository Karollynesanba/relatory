import Link from "next/link"

type ReportRow = {
  client: string
  period: string
  createdAt: string
  updatedAt: string
}

const REPORTS: ReportRow[] = [
  {
    client: "teste",
    period: "09/07/2026 - 19/07/2026",
    createdAt: "20/07/2026",
    updatedAt: "20/07/2026",
  },
  {
    client: "Patricia Great",
    period: "13/07/2026 - 19/07/2026",
    createdAt: "20/07/2026",
    updatedAt: "20/07/2026",
  },
]

function ReportAction({ label, tone = "default" }: { label: string; tone?: "default" | "soft" | "danger" }) {
  const toneClasses =
    tone === "danger"
      ? "border-[#f4d3d0] bg-white text-[#ca3a43] hover:bg-[#fff5f4]"
      : tone === "soft"
        ? "border-[#dbe4ff] bg-[#ecf2ff] text-[#3e63dd] hover:bg-[#e3ebff]"
        : "border-[#d5dde8] bg-white text-[#0f172a] hover:bg-[#f8fafc]"

  return (
    <button
      type="button"
      className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition ${toneClasses}`}
    >
      {label}
    </button>
  )
}

export default function ReportsLandingPage() {
  return (
    <main className="min-h-screen bg-[#f5f7fb] px-6 py-10 text-slate-900 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              Gerador de relatório
            </p>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em] text-slate-950 sm:text-5xl">
              Painel de relatórios
            </h1>
            <p className="mt-3 text-[18px] leading-8 text-slate-500">
              Crie, edite, duplique e exporte relatórios em PDF com prévia em tempo real e
              layout fiel ao modelo.
            </p>
          </div>

          <Link
            href="/dashboard/reports?fresh=1"
            className="inline-flex items-center justify-center rounded-full bg-[#111c3a] px-6 py-3.5 text-base font-semibold text-white shadow-[0_16px_40px_-18px_rgba(17,28,58,0.65)] transition hover:bg-[#0c1630]"
          >
            Novo relatório
          </Link>
        </div>

        <section className="mt-8 overflow-hidden rounded-[30px] border border-slate-200/90 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.16)]">
          <div className="grid grid-cols-[1.4fr_1.55fr_0.8fr_0.8fr_1fr] gap-4 border-b border-slate-100 bg-[#f8fafd] px-6 py-5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            <span>Cliente</span>
            <span>Período</span>
            <span>Criado em</span>
            <span>Última edição</span>
            <span>Ações</span>
          </div>

          <div className="divide-y divide-slate-100">
            {REPORTS.map((report) => (
              <div
                key={`${report.client}-${report.period}`}
                className="grid grid-cols-1 gap-4 px-6 py-6 lg:grid-cols-[1.4fr_1.55fr_0.8fr_0.8fr_1fr] lg:items-center"
              >
                <div>
                  <p className="text-[22px] font-bold leading-none tracking-[-0.04em] text-slate-950">
                    {report.client}
                  </p>
                  <p className="mt-1 text-sm text-[#5c79d6]">Visão Geral · META Ads</p>
                </div>

                <p className="text-[17px] font-medium text-slate-900">{report.period}</p>
                <p className="text-[17px] font-medium text-slate-900">{report.createdAt}</p>
                <p className="text-[17px] font-medium text-slate-900">{report.updatedAt}</p>

                <div className="flex flex-wrap gap-2">
                  <ReportAction label="Editar" />
                  <ReportAction label="Duplicar" tone="soft" />
                  <ReportAction label="PDF" tone="soft" />
                  <ReportAction label="Excluir" tone="danger" />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
