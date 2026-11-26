# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Encrypted drives ask for their password in this dialog
  (`omarchy.polkit unlockDrive`, from Omarchy's `omarchy-drive-unlock`).
  Without it, udiskie's prompt reached this plugin, found no such method and
  failed without a word, so no encrypted drive could be unlocked.
- The prompt shows the coding agent it comes from, with the program on a line
  of its own (`omarchy.polkit expect` labels), and names the drive a udisks
  format is for.
- Every pkexec prompt has two lines, like Omarchy's: *Authorize running
  command* (or *Authorize <agent> to run command*, or the caller's reason)
  over the command itself. The command used to be quoted inside the heading
  when nothing labelled it.
- A test that every IPC method of Omarchy's agent exists here.

### Changed

- The dialog closes as soon as authentication succeeds or is cancelled,
  instead of after a short delay.
- Line breaks in a label, an agent name or a command are collapsed to
  spaces, and each line of the label above the card stays one line, clipped
  to the screen, so a multi-line command can no longer overflow it.
- Based on Omarchy's main branch at a30167e (was 4.5.0rc1).

## [0.3.0] - 2026-11-23

### Added
- A fingerprint scan that doesn't work now shows. The sensor glyph and the
  border turn red and the card shakes, as for a wrong password, and the label
  above the card shows pam_fprintd's own message ("Failed to match
  fingerprint", "Swipe was too fast, try again", in your language) for a few
  seconds. The dialog stays on the fingerprint for the next try. After the
  last try, the message stays up while the dialog moves on to the security
  key or the password, saying why. Before, every failed scan looked the same
  as no scan at all. Proposed upstream in omacom/omarchy#19948.

## [0.2.3] - 2026-11-22

### Fixed
- Keyboard focus leaves the password field when the security key prompt
  takes over. The hidden field kept it, so anything typed while waiting for
  the touch went into it, hid the instruction, and was submitted with the
  next password.

## [0.2.2] - 2026-11-02

### Fixed
- The security key card is now sized from the width the instruction takes
  when laid out, not from its font advance, which in some proportional fonts
  fell a pixel short and could cut the instruction off.

## [0.2.1] - 2026-10-24

### Fixed
- With pam_u2f first and a fingerprint reader, a translated pam_fprintd
  message (such as "Placez votre doigt sur le lecteur d'empreintes
  digitales") showed the security key while PAM waited on the reader. While
  the reader is reachable, any message that isn't the key's cue is now the
  reader's.
- A `cue_prompt` set on pam_u2f in `/etc/pam.d/polkit-1` is recognized
  whatever its wording, so it shows the key instead of the fingerprint, and
  after a PIN with `pinverification` it no longer stays on "Checking...".
  Its arguments are split the way Linux-PAM splits them.
- "Touch your security key" was cut off in languages where it is longer,
  such as Portuguese ("Toque na sua chave de segurança"). The dialog now
  widens to fit the translated instruction, up to the screen's width.

These come from the review of the upstream pull request
([omacom/omarchy#16094](https://github.com/omacom/omarchy/pull/16094)).

## [0.2.0] - 2026-10-21

### Added
- The prompt follows the language picked under Setup > Language, like
  Omarchy's own agent. "Touch your security key" and "Enter PIN" come from
  `plugin/i18n/`, which has a catalog for each of Omarchy's 50 languages.
  Apart from English and Portuguese, nobody has reviewed these translations
  yet; corrections are welcome.

### Changed
- Based on Omarchy 4.5.0rc1's agent, which is now required: the texts it
  shares with `omarchy.polkit` come from Omarchy's own translations, and the
  dialog is mirrored for right-to-left languages.
- With `pinverification`, the field shows a translated "Enter PIN" instead of
  pam_u2f's English prompt.

### Fixed
- With `pinverification`, the dialog stayed on "Checking..." after the PIN
  was sent and never said to touch the key. pam_u2f's touch cue now brings
  the security key prompt back.

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
