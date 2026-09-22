import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { OpenSubtitlesAuthenticationError, OpenSubtitlesClient, OpenSubtitlesError, OpenSubtitlesQuotaError, OpenSubtitlesTimeoutError, OpenSubtitlesValidationError } from '../src/lib/opensubtitles.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('OpenSubtitlesClient', () => {
  it('logs in with the required headers and follows the returned API host', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      userAgent: 'The Lasso Way v0.1.0',
      loginCooldownMs: 0,
      requestIntervalMs: 0,
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        return jsonResponse({
          user: { allowed_translations: 5, allowed_downloads: 20, level: 'Sub leecher', user_id: 7, ext_installed: false, vip: false },
          base_url: 'vip-api.opensubtitles.com',
          token: 'jwt-token',
          status: 200,
        });
      },
    });

    const result = await client.login({ username: 'lasso', password: 'secret' });

    assert.equal(result.baseUrl, 'https://vip-api.opensubtitles.com/api/v1');
    assert.equal(result.user.remainingDownloads, undefined);
    assert.equal(requests[0].url, 'https://api.opensubtitles.com/api/v1/login');
    assert.equal((requests[0].init.headers as Record<string, string>)['Api-Key'], 'test-api-key');
    assert.equal((requests[0].init.headers as Record<string, string>)['User-Agent'], 'The Lasso Way v0.1.0');
    assert.equal(requests[0].init.body, JSON.stringify({ username: 'lasso', password: 'secret' }));
  });

  it('maps typed episode search parameters and subtitle files', async () => {
    const requests: Array<{ url: string; init: RequestInit }> = [];
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      requestIntervalMs: 0,
      fetchImpl: async (input, init = {}) => {
        requests.push({ url: String(input), init });
        return jsonResponse({
          total_pages: 1,
          total_count: 1,
          per_page: 50,
          page: 1,
          data: [{
            id: '123',
            type: 'subtitle',
            attributes: {
              language: 'en',
              feature_details: { parent_title: 'Ted Lasso', season_number: 1, episode_number: 1 },
              files: [{ file_id: 456, file_name: 'Ted.Lasso.S01E01.srt' }],
            },
          }],
        });
      },
    });

    const result = await client.searchSubtitles({ query: 'Ted Lasso', parentImdbId: 10986410, seasonNumber: 1, episodeNumber: 1, languages: ['en'] });

    assert.equal(requests[0].url, 'https://api.opensubtitles.com/api/v1/subtitles?episode_number=1&languages=en&parent_imdb_id=10986410&query=Ted+Lasso&season_number=1');
    assert.equal(result.data[0].attributes.files?.[0].fileId, 456);
    assert.equal(result.data[0].attributes.featureDetails?.parentTitle, 'Ted Lasso');
  });

  it('caches identical subtitle searches for the client lifetime', async () => {
    let calls = 0;
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      requestIntervalMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ total_pages: 1, total_count: 0, per_page: 50, page: 1, data: [] });
      },
    });

    await client.searchSubtitles({ parentImdbId: 10986410, seasonNumber: 1, episodeNumber: 1, languages: ['en'] });
    await client.searchSubtitles({ parentImdbId: 10986410, seasonNumber: 1, episodeNumber: 1, languages: ['en'] });

    assert.equal(calls, 1);
  });

  it('requests a temporary link and saves the subtitle bytes', async () => {
    const requests: Array<{ method: string; url: string; authorization?: string }> = [];
    const directory = await mkdtemp(join(tmpdir(), 'lasso-opensubtitles-'));
    temporaryDirectories.push(directory);
    const outputPath = join(directory, 'S01E01.srt');
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      token: 'jwt-token',
      requestIntervalMs: 0,
      fetchImpl: async (input, init = {}) => {
        requests.push({
          method: String(init.method ?? 'GET'),
          url: String(input),
          authorization: (init.headers as Record<string, string> | undefined)?.Authorization,
        });
        if (String(input).endsWith('/download')) return jsonResponse({ link: 'https://dl.opensubtitles.com/temp.srt', file_name: 'temp.srt', requests: 1, remaining: 19, message: '', reset_time: '', reset_time_utc: '' });
        return new Response('1\n00:00:01,000 --> 00:00:02,000\nBelieve.\n', { status: 200 });
      },
    });

    const result = await client.downloadSubtitle({ fileId: 456, outputPath });

    assert.equal(result.outputPath, outputPath);
    assert.equal(await readFile(outputPath, 'utf8'), '1\n00:00:01,000 --> 00:00:02,000\nBelieve.\n');
    assert.deepEqual(requests, [
      { method: 'POST', url: 'https://api.opensubtitles.com/api/v1/download', authorization: 'Bearer jwt-token' },
      { method: 'GET', url: 'https://dl.opensubtitles.com/temp.srt', authorization: undefined },
    ]);
  });

  it('rejects downloads before spending a request without a JWT', async () => {
    let calls = 0;
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      requestIntervalMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });

    await assert.rejects(() => client.requestDownload({ fileId: 456 }), (error: unknown) => error instanceof OpenSubtitlesAuthenticationError);
    assert.equal(calls, 0);
  });

  it('validates download identifiers and paired FPS conversion values before spending a request', async () => {
    let calls = 0;
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      token: 'jwt-token',
      requestIntervalMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({});
      },
    });

    await assert.rejects(() => client.requestDownload({ fileId: 0 }), (error: unknown) => error instanceof OpenSubtitlesValidationError);
    await assert.rejects(() => client.requestDownload({ fileId: 456, inputFps: 23.976 }), (error: unknown) => error instanceof OpenSubtitlesValidationError);
    assert.equal(calls, 0);
  });

  it('does not retry an ambiguous download timeout', async () => {
    let calls = 0;
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      token: 'jwt-token',
      requestIntervalMs: 0,
      timeoutMs: 5,
      maxRetries: 3,
      fetchImpl: async () => {
        calls += 1;
        await new Promise<void>(() => undefined);
        return jsonResponse({});
      },
    });

    await assert.rejects(() => client.requestDownload({ fileId: 456 }), (error: unknown) => error instanceof OpenSubtitlesTimeoutError);
    assert.equal(calls, 1);
  });

  it('surfaces API errors without exposing the API key', async () => {
    const client = new OpenSubtitlesClient({
      apiKey: 'do-not-leak-this-key',
      requestIntervalMs: 0,
      fetchImpl: async () => jsonResponse({ message: 'Unauthorized' }, 401),
    });

    await assert.rejects(() => client.getUserInfo(), (error: unknown) => {
      assert.ok(error instanceof OpenSubtitlesError);
      assert.equal(error.status, 401);
      assert.doesNotMatch(error.message, /do-not-leak-this-key/);
      return true;
    });
  });

  it('does not spend another download request after the server reports zero remaining', async () => {
    let calls = 0;
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      token: 'jwt-token',
      requestIntervalMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return jsonResponse({ link: 'https://dl.opensubtitles.com/temp.srt', file_name: 'temp.srt', requests: 1, remaining: 0, message: '', reset_time: '', reset_time_utc: '2026-09-23T00:00:00Z' });
      },
    });

    await client.requestDownload({ fileId: 456 });

    await assert.rejects(() => client.requestDownload({ fileId: 789 }), (error: unknown) => error instanceof OpenSubtitlesQuotaError);
    assert.equal(calls, 1);
  });

  it('blocks a queued download request after an earlier response reaches zero quota', async () => {
    let calls = 0;
    let markStarted!: () => void;
    let releaseFirst!: (response: Response) => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const firstResponse = new Promise<Response>((resolve) => { releaseFirst = resolve; });
    const client = new OpenSubtitlesClient({
      apiKey: 'test-api-key',
      token: 'jwt-token',
      policies: { downloadRequest: { requestIntervalMs: 0 } },
      fetchImpl: async () => {
        calls += 1;
        markStarted();
        return firstResponse;
      },
    });

    const first = client.requestDownload({ fileId: 456 });
    await started;
    const second = client.requestDownload({ fileId: 789 });
    releaseFirst(jsonResponse({ link: 'https://dl.opensubtitles.com/temp.srt', file_name: 'temp.srt', requests: 1, remaining: 0, message: '', reset_time: '', reset_time_utc: '2026-09-23T00:00:00Z' }));

    await first;
    await assert.rejects(() => second, (error: unknown) => error instanceof OpenSubtitlesQuotaError);
    assert.equal(calls, 1);
  });
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
