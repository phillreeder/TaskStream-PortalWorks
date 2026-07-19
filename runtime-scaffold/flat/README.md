# Flat RuntimeScaffold command

Run the included example once from the repository root:

```bash
npm run scaffold:flat
```

Run it with an explicit command file:

```bash
npm run scaffold:flat -- runtime-scaffold/flat/command.json
```

Watch the command file and run again whenever it is touched or replaced:

```bash
npm run scaffold:flat:watch -- runtime-scaffold/flat/command.json
```

The reusable CLI lives at `scripts/run-flat-scaffold.ts`; run it with `--help` for all examples.
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

## Generic browser-enabled flat Tasks

A `flatTask` config may declare a generic `web` section. The selected STO must independently declare a `browser-stream` requirement; a Flow cannot acquire browser resources merely because the config contains browser options.

The scaffold supplies `ctx.web.navigate()` and `ctx.web.capture()`. Capture is platform-neutral and can emit a JPEG, visible text, bounded page structure, text-anchored local structure, metadata, manifest, and a ZIP. Portal-specific URLs, anchor text, depth choices, and state transitions remain TenantProcess inputs and Flow logic.

The active command currently runs the documented LinkedIn mission step in:

`Tenants/TaskStream/TenantProcess/SalesPipeline1/steps/001-linkedin-landing-evidence.md`

## Failure transfer archive

When a `flatTask` Run returns `failed` or `blocked`, the scaffold now creates one generic transfer archive under the Run `exports/` directory. The archive is also listed in the CLI `evidenceArchives` output and contains:

- `run.json`, cycle, Stream, state, artifact, and trace files already produced;
- any partial portal evidence captured before the failure;
- the selected command and config snapshots;
- `diagnostics/failure-summary.json` with the surfaced reason and per-Stream status.

The CLI prints `reason` directly as well. This packaging is scaffold behavior; it does not interpret portal state or introduce TenantProcess-specific recovery rules.
