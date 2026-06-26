# Flat RuntimeScaffold command

Run the watched flat pathway from the repository root:

```bash
npm run scaffold:flat:watch -- runtime-scaffold/flat/command.json
```

The watcher runs immediately, then runs again whenever `command.json` is touched or replaced.
The command file selects the active config. The config loads the canonical TenantProcess module,
provides Task input and initial state, and writes each generated Run under `runtime-data/runs/`.

An initial-state artifact marker has this shape:

```json
{
  "$artifact": {
    "ref": "../artifacts/work-entry.json",
    "format": "json",
    "select": "artifactId"
  }
}
```

The source is copied into the Run artifact store before activation. The marker is replaced with the
new runtime `artifactId`. `select` may also be `record` or `content`.
