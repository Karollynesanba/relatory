const clients = [
  {
    id: "client-a",
    name: "Paula Manually Great",
    company: "Great Labs",
    email: "paula@example.com",
    phone: "(11) 99999-1111",
    whatsappGroupId: "evo-main::group-paula",
    status: "ACTIVE",
    createdAt: "2026-04-18T12:00:00.000Z",
    adAccountId: "act_1001",
    campaigns: [{ id: "camp-1" }],
  },
  {
    id: "client-b",
    name: "Camila Lucarelli Great",
    company: "Lucarelli Studio",
    email: "camila@example.com",
    phone: "(11) 98888-2222",
    whatsappGroupId: "evo-main::group-camila",
    status: "ACTIVE",
    createdAt: "2026-04-17T12:00:00.000Z",
    adAccountId: "act_1002",
    campaigns: [{ id: "camp-2" }],
  },
]

const readyReport = {
  id: "report-123",
  status: "SENT",
  generatedAt: "2026-04-20T15:10:00.000Z",
  referenceWeek: "2026-04-13T00:00:00.000Z",
  errorMessage: null,
  payload: {
    filters: {
      since: "2026-04-13",
      until: "2026-04-20",
      objective: "ALL",
      generatedAt: "2026-04-20T15:10:00.000Z",
    },
    client: {
      id: "client-a",
      name: "Paula Manually Great",
      company: "Great Labs",
      email: "paula@example.com",
      adAccountId: "act_1001",
    },
    campaigns: [
      {
        id: "camp-1",
        name: "Campanha Prospecting",
        status: "ACTIVE",
        objective: "LINK_CLICKS",
        insights: {
          data: [
            {
              date_start: "2026-04-13",
              spend: "120",
              impressions: "12000",
              reach: "4300",
              clicks: "350",
              ctr: "2.91",
              cpc: "0.34",
              cpm: "10.00",
              actions: [{ action_type: "link_click", value: "350" }],
            },
          ],
        },
      },
      {
        id: "camp-2",
        name: "Campanha Remarketing",
        status: "PAUSED",
        objective: "CONVERSIONS",
        insights: {
          data: [
            {
              date_start: "2026-04-14",
              spend: "80",
              impressions: "8500",
              reach: "2900",
              clicks: "210",
              ctr: "2.47",
              cpc: "0.38",
              cpm: "9.41",
              actions: [{ action_type: "lead", value: "26" }],
              action_values: [{ action_type: "lead", value: "8450" }],
            },
          ],
        },
      },
    ],
    accountInsights: {
      spend: "1200",
      impressions: "100000",
      reach: "42000",
      clicks: "2300",
      ctr: "2.3",
      cpc: "0.52",
      cpm: "12",
      actions: [{ action_type: "lead", value: "220" }],
      action_values: [{ action_type: "lead", value: "8450" }],
    },
    dailyInsights: [
      {
        date_start: "2026-04-13",
        spend: "100",
        impressions: "8000",
        reach: "4100",
        clicks: "210",
        ctr: "2.62",
        cpc: "0.48",
        cpm: "12.5",
      },
      {
        date_start: "2026-04-14",
        spend: "110",
        impressions: "8600",
        reach: "4300",
        clicks: "220",
        ctr: "2.55",
        cpc: "0.50",
        cpm: "12.8",
      },
    ],
    topAds: [
      {
        id: "ad-1",
        name: "Anúncio principal",
        impressions: "5400",
        reach: "2200",
        clicks: "92",
        spend: "52",
        actions: [{ action_type: "lead", value: "23" }],
      },
    ],
    genderBreakdown: [
      { dimension: "female", spend: "650", impressions: "53000", reach: "22000", clicks: "1250" },
      { dimension: "male", spend: "550", impressions: "47000", reach: "20000", clicks: "1050" },
    ],
  },
}

const pendingReport = {
  id: "report-123",
  status: "PENDING",
  generatedAt: "2026-04-20T15:10:00.000Z",
  referenceWeek: "2026-04-13T00:00:00.000Z",
  errorMessage: null,
  payload: null,
}

const clientSchedule = {
  id: "schedule-123",
  clientId: "client-a",
  frequency: "WEEKLY",
  weekday: 1,
  scheduledDate: null,
  hour: 9,
  minute: 30,
  timeZone: "America/Fortaleza",
  filtersSince: "2026-04-13",
  filtersUntil: "2026-04-20",
  objective: "ALL",
  sendMode: "PDF_AND_MESSAGE",
  message: "Relatório automático",
  groupId: "evo-main::group-paula",
  active: true,
  nextRunAt: "2026-04-27T12:30:00.000Z",
  lastRunAt: "2026-04-20T12:30:00.000Z",
  lastError: null,
  createdAt: "2026-04-18T12:00:00.000Z",
  updatedAt: "2026-04-20T12:30:00.000Z",
}

