#!/usr/bin/env bash

set -euo pipefail

# --- CONFIG ---

# Base path where all relative paths are resolved
BASE_PATH="/data/titan/ActiveProjects/ActiveProjects/TaskStream"
# docs/System/Modules/index.md

# Root path inside the zip (defines how paths appear in archive)
ZIP_ROOT="$BASE_PATH"

# Output zip file (script decides location)
OUTPUT_ZIP="$(dirname "$0")/LeadDevFirstVertical.zip"

# Entries:
# - Normal entries = include
# - Entries starting with '-' = exclusion
INCLUDE_PATHS=(
  ""
    
  "docs/System/Modules/**"
  "docs/development/TaskLog.md"
  "docs/development/UseCases.md"
  "docs/System/Schemas/DB/PrismaDefinition.md"
  "docs/System/Architecture/**"
  "docs/AgentProtocol/LeadDev.md"
  "docs/AgentProtocol/TicketFormat.md"
  "docs/AgentProtocol/DevelopmentRoles.md"
  "docs/development/phases/FirstVertical/FirstVertical.md"


)

##
#INCLUDE_PATHS=(
#  "docs/System/Modules/**"
#  "package.json"
#  "config/*.json"
#  "scripts/*.sh"
#  "-src/**/*.test.ts"
#  "-config/dev/*.json"
#)
###

# --- EXECUTION ---

shopt -s globstar nullglob

cd "$ZIP_ROOT"

INCLUDE_FILES=()
EXCLUDE_FILES=()

for pattern in "${INCLUDE_PATHS[@]}"; do
  if [[ "$pattern" == -* ]]; then
    clean_pattern="${pattern:1}"
    matches=( $clean_pattern )
    for f in "${matches[@]}"; do
      [[ -e "$f" ]] && EXCLUDE_FILES+=("$f")
    done
  else
    matches=( $pattern )
    for f in "${matches[@]}"; do
      [[ -e "$f" ]] && INCLUDE_FILES+=("$f")
    done
  fi
done

# Deduplicate includes
mapfile -t UNIQUE_INCLUDES < <(printf "%s\n" "${INCLUDE_FILES[@]}" | sort -u)

# Deduplicate excludes
mapfile -t UNIQUE_EXCLUDES < <(printf "%s\n" "${EXCLUDE_FILES[@]}" | sort -u)

# Filter excludes from includes
FINAL_FILES=()
for f in "${UNIQUE_INCLUDES[@]}"; do
  skip=false
  for ex in "${UNIQUE_EXCLUDES[@]}"; do
    if [[ "$f" == "$ex" ]]; then
      skip=true
      break
    fi
  done
  [[ "$skip" == false ]] && FINAL_FILES+=("$f")
done

# Fail if empty
if [ ${#FINAL_FILES[@]} -eq 0 ]; then
  echo "No files matched after exclusions."
  exit 1
fi

# Debug
printf "Final files:\n%s\n" "${FINAL_FILES[@]}"

# Create zip
zip -r "$OUTPUT_ZIP" "${FINAL_FILES[@]}"

echo "Created: $OUTPUT_ZIP"
