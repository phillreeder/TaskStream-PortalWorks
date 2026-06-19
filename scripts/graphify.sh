#!/usr/bin/env bash
set -euo pipefail

if [ "${GRAPHIFY_DEBUG:-}" = "1" ]; then
  set -x
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REAL_SRC="$PROJECT_ROOT/src"
WORK_ROOT="$PROJECT_ROOT/../graphify-work"
WORK_SRC="$WORK_ROOT/src"
GRAPH_OUTPUT_DIR="$WORK_SRC/graphify-out"
REAL_GRAPH_DIR="$WORK_ROOT/graphify-out"
REAL_GRAPH_FILE="$REAL_GRAPH_DIR/graph.json"
LAST_UPDATE_FILE="$REAL_GRAPH_DIR/GRAPHIFY_LAST_GRAPH_UPDATE.md"

sync_source() {
  mkdir -p "$WORK_SRC"

  rsync -a --delete \
    --include='*/' \
    --include='*.ts' \
    --include='*.tsx' \
    --include='*.js' \
    --include='*.jsx' \
    --include='*.json' \
    --exclude='*' \
    "$REAL_SRC/" "$WORK_SRC/"
}

sync_graph_output() {
  if [ -d "$GRAPH_OUTPUT_DIR" ]; then
    mkdir -p "$REAL_GRAPH_DIR"

    rsync -a --delete \
      "$GRAPH_OUTPUT_DIR/" "$REAL_GRAPH_DIR/"

    rm -rf "$GRAPH_OUTPUT_DIR"
  fi
}

write_last_update_file() {
  local updated_at commit graph_summary

  updated_at="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
  commit="$(git -C "$PROJECT_ROOT" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
  graph_summary="$(node -e "const fs=require('fs'); const p=process.argv[1]; const g=JSON.parse(fs.readFileSync(p,'utf8')); const nodes=Array.isArray(g.nodes)?g.nodes.length:'unknown'; const links=Array.isArray(g.links)?g.links.length:(Array.isArray(g.edges)?g.edges.length:'unknown'); const communities=new Set((g.nodes||[]).map((n)=>n.community).filter((v)=>v!==undefined)).size; console.log(nodes + ' nodes, ' + links + ' links, ' + communities + ' communities');" "$REAL_GRAPH_FILE" 2>/dev/null || echo "graph summary unavailable")"

  {
    echo "# GRAPHIFY LAST GRAPH UPDATE"
    echo
    echo "This file is rewritten by scripts/graphify.sh after each successful refresh."
    echo
    echo "- Updated at UTC: $updated_at"
    echo "- Project root: $PROJECT_ROOT"
    echo "- Source root: $REAL_SRC"
    echo "- Graph output: $REAL_GRAPH_DIR"
    echo "- Commit: $commit"
    echo "- Summary: $graph_summary"
    echo
    echo "Agents: check this file before refreshing Graphify. If it is recent enough for the current task and no relevant source files changed after this timestamp, use query/explain/path against the existing graph instead of running another refresh."
  } > "$LAST_UPDATE_FILE"
}

run_in_work_src() {
  (
    cd "$WORK_SRC"
    "$@"
  )
}

run_in_work_root() {
  (
    cd "$WORK_ROOT"
    "$@"
  )
}

build_or_update() {
  if [ -f "$REAL_GRAPH_FILE" ]; then
    graphify update "$WORK_SRC"
  else
    graphify extract "$WORK_SRC"
  fi

  graphify cluster-only "$WORK_SRC"

  sync_graph_output
  write_last_update_file
}

case "${1:-refresh}" in
  refresh)
    sync_source
    build_or_update
    ;;

  query)
    shift
    run_in_work_src graphify query "$*" --graph "$REAL_GRAPH_FILE"
    ;;

  cluster)
    shift
    run_in_work_root graphify cluster-only "${1:-$WORK_SRC}" --graph "$REAL_GRAPH_FILE"
    ;;
  explain)
    shift
    run_in_work_src graphify explain "$*" --graph "$REAL_GRAPH_FILE"
    ;;

  path)
    shift
    run_in_work_src graphify path "$1" "$2" --graph "$REAL_GRAPH_FILE"
    ;;

  open)
    xdg-open "$REAL_GRAPH_DIR/graph.html"
    ;;

  *)
    echo "Usage:"
    echo "  scripts/graphify.sh refresh"
    echo "  scripts/graphify.sh query \"question\""
    echo "  scritps/graphify.sh cluster"
    echo "  scripts/graphify.sh explain \"concept\""
    echo "  scripts/graphify.sh path \"A\" \"B\""
    echo "  scripts/graphify.sh open"
    echo
    echo "Set GRAPHIFY_DEBUG=1 to print shell trace output."
    exit 1
    ;;
esac