const schedules = {
  schedules: [
    {
      clientId: "client-a",
      clientName: "Paula Manually Great",
      clientCompany: "Great Labs",
      clientStatus: "ACTIVE",
      clientWhatsappGroupId: "evo-main::group-paula",
      schedule: clientSchedule,
      status: "SCHEDULED",
      statusLabel: "Agendado",
  statusDetail: "Próximo envio em 27/04/2026, 09:30.",
      lastReportId: "report-123",
      lastReportGeneratedAt: "2026-04-20T15:10:00.000Z",
      lastSendAttemptAt: "2026-04-20T12:30:00.000Z",
      lastSendError: null,
    },
  ],
}

let reportSchedulesResponse = schedules
let reportExistingScheduleResponse = clientSchedule

const evolutionGroups = {
  configured: true,
  connected: true,
  instance: "evo-main",
  detail: "2 grupo(s) encontrado(s) em 1 instância(s).",
  groups: [
    {
      id: "group-paula",
      subject: "GreatGo | Operacao Central",
      size: 31,
      announce: false,
      instance: "evo-main",
    },
    {
      id: "group-camila",
      subject: "GreatGo | Operacao Comercial",
      size: 18,
      announce: true,
      instance: "evo-backup",
    },
  ],
  instances: [
    { name: "evo-main", status: "open", isPrimary: true },
    { name: "evo-backup", status: "open", isPrimary: false },
  ],
}

function mockReportGeneration() {
  let pollCount = 0

  cy.intercept("GET", "/api/clients", clients).as("loadClients")
  cy.intercept("POST", "/api/reports", (req) => {
    expect(req.body.clientId).to.eq("client-a")
    req.reply({
      statusCode: 202,
      body: {
        reportId: "report-123",
        status: "PENDING",
        generatedAt: "2026-04-20T15:10:00.000Z",
        referenceWeek: "2026-04-13T00:00:00.000Z",
        queued: true,
      },
    })
  }).as("queueReport")
  cy.intercept("GET", "/api/reports/report-123", (req) => {
    pollCount += 1
    req.reply({
      statusCode: 200,
      body: pollCount === 1 ? pendingReport : readyReport,
    })
  }).as("pollReport")
}

function mockReportScheduleModal() {
  cy.intercept("GET", "/api/clients/client-a/report-schedule", {
    schedule: null,
  }).as("loadSchedule")
  cy.intercept("GET", "/api/settings/evolution", evolutionGroups).as("loadEvolution")
  cy.intercept("PUT", "/api/clients/client-a/report-schedule", (req) => {
    expect(req.body.frequency).to.eq("ONCE")
    expect(req.body.groupId).to.eq("evo-backup::group-camila")
    req.reply({
      statusCode: 200,
      body: {
        ok: true,
        schedule: {
          ...clientSchedule,
          frequency: "ONCE",
          weekday: null,
          scheduledDate: "2026-05-02",
          hour: 10,
          minute: 45,
          sendMode: "MESSAGE_ONLY",
          nextRunAt: "2026-05-02T13:45:00.000Z",
        },
      },
    })
  }).as("saveSchedule")
}

function mockReportSchedulesPanel() {
  cy.intercept("GET", "/api/clients", clients).as("loadClients")
  reportSchedulesResponse = schedules
  reportExistingScheduleResponse = clientSchedule
  cy.intercept("GET", "/api/reports/schedules", () => {
    return {
      statusCode: 200,
      body: reportSchedulesResponse,
    }
  }).as("loadSchedules")
  cy.intercept("GET", "/api/clients/client-a/report-schedule", () => {
    return {
      statusCode: 200,
      body: {
        schedule: reportExistingScheduleResponse,
      },
    }
  }).as("loadExistingSchedule")
  cy.intercept("GET", "/api/settings/evolution", evolutionGroups).as("loadEvolution")
  cy.intercept("DELETE", "/api/clients/client-a/report-schedule", () => {
    reportSchedulesResponse = { schedules: [] }
    reportExistingScheduleResponse = null

    return {
      statusCode: 200,
      body: {
        ok: true,
        schedule: null,
      },
    }
  }).as("deleteSchedule")
}

