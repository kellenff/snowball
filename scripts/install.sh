#!/usr/bin/env bash
#
# install.sh — Install Snowball into a single provider, walking through the
# steps documented in the README's Setup section. Pass the provider name
# as the first argument.
#
# Usage:
#   install.sh <provider> [options]
#
# Providers (named exactly as the README uses them):
#   claude-code   Register a local marketplace and install the plugin.
#   opencode      Print the OpenCode-specific pointer (auto-registers).
#   cursor        Print the Cursor manifest pointer.
#   codex         Run the (currently stale) Codex sync script.
#   gemini        Print the Gemini extension manifest pointer.
#   copilot       Print the Copilot CLI pointer (shares Claude manifest).
#   duo           Run scripts/install-into-project.sh (GitLab Duo CLI).
#   aider         Run scripts/install-into-project.sh (Aider).
#   junie         Print the Junie IDE plugin pointer.
#   junie-cli     Print the Junie CLI marketplace pointer.
#   vtcode        Symlink skills and bootstrap mirror into a project.
#
# Options (provider-specific; see --help):
#   --target DIR       Project directory (defaults to $PWD).
#   --clone-root DIR   Snowball clone (defaults: this script's parent).
#   --force            Overwrite existing files / symlinks (vtcode, duo, aider).
#   --uninstall        Reverse the install (vtcode, duo, aider).
#   -h, --help         Show this help.
#
# Notes:
#   - This script does not clone Snowball for you. Clone it first
#     (README: `git clone https://github.com/kellenff/snowball.git`).
#   - Claude Code, Cursor, Codex, Gemini, Copilot, Junie IDE, and Junie CLI
#     need to be installed from inside their own host application; this
#     script prints the exact commands rather than shelling into a closed
#     binary, because there is no stable CLI for those flows.
#
set -euo pipefail

# --- resolve script and snowball paths (follow symlinks) ---

