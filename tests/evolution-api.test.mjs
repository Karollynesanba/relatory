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
