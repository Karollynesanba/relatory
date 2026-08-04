import { readdir } from "node:fs/promises"

process.env.DATABASE_URL ??= "file:./dev.db"
process.env.DIRECT_URL ??= process.env.DATABASE_URL

const testFiles = (await readdir(new URL(".", import.meta.url), {
  withFileTypes: true,
}))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => entry.name)
  .sort((left, right) => left.localeCompare(right))

for (const testFile of testFiles) {
  await import(new URL(testFile, import.meta.url).href)
}

const { runRegisteredTests } = await import("./test-helpers.mjs")

await runRegisteredTests()


