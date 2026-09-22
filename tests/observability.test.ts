import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createJsonlLogger } from '../src/lib/observability.ts';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('JsonlLogger', () => {
  it('serializes canonical events and span lifecycle records', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'lasso-observability-'));
    temporaryDirectories.push(directory);
    const logger = await createJsonlLogger({ filePath: join(directory, 'run.jsonl'), runId: 'run-1', service: 'test-service' });

    await Promise.all([
      logger.write({ event: 'episode.probe.selected', stage: 'probe', episodeKey: 'S01E01', fileId: 123 }),
      logger.write({ event: 'episode.probe.selected', stage: 'probe', episodeKey: 'S01E02', fileId: 456 }),
      logger.span('subtitle.search', { stage: 'probe', episodeKey: 'S01E03' }, async () => 'ok'),
    ]);
    await logger.flush();

    const lines = (await readFile(join(directory, 'run.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(lines.length, 4);
    assert.ok(lines.every((line) => line.service === 'test-service' && line.runId === 'run-1' && line.traceId === 'run-1' && typeof line.timestamp === 'string'));
    assert.deepEqual(lines.filter((line) => line.event === 'subtitle.search.started').map((line) => line.status), ['started']);
    assert.deepEqual(lines.filter((line) => line.event === 'subtitle.search.completed').map((line) => line.status), ['ok']);
  });
});
