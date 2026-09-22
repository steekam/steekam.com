export interface ConcurrencyGateOptions {
  maxConcurrent?: number;
  minIntervalMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

export class ConcurrencyGate {
  private active = 0;
  private lastStartedAt = Number.NEGATIVE_INFINITY;
  private readonly queue: Array<(release: () => void) => void> = [];
  private readonly maxConcurrent: number;
  private readonly minIntervalMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly now: () => number;

  constructor(options: ConcurrencyGateOptions = {}) {
    this.maxConcurrent = options.maxConcurrent ?? 1;
    this.minIntervalMs = options.minIntervalMs ?? 0;
    this.sleep = options.sleep ?? delay;
    this.now = options.now ?? Date.now;
    if (!Number.isInteger(this.maxConcurrent) || this.maxConcurrent < 1) throw new Error('maxConcurrent must be a positive integer.');
    if (!Number.isFinite(this.minIntervalMs) || this.minIntervalMs < 0) throw new Error('minIntervalMs must be zero or greater.');
  }

  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    const release = await this.acquire();
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private pump(): void {
    while (this.active < this.maxConcurrent && this.queue.length) {
      const resolve = this.queue.shift();
      if (!resolve) return;
      this.active += 1;
      const wait = Math.max(0, this.minIntervalMs - (this.now() - this.lastStartedAt));
      this.lastStartedAt = this.now() + wait;
      void this.sleep(wait).then(() => {
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.active -= 1;
          this.pump();
        });
      });
    }
  }
}

export interface TimeoutOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  createTimeoutError?: () => Error;
}

export class TimeoutError extends Error {
  readonly timeoutMs: number;

  constructor(timeoutMs: number, message = `Operation timed out after ${timeoutMs}ms.`) {
    super(message);
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>, options: TimeoutOptions): Promise<T> {
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('timeoutMs must be greater than zero.');

  const controller = new AbortController();
  const callerSignal = options.signal;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);

  if (callerSignal) {
    if (callerSignal.aborted) abortFromCaller();
    else callerSignal.addEventListener('abort', abortFromCaller, { once: true });
  }
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(options.createTimeoutError?.() ?? new TimeoutError(options.timeoutMs));
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([operation(controller.signal), timeoutPromise]);
  } catch (error) {
    if (timedOut) throw options.createTimeoutError?.() ?? new TimeoutError(options.timeoutMs);
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    callerSignal?.removeEventListener('abort', abortFromCaller);
  }
}

export interface RetryOptions<T> {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  shouldRetry?: (result: T | undefined, error: unknown, attempt: number) => boolean;
  retryAfterMs?: (result: T | undefined, error: unknown) => number | undefined;
}

export async function retryWithJitter<T>(operation: () => Promise<T>, options: RetryOptions<T> = {}): Promise<T> {
  const maxRetries = options.maxRetries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? delay;
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be a non-negative integer.');
  if (!Number.isFinite(baseDelayMs) || baseDelayMs < 0) throw new Error('baseDelayMs must be zero or greater.');
  if (!Number.isFinite(maxDelayMs) || maxDelayMs < baseDelayMs) throw new Error('maxDelayMs must be greater than or equal to baseDelayMs.');

  for (let attempt = 0; ; attempt += 1) {
    let result: T | undefined;
    let error: unknown;
    try {
      result = await operation();
    } catch (caught) {
      error = caught;
    }

    if (!options.shouldRetry?.(result, error, attempt) || attempt >= maxRetries) {
      if (error !== undefined) throw error;
      return result as T;
    }

    const serverDelay = options.retryAfterMs?.(result, error);
    const delayMs = serverDelay === undefined
      ? Math.min(maxDelayMs, baseDelayMs * 2 ** attempt * (0.5 + clampRandom(random)))
      : Math.max(0, serverDelay) + Math.round(250 * clampRandom(random));
    await sleep(delayMs);
  }
}

function clampRandom(random: () => number): number {
  return Math.max(0, Math.min(1, random()));
}

export function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
