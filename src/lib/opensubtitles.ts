import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { ConcurrencyGate, delay, retryWithJitter, TimeoutError, withTimeout } from './resilience.ts';

export const OPEN_SUBTITLES_API_BASE_URL = 'https://api.opensubtitles.com/api/v1';
export const OPEN_SUBTITLES_DEFAULT_USER_AGENT = 'The Lasso Way v0.1.0';

export interface OpenSubtitlesRequestPolicy {
  maxConcurrentRequests: number;
  requestIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
}

export interface OpenSubtitlesLoginPolicy extends OpenSubtitlesRequestPolicy {
  maxPerSecond: number;
  maxPerMinute: number;
  maxPerHour: number;
}

export interface OpenSubtitlesPolicy {
  search: OpenSubtitlesRequestPolicy;
  downloadRequest: OpenSubtitlesRequestPolicy;
  downloadFile: OpenSubtitlesRequestPolicy;
  login: OpenSubtitlesLoginPolicy;
}

export type OpenSubtitlesPolicyOverrides = {
  search?: Partial<OpenSubtitlesRequestPolicy>;
  downloadRequest?: Partial<OpenSubtitlesRequestPolicy>;
  downloadFile?: Partial<OpenSubtitlesRequestPolicy>;
  login?: Partial<OpenSubtitlesLoginPolicy>;
};

export const OPEN_SUBTITLES_POLICY: OpenSubtitlesPolicy = Object.freeze({
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
});

/** @deprecated Use OPEN_SUBTITLES_POLICY for operation-specific limits. */
export const OPEN_SUBTITLES_SAFE_DEFAULTS = Object.freeze({
  maxConcurrentRequests: OPEN_SUBTITLES_POLICY.search.maxConcurrentRequests,
  requestIntervalMs: OPEN_SUBTITLES_POLICY.search.requestIntervalMs,
  timeoutMs: OPEN_SUBTITLES_POLICY.search.timeoutMs,
  maxRetries: OPEN_SUBTITLES_POLICY.search.maxRetries,
  backoffBaseMs: 1000,
  maxBackoffMs: 8000,
  loginCooldownMs: OPEN_SUBTITLES_POLICY.login.requestIntervalMs,
});
export const OPEN_SUBTITLES_LOGIN_LIMITS = Object.freeze({
  perSecond: OPEN_SUBTITLES_POLICY.login.maxPerSecond,
  perMinute: OPEN_SUBTITLES_POLICY.login.maxPerMinute,
  perHour: OPEN_SUBTITLES_POLICY.login.maxPerHour,
});

export type OpenSubtitlesBaseHost = 'api.opensubtitles.com' | 'vip-api.opensubtitles.com';
export type SubtitleFeatureType = 'movie' | 'episode' | 'all';
export type FilterMode = 'include' | 'exclude' | 'only';
export type SortDirection = 'asc' | 'desc';
export type ResponseFormat = 'json' | 'bytes';
type RequestOperation = keyof OpenSubtitlesPolicy;

