// The security property of this plugin: whatever the PAM stack and the
// dialog state, a password prompt from PAM is never hidden behind the
// fingerprint or security key states. Checked over every combination of
// the dialog's flags and a range of PAM messages.
const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../plugin/PolkitModel.js")

const FLAGS = [
  "dialogVisible", "responseRequired", "submitted", "errorFlash",
  "securityKeyConfigured", "securityKeyFirst", "fingerprintConfigured", "laptopClosed"
]
const MESSAGES = [
  "", "Please touch the device.", "Touch your security key", "Tap your FIDO2 key",
  "Place your finger on the reader", "Touch the fingerprint sensor", "Swipe your finger",
  "Account locked", "Password:", "Please enter the PIN:", "touch", "FINGER"
]

function* states() {
  for (let bits = 0; bits < 1 << FLAGS.length; bits++) {
    const s = {}
    FLAGS.forEach((f, i) => { s[f] = !!(bits & (1 << i)) })
    for (const supplementary of MESSAGES) yield { ...s, supplementary }
  }
}

// Omarchy's own rule for the fingerprint state, before this plugin.
function upstreamFingerprintMode(s) {
  return s.fingerprintConfigured && !s.laptopClosed && s.dialogVisible
    && !s.responseRequired && !s.submitted && !s.errorFlash
}

test("a password prompt from PAM is never hidden", () => {
  for (const s of states()) {
    if (!s.responseRequired) continue
    assert.equal(M.securityKeyMode(s), false, JSON.stringify(s))
    assert.equal(M.fingerprintMode(s), false, JSON.stringify(s))
  }
})

test("neither state shows after an answer, a failure or when the dialog is closed", () => {
  for (const s of states()) {
    if (s.submitted || s.errorFlash || !s.dialogVisible) {
      assert.equal(M.securityKeyMode(s), false, JSON.stringify(s))
      assert.equal(M.fingerprintMode(s), false, JSON.stringify(s))
    }
  }
})

test("the two states never show together", () => {
  for (const s of states()) {
    assert.ok(!(M.securityKeyMode(s) && M.fingerprintMode(s)), JSON.stringify(s))
  }
})

test("without a security key, the fingerprint state is exactly Omarchy's", () => {
  for (const s of states()) {
    if (s.securityKeyConfigured || M.messageLooksSecurityKey(s.supplementary)) continue
    assert.equal(M.securityKeyMode(s), false, JSON.stringify(s))
    assert.equal(M.fingerprintMode(s), upstreamFingerprintMode(s), JSON.stringify(s))
  }
})

test("a fingerprint message never turns into the security key state", () => {
  for (const s of states()) {
    if (/finger|fprint|swipe/i.test(s.supplementary)) {
      assert.equal(M.securityKeyMode(s), false, JSON.stringify(s))
    }
  }
})

test("a touch cue shows the security key state while PAM waits", () => {
  for (const s of states()) {
    if (M.waitingOnHardware(s) && M.messageLooksSecurityKey(s.supplementary)) {
      assert.equal(M.securityKeyMode(s), true, JSON.stringify(s))
    }
  }
})

test("missing fields mean 'not set', never a crash or a hidden prompt", () => {
  assert.equal(M.securityKeyMode({}), false)
  assert.equal(M.fingerprintMode({}), false)
  assert.equal(M.securityKeyMode({ dialogVisible: true, supplementary: "Please touch the device." }), true)
  assert.equal(M.securityKeyMode({ dialogVisible: true, responseRequired: true, supplementary: "Please touch the device." }), false)
})

// A small deterministic PRNG, so a failure can be reproduced.
function rng(seed) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32
}

test("the text helpers take any input without throwing", () => {
  const rand = rng(42)
  const alphabet = ["a", "Z", " ", "\n", "\t", "%", ":", "#", "pam_u2f.so", "pam_fprintd.so",
    "auth", "sufficient", "PIN", "touch", "finger", "‮", "\u0000", "é", "🔑", "\\", "\""]
  const text = () => Array.from({ length: Math.floor(rand() * 40) },
    () => alphabet[Math.floor(rand() * alphabet.length)]).join("")
  for (let i = 0; i < 5000; i++) {
    const t = text()
    assert.equal(typeof M.messageLooksSecurityKey(t), "boolean")
    assert.equal(typeof M.promptLooksFingerprint(t), "boolean")
    const modules = M.passiveAuthModules(t)
    assert.ok(modules.every((m) => m === "fingerprint" || m === "security-key"))
    assert.equal(new Set(modules).size, modules.length, "no duplicates")
    const placeholder = M.passwordPlaceholder(t)
    assert.ok(placeholder === "Enter password" || /\bPIN\b/.test(placeholder))
    assert.equal(typeof M.authorizationLabel(t), "string")
  }
  for (const odd of [null, undefined, 0, false, {}, []]) {
    M.messageLooksSecurityKey(odd); M.passiveAuthModules(odd); M.passwordPlaceholder(odd)
  }
})
