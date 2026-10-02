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
  layer-shell overlay or register their own polkit agent.
- **The password inside omarchy-shell.** It passes through a QML
  `TextInput` and the JavaScript heap, which can't be wiped. The field is
  cleared right after answering, as in the original agent.
- **Whether the key is actually touched.** The dialog only reflects what PAM
  reports; pam_u2f does the verification.

## Hardening in place

- Every change from Omarchy's agent is small and listed by
  `just diff-upstream`.
- The helpers in `plugin/PolkitModel.js` are covered by unit tests, and
  they run in CI.
- CodeQL, OpenSSF Scorecard and Dependabot (for the SHA-pinned actions)
  run on the repository.
- `main` only takes squash-merged pull requests with signed commits and
  passing checks.
