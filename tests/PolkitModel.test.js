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

test("messageLooksSecurityKey", () => {
  assert.equal(M.messageLooksSecurityKey("Please touch the device."), true)
  assert.equal(M.messageLooksSecurityKey("Tap your FIDO key"), true)
  assert.equal(M.messageLooksSecurityKey("Insert your security key"), true)
  assert.equal(M.messageLooksSecurityKey(""), false)
  assert.equal(M.messageLooksSecurityKey("Place your finger on the reader"), false)
  assert.equal(M.messageLooksSecurityKey("Touch the fingerprint sensor"), false)
})

test("passwordPlaceholder", () => {
  assert.equal(M.passwordPlaceholder(""), "Enter password")
  assert.equal(M.passwordPlaceholder("Password: "), "Enter password")
  assert.equal(M.passwordPlaceholder("Senha: "), "Enter password")
  assert.equal(M.passwordPlaceholder("Please enter the PIN:"), "Please enter the PIN")
})

test("existing helpers still work", () => {
  assert.equal(M.fingerprintConfiguredFromPamConfig(fprintThenU2f), true)
  assert.equal(M.fingerprintConfiguredFromPamConfig(u2fOnly), false)
  assert.equal(M.authorizationLabel("Authentication is needed to run `/usr/bin/true' as the super user"), "Authorize running '/usr/bin/true'")
})
