import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ConcurrencyGate, TimeoutError, retryWithJitter, withTimeout } from '../src/lib/resilience.ts';

describe('reusable resilience primitives', () => {
  it('keeps concurrent work below the configured limit', async () => {
    const gate = new ConcurrencyGate({ maxConcurrent: 1 });
    let active = 0;
    let peak = 0;
    const work = async (): Promise<void> => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
    };

    await Promise.all([gate.run(work), gate.run(work), gate.run(work)]);

    assert.equal(peak, 1);
  });

  it('retries only when the caller marks the result retryable', async () => {
    let attempts = 0;
    const waits: number[] = [];
    const result = await retryWithJitter(
      async () => {
        attempts += 1;
        return attempts < 3 ? 503 : 200;
      },
      {
        maxRetries: 2,
        baseDelayMs: 10,
        random: () => 0,
        sleep: async (milliseconds) => { waits.push(milliseconds); },
        shouldRetry: (value) => value === 503,
      },
    );

    assert.equal(result, 200);
    assert.equal(attempts, 3);
    assert.deepEqual(waits, [5, 10]);
  });

  it('aborts work at the timeout boundary', async () => {
    await assert.rejects(
      () => withTimeout(
        (signal) => new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
        { timeoutMs: 5 },
      ),
      (error: unknown) => error instanceof TimeoutError,
    );
  });
});
