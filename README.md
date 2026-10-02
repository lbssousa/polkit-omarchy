# polkit-omarchy

[![ci](https://github.com/lbssousa/polkit-omarchy/actions/workflows/ci.yml/badge.svg)](https://github.com/lbssousa/polkit-omarchy/actions/workflows/ci.yml)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/lbssousa/polkit-omarchy/badge)](https://scorecard.dev/viewer/?uri=github.com/lbssousa/polkit-omarchy)

Omarchy's polkit agent (`omarchy.polkit`) with support for FIDO security
keys through **pam_u2f**.

With `auth sufficient pam_u2f.so cue …` in `/etc/pam.d/polkit-1`, PAM
doesn't ask for anything while it waits for the key to be touched. It at
most sends an info message ("Please touch the device."). The stock agent
doesn't show that message and keeps a password field on screen whose Enter
does nothing. This agent shows a pulsing key and **Touch your security key**
instead, the same way the stock agent shows the fingerprint sensor for
pam_fprintd:

- **Security key mode** is used while PAM waits without asking for a response
  and either the info message looks like a touch request (`cue`, or a custom
  `cue_prompt`), or pam_u2f is in the stack and comes before pam_fprintd (or
  the fingerprint reader is unavailable).
- When pam_u2f gives up (no key plugged in, timeout), pam_unix asks for the
  password and the dialog switches to the password field by itself.
- With `pinverification=1`, pam_u2f asks "Please enter the PIN:", and the
  field shows that prompt instead of "Enter password".
- Escape cancels, as before.

It only reacts to polkit authentications. Browser WebAuthn, ssh and gpg
touches are not its business. For ssh, see
[ssh-askpass-omarchy](https://github.com/lbssousa/ssh-askpass-omarchy).

## How it replaces the stock agent

The manifest declares `"omarchy": { "clonedFrom": "omarchy.polkit" }`, the
same thing `omarchy plugin clone` writes. The shell therefore:

- grants it the built-in's `authentication` capability (third-party plugins
  don't get it otherwise);
- disables `omarchy.polkit` when this plugin is enabled, and re-enables it
  when this plugin is disabled or removed.

Only one polkit agent can be registered per session, so this matters.

## Upstream

Based on `shell/plugins/polkit/` from **Omarchy 4.0.4**. `just diff-upstream`
shows the changes against the installed Omarchy. That diff is what goes to
the upstream pull request. Once Omarchy ships it, run `just unlink` and
retire this project.

## Install

You need Omarchy 4 with omarchy-shell, and a security key set up with
pam_u2f for polkit, for example a line like this in `/etc/pam.d/polkit-1`
(`cue` makes PAM print the touch request):

```
auth      sufficient pam_u2f.so cue authfile=/etc/fido2/fido2
```

Then, from a checkout of this repository:

```sh
git clone https://github.com/lbssousa/polkit-omarchy.git
cd polkit-omarchy
just link
```

`just link` symlinks `plugin/` into `~/.config/omarchy/plugins`, enables
the plugin (which disables `omarchy.polkit`) and restarts the shell. Without
[just](https://just.systems/), the same by hand:

```sh
mkdir -p ~/.config/omarchy/plugins
ln -sfn "$PWD/plugin" ~/.config/omarchy/plugins/lbssousa.polkit
omarchy-shell shell rescanPlugins
omarchy plugin enable lbssousa.polkit
omarchy-restart-shell
```

The shell restart is needed because a `keepLoaded` service isn't reloaded
when its files change. To install it outside your home directory, copy
`plugin/` somewhere (say `/usr/share/polkit-omarchy/plugin`) and link that
instead of the checkout.

Check it with `pkexec true` and the key plugged in: you should see the key
prompt, and touching the key authorizes. To go back to Omarchy's own agent,
run `just unlink` (or `omarchy plugin disable lbssousa.polkit`, then remove
the symlink, then `omarchy-restart-shell`).

## Development

| Recipe | What it does |
|---|---|
| `just test` | Node tests for `PolkitModel.js` and `omarchy plugin validate` |
| `just link` | Installs the checkout's plugin in the real shell (see above) |
| `just unlink` | Back to `omarchy.polkit` |
| `just diff-upstream` | Diff against the installed Omarchy agent |

## Releases

`main` only takes squash-merged pull requests, which GitHub signs with its
own key. A release is therefore a **GPG-signed tag** made by the maintainer
on the merged commit. Check one with `git verify-tag vX.Y.Z` after
importing the maintainer's public key.

1. Open a PR that bumps the version in `plugin/manifest.json`.
   The same PR turns the "Unreleased" section of
   [CHANGELOG.md](CHANGELOG.md) into the new version's release notes.
   Merge it.
2. Tag the merge commit and push the tag:
   ```sh
   git switch main && git pull
   git tag -s vX.Y.Z -m "polkit-omarchy X.Y.Z"
   git push origin vX.Y.Z
   ```

## Security

See [SECURITY.md](SECURITY.md) for the threat model and how to report a
vulnerability, and [CONTRIBUTING.md](CONTRIBUTING.md) if you want to change
something.

## License

[MIT](LICENSE), like Omarchy.
