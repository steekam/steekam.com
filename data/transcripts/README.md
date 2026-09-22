# Transcript input

Put licensed or user-supplied Ted Lasso transcript files here. The harness reads `.txt`, `.srt`, and `.vtt` files recursively.

## Source policy

OpenSubtitles is not assumed to be an open-source or redistribution-cleared transcript source. Use it to identify episode or release metadata, or supply a file whose use you are authorized to make. Do not point the harness at a remote subtitle URL; only local, rights-cleared files belong in this folder.

Name files with episode metadata when possible:

```text
S01E01 - Pilot.vtt
S02E03 - Do the Right-est Thing.srt
```

Then run:

```bash
npm run lasso:harness
```

For the current harvest target, S1–S3:

```bash
npm run lasso:transcripts -- --stage probe
npm run lasso:transcripts -- --stage download
npm run lasso:quotes -- --seasons 1,2,3
```

The harvester checkpoints in `harvest-state.json` and appends structured events to `logs/`. Probe workers may run concurrently; the SDK keeps search, download-link, and temporary-file request policies separate. The SDK’s auth, quota, retry, and pacing policy is documented in [`docs/opensubtitles-sdk.md`](../../docs/opensubtitles-sdk.md). Search is quota-free; `POST /download` spends download quota, so the harvester never retries it.

For a completeness check, `manifest.json` contains the 34 expected episodes from S1–S3. Update it if the target seasons change. Its shape is:

```json
[
  { "season": 1, "episode": 1, "episodeTitle": "Pilot" }
]
```

This writes a durable candidate index to `data/lasso-quote-index.json` and a local review queue to `public/data/lasso-review.json`. Existing review status and editorial fields are preserved; approved candidates missing from a later transcript sync stay in the index. The files and generated queue are ignored by Git. The review page runs in the browser; it does not upload transcript text.

After reviewing candidates in the desk, mark approved lines `Keep`, then export the site import bundle:

```bash
npm run lasso:harness -- export
```

The public bundle is written to `public/data/lasso-approved.json` and contains only the approved snippet plus editorial fields and episode metadata. The local audit is written to `data/lasso-approved-audit.json`; it retains context, source paths, ranking, and duplicate provenance for review, but is ignored and never intended for the site.

## Scene anchors

Resolve approved quotes to subtitle timecodes:

```bash
npm run lasso:scenes
```

With local episode videos, capture stills too:

```bash
npm run lasso:scenes -- --video-root /path/to/videos
```

Episode files should include `S01E01`, `S01E02`, and so on in their names. The scene manifest writes exact subtitle start/end times and, when videos are available, stills under `public/images/lasso-scenes/`.
