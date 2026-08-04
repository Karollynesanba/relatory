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

function ReportAction({
  label,
  tone = "default",
}: {
  label: string
  tone?: "default" | "soft" | "danger"
}) {
  const toneClasses =
    tone === "danger"
      ? "border-[#f3c6c9] bg-white text-[#e14b52] hover:bg-[#fff6f6]"
      : tone === "soft"
        ? "border-[#d9e3ff] bg-[#eef4ff] text-[#4663d8] hover:bg-[#e5edff]"
        : "border-[#d6dceb] bg-white text-[#0f172a] hover:bg-[#f8fafc]"

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
    <main className="min-h-screen bg-[#f5f7fb] px-4 py-6 text-slate-900 sm:px-6 sm:py-8 lg:px-10 lg:py-10">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex flex-col gap-5 sm:gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Gerador de relatórios em PDF
            </p>
            <h1 className="mt-2 text-[34px] font-black leading-[1.02] tracking-[-0.05em] text-slate-950 sm:text-[44px]">
              Painel de relatórios
            </h1>
            <p className="mt-2 max-w-[760px] text-[15px] leading-7 text-slate-500 sm:text-[16px]">
              Crie, edite, duplique e exporte relatórios em PDF com prévia em tempo real e
              layout fiel ao modelo.
            </p>
          </div>

          <Link
            href="/dashboard/reports/new"
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#111c3a] px-5 text-sm font-semibold text-white shadow-[0_16px_40px_-18px_rgba(17,28,58,0.6)] transition hover:bg-[#0b142a]"
          >
            Novo relatório
          </Link>
        </div>

        <section className="mt-5 overflow-hidden rounded-[22px] border border-slate-200/90 bg-white shadow-[0_18px_50px_-30px_rgba(15,23,42,0.16)] sm:mt-6">
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-[#fbfcfe] px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:px-5 md:grid-cols-[1.2fr_1.5fr_0.75fr_0.85fr_1.15fr] md:gap-4 md:px-6">
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
                className="grid grid-cols-1 gap-4 px-4 py-5 md:grid-cols-[1.2fr_1.5fr_0.75fr_0.85fr_1.15fr] md:items-center md:gap-4 md:px-6 md:py-4"
              >
                <div className="min-w-0">
                  <p className="text-[18px] font-bold leading-tight tracking-[-0.04em] text-slate-950 sm:text-[19px]">
                    {report.client}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5a78d8] sm:text-sm">
                    Visão Geral · META Ads
                  </p>
                </div>

                <p className="text-[15px] font-medium text-slate-900 sm:text-[16px]">
                  {report.period}
                </p>
                <p className="text-[15px] font-medium text-slate-900 sm:text-[16px]">
                  {report.createdAt}
                </p>
                <p className="text-[15px] font-medium text-slate-900 sm:text-[16px]">
                  {report.updatedAt}
                </p>

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