resolve_script_dir() {
  local src="${BASH_SOURCE[0]}"
  while [ -L "$src" ]; do
    local dir
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ $src != /* ]] && src="$dir/$src"
  done
  cd -P "$(dirname "$src")" && pwd
}

SCRIPT_DIR="$(resolve_script_dir)"
SNOWBALL_ROOT_DEFAULT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- help ---

usage() {
  sed -n '3,40p' "$0" | sed 's/^# \{0,1\}//'
}

# --- arg parsing ---

provider=""
target=""
clone_root="$SNOWBALL_ROOT_DEFAULT"
force=0
uninstall=0

while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    --target)
      shift
      target="${1:-}"
      [ -n "$target" ] || {
        echo "error: --target requires a path" >&2
        exit 2
      }
      ;;
    --clone-root)
      shift
      clone_root="${1:-}"
      [ -n "$clone_root" ] || {
        echo "error: --clone-root requires a path" >&2
        exit 2
      }
      ;;
    --force) force=1 ;;
    --uninstall) uninstall=1 ;;
    --)
      shift
      target="${1:-}"
      break
      ;;
    -*)
      echo "error: unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      if [ -z "$provider" ]; then
        provider="$1"
      else
        echo "error: unexpected positional argument: $1" >&2
        usage >&2
        exit 2
      fi
      ;;
  esac
  shift
done

if [ -z "$provider" ]; then
  usage >&2
  echo "error: provider is required (e.g. claude-code, vtcode, duo)" >&2
  exit 2
fi

# Normalize aliases the README uses informally.
case "$provider" in
  claude) provider="claude-code" ;;
  junie-ide) provider="junie" ;;
esac

if [ ! -d "$clone_root" ]; then
  echo "error: --clone-root does not exist: $clone_root" >&2
  exit 1
fi
clone_root="$(cd "$clone_root" && pwd)"

# Providers whose install happens entirely inside a host app. These
# have no shell-automatable step, so we print the README's exact commands.
print_pointer() {
  local title="$1"
  shift
  echo "Snowball install for: $title"
  echo "Snowball clone:       $clone_root"
  echo
  printf '%s\n' "$@"
  echo
  echo "Verify after running the above:"
  echo "  - Open a fresh session in the host app."
  echo "  - The 'using-snowball' skill should be injected at session start."
}

install_claude_code() {
  print_pointer "Claude Code" \
    "Run these from inside Claude Code (not from this shell):" \
    "    /plugin marketplace add $clone_root" \
    "    /plugin install snowball@snowball-dev" \
    "    /reload-plugins" \
    "" \
    "The marketplace name 'snowball-dev' is set in .claude-plugin/marketplace.json." \
    "The SessionStart hook in hooks/hooks.json fires on every /clear and /compact too."
}

install_opencode() {
  print_pointer "OpenCode" \
    "No manual symlink is needed — the plugin auto-registers its skills path." \
    "See docs/README.opencode.md for harness-specific notes." \
    "" \
    "If skills aren't picked up, point OpenCode at the clone:" \
    "    ln -sfn $clone_root/skills ~/.config/opencode/skills/snowball"
}

install_cursor() {
  print_pointer "Cursor" \
    "From inside Cursor, follow Cursor's plugin docs and point it at:" \
    "    $clone_root/.cursor-plugin/plugin.json" \
    "" \
    "Decision-spine hooks (AskQuestion capture) require Cursor's hook rail." \
    "See hooks/hooks-cursor.json for the registered hook set."
}

install_codex() {
  if [ "$uninstall" -eq 1 ] || [ "$force" -eq 1 ] || [ -n "$target" ]; then
    echo "error: codex install does not accept --target, --force, or --uninstall" >&2
    exit 2
  fi
  echo "Snowball install for: Codex CLI / Codex App"
  echo "Snowball clone:       $clone_root"
  echo
  echo "WARNING: scripts/sync-to-codex-plugin.sh is currently stale (README: it"
  echo "points at a non-existent fork marketplace). Run it anyway to inspect:"
  echo
  echo "    $clone_root/scripts/sync-to-codex-plugin.sh"
  echo
  echo "Until the sync path is reconciled, follow Codex's plugin docs and"
  echo "point at the manifest directly:"
  echo "    $clone_root/.codex-plugin/plugin.json"
}

install_gemini() {
  print_pointer "Gemini CLI" \
    "Follow Gemini's extension docs and point at:" \
    "    $clone_root/gemini-extension.json" \
    "" \
    "Skills activate via activate_skill; see GEMINI.md in the clone." \
    "Harness-specific context is in GEMINI.md."
}

install_copilot() {
  print_pointer "GitHub Copilot CLI" \
    "Copilot CLI shares .claude-plugin/plugin.json with Claude Code." \
    "Bootstrap detects COPILOT_CLI=1 and emits SDK-standard JSON." \
    "" \
    "Follow Copilot CLI's plugin docs, pointing at:" \
    "    $clone_root/.claude-plugin/plugin.json"
}

# duo and aider both delegate to install-into-project.sh, which already
# handles both providers. Forward the target/force/uninstall flags.
delegate_into_project() {
  local title="$1"
  echo "Snowball install for: $title"
  echo "Snowball clone:       $clone_root"
  echo "Target project:       ${target:-$PWD}"
  echo

  local -a cmd=("$clone_root/scripts/install-into-project.sh")
  [ "$force" -eq 1 ] && cmd+=(--force)
  [ "$uninstall" -eq 1 ] && cmd+=(--uninstall)

  if [ -n "$target" ]; then
    cmd+=("$target")
  fi

  echo "Running: ${cmd[*]}"
  echo
  exec "${cmd[@]}"
}

install_duo() {
  delegate_into_project "GitLab Duo (CLI)"
}

install_aider() {
  delegate_into_project "Aider"
}

install_junie() {
  print_pointer "Junie (JetBrains IDE plugin)" \
    "In the IDE, install the local extension pointing at:" \
    "    $clone_root/extensions/snowball/" \
    "" \
    "mcp/mcp.json points at ../snowball-capture/run.cjs which resolves the" \
    "server's path at start time — no manual edit needed for snowball-capture." \
    "The 'argdown' and 'codebase-memory' MCP entries still need their" \
    "<absolute-path-to-*> placeholders replaced with real absolute paths." \
    "" \
    "Restart the IDE so Junie picks up the wiring. The .junie/AGENTS.md is" \
    "read automatically as project guidelines."
}

install_junie_cli() {
  print_pointer "Junie CLI" \
    "In any project, in a Junie CLI session:" \
    "    /extensions marketplace add https://github.com/kellenff/snowball" \
    "    /extensions install snowball" \
    "" \
    "Extension content is cached under ~/.junie/extensions/; no project" \
    "files are modified." \
    "" \
    "After install, snowball-capture / argdown / codebase-memory should" \
    "appear as Active in /mcp. For adapters that don't resolve relative" \
    "paths, run once:" \
    "    node $clone_root/extensions/snowball/scripts/install-path-fix.cjs"
}

# vtcode: the only provider whose install is fully shell-scriptable end-to-end.
# Mirrors the README's VTCode block: symlink skills into ~/.agents/skills/,
# symlink the bootstrap mirror + hooks.toml into the target project, and
# leave the absolute-path placeholder substitution for the operator.
install_vtcode() {
  target="${target:-$PWD}"
  if [ ! -d "$target" ]; then
    echo "error: target directory does not exist: $target" >&2
    exit 1
  fi
  target="$(cd "$target" && pwd)"

  echo "Snowball install for: VTCode"
  echo "Snowball clone:       $clone_root"
  echo "Target project:       $target"
  echo

  if [ "$uninstall" -eq 1 ]; then
    # Remove only Snowball symlinks we created; leave other content alone.
    if [ -L "$target/AGENTS.md" ]; then
      link="$(readlink "$target/AGENTS.md")"
      case "$link" in
        "$clone_root/.vtcode/AGENTS.md" | "$clone_root/.vtcode/AGENTS.md/")
          rm -f "$target/AGENTS.md"
          echo "  removed AGENTS.md symlink"
          ;;
        *) echo "  preserving AGENTS.md (symlink to non-Snowball target)" ;;
      esac
    fi
    if [ -L "$target/.vtcode/hooks.toml" ]; then
      link="$(readlink "$target/.vtcode/hooks.toml")"
      case "$link" in
        "$clone_root/.vtcode/hooks.toml" | "$clone_root/.vtcode/hooks.toml/")
          rm -f "$target/.vtcode/hooks.toml"
          echo "  removed .vtcode/hooks.toml symlink"
          ;;
        *) echo "  preserving .vtcode/hooks.toml (symlink to non-Snowball target)" ;;
      esac
    fi
    if rmdir "$target/.vtcode" 2>/dev/null; then
      echo "  removed empty .vtcode/"
    fi
    echo
    echo "Done. User-scope skills (~/.agents/skills/) are not touched; remove"
    echo "Snowball symlinks manually if needed:"
    echo "    rm -f ~/.agents/skills/<snowball-skill>"
    return
  fi

  # 1. Skills into ~/.agents/skills/ (user-scope discovery).
  local skills_dst="$HOME/.agents/skills"
  mkdir -p "$skills_dst"
  local copied=0
  for skill in "$clone_root/skills"/*/; do
    [ -d "$skill" ] || continue
    local name
    name="$(basename "$skill")"
    if [ -e "$skills_dst/$name" ] && [ "$force" -ne 1 ]; then
      echo "  preserving existing ~/$skills_dst/$name (re-run with --force to replace)"
      continue
    fi
    ln -sfn "$skill" "$skills_dst/$name"
    copied=$((copied + 1))
  done
  echo "  linked $copied skill(s) into $skills_dst/"

  # 2. Bootstrap mirror as the project's AGENTS.md.
  mkdir -p "$target/.vtcode"
  if [ -e "$target/AGENTS.md" ] && [ ! -L "$target/AGENTS.md" ] && [ "$force" -ne 1 ]; then
    echo "  preserving existing $target/AGENTS.md (re-run with --force to replace)"
  else
    ln -sfn "$clone_root/.vtcode/AGENTS.md" "$target/AGENTS.md"
    echo "  linked $target/AGENTS.md -> $clone_root/.vtcode/AGENTS.md"
  fi

  # 3. Hooks config.
  ln -sfn "$clone_root/.vtcode/hooks.toml" "$target/.vtcode/hooks.toml"
  echo "  linked $target/.vtcode/hooks.toml -> $clone_root/.vtcode/hooks.toml"

  echo
  echo "Next steps:"
  echo "  1. Edit $target/.vtcode/hooks.toml and replace"
  echo "     /absolute/path/to/snowball with: $clone_root"
  echo "  2. Verify with: vtcode skills list   (all 18 skills should appear)"
  echo "  3. Answer a request_user_input prompt — a MADR should land under"
  echo "     docs/snowball/decisions/ in the target repo."
  echo
  echo "Note: the committed .vtcode/tool-policy.json is a user-environment"
  echo "artifact, not Snowball-managed."
}

# --- dispatch ---

case "$provider" in
  claude-code) install_claude_code ;;
  opencode) install_opencode ;;
  cursor) install_cursor ;;
  codex) install_codex ;;
  gemini) install_gemini ;;
  copilot) install_copilot ;;
  duo | gitlab-duo) install_duo ;;
  aider) install_aider ;;
  junie) install_junie ;;
  junie-cli) install_junie_cli ;;
  vtcode) install_vtcode ;;
  *)
    echo "error: unknown provider: $provider" >&2
    echo "       run with --help to see the list" >&2
    exit 2
    ;;
esac
