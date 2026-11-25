// Callers keep using the built-in id: `omarchy-shell omarchy.polkit <method>`
// reaches this plugin while it replaces omarchy.polkit. A method Omarchy's
// agent has and this one lacks fails without a word (omarchy-drive-unlock
// calls it with -q), so every method of the snapshot in upstream/ must be here.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

function ipcMethods(file) {
  const source = fs.readFileSync(file, "utf8")
  const start = source.indexOf("ShellIpc {")
  if (start === -1) return { target: "", methods: [] }
  // The block ends at the brace that closes it.
  let depth = 0
  let end = start
  for (let i = source.indexOf("{", start); i < source.length; i++) {
    if (source[i] === "{") depth++
    else if (source[i] === "}" && --depth === 0) { end = i; break }
  }
  const block = source.slice(start, end)
  const target = (block.match(/target:\s*"([^"]+)"/) || [])[1] || ""
  const methods = [...block.matchAll(/function\s+([A-Za-z_]\w*)\s*\(([^)]*)\)/g)]
    .map((m) => `${m[1]}(${m[2].replace(/\s+/g, " ").trim()})`)
  return { target, methods }
}

const root = path.join(__dirname, "..")
const ours = ipcMethods(path.join(root, "plugin", "PolkitAgent.qml"))
const base = ipcMethods(path.join(root, "upstream", "PolkitAgent.qml"))

test("the IPC answers to omarchy.polkit", () => {
  assert.equal(ours.target, "omarchy.polkit")
})

test("every IPC method of Omarchy's agent is here, with the same signature", () => {
  for (const method of base.methods) assert.ok(ours.methods.includes(method), `missing ${method}`)
})
