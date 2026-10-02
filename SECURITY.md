# Security policy

## Supported versions

Only the latest release on `main` gets security fixes.

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub's
[private vulnerability reporting](https://github.com/lbssousa/polkit-omarchy/security/advisories/new),
not in a public issue. Include the version (`plugin/manifest.json`), your
Omarchy version (`pacman -Q omarchy`), what you did, and what happened. You
should get an answer within a week.

If the problem is also in Omarchy's own polkit agent (`omarchy.polkit`),
which this plugin is a copy of, report it to Omarchy as well.

## Threat model

polkit-omarchy is a polkit authentication agent: it shows the dialog where
the user types a password, or touches a security key, to authorize a
privileged action. It is Omarchy's agent plus a "Touch your security key"
state, so it has the same exposure as the original:

**In scope:**

- Anything this plugin changes that lets an authorization succeed without
  the user's password or key, or that shows a different action than the one
  being authorized.
- The security key state hiding a password prompt: when PAM asks for a
  response (`isResponseRequired`), the dialog must show the password field.
- Leaking the password beyond what the original agent does.

**Out of scope, by design:**

- **Processes running as the same user.** They can draw a look-alike
  layer-shell overlay, register their own polkit agent, or rewrite the
  plugin in `~/.config/omarchy/plugins`, which is the user's own directory.
- **The password inside omarchy-shell.** It passes through a QML
  `TextInput` and the JavaScript heap, which can't be wiped. The field is
  cleared right after answering, as in the original agent.
- **Whether the key is actually touched.** The dialog only reflects what PAM
  reports; pam_u2f does the verification.

## Hardening in place

- **The rule that matters is tested exhaustively.** The decision to show the
  fingerprint or the security key state lives in `plugin/PolkitModel.js`, and
  `tests/modes.test.js` checks it over every combination of the dialog's
  flags and a range of PAM messages: a password prompt from PAM is never
  hidden, neither state shows after an answer or a failure, the two never
  show together, and without a security key the fingerprint state is exactly
  Omarchy's. `tests/manifest.test.js` checks that the QML takes its decisions
  from those functions and keeps no second copy of the rule.
- **The manifest asks for nothing.** It declares no capabilities of its
  own: the shell grants the `authentication` capability through
  `clonedFrom`, from the built-in agent it replaces. The plugin folder holds
  only plain, non-executable files.
- **The change is small and reviewable.** `upstream/` keeps Omarchy's
  original files as the merge base. `just diff-base` shows exactly what
  differs, and every CI run puts the same diff in its summary.
- **Text is drawn as plain text,** never rich text, and the only text from
  outside that gets shown is the one Omarchy's agent already showed.
- **No runtime dependencies,** and no code that runs outside omarchy-shell.
- CodeQL, OpenSSF Scorecard and Dependabot (for the SHA-pinned actions)
  run on the repository.
- `main` only takes squash-merged pull requests with signed commits and
  passing checks.
