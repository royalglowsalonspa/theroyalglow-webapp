# ltm/ — Local Long-Term Memory

Project-local memory managed by ltm-power.

## Commit policy: repo-portable tooling, local-private memory

**Commit:** `ltm/bin/ltm.py`, `ltm/config.json`, `ltm/manifest.json`, this README.
**Do NOT commit:** `ltm/store/`, `ltm/runtime/`, `ltm/reports/`, `ltm/snapshots/`.

If the hook uses an absolute path, review `.kiro/hooks/ltm-postturn-capture.json` (or `.kiro/hooks/ltm-postturn-capture.kiro.hook` on older Kiro versions) before committing.

## Commands

Read `python_cmd` from `ltm/config.json`.

- `<python_cmd> ltm/bin/ltm.py files --limit 10`
- `<python_cmd> ltm/bin/ltm.py health`
- `<python_cmd> ltm/bin/ltm.py checkpoint --summary "..."`
- `<python_cmd> ltm/bin/ltm.py validate`
- `<python_cmd> ltm/bin/ltm.py repair`
- `<python_cmd> ltm/bin/ltm.py purge-last --confirm`
- `<python_cmd> ltm/bin/ltm.py purge-all --confirm`
- `<python_cmd> ltm/bin/ltm.py teardown --confirm`
