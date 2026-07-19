# Step 001 — LinkedIn landing evidence

## Mission position

This is the first user-in-the-middle execution step for the LinkedIn connection-request mission.
It establishes the real authenticated browser surface before a later Flow is authorised to locate or use the search control.

## Responsibility split

- **Channel:** reads `phase` and selects either `openLinkedInLanding` or `pauseForEvidenceReview`.
- **STO:** declares the bounded Flow, contracts, and exclusive BrowserStream requirement.
- **Flow:** navigates to the configured LinkedIn landing URL, captures evidence, and advances StreamState to `page_inspected`.
- **RuntimeScaffold:** supplies generic browser resource composition, file persistence, structural capture, screenshot capture, and ZIP packaging.
- **User:** runs the step and returns the emitted ZIP for the next concrete Flow revision.

## Inputs

- persistent browser profile `linkedin-primary`;
- `https://www.linkedin.com/feed/`;
- local structure anchor text `Search`;
- bounded structure depths from the TenantProcess input.

## Outputs

Each Run writes:

- `page.jpg`;
- `page-structure.json`;
- `visible-text.txt`;
- `local-structure.json` when the anchor is found;
- `page-metadata.json`;
- `manifest.json`;
- one evidence ZIP under the Run `exports/` directory.

The Flow writes the ZIP path into `currentPageRef`, sets `phase` to `page_inspected`, and then the pause Flow ends the Stream without another state mutation.

## Run command

From the TaskStream repository root:

```bash
npm run scaffold:flat -- runtime-scaffold/flat/command.json
```

On the first run, sign in manually in the launched persistent browser if LinkedIn requires authentication. Re-run the same command after login; the profile is retained outside any single Run.

If the Run returns `failed` or `blocked`, return the ZIP listed in `evidenceArchives`. The generic scaffold package includes the trace, lifecycle records, command/config snapshots, partial artifacts, and the failure reason so the next patch can address the observed boundary rather than guess.

## Next patch gate

The next Flow change must be based on the returned evidence ZIP. It will replace uncertainty about the search handle with a concrete, verified interaction. No selector is authorised by this step alone.

## Platform findings

1. The flat scaffold previously had no generic `ctx.web` accessor or BrowserStream requirement plumbing.
2. File-backed evidence and ZIP packaging are sufficient for this discovery loop but are not a long-term indexed evidence store.
3. Persistent profile retention is currently the practical authentication bridge; explicit checkpoint persistence remains a later platform concern.
