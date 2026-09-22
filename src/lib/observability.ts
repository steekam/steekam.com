import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogStatus = 'started' | 'ok' | 'error';

export interface JsonlLogEvent {
  timestamp: string;
  level: LogLevel;
  event: string;
  runId: string;
  traceId: string;
  spanId?: string;
  stage?: string;
  episodeKey?: string;
  status?: LogStatus;
  durationMs?: number;
  [key: string]: unknown;
}

export interface JsonlLoggerOptions {
  filePath: string;
  service?: string;
  runId?: string;
  traceId?: string;
  now?: () => Date;
}

export interface LogEventInput {
  level?: LogLevel;
  event: string;
  spanId?: string;
  stage?: string;
  episodeKey?: string;
  status?: LogStatus;
  durationMs?: number;
  [key: string]: unknown;
}

export class JsonlLogger {
  readonly filePath: string;
  readonly service: string;
  readonly runId: string;
  readonly traceId: string;
  private readonly now: () => Date;
  private writes: Promise<void> = Promise.resolve();

  constructor(options: JsonlLoggerOptions) {
    this.filePath = options.filePath;
    this.service = options.service ?? 'application';
    this.runId = options.runId ?? randomUUID();
    this.traceId = options.traceId ?? this.runId;
    this.now = options.now ?? (() => new Date());
  }

  async write(input: LogEventInput): Promise<void> {
    const { event: eventName, ...fields } = input;
    const event: JsonlLogEvent = {
      timestamp: this.now().toISOString(),
      level: input.level ?? 'info',
      event: eventName,
      service: this.service,
      runId: this.runId,
      traceId: this.traceId,
      ...fields,
    };
    const line = `${JSON.stringify(event)}\n`;
    const write = this.writes
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await appendFile(this.filePath, line, 'utf8');
      });
    this.writes = write.catch(() => undefined);
    await write;
  }

  async span<T>(name: string, fields: Omit<LogEventInput, 'event' | 'spanId' | 'status' | 'durationMs'>, operation: () => Promise<T>): Promise<T> {
    const spanId = randomUUID();
    const startedAt = this.now().getTime();
    await this.write({ ...fields, event: `${name}.started`, spanId, status: 'started' });
    try {
      const result = await operation();
      await this.write({ ...fields, event: `${name}.completed`, spanId, status: 'ok', durationMs: this.now().getTime() - startedAt });
      return result;
    } catch (error) {
      await this.write({
        ...fields,
        event: `${name}.failed`,
        spanId,
        status: 'error',
        durationMs: this.now().getTime() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async flush(): Promise<void> {
    await this.writes;
  }
}

export async function createJsonlLogger(options: JsonlLoggerOptions): Promise<JsonlLogger> {
  const logger = new JsonlLogger(options);
  await mkdir(dirname(logger.filePath), { recursive: true });
  return logger;
}
