// What the shell trusts about this plugin comes from its manifest and the
// files next to it. These checks stand in for `omarchy plugin validate`,
// which needs Omarchy installed, and guard the security-relevant parts.
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const dir = path.join(__dirname, "..", "plugin")
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"))
const agent = fs.readFileSync(path.join(dir, "PolkitAgent.qml"), "utf8")

function walk(d) {
  return fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)])
}

test("the manifest identifies a service replacing Omarchy's agent", () => {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.id, "lbssousa.polkit")
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/)
  assert.deepEqual(manifest.kinds, ["service"])
  assert.equal(manifest.keepLoaded, true)
  assert.equal(manifest.omarchy.clonedFrom, "omarchy.polkit")
})

test("it doesn't declare capabilities for itself", () => {
  // The shell grants the `authentication` capability through clonedFrom,
  // from the built-in it replaces; a third-party manifest asking for it
  // directly would only be a request nobody should rely on.
  assert.equal(manifest.omarchy.capabilities, undefined)
})

test("the entry point is a plain file inside the plugin", () => {
  const entry = manifest.entryPoints.service
  assert.ok(!path.isAbsolute(entry) && !entry.split("/").includes(".."), entry)
  const stat = fs.lstatSync(path.join(dir, entry))
  assert.ok(stat.isFile() && !stat.isSymbolicLink())
})

test("the plugin folder holds no symlinks or executables", () => {
  for (const file of walk(dir)) {
    const stat = fs.lstatSync(file)
    assert.ok(!stat.isSymbolicLink(), file)
    assert.equal(stat.mode & 0o111, 0, `${file} is executable`)
  }
})

test("the agent takes its mode decisions from the tested functions", () => {
  assert.match(agent, /PolkitModel\.securityKeyMode\(modeState\)/)
  assert.match(agent, /PolkitModel\.fingerprintMode\(modeState\)/)
  // No second, untested copy of the rule.
  assert.doesNotMatch(agent, /messageLooksSecurityKey/)
})

test("text from outside is drawn as plain text", () => {
  for (const id of ["justificationText"]) {
    const block = agent.slice(agent.indexOf(`id: ${id}`) - 200, agent.indexOf(`id: ${id}`) + 400)
    assert.match(block, /textFormat: Text\.PlainText/, id)
  }
  const at = agent.indexOf("root.passwordPlaceholder")
  assert.ok(at > 0)
  assert.match(agent.slice(at - 700, at), /textFormat: Text\.PlainText/, "placeholder")
})

test("the password field stays hidden only in the two hardware states", () => {
  assert.match(agent, /visible: !root\.securityKeyMode/)
  assert.match(agent, /visible: !root\.fingerprintMode/)
})