export interface OpenSubtitlesClientOptions {
  apiKey?: string;
  userAgent?: string;
  baseUrl?: string;
  token?: string;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  maxConcurrentRequests?: number;
  requestIntervalMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  maxBackoffMs?: number;
  loginCooldownMs?: number;
  policies?: OpenSubtitlesPolicyOverrides;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface OpenSubtitlesUser {
  allowedTranslations: number;
  allowedDownloads: number;
  level: string;
  userId: number;
  extensionInstalled: boolean;
  vip: boolean;
  downloadsCount?: number;
  remainingDownloads?: number;
}

export interface LoginResult {
  user: OpenSubtitlesUser;
  baseUrl: string;
  token: string;
  status: number;
}

export interface SubtitleSearchParams {
  id?: number;
  imdbId?: number;
  tmdbId?: number;
  type?: SubtitleFeatureType;
  query?: string;
  languages?: string | string[];
  movieHash?: string;
  uploaderId?: number;
  hearingImpaired?: FilterMode;
  foreignPartsOnly?: FilterMode;
  trustedSources?: Exclude<FilterMode, 'exclude'>;
  machineTranslated?: Exclude<FilterMode, 'only'>;
  aiTranslated?: Exclude<FilterMode, 'only'>;
  orderBy?: string;
  orderDirection?: SortDirection;
  parentFeatureId?: number;
  parentImdbId?: number;
  parentTmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  year?: number;
  movieHashMatch?: FilterMode;
  page?: number;
}

export interface SubtitleSearchResponse {
  totalPages: number;
  totalCount: number;
  perPage: number;
  page: number;
  data: SubtitleResult[];
  raw: Record<string, unknown>;
}

export interface SubtitleResult {
  id: string;
  type: string;
  attributes: SubtitleAttributes;
}

export interface SubtitleAttributes {
  subtitleId?: string;
  language?: string;
  downloadCount?: number;
  newDownloadCount?: number;
  hearingImpaired?: boolean;
  hd?: boolean;
  movieHashMatch?: boolean;
  fps?: number;
  votes?: number;
  ratings?: number;
  fromTrusted?: boolean;
  foreignPartsOnly?: boolean;
  uploadDate?: string;
  aiTranslated?: boolean;
  nbCd?: number;
  slug?: string;
  machineTranslated?: boolean;
  release?: string;
  comments?: string;
  legacySubtitleId?: number;
  legacyUploaderId?: number;
  uploader?: SubtitleUploader;
  featureDetails?: FeatureDetails;
  url?: string;
  relatedLinks?: RelatedLink[];
  files?: SubtitleFile[];
}

export interface SubtitleUploader {
  uploaderId?: number;
  name?: string;
  rank?: string;
}

export interface FeatureDetails {
  featureId?: number;
  featureType?: string;
  year?: number;
  title?: string;
  movieName?: string;
  imdbId?: number;
  tmdbId?: number;
  seasonNumber?: number;
  episodeNumber?: number;
  parentImdbId?: number;
  parentTitle?: string;
  parentTmdbId?: number;
  parentFeatureId?: number;
}

export interface RelatedLink {
  label?: string;
  url?: string;
  imageUrl?: string;
}

export interface SubtitleFile {
  fileId: number;
  cdNumber?: number;
  fileName?: string;
}

export interface DownloadSubtitleOptions {
  fileId: number;
  subFormat?: string;
  fileName?: string;
  inputFps?: number;
  outputFps?: number;
  timeshift?: number;
  forceDownload?: boolean;
  outputPath?: string;
}

export interface DownloadRequest {
  file_id: number;
  sub_format?: string;
  file_name?: string;
  in_fps?: number;
  out_fps?: number;
  timeshift?: number;
  force_download?: boolean;
}

export interface DownloadResult {
  link: string;
  fileName: string;
  requests: number;
  remaining: number;
  message: string;
  resetTime: string;
  resetTimeUtc: string;
  outputPath?: string;
  raw: Record<string, unknown>;
}

export interface OpenSubtitlesErrorDetails {
  status: number;
  url: string;
  code?: string;
  details?: unknown;
  retryAfterMs?: number;
}

export class OpenSubtitlesError extends Error {
  readonly status: number;
  readonly url: string;
  readonly code?: string;
  readonly details?: unknown;
  readonly retryAfterMs?: number;

  constructor(message: string, details: OpenSubtitlesErrorDetails) {
    super(message);
    this.name = 'OpenSubtitlesError';
    this.status = details.status;
    this.url = details.url;
    this.code = details.code;
    this.details = details.details;
    this.retryAfterMs = details.retryAfterMs;
  }
}

export class OpenSubtitlesTimeoutError extends TimeoutError {
  readonly url: string;

  constructor(url: string, timeoutMs: number) {
    super(timeoutMs, `OpenSubtitles request timed out after ${timeoutMs}ms.`);
    this.name = 'OpenSubtitlesTimeoutError';
    this.url = url;
  }
}

export class OpenSubtitlesQuotaError extends Error {
  readonly resetTimeUtc?: string;

  constructor(resetTimeUtc?: string) {
    super(`OpenSubtitles reports no downloads remaining${resetTimeUtc ? ` until ${resetTimeUtc}` : ''}.`);
    this.name = 'OpenSubtitlesQuotaError';
    this.resetTimeUtc = resetTimeUtc;
  }
}

export class OpenSubtitlesAuthenticationError extends Error {
  constructor(message = 'OpenSubtitles downloads require a JWT from login.') {
    super(message);
    this.name = 'OpenSubtitlesAuthenticationError';
  }
}

export class OpenSubtitlesValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenSubtitlesValidationError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  operation?: RequestOperation;
  beforeSend?: () => void;
  query?: URLSearchParams;
  body?: object;
  includeAuth?: boolean;
  responseFormat?: ResponseFormat;
  retries?: number;
  retryable?: boolean;
  signal?: AbortSignal;
}

