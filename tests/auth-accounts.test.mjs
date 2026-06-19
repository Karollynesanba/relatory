import { assert, test } from "./test-helpers.mjs"
import {
  DEFAULT_LOGIN_PASSWORD,
  getAuthLoginAccounts,
  getBootstrapLoginAccount,
} from "@/lib/auth-accounts"

test("getAuthLoginAccounts inclui a conta bootstrap do Brayton", () => {
  assert.deepEqual(
    getAuthLoginAccounts({}).map(({ email, name, role, password }) => ({
      email,
      name,
      role,
      password,
    })),
    [
      {
        email: "braytonmaycon5@gmail.com",
        name: "Brayton Maycon",
        role: "ADMIN",
        password: DEFAULT_LOGIN_PASSWORD,
      },
      {
        email: "kauaanderson1919@gmail.com",
        name: "Kaua Anderson",
        role: "ADMIN",
        password: DEFAULT_LOGIN_PASSWORD,
      },
    ]
  )
})

test("getAuthLoginAccounts inclui contas explicitamente configuradas", () => {
  const accounts = getAuthLoginAccounts({
    ADMIN_EMAIL: " admin@greatgo.com ",
    ADMIN_PASSWORD: "senha-admin",
    DEV_BYPASS_AUTH_EMAIL: " gestor@empresa.com ",
    DEV_BYPASS_AUTH_NAME: "Gestor Teste",
    DEV_BYPASS_AUTH_PASSWORD: "senha-dev",
  })

  assert.deepEqual(
    accounts.map(({ email, name, role, password }) => ({
      email,
      name,
      role,
      password,
    })),
    [
      {
        email: "admin@greatgo.com",
        name: "Administrador",
        role: "ADMIN",
        password: "senha-admin",
      },
      {
        email: "gestor@empresa.com",
        name: "Gestor Teste",
        role: "MANAGER",
        password: "senha-dev",
      },
      {
        email: "braytonmaycon5@gmail.com",
        name: "Brayton Maycon",
        role: "ADMIN",
        password: DEFAULT_LOGIN_PASSWORD,
      },
      {
        email: "kauaanderson1919@gmail.com",
        name: "Kaua Anderson",
        role: "ADMIN",
        password: DEFAULT_LOGIN_PASSWORD,
      },
    ]
  )
})

test("getBootstrapLoginAccount retorna a conta bootstrap do Brayton", () => {
  assert.deepEqual(getBootstrapLoginAccount("braytonmaycon5@gmail.com", {}), {
    id: "brayton-maycon",
    name: "Brayton Maycon",
    email: "braytonmaycon5@gmail.com",
    role: "ADMIN",
    password: DEFAULT_LOGIN_PASSWORD,
  })
})

test("getBootstrapLoginAccount retorna a conta bootstrap do Kaua", () => {
  assert.deepEqual(getBootstrapLoginAccount("kauaanderson1919@gmail.com", {}), {
    id: "kaua-anderson",
    name: "Kaua Anderson",
    email: "kauaanderson1919@gmail.com",
    role: "ADMIN",
    password: DEFAULT_LOGIN_PASSWORD,
  })
})

test("getBootstrapLoginAccount retorna null para contas nao configuradas", () => {
  assert.equal(getBootstrapLoginAccount("admin@greatgo.com", {}), null)
  assert.equal(getBootstrapLoginAccount("gestor@empresa.com", {}), null)
})
