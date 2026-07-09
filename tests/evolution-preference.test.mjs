import { assert, test } from "./test-helpers.mjs"
import {
  getEvolutionInstanceForMetaPreset,
  resolveUserEvolutionInstance,
} from "@/lib/evolution-preference"

test("getEvolutionInstanceForMetaPreset maps presets to their matching instance", async () => {
  assert.equal(getEvolutionInstanceForMetaPreset("ISAQUE"), "Isaque - GreatGo")
  assert.equal(getEvolutionInstanceForMetaPreset("BRAYTON"), "Brayton - GreatGo")
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
    name: "Brayton Maycon | Assessoria Great",
    email: "braytonmaycon5@gmail.com",
    evolutionInstance: "Carlos",
    metaAccessToken: null,
  })

  assert.equal(instance, "Brayton - GreatGo")
})

test("resolveUserEvolutionInstance resolves Jeff to the exact Evolution instance name", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-1c",
    name: "Jeferson Luiz",
    email: "jefereson@example.com",
    evolutionInstance: null,
    metaAccessToken: null,
  })

  assert.equal(instance, "Jeferson")
})

test("resolveUserEvolutionInstance falls back to the Meta preset when no instance is saved", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-2",
    name: "Usuário sem pista",
    email: "user@example.com",
    evolutionInstance: null,
    metaAccessToken: "preset:v1:ISAQUE",
  })

  assert.equal(instance, "Isaque - GreatGo")
})

test("resolveUserEvolutionInstance uses the explicit instance when identity is unknown", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-3",
    name: "Equipe Operacional",
    email: "operacional@greatgo.com",
    evolutionInstance: "Jeferson",
    metaAccessToken: null,
  })

  assert.equal(instance, "Jeferson")
})
