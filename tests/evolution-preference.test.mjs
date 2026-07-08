import { assert, test } from "./test-helpers.mjs"
import {
  getEvolutionInstanceForMetaPreset,
  resolveUserEvolutionInstance,
} from "@/lib/evolution-preference"

test("getEvolutionInstanceForMetaPreset maps presets to their matching instance", async () => {
  assert.equal(getEvolutionInstanceForMetaPreset("ISAQUE"), "Isaque")
  assert.equal(getEvolutionInstanceForMetaPreset("BRAYTON"), "Brayton")
})

test("resolveUserEvolutionInstance infers instance from the user identity", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-1",
    name: "Carlos Silva",
    email: "carlos@greatgo.com",
    evolutionInstance: "Brayton",
    metaAccessToken: "preset:v1:ISAQUE",
  })

  assert.equal(instance, "Carlos")
})

test("resolveUserEvolutionInstance favors the Brayton identity even with a stale instance saved", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-1b",
    name: "Pessoa sem pista",
    email: "braytonmaycon5@gmail.com",
    evolutionInstance: "Carlos",
    metaAccessToken: null,
  })

  assert.equal(instance, "Brayton")
})

test("resolveUserEvolutionInstance falls back to the Meta preset when no instance is saved", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-2",
    name: "Usuário sem pista",
    email: "user@example.com",
    evolutionInstance: null,
    metaAccessToken: "preset:v1:ISAQUE",
  })

  assert.equal(instance, "Isaque")
})

test("resolveUserEvolutionInstance uses the explicit instance when identity is unknown", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-3",
    name: "Equipe Operacional",
    email: "operacional@greatgo.com",
    evolutionInstance: "Jeff",
    metaAccessToken: null,
  })

  assert.equal(instance, "Jeff")
})
