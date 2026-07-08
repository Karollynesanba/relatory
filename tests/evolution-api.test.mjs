import { assert, test } from "./test-helpers.mjs"
import {
  loadEvolutionCatalog,
  resolveEvolutionInstanceForDestination,
  sendWhatsAppText,
} from "@/lib/evolution-api"

const originalFetch = globalThis.fetch
const originalEnv = {
  EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
  EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
  EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
}

function setEvolutionEnv() {
  process.env.EVOLUTION_API_URL = "https://evolution.example.com"
  process.env.EVOLUTION_API_KEY = "test-api-key"
  process.env.EVOLUTION_INSTANCE = "GreatGo"
}

function restoreEnvironment() {
  globalThis.fetch = originalFetch

  for (const [key, value] of Object.entries(originalEnv)) {
    if (value == null) {
      delete process.env[key]
      continue
    }

    process.env[key] = value
  }
}

test("loadEvolutionCatalog returns groups from every open instance", async () => {
  setEvolutionEnv()
  const novaInstance = "NovaInstancia"

  globalThis.fetch = async (input) => {
    const url = String(input)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: novaInstance, status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "120@g.us", subject: "Grupo Antigo", size: 10, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes(`/group/fetchAllGroups/${encodeURIComponent(novaInstance)}`)) {
      return new Response(
        JSON.stringify([
          { id: "999@g.us", subject: "Grupo Novo", size: 22, announce: true },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog()

  assert.equal(catalog.connected, true)
  assert.equal(catalog.instances.length, 2)
  assert.deepEqual(
    catalog.groups.map((group) => ({
      id: group.id,
      instance: group.instance,
    })),
    [
      { id: "120@g.us", instance: "GreatGo" },
      { id: "999@g.us", instance: "NovaInstancia" },
    ]
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog stays connected when a requested instance returns groups", async () => {
  setEvolutionEnv()

  globalThis.fetch = async (input) => {
    const url = String(input)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "closed" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "120@g.us", subject: "Grupo Isaque", size: 10, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({ groupInstances: ["GreatGo"] })

  assert.equal(catalog.connected, true)
  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].instance, "GreatGo")

  restoreEnvironment()
})

test("loadEvolutionCatalog resolves reordered instance names to the canonical Evolution instance", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "Isaque - GreatGo", status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/Isaque%20-%20GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "120@g.us", subject: "Grupo Isaque", size: 10, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({
    groupInstances: ["GreatGo - isaque"],
  })

  assert.equal(catalog.connected, true)
  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].instance, "Isaque - GreatGo")
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/Isaque%20-%20GreatGo")),
    true
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog falls back to connected instances when the saved instance has no groups", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "closed" },
          { name: "Fernanda - GreatGo", status: "open" },
          { name: "Isaque - GreatGo", status: "closed" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes("/group/fetchAllGroups/Fernanda%20-%20GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "120@g.us", subject: "Grupo Fernanda", size: 18, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/Isaque%20-%20GreatGo")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({ groupInstances: ["GreatGo"] })

  assert.equal(catalog.connected, true)
  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].instance, "Fernanda - GreatGo")
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/GreatGo")),
    true
  )
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/Fernanda%20-%20GreatGo")),
    true
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog does not widen the search when an explicit instance is requested", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: "Carlos", status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "120@g.us", subject: "Grupo Brayton", size: 10, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/Carlos")) {
      throw new Error(`A busca nao deveria widen para Carlos: ${url}`)
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({ groupInstances: ["GreatGo"] })

  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].instance, "GreatGo")
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/Carlos")),
    false
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog also inspects disconnected instances when there is no participant filter", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: "ART DENTAL", status: "closed" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes("/group/fetchAllGroups/ART%20DENTAL")) {
      return new Response(
        JSON.stringify([
          {
            id: "999@g.us",
            subject: "ART DENTAL",
            size: 14,
            announce: false,
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog()

  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].subject, "ART DENTAL")
  assert.equal(catalog.groups[0].instance, "ART DENTAL")
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/ART%20DENTAL")),
    true
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog filters groups by participant phone when requested", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: "Isaque", status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      assert.equal(url.includes("getParticipants=true"), true)
      return new Response(
        JSON.stringify([
          {
            id: "999@g.us",
            subject: "Grupo Brayton",
            size: 12,
            announce: false,
            participants: [
              { id: "559988776655@s.whatsapp.net" },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/Isaque")) {
      assert.equal(url.includes("getParticipants=true"), true)
      return new Response(
        JSON.stringify([
          {
            id: "120@g.us",
            subject: "Grupo Correspondente",
            size: 10,
            announce: false,
            participants: [
              { id: "5577933008319@s.whatsapp.net" },
            ],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({
    participantPhone: "7793300-8319",
  })

  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].id, "120@g.us")
  assert.equal(catalog.groups[0].instance, "Isaque")
  assert.equal(
    requestedUrls.some((url) => url.includes("getParticipants=true")),
    true
  )

  restoreEnvironment()
})

test("loadEvolutionCatalog prefers the selected instance before widening participant searches", async () => {
  setEvolutionEnv()
  const requestedUrls = []

  globalThis.fetch = async (input) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "Brayton", status: "open" },
          { name: "GreatGo", status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/Brayton")) {
      assert.equal(url.includes("getParticipants=true"), true)
      return new Response(
        JSON.stringify([
          {
            id: "120@g.us",
            subject: "Grupo Brayton",
            size: 12,
            announce: false,
            participants: [{ id: "5577933008319@s.whatsapp.net" }],
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      throw new Error(`A busca nao deveria widen para GreatGo: ${url}`)
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const catalog = await loadEvolutionCatalog({
    groupInstances: ["Brayton"],
    participantPhone: "7793300-8319",
  })

  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].instance, "Brayton")
  assert.equal(
    requestedUrls.some((url) => url.includes("/group/fetchAllGroups/GreatGo")),
    false
  )

  restoreEnvironment()
})

test("sendWhatsAppText resolves the instance from the group id", async () => {
  setEvolutionEnv()
  const requestedUrls = []
  const novaInstance = "NovaInstancia"

  globalThis.fetch = async (input, init) => {
    const url = String(input)
    requestedUrls.push(url)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: novaInstance, status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    if (url.includes(`/group/fetchAllGroups/${encodeURIComponent(novaInstance)}`)) {
      return new Response(
        JSON.stringify([
          { id: "999@g.us", subject: "Grupo Novo", size: 22, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.endsWith(`/message/sendText/${encodeURIComponent(novaInstance)}`)) {
      assert.equal(init?.method, "POST")

      return new Response(
        JSON.stringify({
          status: "PENDING",
          key: {
            id: "msg-1",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  await sendWhatsAppText({
    number: "999@g.us",
    text: "Relatorio enviado",
  })

  assert.equal(
    requestedUrls.includes(
      `https://evolution.example.com/message/sendText/${encodeURIComponent(novaInstance)}`
    ),
    true
  )

  restoreEnvironment()
})

test("resolveEvolutionInstanceForDestination prefers the instance bound to the WhatsApp group", async () => {
  setEvolutionEnv()
  const requestedInstance = "OutraInstancia"

  globalThis.fetch = async (input) => {
    const url = String(input)

    if (url.endsWith("/instance/fetchInstances")) {
      return new Response(
        JSON.stringify([
          { name: "GreatGo", status: "open" },
          { name: requestedInstance, status: "open" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes("/group/fetchAllGroups/GreatGo")) {
      return new Response(
        JSON.stringify([
          { id: "999@g.us", subject: "Grupo Correto", size: 22, announce: false },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    }

    if (url.includes(`/group/fetchAllGroups/${encodeURIComponent(requestedInstance)}`)) {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }

    throw new Error(`URL nao esperada no teste: ${url}`)
  }

  const instance = await resolveEvolutionInstanceForDestination(
    "999@g.us",
    requestedInstance
  )

  assert.equal(instance, "GreatGo")

  restoreEnvironment()
})
