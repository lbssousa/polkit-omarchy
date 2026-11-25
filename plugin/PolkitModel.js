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

function messageLooksSecurityKey(text, cues) {
  // pam_u2f's default cue is "Please touch the device."; cue_prompt= can
  // change it. A configured cue is matched exactly, before the usual words
  // for a FIDO key.
  var trimmed = String(text || "").replace(/^\s+|\s+$/g, "").toLowerCase()
  var configured = cues || []
  for (var i = 0; trimmed && i < configured.length; i++) {
    if (String(configured[i]).replace(/^\s+|\s+$/g, "").toLowerCase() === trimmed) return true
  }
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

function pamTokens(line) {
  // Split a pam.d line as Linux-PAM does: "[...]" is one token with only \]
  // escaped, only space, tab and newline separate, and '#' ends the line.
  var s = String(line || "").split("#")[0]
  var out = []
  var i = 0
  while (i < s.length) {
    while (i < s.length && /[ \t\n]/.test(s.charAt(i))) i++
    if (i >= s.length) break
    var token = ""
    if (s.charAt(i) === "[") {
      for (i++; i < s.length && s.charAt(i) !== "]"; i++) {
        if (s.charAt(i) === "\\" && s.charAt(i + 1) === "]") i++
        token += s.charAt(i)
      }
      i++
    } else {
      for (; i < s.length && !/[ \t\n]/.test(s.charAt(i)); i++) token += s.charAt(i)
    }
    out.push(token)
  }
  return out
}

function securityKeyCuesFromPamConfig(raw) {
  // The cue_prompt= arguments of pam_u2f, bare (cue_prompt=Tap) or in
  // brackets ([cue_prompt=Tap the token]).
  var out = []
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var tokens = pamTokens(lines[i])
    if (tokens[0] !== "auth" || !/(^|\/)pam_u2f\.so$/.test(tokens[2] || "")) continue
    for (var j = 3; j < tokens.length; j++) {
      if (tokens[j].indexOf("cue_prompt=") !== 0) continue
      var cue = tokens[j].slice("cue_prompt=".length)
      if (cue && out.indexOf(cue) === -1) out.push(cue)
    }
  }
  return out
}

// Which method owns the dialog while PAM waits on hardware. These live here
// rather than in QML bindings so tests/ can check the property that matters:
// a password prompt from PAM (`responseRequired`) is never hidden. `s` holds
// the dialog's state: dialogVisible, responseRequired, submitted, errorFlash,
// supplementary (PAM's info message), securityKeyConfigured, securityKeyFirst,
// securityKeyCues (pam_u2f's cue_prompt values), fingerprintConfigured and
// laptopClosed.
function waitingOnHardware(s) {
  return !!s.dialogVisible && !s.responseRequired && !s.submitted && !s.errorFlash
}

// pam_u2f blocks until the key is touched and asks for nothing — at most an
// info message ("Please touch the device." with `cue`). A cue tells us for
// sure; without one, go by the PAM stack (u2f first, or the fingerprint
// reader out of the way).
function securityKeyMode(s) {
  if (!waitingOnHardware(s)) return false
  if (messageLooksSecurityKey(s.supplementary, s.securityKeyCues)) return true
  if (!s.securityKeyConfigured || promptLooksFingerprint(s.supplementary)) return false
  // pam_u2f's cue is never translated but pam_fprintd's messages are, so any
  // other message while the reader is reachable is the reader's.
  if (s.fingerprintConfigured && !s.laptopClosed) return !!s.securityKeyFirst && !s.supplementary
  return true
}

// Whether an answer is still being checked after PAM's flow changed. `s`
// holds submitted, responseRequired, supplementary, securityKeyCues and
// messageChanged (PAM sent a new info message). PAM asking again ends the check; so does a new
// touch cue, since PAM then took the answer (pam_u2f's PIN with
// `pinverification`) and waits on the key instead.
function stillSubmitted(s) {
  if (!s.submitted || s.responseRequired) return false
  return !(s.messageChanged && messageLooksSecurityKey(s.supplementary, s.securityKeyCues))
}

// Fingerprint owns the dialog while PAM waits on the reader (lid open, sensor
// enrolled), unless it's the security key being waited on.
function fingerprintMode(s) {
  return !!s.fingerprintConfigured && !s.laptopClosed && waitingOnHardware(s) && !securityKeyMode(s)
}

