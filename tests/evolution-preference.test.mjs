import { assert, test } from "./test-helpers.mjs"
import {
  getEvolutionInstanceForMetaPreset,
  resolveUserEvolutionInstance,
} from "@/lib/evolution-preference"

test("getEvolutionInstanceForMetaPreset maps presets to their matching instance", async () => {
  assert.equal(getEvolutionInstanceForMetaPreset("ISAQUE"), "Isaque")
  assert.equal(getEvolutionInstanceForMetaPreset("BRAYTON"), "Brayton")
})

test("resolveUserEvolutionInstance prefers the Meta preset over the explicit instance", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-1",
    evolutionInstance: "Brayton",
    metaAccessToken: "preset:v1:ISAQUE",
  })

  assert.equal(instance, "Isaque")
})

test("resolveUserEvolutionInstance falls back to the Meta preset when no instance is saved", async () => {
  const instance = await resolveUserEvolutionInstance({
    id: "user-2",
    evolutionInstance: null,
    metaAccessToken: "preset:v1:ISAQUE",
  })

  assert.equal(instance, "Isaque")
})
