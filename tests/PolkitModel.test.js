// Run with: node --test tests/
const test = require("node:test")
const assert = require("node:assert/strict")
const M = require("../plugin/PolkitModel.js")

const u2fOnly = "auth      sufficient pam_u2f.so cue authfile=/etc/fido2/fido2\nauth      required pam_unix.so\n"
const u2fThenFprint = "auth sufficient pam_u2f.so cue\nauth sufficient pam_fprintd.so\nauth required pam_unix.so\n"
const fprintThenU2f = "auth [success=1 default=ignore] pam_exec.so quiet /usr/bin/lid-closed\nauth sufficient pam_fprintd.so\nauth sufficient pam_u2f.so\nauth required pam_unix.so\n"

test("passiveAuthModules keeps stack order", () => {
  assert.deepEqual(M.passiveAuthModules(u2fOnly), ["security-key"])
  assert.deepEqual(M.passiveAuthModules(u2fThenFprint), ["security-key", "fingerprint"])
  assert.deepEqual(M.passiveAuthModules(fprintThenU2f), ["fingerprint", "security-key"])
  assert.deepEqual(M.passiveAuthModules("auth required pam_unix.so\n"), [])
})

test("commented and non-auth lines are ignored", () => {
  assert.equal(M.securityKeyConfiguredFromPamConfig("#auth sufficient pam_u2f.so\nauth required pam_unix.so"), false)
  assert.equal(M.securityKeyConfiguredFromPamConfig("session optional pam_u2f.so"), false)
  assert.equal(M.securityKeyConfiguredFromPamConfig(u2fOnly), true)
  assert.equal(M.securityKeyConfiguredFromPamConfig(""), false)
})

test("securityKeyCuesFromPamConfig reads cue_prompt, bare or in brackets", () => {
  assert.deepEqual(M.securityKeyCuesFromPamConfig(
    "auth sufficient pam_u2f.so cue [cue_prompt=Tap the [token\\]] authfile=/etc/fido2/fido2\n" +
    "auth sufficient pam_u2f.so cue cue_prompt=Tap!\n" +
    "# auth sufficient pam_u2f.so cue cue_prompt=Ignored\n" +
    "auth required pam_unix.so\n"), ["Tap the [token]", "Tap!"])
  assert.deepEqual(M.securityKeyCuesFromPamConfig(u2fOnly), [])
})

test("securityKeyCuesFromPamConfig splits arguments the way Linux-PAM does", () => {
  // Only \\] is an escape inside brackets, only space, tab and newline
  // separate, '#' ends the line, and a cue_prompt= inside another argument
  // isn't one.
  assert.deepEqual(M.securityKeyCuesFromPamConfig(
    "auth [success=done default=ignore] pam_u2f.so cue [cue_prompt=Tap\\\\] now] [prompt=Insert it cue_prompt=Nope] # cue_prompt=Comment\n" +
    "auth sufficient pam_u2f.so cue cue_prompt=Tap\u00a0it\n"), ["Tap\\] now", "Tap\u00a0it"])
})

test("messageLooksSecurityKey", () => {
  assert.equal(M.messageLooksSecurityKey("Please touch the device."), true)
  assert.equal(M.messageLooksSecurityKey("Tap your FIDO key"), true)
  assert.equal(M.messageLooksSecurityKey("Insert your security key"), true)
  assert.equal(M.messageLooksSecurityKey(""), false)
  assert.equal(M.messageLooksSecurityKey("Place your finger on the reader"), false)
  assert.equal(M.messageLooksSecurityKey("Touch the fingerprint sensor"), false)
  assert.equal(M.messageLooksSecurityKey("Please touch the FIDO authenticator."), true)
  assert.equal(M.messageLooksSecurityKey("Tap the token"), false)
  assert.equal(M.messageLooksSecurityKey(" tap the TOKEN ", ["Tap the token"]), true)
})

test("which device the dialog shows with a key and a reader", () => {
  const both = { dialogVisible: true, securityKeyConfigured: true, securityKeyFirst: true, fingerprintConfigured: true }
  assert.equal(M.securityKeyMode(both), true, "pam_u2f first, before its cue")
  assert.equal(M.fingerprintMode({ ...both, securityKeyFirst: false }), true, "pam_fprintd first")
  const french = { ...both, supplementary: "Placez votre doigt sur le lecteur d'empreintes digitales" }
  assert.ok(M.fingerprintMode(french) && !M.securityKeyMode(french), "pam_fprintd speaks after pam_u2f, in any language")
  const custom = { ...both, securityKeyCues: ["Tap the token"], supplementary: "Tap the token" }
  assert.ok(M.securityKeyMode(custom) && !M.fingerprintMode(custom), "the configured cue_prompt with a reachable reader")
  assert.equal(M.fingerprintMode({ ...french, securityKeyCues: ["Tap the token"] }), true)
  assert.equal(M.securityKeyMode({ dialogVisible: true, securityKeyConfigured: true, supplementary: "Tap the token" }), true,
    "an unknown cue with no reader")
})

test("promptAsksPin", () => {
  assert.equal(M.promptAsksPin(""), false)
  assert.equal(M.promptAsksPin("Password: "), false)
  assert.equal(M.promptAsksPin("Senha: "), false)
  assert.equal(M.promptAsksPin("Please enter the PIN:"), true)
})

test("existing helpers still work", () => {
  assert.equal(M.fingerprintConfiguredFromPamConfig(fprintThenU2f), true)
  assert.equal(M.fingerprintConfiguredFromPamConfig(u2fOnly), false)
  assert.equal(M.authorizationLabel("Authentication is needed to run `/usr/bin/true' as the super user"), "Authorize running '/usr/bin/true'")
  const tr = (key) => ({ "polkit.authorizeRunning": "Autorizar execução de '%1'" })[key]
  assert.equal(M.authorizationLabel("Authentication is needed to run `/usr/bin/true' as the super user", tr), "Autorizar execução de '/usr/bin/true'")
})
