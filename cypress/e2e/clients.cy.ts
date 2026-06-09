const clients = [
  {
    id: "client-a",
    name: "Paula Manually Great",
    company: "Great Labs",
    email: "paula@example.com",
    phone: "(11) 99999-1111",
    whatsappGroupId: "120363407411420148@g.us",
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
    whatsappGroupId: null,
    status: "INACTIVE",
    createdAt: "2026-04-17T12:00:00.000Z",
    adAccountId: null,
    campaigns: [],
  },
]

const metaOptions = {
  profiles: [
    { id: "profile-1", name: "Paula" },
    { id: "profile-2", name: "Camila" },
  ],
  brands: [
    {
      id: "brand-1",
      name: "Great Labs",
      displayName: "Great Labs",
      businessName: "Great Labs",
      adAccountId: "act_1001",
      adAccountName: "GreatGo - Conta principal",
      accountStatus: 1,
    },
  ],
}

const evolutionGroups = {
  configured: true,
  connected: true,
  instance: "evo-main",
  detail: "2 grupo(s) encontrado(s).",
  groups: [
    {
      id: "120363407411420148@g.us",
      subject: "GreatGo | Operacao Central",
      size: 31,
      announce: false,
      instance: "evo-main",
    },
    {
      id: "120363407411420149@g.us",
      subject: "GreatGo | Comercial",
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

function filterClients(query: Record<string, string | undefined>) {
  const search = (query.search ?? "").toLowerCase()
  const status = query.status ?? "ALL"
  const metaStatus = query.metaStatus ?? "ALL"

  return clients.filter((client) => {
    const matchesSearch =
      !search ||
      client.name.toLowerCase().includes(search) ||
      (client.company ?? "").toLowerCase().includes(search)
    const matchesStatus = status === "ALL" || client.status === status
    const matchesMeta =
      metaStatus === "ALL" ||
      (metaStatus === "CONNECTED" ? Boolean(client.adAccountId) : !client.adAccountId)

    return matchesSearch && matchesStatus && matchesMeta
  })
}

function mockClients() {
  cy.intercept("GET", "/api/clients*", (req) => {
    req.reply(filterClients(req.query as Record<string, string | undefined>))
  }).as("loadClients")
  cy.intercept("GET", "**/api/clients/meta-options**", metaOptions).as("metaOptions")
  cy.intercept("GET", "**/api/settings/evolution**", evolutionGroups).as("loadEvolution")
}

describe("Clientes", () => {
  beforeEach(() => {
    cy.viewport(1440, 1080)
    mockClients()
    cy.login()
    cy.visit("/dashboard/clients")
    cy.wait("@loadClients")
  })

  it("deve carregar a listagem com os principais elementos", () => {
    cy.contains("Clientes").should("be.visible")
    cy.contains("Novo Cliente").should("be.visible")
    cy.contains("Paula Manually Great").should("be.visible")
    cy.contains("Camila Lucarelli Great").should("be.visible")
    cy.contains("Cliente").should("be.visible")
    cy.contains("Empresa").should("be.visible")
    cy.contains("Status META").should("be.visible")
  })

  it("deve filtrar por busca e status", () => {
    cy.get('input[placeholder="Buscar por nome ou empresa..."]').clear().type("Camila")
    cy.wait("@loadClients")
    cy.contains("Camila Lucarelli Great").should("be.visible")
    cy.contains("Paula Manually Great").should("not.exist")

    cy.get('input[placeholder="Buscar por nome ou empresa..."]').clear()
    cy.wait("@loadClients")

    cy.contains("button", /^Status: Todos$/).click()
    cy.contains('[role="option"]', "Ativo").click()
    cy.wait("@loadClients")
    cy.contains("Paula Manually Great").should("be.visible")
    cy.contains("Camila Lucarelli Great").should("not.exist")
    cy.contains("button", "Ativo").should("be.visible")

    cy.contains("button", /^Integração META: Todos$/).click()
    cy.contains('[role="option"]', "Conectado").click()
    cy.wait("@loadClients")
    cy.contains("Paula Manually Great").should("be.visible")
    cy.contains("Camila Lucarelli Great").should("not.exist")
  })

  it("deve abrir a pagina de novo cliente com os dados da META", () => {
    cy.visit("/dashboard/clients/new")
    cy.wait("@metaOptions")
    cy.wait("@loadEvolution")

    cy.url().should("include", "/dashboard/clients/new")
    cy.contains("Novo cliente").should("be.visible")
    cy.contains("Informações do cliente").should("be.visible")
    cy.contains("Opções da integração com a META").should("be.visible")
    cy.get('input[name="profileName"]').should("be.visible")
    cy.get('select[name="brandId"]').should("be.visible")

    cy.get('[data-cy="client-whatsapp-group-select"]').click()
    cy.get('input[placeholder="Pesquisar grupo pelo nome..."]')
      .should("be.focused")
      .type("COMER")
    cy.contains('[role="option"]', "GreatGo | Comercial").should("be.visible")
    cy.contains('[role="option"]', "GreatGo | Operacao Central").should("not.exist")
    cy.contains('[role="option"]', "GreatGo | Comercial").click()
    cy.get('[data-cy="client-whatsapp-group-select"]').should(
      "contain",
      "GreatGo | Comercial"
    )
  })
})
