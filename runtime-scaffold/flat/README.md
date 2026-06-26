# Flat RuntimeScaffold command

Run the watched flat pathway from the repository root:

```bash
npm run scaffold:flat:watch -- runtime-scaffold/flat/command.json
```

The watcher runs immediately, then runs again whenever `command.json` is touched or replaced.
The command file selects the active config. The config loads the canonical TenantProcess module,
provides Task input and initial state, and writes each generated Run under `runtime-data/runs/`.

RuntimeScaffold does not inspect or rewrite artifact references inside initial state. Initial state is
passed to activation and Stream execution unchanged. A Flow resolves a reference explicitly:

```ts
const artifactRef = ctx.state.get({ path: ['workEntryRef'] });
if (typeof artifactRef !== 'string' || artifactRef.length === 0) {
  return ctx.fail({ reason: 'workEntryRef is required' });
}

const artifact = await ctx.artifact.resolve({
  ref: artifactRef,
  format: 'json',
});

if (artifact.status !== 'succeeded') {
  return ctx.fail({ reason: artifact.reason });
}

ctx.change.set({
  path: ['workEntryId'],
  value: artifact.value.artifactId,
});
```

Relative references are resolved from the active config file's directory. Resolution copies the
source into the Run artifact store and returns its runtime artifact record. The Flow decides when to
resolve it and how the resulting artifact ID affects state.