const queryFields: Record<keyof SubtitleSearchParams, string> = {
  id: 'id',
  imdbId: 'imdb_id',
  tmdbId: 'tmdb_id',
  type: 'type',
  query: 'query',
  languages: 'languages',
  movieHash: 'moviehash',
  uploaderId: 'uploader_id',
  hearingImpaired: 'hearing_impaired',
  foreignPartsOnly: 'foreign_parts_only',
  trustedSources: 'trusted_sources',
  machineTranslated: 'machine_translated',
  aiTranslated: 'ai_translated',
  orderBy: 'order_by',
  orderDirection: 'order_direction',
  parentFeatureId: 'parent_feature_id',
  parentImdbId: 'parent_imdb_id',
  parentTmdbId: 'parent_tmdb_id',
  seasonNumber: 'season_number',
  episodeNumber: 'episode_number',
  year: 'year',
  movieHashMatch: 'moviehash_match',
  page: 'page',
};

export class OpenSubtitlesClient {
  private readonly apiKey: string;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly policies: OpenSubtitlesPolicy;
  private readonly requestGates: Record<RequestOperation, ConcurrencyGate>;
  private readonly backoffBaseMs: number;
  private readonly maxBackoffMs: number;
  private readonly loginAttempts: number[] = [];
  private readonly searchCache = new Map<string, Promise<SubtitleSearchResponse>>();
  private downloadRequestHaltError: Error | undefined;
  private token: string | undefined;
  private baseUrl: string;
  private remainingDownloads: number | undefined;
  private downloadResetTimeUtc: string | undefined;

  constructor(options: OpenSubtitlesClientOptions = {}) {
    const apiKey = options.apiKey ?? process.env.OPEN_SUBTITLES_API_KEY;
    if (!apiKey) throw new Error('OpenSubtitles API key is required. Set OPEN_SUBTITLES_API_KEY via Varlock.');

    const fetchImpl = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) throw new Error('A fetch implementation is required.');

