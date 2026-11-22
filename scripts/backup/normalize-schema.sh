#!/usr/bin/env bash
set -euo pipefail

# These are dump-tool metadata and per-dump psql security tokens. Keep every SQL
# statement so changes to indexes, triggers, constraints and functions differ.
sed -E '/^\\(un)?restrict[[:space:]]/d; /^-- Dumped (from|by) /d'
