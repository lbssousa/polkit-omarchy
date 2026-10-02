function promptLooksFingerprint(text) {
  var s = String(text || "").toLowerCase()
  return s.indexOf("finger") !== -1 || s.indexOf("fprint") !== -1 || s.indexOf("swipe") !== -1
}

function fingerprintConfiguredFromPamConfig(raw) {
  // Fingerprint is available whenever pam_fprintd appears anywhere in the auth
  // stack — it need not be the first module. A clamshell gate (pam_exec) may
  // legitimately precede it to skip fingerprint while the lid is closed.
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "")
    if (!line || line.charAt(0) === "#") continue
    if (!line.match(/^auth\s+/)) continue
    if (line.indexOf("pam_fprintd.so") !== -1) return true
  }
  return false
}

function messageLooksSecurityKey(text) {
  // pam_u2f's default cue is "Please touch the device."; cue_prompt= can
  // change it, so also accept the usual words for a FIDO key.
  if (promptLooksFingerprint(text)) return false
  var s = String(text || "").toLowerCase()
  return s.indexOf("touch") !== -1 || s.indexOf("security key") !== -1
    || s.indexOf("u2f") !== -1 || s.indexOf("fido") !== -1
}

function passiveAuthModules(raw) {
  // The auth modules that wait on hardware instead of asking for a response,
  // in stack order: "fingerprint" (pam_fprintd) and "security-key" (pam_u2f).
  var out = []
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "")
    if (!line || line.charAt(0) === "#") continue
    if (!line.match(/^auth\s+/)) continue
    var kind = line.indexOf("pam_fprintd.so") !== -1 ? "fingerprint"
      : line.indexOf("pam_u2f.so") !== -1 ? "security-key" : ""
    if (kind && out.indexOf(kind) === -1) out.push(kind)
  }
  return out
}

function securityKeyConfiguredFromPamConfig(raw) {
  return passiveAuthModules(raw).indexOf("security-key") !== -1
}

// Which method owns the dialog while PAM waits on hardware. These live here
// rather than in QML bindings so tests/ can check the property that matters:
// a password prompt from PAM (`responseRequired`) is never hidden. `s` holds
// the dialog's state: dialogVisible, responseRequired, submitted, errorFlash,
// supplementary (PAM's info message), securityKeyConfigured, securityKeyFirst,
// fingerprintConfigured and laptopClosed.
function waitingOnHardware(s) {
  return !!s.dialogVisible && !s.responseRequired && !s.submitted && !s.errorFlash
}

// pam_u2f blocks until the key is touched and asks for nothing — at most an
// info message ("Please touch the device." with `cue`). A cue tells us for
// sure; without one, go by the PAM stack (u2f first, or the fingerprint
// reader out of the way).
function securityKeyMode(s) {
  if (!waitingOnHardware(s)) return false
  if (messageLooksSecurityKey(s.supplementary)) return true
  return !!s.securityKeyConfigured && !promptLooksFingerprint(s.supplementary)
    && (!!s.securityKeyFirst || !s.fingerprintConfigured || !!s.laptopClosed)
}

// Fingerprint owns the dialog while PAM waits on the reader (lid open, sensor
// enrolled), unless it's the security key being waited on.
function fingerprintMode(s) {
  return !!s.fingerprintConfigured && !s.laptopClosed && waitingOnHardware(s) && !securityKeyMode(s)
}

function passwordPlaceholder(prompt) {
  // PAM's own prompt when it asks for a PIN instead of the password
  // (pam_u2f with pinverification asks "Please enter the PIN:").
  var text = String(prompt || "").replace(/^\s+|[\s:]+$/g, "")
  return /\bPIN\b/.test(text) ? text : "Enter password"
}

function authorizationLabel(message) {
  var text = String(message || "")
  var match = text.match(/^Authentication is (?:needed|required) to run [`']([^`']+)[`'] as /i)
  return match ? "Authorize running '" + match[1] + "'" : text
}

if (typeof module !== "undefined") {
  module.exports = {
    promptLooksFingerprint: promptLooksFingerprint,
    fingerprintConfiguredFromPamConfig: fingerprintConfiguredFromPamConfig,
    messageLooksSecurityKey: messageLooksSecurityKey,
    waitingOnHardware: waitingOnHardware,
    securityKeyMode: securityKeyMode,
    fingerprintMode: fingerprintMode,
    passiveAuthModules: passiveAuthModules,
    securityKeyConfiguredFromPamConfig: securityKeyConfiguredFromPamConfig,
    passwordPlaceholder: passwordPlaceholder,
    authorizationLabel: authorizationLabel
  }
}