    this.apiKey = apiKey;
    this.userAgent = options.userAgent ?? process.env.OPEN_SUBTITLES_USER_AGENT ?? OPEN_SUBTITLES_DEFAULT_USER_AGENT;
    this.fetchImpl = fetchImpl;
    this.sleep = options.sleep ?? delay;
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
    const legacyOverrides: Partial<OpenSubtitlesRequestPolicy> = {};
    if (options.maxConcurrentRequests !== undefined) legacyOverrides.maxConcurrentRequests = options.maxConcurrentRequests;
    if (options.requestIntervalMs !== undefined) legacyOverrides.requestIntervalMs = options.requestIntervalMs;
    if (options.timeoutMs !== undefined) legacyOverrides.timeoutMs = options.timeoutMs;
    if (options.maxRetries !== undefined) legacyOverrides.maxRetries = options.maxRetries;
    this.policies = {
      search: { ...OPEN_SUBTITLES_POLICY.search, ...options.policies?.search, ...legacyOverrides },
      downloadRequest: { ...OPEN_SUBTITLES_POLICY.downloadRequest, ...options.policies?.downloadRequest, ...legacyOverrides },
      downloadFile: { ...OPEN_SUBTITLES_POLICY.downloadFile, ...options.policies?.downloadFile, ...legacyOverrides },
      login: {
        ...OPEN_SUBTITLES_POLICY.login,
        ...options.policies?.login,
        ...legacyOverrides,
        requestIntervalMs: options.loginCooldownMs ?? options.policies?.login?.requestIntervalMs ?? options.requestIntervalMs ?? OPEN_SUBTITLES_POLICY.login.requestIntervalMs,
      },
    };
    this.backoffBaseMs = options.backoffBaseMs ?? OPEN_SUBTITLES_SAFE_DEFAULTS.backoffBaseMs;
    this.maxBackoffMs = options.maxBackoffMs ?? OPEN_SUBTITLES_SAFE_DEFAULTS.maxBackoffMs;
    this.token = options.token ?? process.env.OPEN_SUBTITLES_TOKEN;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? OPEN_SUBTITLES_API_BASE_URL);
    this.requestGates = {
      search: createRequestGate(this.policies.search, this.sleep, this.now),
      downloadRequest: createRequestGate(this.policies.downloadRequest, this.sleep, this.now),
      downloadFile: createRequestGate(this.policies.downloadFile, this.sleep, this.now),
      login: createRequestGate(this.policies.login, this.sleep, this.now),
    };
  }

  get isAuthenticated(): boolean {
    return Boolean(this.token);
  }

  get currentBaseUrl(): string {
    return this.baseUrl;
  }

  async login(credentials: LoginCredentials): Promise<LoginResult> {
    if (!credentials.username || !credentials.password) throw new Error('OpenSubtitles username and password are required.');
    await this.waitForLoginWindow();
    const response = await this.request('/login', {
      method: 'POST',
      operation: 'login',
      body: credentials,
      includeAuth: false,
      retries: 0,
      retryable: false,
    }) as Record<string, unknown>;
    const token = stringValue(response.token);
    if (!token) throw new Error('OpenSubtitles login succeeded without returning a token.');
    this.token = token;
    if (response.base_url) this.baseUrl = normalizeBaseUrl(String(response.base_url));
    return {
      user: mapUser(response.user),
      baseUrl: this.baseUrl,
      token,
      status: numberValue(response.status),
    };
  }

  async logout(): Promise<void> {
    if (!this.token) return;
    await this.request('/logout', { method: 'DELETE', operation: 'login' });
    this.token = undefined;
  }

  async getUserInfo(): Promise<OpenSubtitlesUser> {
    const response = await this.request('/infos/user', { operation: 'search' }) as Record<string, unknown>;
    const user = mapUser(response.data);
    if (user.remainingDownloads !== undefined) this.remainingDownloads = user.remainingDownloads;
    return user;
  }

  async searchSubtitles(params: SubtitleSearchParams = {}): Promise<SubtitleSearchResponse> {
    const query = new URLSearchParams();
    const entries: Array<[string, string]> = [];
    for (const [key, field] of Object.entries(queryFields) as [keyof SubtitleSearchParams, string][]) {
      const value = params[key];
      if (value === undefined || value === null || value === '') continue;
      entries.push([field, Array.isArray(value) ? [...value].sort().join(',') : String(value)]);
    }
    entries.sort(([fieldA], [fieldB]) => fieldA.localeCompare(fieldB));
    for (const [field, value] of entries) query.set(field, value);
    const cacheKey = query.toString();
    const cached = this.searchCache.get(cacheKey);
    if (cached) return cached;
    const pending = this.request('/subtitles', { operation: 'search', query })
      .then((response) => mapSearchResponse(response as Record<string, unknown>));
    this.searchCache.set(cacheKey, pending);
    try {
      return await pending;
    } catch (error) {
      this.searchCache.delete(cacheKey);
      throw error;
    }
  }

  async requestDownload(options: Omit<DownloadSubtitleOptions, 'outputPath'>): Promise<DownloadResult> {
    this.assertDownloadRequestsAllowed();
    validateDownloadOptions(options);
    if (this.remainingDownloads === 0) throw new OpenSubtitlesQuotaError(this.downloadResetTimeUtc);
    const body: DownloadRequest = { file_id: options.fileId };
    if (options.subFormat) body.sub_format = options.subFormat;
    if (options.fileName) body.file_name = options.fileName;
    if (options.inputFps !== undefined) body.in_fps = options.inputFps;
    if (options.outputFps !== undefined) body.out_fps = options.outputFps;
    if (options.timeshift !== undefined) body.timeshift = options.timeshift;
    if (options.forceDownload !== undefined) body.force_download = options.forceDownload;

    const response = await this.request('/download', {
      method: 'POST',
      operation: 'downloadRequest',
      body,
      beforeSend: () => this.assertDownloadRequestsAllowed(),
    }) as Record<string, unknown>;
    const result = mapDownloadResponse(response);
    this.remainingDownloads = result.remaining;
    this.downloadResetTimeUtc = result.resetTimeUtc;
    return result;
  }

  async downloadSubtitle(options: DownloadSubtitleOptions): Promise<DownloadResult> {
    const result = await this.requestDownload(options);
    if (!options.outputPath) return result;
    await this.saveTemporarySubtitle(result.link, options.outputPath);
    return { ...result, outputPath: options.outputPath };
  }

  async saveTemporarySubtitle(link: string, outputPath: string): Promise<void> {
    const fileResponse = await this.request(link, { operation: 'downloadFile', responseFormat: 'bytes', includeAuth: false });
    await mkdir(dirname(outputPath), { recursive: true });
    const temporaryPath = `${outputPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, fileResponse as Uint8Array);
      await rename(temporaryPath, outputPath);
    } catch (error) {
      try {
        await unlink(temporaryPath);
      } catch {
        // Keep the original write error; cleanup is best effort.
      }
      throw error;
    }
  }

  haltDownloadRequests(error: Error): void {
    this.downloadRequestHaltError = error;
  }

  private async waitForLoginWindow(): Promise<void> {
    const now = this.now();
    const windows = [
      { durationMs: 1000, limit: this.policies.login.maxPerSecond },
      { durationMs: 60_000, limit: this.policies.login.maxPerMinute },
      { durationMs: 3_600_000, limit: this.policies.login.maxPerHour },
    ];
    while (this.loginAttempts[0] !== undefined && now - this.loginAttempts[0] >= 3_600_000) this.loginAttempts.shift();
    const waits = windows.map(({ durationMs, limit }) => {
      const recent = this.loginAttempts.filter((attempt) => now - attempt < durationMs);
      if (recent.length < limit) return 0;
      return recent[0] + durationMs - now;
    });
    const lastLoginAt = this.loginAttempts.at(-1) ?? Number.NEGATIVE_INFINITY;
    const wait = Math.max(this.policies.login.requestIntervalMs - (now - lastLoginAt), ...waits);
    if (wait > 0) {
      await this.sleep(wait);
      return this.waitForLoginWindow();
    }
    this.loginAttempts.push(this.now());
  }

  private async request(pathOrUrl: string, options: RequestOptions = {}): Promise<unknown> {
    const url = toRequestUrl(pathOrUrl, this.baseUrl, options.query);
    const method = options.method ?? 'GET';
    const operation = options.operation ?? 'search';
    const policy = this.policies[operation];
    const canRetry = options.retryable ?? method === 'GET';
    const response = await retryWithJitter(
      () => this.fetchWithTimeout(url, this.requestInit(options), operation, options.beforeSend),
      {
        maxRetries: canRetry ? options.retries ?? policy.maxRetries : 0,
        baseDelayMs: this.backoffBaseMs,
        maxDelayMs: this.maxBackoffMs,
        random: this.random,
        sleep: this.sleep,
        shouldRetry: (result, error) => canRetry && (
          (result instanceof Response && isRetryableStatus(result.status))
          || error instanceof OpenSubtitlesTimeoutError
          || error instanceof TypeError
        ),
        retryAfterMs: (result) => result instanceof Response ? getRetryAfterMs(result.headers.get('retry-after')) : undefined,
      },
    );

    if (response.ok) {
      if (options.responseFormat === 'bytes') return new Uint8Array(await response.arrayBuffer());
      return parseJson(await response.text(), url);
    }

    const retryAfterMs = getRetryAfterMs(response.headers.get('retry-after'));
    const details = parseErrorBody(await response.text());
    throw new OpenSubtitlesError(
      details.message ?? `OpenSubtitles request failed with HTTP ${response.status}.`,
      {
        status: response.status,
        url,
        code: details.code,
        details: details.details,
        retryAfterMs,
      },
    );
  }

  private async fetchWithTimeout(url: string, init: RequestInit, operation: RequestOperation, beforeSend?: () => void): Promise<Response> {
    const policy = this.policies[operation];
    return this.requestGates[operation].run(() => {
      beforeSend?.();
      return withTimeout(
        (signal) => this.fetchImpl(url, { ...init, signal }),
        {
          timeoutMs: policy.timeoutMs,
          signal: init.signal ?? undefined,
          createTimeoutError: () => new OpenSubtitlesTimeoutError(url, policy.timeoutMs),
        },
      );
    });
  }

  private assertDownloadRequestsAllowed(): void {
    if (!this.token) throw new OpenSubtitlesAuthenticationError();
    if (this.downloadRequestHaltError) throw this.downloadRequestHaltError;
    if (this.remainingDownloads === 0) throw new OpenSubtitlesQuotaError(this.downloadResetTimeUtc);
  }

  private requestInit(options: RequestOptions): RequestInit {
    const headers: Record<string, string> = {
      Accept: options.responseFormat === 'bytes' ? '*/*' : 'application/json',
      'Api-Key': this.apiKey,
      'User-Agent': this.userAgent,
    };
    if (options.body) headers['Content-Type'] = 'application/json';
    if (options.includeAuth !== false && this.token) headers.Authorization = `Bearer ${this.token}`;
    return {
      method: options.method ?? 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    };
  }
}

export function createOpenSubtitlesClient(options: OpenSubtitlesClientOptions = {}): OpenSubtitlesClient {
  return new OpenSubtitlesClient(options);
}

function normalizeBaseUrl(value: string): string {
  const withProtocol = value.startsWith('http://') || value.startsWith('https://') ? value : `https://${value}`;
  const url = new URL(withProtocol);
  const pathname = url.pathname.replace(/\/+$/, '');
  url.pathname = pathname.endsWith('/api/v1') ? pathname : `${pathname}/api/v1`.replace(/^\/api\/v1\/api\/v1$/, '/api/v1');
  return url.toString().replace(/\/$/, '');
}

