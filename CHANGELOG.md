# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-10-02

### Added
- The security key prompt: while pam_u2f waits for a touch, the dialog shows
  a pulsing key and "Touch your security key" instead of a password field
  whose Enter did nothing. It falls back to the password field as soon as PAM
  asks for one. With `pinverification`, the field shows pam_u2f's PIN prompt.
- `upstream/`: Omarchy 4.0.4's original agent files, the merge base for
  reviewing and for updating. `just diff-base` shows this plugin's changes,
  and CI puts the same diff in each run's summary.
- A contribution guide, this changelog and a security policy.

### Security
- The fingerprint and security key states are decided in `PolkitModel.js`
  and tested over every combination of the dialog's state: a password prompt
  from PAM is never hidden. Tests also check that the QML uses those
  functions, that the manifest declares no capabilities of its own and that
  the plugin folder holds only plain, non-executable files.
- CI, CodeQL, OpenSSF Scorecard and Dependabot, with `main` protected by a
  ruleset (signed commits, squash-merged pull requests, required checks).
