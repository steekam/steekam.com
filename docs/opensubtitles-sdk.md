# OpenSubtitles SDK

Small, server-only TypeScript client for the OpenSubtitles.com REST API. Its pacing, concurrency, retry, timeout, and jitter primitives live in [src/lib/resilience.ts](../src/lib/resilience.ts) so future experiment builds can reuse them.

The checked-in contract is [docs/vendor/opensubtitles.openapi.json](./vendor/opensubtitles.openapi.json), downloaded from the official Stoplight export endpoint. The client currently covers the thin path needed by The Lasso Way:

1. authenticate with `POST /login`;
2. search episode subtitles with `GET /subtitles`;
3. request a temporary link with `POST /download`;
4. save the UTF-8 subtitle file locally.

## Secret handling

The client reads `OPEN_SUBTITLES_API_KEY` from the process environment. Run the CLI through Varlock so `.env.local` stays out of shell history and logs:

```sh
npm run opensubtitles -- search --query "Ted Lasso" --season 1 --episode 1 --languages en
```

Optional login credentials use `OPEN_SUBTITLES_USERNAME` and `OPEN_SUBTITLES_PASSWORD`, or an existing short-lived `OPEN_SUBTITLES_TOKEN`. The token is valid for about 12 hours; prefer username/password for a one-process run. Do not put any of these values in tracked files.

## CLI

```sh
npm run opensubtitles -- login
npm run opensubtitles -- search --query "Ted Lasso" --season 1 --episode 1 --languages en
npm run opensubtitles -- download --file-id 123456 --output data/transcripts/S01E01.srt
```

The API key and user agent are sent on every request. `OPEN_SUBTITLES_POLICY` keeps separate budgets: searches allow four in-flight requests with 300ms spacing and 15-second timeouts; download-link POSTs allow one request with one-second spacing and no retries; temporary file GETs allow one request with 250ms spacing, 30-second timeouts, and two retries. Login is throttled to the documented one request per second, 10 per minute, and 30 per hour; failed credential responses are never retried. GET retries use bounded exponential backoff with jitter and honor `Retry-After`. Download POSTs never auto-retry because a timeout can still consume quota. Once the API reports zero remaining downloads, the client blocks later download attempts locally until reset. Download links are temporary and are never cached. Identical subtitle searches are cached for the client lifetime.

### Recommended batch policy

For transcript harvesting, treat search, link generation, and file retrieval as separate operations. The client applies these per-operation policies directly:

```ts
export const OPEN_SUBTITLES_POLICY = {
  search: {
    maxConcurrentRequests: 4,
    requestIntervalMs: 300,
    timeoutMs: 15_000,
    maxRetries: 2,
  },
  downloadRequest: {
    maxConcurrentRequests: 1,
    requestIntervalMs: 1_000,
    timeoutMs: 20_000,
    maxRetries: 0,
  },
  downloadFile: {
    maxConcurrentRequests: 1,
    requestIntervalMs: 250,
    timeoutMs: 30_000,
    maxRetries: 2,
  },
  login: {
    maxConcurrentRequests: 1,
    requestIntervalMs: 1_000,
    timeoutMs: 20_000,
    maxRetries: 0,
    maxPerSecond: 1,
    maxPerMinute: 10,
    maxPerHour: 30,
  },
} as const;
```

Searches do not spend subtitle-download quota, but they are not unbounded: keep autocomplete below 40 requests per 10 seconds, send sorted parameters, and honor server rate-limit headers. The `POST /download` call consumes quota and must not be retried. The generated temporary file URL is served separately; do not cache it, and pace file GETs independently. Stop when the response reports zero remaining downloads.

The 300ms search and 250ms file-fetch spacings are this experiment’s operational defaults, not universal guarantees. Prefer response headers and `Retry-After` when the service provides them. The download-link POST remains serialized because it spends account quota.

The client also rejects a download before making a request when no login JWT is available, when `fileId` is invalid, or when only one FPS conversion boundary is supplied. Subtitle conversions must provide both input and output FPS values.

The search mapping follows the API guidance: use IDs when available, send the parent show ID plus season and episode for TV episodes, sort language lists, and omit empty/default query parameters.

References:

- [OpenSubtitles REST API getting started](https://opensubtitles.stoplight.io/docs/opensubtitles-api/e3750fd63a100-getting-started)
- [OpenSubtitles API OpenAPI export](https://stoplight.io/api/v1/projects/opensubtitles/opensubtitles-api/nodes/open_api.json)
- [OpenSubtitles Help Center: Getting Started](https://opensubtitles.tawk.help/article/getting-started)
- [OpenSubtitles staff clarification on API and file-serving limits](https://forum.opensubtitles.com/t/download-rate-limit/6415)

## Programmatic usage

```ts
import { createOpenSubtitlesClient } from '../src/lib/opensubtitles.ts';

const client = createOpenSubtitlesClient();
const search = await client.searchSubtitles({
  query: 'Ted Lasso',
  seasonNumber: 1,
  episodeNumber: 1,
  languages: ['en'],
});

const fileId = search.data[0]?.attributes.files?.[0]?.fileId;
if (!fileId) throw new Error('No subtitle file found.');

await client.downloadSubtitle({
  fileId,
  outputPath: 'data/transcripts/S01E01.srt',
});
```

The SDK exports request and response types, `OpenSubtitlesError`, and dependency injection points for deterministic tests.

## Transcript harvest

The resumable Ted Lasso harvester has two stages. It searches by the parent IMDb ID, season, and episode. By default it targets every season in `manifest.json`; pass `--seasons` to choose explicitly. Probe workers run in parallel while the SDK applies the search policy:

```sh
npm run lasso:transcripts -- --stage probe --seasons 1,2,3
```

The probe stage writes ranked candidates and the selected file to `data/transcripts/harvest-state.json`. It does not spend download quota. The download stage reads that state and writes selected English subtitles into `data/transcripts/`. Its quota-consuming POST and temporary file GET use separate policies, allowing safe pipeline overlap while each operation remains bounded:

```sh
npm run lasso:transcripts -- --stage download --seasons 1,2,3
npm run lasso:quotes -- --seasons 1,2,3
```

The selection prefers movie-hash matches, exact episode metadata, original subtitles, trusted sources, and HD files, then filters to English. State is checkpointed after each transition. Temporary download links stay in memory only; after the quota-consuming POST, the state records `downloading` without the link. File-fetch failures become `ambiguous` and will not spend quota again automatically. Quota exhaustion becomes `quota-blocked` with the server reset time; later runs resume it after reset, while `--force` overrides the wait. File writes use a temporary path and atomic rename. Every run writes append-only canonical JSONL events to `data/transcripts/logs/`, including service, run/trace/span IDs, stage, episode, status, duration, error, and quota fields. `--probe-workers` defaults to 4 and `--download-workers` defaults to 2; the SDK policy gates the actual API operations. The default parent IMDb ID is `10986410`; override it with `--parent-imdb-id` when reusing the harvester for another show.
