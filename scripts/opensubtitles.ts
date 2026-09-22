import 'varlock/auto-load';
import { createOpenSubtitlesClient, type LoginCredentials, type SubtitleSearchParams } from '../src/lib/opensubtitles.ts';

const [command, ...argv] = process.argv.slice(2);
const flags = parseFlags(argv);

if (!command || command === 'help' || command === '--help') {
  printUsage();
  process.exit(0);
}

const client = createOpenSubtitlesClient();

try {
  if (command === 'login') {
    const credentials: LoginCredentials = {
      username: requiredFlag(flags, 'username', process.env.OPEN_SUBTITLES_USERNAME),
      password: requiredFlag(flags, 'password', process.env.OPEN_SUBTITLES_PASSWORD),
    };
    const result = await client.login(credentials);
    console.log(JSON.stringify({ user: result.user, baseUrl: result.baseUrl, authenticated: true }, null, 2));
  } else if (command === 'search') {
    const result = await client.searchSubtitles(searchParams(flags));
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'download') {
    await authenticateIfConfigured();
    if (!client.isAuthenticated) throw new Error('Downloads require OPEN_SUBTITLES_TOKEN or OPEN_SUBTITLES_USERNAME and OPEN_SUBTITLES_PASSWORD via Varlock.');
    const fileId = Number(requiredFlag(flags, 'file-id'));
    if (!Number.isInteger(fileId) || fileId <= 0) throw new Error('--file-id must be a positive integer.');
    const outputPath = requiredFlag(flags, 'output');
    const result = await client.downloadSubtitle({
      fileId,
      outputPath,
      subFormat: flags['sub-format'],
      fileName: flags['file-name'],
      inputFps: optionalNumberFlag(flags['in-fps'], 'in-fps'),
      outputFps: optionalNumberFlag(flags['out-fps'], 'out-fps'),
      timeshift: optionalNumberFlag(flags.timeshift, 'timeshift', true),
    });
    console.log(JSON.stringify({ fileName: result.fileName, outputPath: result.outputPath, remaining: result.remaining }, null, 2));
  } else if (command === 'whoami') {
    await authenticateIfConfigured();
    console.log(JSON.stringify(await client.getUserInfo(), null, 2));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function parseFlags(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const [key, inlineValue] = arg.slice(2).split('=', 2);
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined && value && !value.startsWith('--')) index += 1;
    if (value) result[key] = value;
  }
  return result;
}

function requiredFlag(flags: Record<string, string>, name: string, fallback?: string): string {
  const value = flags[name] ?? fallback;
  if (!value) throw new Error(`Missing --${name}.`);
  return value;
}

function searchParams(flags: Record<string, string>): SubtitleSearchParams {
  const params: SubtitleSearchParams = {};
  if (flags.query) params.query = flags.query;
  if (flags.languages) params.languages = flags.languages.split(',').map((language) => language.trim()).filter(Boolean);
  if (flags.season) params.seasonNumber = numberFlag(flags.season, 'season');
  if (flags.episode) params.episodeNumber = numberFlag(flags.episode, 'episode');
  if (flags['parent-imdb-id']) params.parentImdbId = numberFlag(flags['parent-imdb-id'], 'parent-imdb-id');
  if (flags['parent-tmdb-id']) params.parentTmdbId = numberFlag(flags['parent-tmdb-id'], 'parent-tmdb-id');
  if (flags.type) params.type = flags.type as SubtitleSearchParams['type'];
  if (flags.page) params.page = numberFlag(flags.page, 'page');
  if (flags['movie-hash']) params.movieHash = flags['movie-hash'];
  return params;
}

async function authenticateIfConfigured(): Promise<void> {
  if (client.isAuthenticated) return;
  const username = process.env.OPEN_SUBTITLES_USERNAME;
  const password = process.env.OPEN_SUBTITLES_PASSWORD;
  if (username && password) await client.login({ username, password });
}

function numberFlag(value: string, name: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error(`--${name} must be a non-negative integer.`);
  return parsed;
}

function optionalNumberFlag(value: string | undefined, name: string, allowNegative = false): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || (!allowNegative && parsed < 0)) throw new Error(`--${name} must be a finite ${allowNegative ? 'number' : 'non-negative number'}.`);
  return parsed;
}

function printUsage(): void {
  console.log(`OpenSubtitles SDK\n\nCommands:\n  login --username <name> --password <password>\n  search --query "Ted Lasso" --season 1 --episode 1 --languages en\n  download --file-id <id> --output data/transcripts/S01E01.srt [--sub-format srt --in-fps 23.976 --out-fps 25]\n  whoami\n\nVarlock autoloads for this CLI; run:\n  npm run opensubtitles -- search --query "Ted Lasso" --season 1 --episode 1 --languages en`);
}