function createRequestGate(policy: OpenSubtitlesRequestPolicy, sleep: (milliseconds: number) => Promise<void>, now: () => number): ConcurrencyGate {
  return new ConcurrencyGate({
    maxConcurrent: policy.maxConcurrentRequests,
    minIntervalMs: policy.requestIntervalMs,
    sleep,
    now,
  });
}

function validateDownloadOptions(options: Omit<DownloadSubtitleOptions, 'outputPath'>): void {
  if (!Number.isInteger(options.fileId) || options.fileId <= 0) {
    throw new OpenSubtitlesValidationError('OpenSubtitles fileId must be a positive integer.');
  }

  const hasInputFps = options.inputFps !== undefined;
  const hasOutputFps = options.outputFps !== undefined;
  if (hasInputFps !== hasOutputFps) {
    throw new OpenSubtitlesValidationError('OpenSubtitles subtitle conversion requires both inputFps and outputFps.');
  }
  if (hasInputFps && (!isPositiveFiniteNumber(options.inputFps) || !isPositiveFiniteNumber(options.outputFps))) {
    throw new OpenSubtitlesValidationError('OpenSubtitles inputFps and outputFps must be positive finite numbers.');
  }
  if (options.timeshift !== undefined && !Number.isFinite(options.timeshift)) {
    throw new OpenSubtitlesValidationError('OpenSubtitles timeshift must be a finite number.');
  }
}

