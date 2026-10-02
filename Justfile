set shell := ["bash", "-uc"]

plugin_link := env("HOME") / ".config/omarchy/plugins/lbssousa.polkit"

default:
    @just --list

# Unit tests for the pure helpers in PolkitModel.js.
test:
    node --test tests/
    omarchy-plugin-validate plugin

# Load this checkout's agent in the real shell. Enabling a clone of
# omarchy.polkit disables the built-in one; the shell is restarted because a
# keepLoaded service doesn't reload when its files change.
link:
    ln -sfn "$PWD/plugin" {{plugin_link}}
    omarchy-shell shell rescanPlugins >/dev/null
    omarchy-plugin-enable lbssousa.polkit
    omarchy-restart-shell

# Go back to Omarchy's own agent.
unlink:
    omarchy-plugin-disable lbssousa.polkit
    rm -f {{plugin_link}}
    omarchy-restart-shell

# Show what this agent changes relative to the installed Omarchy one.
diff-upstream:
    -diff -u /usr/share/omarchy/shell/plugins/polkit/PolkitModel.js plugin/PolkitModel.js
    -diff -u /usr/share/omarchy/shell/plugins/polkit/PolkitAgent.qml plugin/PolkitAgent.qml
