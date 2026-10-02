# Omarchy's polkit agent, as it was

Unmodified copies of `shell/plugins/polkit/` from **Omarchy 4.0.4**
(`pacman -Q omarchy`), which `plugin/` is based on. Omarchy is MIT licensed,
like this project.

This is the base for reviewing and for updating:

- `just diff-base` shows exactly what this plugin changes. The same diff is
  in every CI run's summary.
- To move to a newer Omarchy, copy its files here, then merge them into
  `plugin/` with the old copies as the base, for example
  `git merge-file plugin/PolkitAgent.qml upstream/PolkitAgent.qml newer/PolkitAgent.qml`
  with the files arranged as that command expects (ours, base, theirs).
  Update the version above.

Nothing here is loaded by the shell.