describe("Reports", () => {
  beforeEach(() => {
    cy.viewport(1440, 1080)
    cy.login()
  })

  it("deve gerar o relatório e manter os controles principais visíveis", () => {
    mockReportGeneration()

    cy.visit("/dashboard/reports")
    cy.wait("@loadClients")

    cy.contains("Relatórios").should("be.visible")
    cy.get('[data-cy="reports-reset-workspace"]').should("be.visible")

    cy.get('[data-cy="report-client-client-a"]')
      .scrollIntoView()
      .click({ force: true })

    cy.wait("@queueReport")
    cy.wait("@pollReport")
    cy.wait("@pollReport")

    cy.contains("Relatório").should("be.visible")
    cy.contains("Paula Manually Great").should("be.visible")
    cy.contains("button", "1 semana", { timeout: 60000 }).should("be.visible")
    cy.contains("button", "Tráfego", { timeout: 60000 }).should("be.visible")
    cy.contains("button", "Conversão", { timeout: 60000 }).should("be.visible")
    cy.contains("button", "Mensagens", { timeout: 60000 }).should("be.visible")
    cy.get('[data-cy="reports-save-pdf"]').should("be.visible")
    cy.get('[data-cy="reports-send-whatsapp"]').should("be.visible")
    cy.get('[data-cy="reports-open-schedule"]').should("be.visible")
  })

  it("deve abrir o agendamento do relatório e salvar uma programação", () => {
    mockReportGeneration()
    mockReportScheduleModal()

    cy.visit("/dashboard/reports")
    cy.wait("@loadClients")

    cy.get('[data-cy="report-client-client-a"]')
      .scrollIntoView()
      .click({ force: true })
    cy.wait("@queueReport")
    cy.wait("@pollReport")
    cy.wait("@pollReport")

    cy.get('[data-cy="reports-open-schedule"]', { timeout: 60000 })
      .scrollIntoView()
      .click({ force: true })

    cy.wait("@loadSchedule")
    cy.wait("@loadEvolution")

    cy.contains("h2", "Agendar envio").should("be.visible")
    cy.get('[data-cy="reports-schedule-once"]').click({ force: true })
    cy.get('[data-cy="reports-schedule-date"]')
      .should("be.visible")
      .clear()
      .type("2026-05-02")
    cy.get('[data-cy="reports-schedule-time"]')
      .should("be.visible")
      .clear()
      .type("10:45")
    cy.get('[data-cy="reports-schedule-send-mode"]')
      .should("be.visible")
      .select("Somente mensagem")
    cy.get('[data-cy="reports-schedule-group-select"]').click()
    cy.get('input[placeholder="Pesquisar grupo pelo nome..."]')
      .should("be.focused")
      .type("comer")
    cy.contains('[role="option"]', "GreatGo | Operacao Comercial").click()
    cy.get('[data-cy="reports-schedule-confirm"]').should("be.visible").click()

    cy.wait("@saveSchedule")
    cy.contains("Agendamento salvo. Próximo envio em").should("be.visible")
  })

  it("deve exibir agendamentos, editar e excluir um item", () => {
    mockReportSchedulesPanel()

    cy.visit("/dashboard/reports")
    cy.wait("@loadClients")

    cy.get('[data-cy="reports-tab-schedules"]')
      .scrollIntoView()
      .click({ force: true })

    cy.contains("Atualizar status", { timeout: 60000 }).should("be.visible")
    cy.contains("Paula Manually Great").should("be.visible")
    cy.get('[data-cy="report-schedule-open-client"]').should("be.visible")
    cy.get('[data-cy="report-schedule-edit"]').should("be.visible")
    cy.get('[data-cy="report-schedule-delete"]').should("be.visible")

    cy.get('[data-cy="report-schedule-edit"]').click({ force: true })
    cy.wait("@loadExistingSchedule")
    cy.wait("@loadEvolution")
    cy.contains("h2", "Agendar envio").should("be.visible")
    cy.contains("Agendamento ativo").should("be.visible")
    cy.contains("button", "Cancelar").click()

    cy.on("window:confirm", () => true)
    cy.get('[data-cy="report-schedule-delete"]').click({ force: true })
    cy.wait("@deleteSchedule")
    cy.wait("@loadSchedules")
    cy.wait(300)
    cy.contains("Agendamento de Paula Manually Great excluido com sucesso.").should(
      "be.visible"
    )
    cy.contains("Nenhum agendamento encontrado").should("be.visible")
  })
})