// pam_fprintd reports a scan that didn't work (no match, or a retry such as a
// swipe that was too fast) as a PAM error message, in the user's language, and
// prompts for the next try ("Place your finger on …") with an info one. `s`
// holds fingerprintMode, supplementary, supplementaryIsError and
// securityKeyCues. Only a failed scan while the reader owns the dialog gets the
// feedback; a security key cue never does.
function fingerprintScanFailed(s) {
  if (!s.fingerprintMode || !s.supplementaryIsError) return false
  var text = String(s.supplementary || "").replace(/^\s+|\s+$/g, "")
  return text !== "" && !messageLooksSecurityKey(text, s.securityKeyCues)
}

// pam_u2f with pinverification asks "Please enter the PIN:" instead of the
// password.
function promptAsksPin(prompt) {
  return /\bPIN\b/.test(String(prompt || ""))
}

// pkexec's prompt, with its command line between a backtick and a quote. The
// line can hold quotes of its own, so it runs to the last one before " as".
var pkexecPrompt = /^Authentication is (?:needed|required) to run [`']([\s\S]+)[`'] as (?:the super user|user )/i

// The program a pkexec prompt asks to run, as its message names it; empty for
// any other prompt.
function promptProgram(message) {
  var match = String(message || "").match(pkexecPrompt)
  return match ? match[1] : ""
}

// pkexec's prompt cuts a command line longer than 80 bytes to its first 38
// and last 37, so one expected whole is cut the same way to match it. This
// counts characters, which are bytes for an ASCII command line.
function promptLine(line) {
  var text = String(line || "")
  return text.length > 80 ? text.slice(0, 38) + " ... " + text.slice(-37) : text
}

function matchesProgram(shown, want) {
  if (!shown || !want) return false
  if (want.charAt(0) === "/") return shown === want || shown === promptLine(want)
  var clean = want.replace(/^\.\//, "")
  var bare = "/" + clean
  if (shown.slice(-bare.length) === bare && shown.slice(0, shown.length - bare.length).indexOf(" ") === -1) return true
  var wantExe = "/" + clean.split(" ")[0]
  var shownExe = shown.split(" ")[0]
  return shown.length === 80 && shown.indexOf(" ... ") === 38 && shownExe.slice(-wantExe.length) === wantExe && shown.slice(-37) === bare.slice(-37)
}

// A label a command asked for its next prompt (omarchy.polkit expect), when
// this prompt is that one: pkexec running the program it named, before the
// label went stale. Empty otherwise.
function expectedLabel(message, expected, nowMs) {
  if (!expected || !expected.label || nowMs > expected.until) return ""
  return matchesProgram(promptProgram(message), String(expected.program || "")) ? String(expected.label) : ""
}

// Parse requester.py output ("<mark>\t<display name>\t<0|1>"); null otherwise.
function parseRequester(text) {
  var parts = String(text || "").trim().split("\t")
  if (parts.length < 2) return null
  var mark = parts[0]
  var name = parts[1].trim()
  if (!/^[a-z0-9-]+$/.test(mark) || name === "") return null
  return { mark: mark, name: name, light: parts[2] === "1" }
}

// A pkexec prompt names the agent it comes from, when that's known. The parts
// go in through functions, so a $ in a command line stays as it is.
function authorizationLabel(message, tr, agentName) {
  var t = typeof tr === "function" ? tr : function(key, english) { return english }
  var text = String(message || "")
  var match = text.match(pkexecPrompt)
  if (match) {
    var name = String(agentName || "").trim()
    if (name !== "")
      return t("polkit.authorizeAgentRunning", "Authorize %1 to run '%2'").replace("%1", function() { return name }).replace("%2", function() { return match[1] })
    return t("polkit.authorizeRunning", "Authorize running '%1'").replace("%1", function() { return match[1] })
  }
  // udisks formatting a drive, named as udisks names it.
  match = text.match(/^Authentication is required to format (.+)$/i)
  if (match) return t("polkit.authorizeFormatting", "Authorize formatting of %1").replace("%1", function() { return match[1] })
  return text
}

if (typeof module !== "undefined") {
  module.exports = {
    promptLooksFingerprint: promptLooksFingerprint,
    fingerprintConfiguredFromPamConfig: fingerprintConfiguredFromPamConfig,
    messageLooksSecurityKey: messageLooksSecurityKey,
    waitingOnHardware: waitingOnHardware,
    securityKeyMode: securityKeyMode,
    stillSubmitted: stillSubmitted,
    fingerprintMode: fingerprintMode,
    fingerprintScanFailed: fingerprintScanFailed,
    passiveAuthModules: passiveAuthModules,
    securityKeyConfiguredFromPamConfig: securityKeyConfiguredFromPamConfig,
    securityKeyCuesFromPamConfig: securityKeyCuesFromPamConfig,
    promptAsksPin: promptAsksPin,
    authorizationLabel: authorizationLabel,
    promptProgram: promptProgram,
    expectedLabel: expectedLabel,
    parseRequester: parseRequester
  }
}
