import { assert, test } from "./test-helpers.mjs"
import {
  canAccessClient,
  canAccessReportClient,
  scopeClientWhere,
  scopeReportClientWhere,
  scopeSharedReportClientWhere,
} from "@/lib/authorization"

const sharedClientUser = {
  id: "user-cl-1",
  email: "Cl.Andrade99@Gmail.com",
  role: "MANAGER",
}

const regularUser = {
  id: "user-regular",
  email: "gestor@greatgo.com",
  role: "MANAGER",
}

test("shared client emails can access clients across managers", () => {
  assert.equal(canAccessClient(sharedClientUser, "another-manager-id"), true)
  assert.deepEqual(scopeClientWhere(sharedClientUser), {})
})

test("shared client emails can access shared reports and schedules", () => {
  assert.equal(canAccessReportClient(sharedClientUser, "another-manager-id"), true)
  assert.deepEqual(scopeReportClientWhere(sharedClientUser), {})
  assert.deepEqual(scopeSharedReportClientWhere(sharedClientUser), {})
})

test("regular managers remain scoped to their own clients", () => {
  assert.equal(canAccessClient(regularUser, "another-manager-id"), false)
  assert.deepEqual(scopeClientWhere(regularUser), {
    AND: [{}, { managerId: "user-regular" }],
  })
})
