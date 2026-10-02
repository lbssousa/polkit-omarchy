# Contributing to polkit-omarchy

Thanks for helping. This plugin draws the dialog where a password or a
security key authorizes a privileged action, so changes are held to a few
firm rules.

## Reporting bugs and asking for features

- **Bugs and feature requests:** open a
  [GitHub issue](https://github.com/lbssousa/polkit-omarchy/issues).
  Include your Omarchy version (`pacman -Q omarchy`), the PAM line for
  pam_u2f (`/etc/pam.d/polkit-1`), what you did, what you expected, and what
  happened.
- **Security vulnerabilities:** **never** report them in a public issue.
  Follow [SECURITY.md](SECURITY.md) and use GitHub's private vulnerability
  reporting.

## Making a change

1. Fork the repository and create a branch from `main`.
2. Make your change. Keep it focused: one topic per pull request.
3. **Add or update tests.** New behavior needs tests that exercise it, and a
   bug fix needs a test that fails without the fix. The helpers in
   `plugin/PolkitModel.js` are tested in `tests/` with Node's built-in test
   runner; `tests/manifest.test.js` guards the manifest and how the QML uses
   the helpers.
4. Run the checks:
   ```sh
   just test    # node tests, and `omarchy plugin validate` on the plugin
   ```
   If you touch the QML, also try it in the real shell: `just link`, then
   `pkexec true` (and `just unlink` to go back).
5. **Sign your commits** (`git commit -S`). `main` only accepts signed
   commits.
6. Open a pull request against `main` that says what changed and why, and
   add an entry under "Unreleased" in [CHANGELOG.md](CHANGELOG.md) if users
   can see the difference.

## What gets merged

`main` is protected. A pull request can only be merged, and only as a squash
merge, when `test`, CodeQL's `analyze` jobs pass and the branch is up to date
with `main`.

### Rules for the code

- **Never hide a password prompt.** When PAM asks for a response
  (`responseRequired`), the password field is what the user sees. Any new
  state that replaces the field must be decided in `PolkitModel.js` and
  covered by the invariants in `tests/modes.test.js`, not in a QML binding.
- **Stay close to Omarchy's agent.** The smaller the diff against
  `upstream/`, the easier it is to review and to follow Omarchy's updates.
  Check it with `just diff-base`.
- **No new capabilities, no runtime dependencies,** and nothing that runs
  outside omarchy-shell.
- **Text from outside** (the polkit action's message, PAM's prompts) is
  rendered as `Text.PlainText`.

## Releases

Releases are GPG-signed tags made by the maintainer.

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).