function isPositiveFiniteNumber(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

function toRequestUrl(pathOrUrl: string, baseUrl: string, query?: URLSearchParams): string {
  const url = /^https?:\/\//i.test(pathOrUrl)
    ? new URL(pathOrUrl)
    : new URL(pathOrUrl.replace(/^\/+/, ''), `${baseUrl}/`);
  if (query) url.search = query.toString();
  return url.toString();
}

function mapUser(value: unknown): OpenSubtitlesUser {
  const user = recordValue(value);
  return {
    allowedTranslations: numberValue(user.allowed_translations),
    allowedDownloads: numberValue(user.allowed_downloads),
    level: stringValue(user.level) ?? '',
    userId: numberValue(user.user_id),
    extensionInstalled: Boolean(user.ext_installed),
    vip: Boolean(user.vip),
    downloadsCount: optionalNumber(user.downloads_count),
    remainingDownloads: optionalNumber(user.remaining_downloads),
  };
}

function mapSearchResponse(value: Record<string, unknown>): SubtitleSearchResponse {
  const data = Array.isArray(value.data) ? value.data.map(mapSubtitleResult) : [];
  return {
    totalPages: numberValue(value.total_pages),
    totalCount: numberValue(value.total_count),
    perPage: numberValue(value.per_page),
    page: numberValue(value.page),
    data,
    raw: value,
  };
}

function mapSubtitleResult(value: unknown): SubtitleResult {
  const result = recordValue(value);
  return {
    id: stringValue(result.id) ?? '',
    type: stringValue(result.type) ?? '',
    attributes: mapSubtitleAttributes(result.attributes),
  };
}

function mapSubtitleAttributes(value: unknown): SubtitleAttributes {
  const attributes = recordValue(value);
  return {
    subtitleId: stringValue(attributes.subtitle_id),
    language: stringValue(attributes.language),
    downloadCount: optionalNumber(attributes.download_count),
    newDownloadCount: optionalNumber(attributes.new_download_count),
    hearingImpaired: optionalBoolean(attributes.hearing_impaired),
    hd: optionalBoolean(attributes.hd),
    movieHashMatch: optionalBoolean(attributes.moviehash_match),
    fps: optionalNumber(attributes.fps),
    votes: optionalNumber(attributes.votes),
    ratings: optionalNumber(attributes.ratings),
    fromTrusted: optionalBoolean(attributes.from_trusted),
    foreignPartsOnly: optionalBoolean(attributes.foreign_parts_only),
    uploadDate: stringValue(attributes.upload_date),
    aiTranslated: optionalBoolean(attributes.ai_translated),
    nbCd: optionalNumber(attributes.nb_cd),
    slug: stringValue(attributes.slug),
    machineTranslated: optionalBoolean(attributes.machine_translated),
    release: stringValue(attributes.release),
    comments: stringValue(attributes.comments),
    legacySubtitleId: optionalNumber(attributes.legacy_subtitle_id),
    legacyUploaderId: optionalNumber(attributes.legacy_uploader_id),
    uploader: mapUploader(attributes.uploader),
    featureDetails: mapFeatureDetails(attributes.feature_details),
    url: stringValue(attributes.url),
    relatedLinks: arrayValue(attributes.related_links).map(mapRelatedLink),
    files: arrayValue(attributes.files).map(mapSubtitleFile),
  };
}

function mapUploader(value: unknown): SubtitleUploader | undefined {
  if (!value) return undefined;
  const uploader = recordValue(value);
  return {
    uploaderId: optionalNumber(uploader.uploader_id),
    name: stringValue(uploader.name),
    rank: stringValue(uploader.rank),
  };
}

function mapFeatureDetails(value: unknown): FeatureDetails | undefined {
  if (!value) return undefined;
  const feature = recordValue(value);
  return {
    featureId: optionalNumber(feature.feature_id),
    featureType: stringValue(feature.feature_type),
    year: optionalNumber(feature.year),
    title: stringValue(feature.title),
    movieName: stringValue(feature.movie_name),
    imdbId: optionalNumber(feature.imdb_id),
    tmdbId: optionalNumber(feature.tmdb_id),
    seasonNumber: optionalNumber(feature.season_number),
    episodeNumber: optionalNumber(feature.episode_number),
    parentImdbId: optionalNumber(feature.parent_imdb_id),
    parentTitle: stringValue(feature.parent_title),
    parentTmdbId: optionalNumber(feature.parent_tmdb_id),
    parentFeatureId: optionalNumber(feature.parent_feature_id),
  };
}

function mapRelatedLink(value: unknown): RelatedLink {
  const link = recordValue(value);
  return { label: stringValue(link.label), url: stringValue(link.url), imageUrl: stringValue(link.img_url) };
}

function mapSubtitleFile(value: unknown): SubtitleFile {
  const file = recordValue(value);
  return { fileId: numberValue(file.file_id), cdNumber: optionalNumber(file.cd_number), fileName: stringValue(file.file_name) };
}

function mapDownloadResponse(value: Record<string, unknown>): DownloadResult {
  const link = stringValue(value.link);
  if (!link) throw new Error('OpenSubtitles download response did not include a temporary link.');
  return {
    link,
    fileName: stringValue(value.file_name) ?? '',
    requests: numberValue(value.requests),
    remaining: numberValue(value.remaining),
    message: stringValue(value.message) ?? '',
    resetTime: stringValue(value.reset_time) ?? '',
    resetTimeUtc: stringValue(value.reset_time_utc) ?? '',
    raw: value,
  };
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function parseJson(text: string, url: string): Record<string, unknown> {
  if (!text) return {};
  try {
    return recordValue(JSON.parse(text));
  } catch {
    throw new OpenSubtitlesError('OpenSubtitles returned invalid JSON.', { status: 200, url, details: text.slice(0, 200) });
  }
}

function parseErrorBody(text: string): { message?: string; code?: string; details?: unknown } {
  try {
    const body = recordValue(JSON.parse(text));
    return { message: stringValue(body.message), code: stringValue(body.code), details: body };
  } catch {
    return { message: text.slice(0, 200) || undefined, details: text.slice(0, 200) || undefined };
  }
}

function getRetryAfterMs(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}
