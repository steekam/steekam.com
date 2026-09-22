const cueTime = /^\s*(?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}\s+-->\s+(?:\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{3}/;
const episodePattern = /(?:s(?:eason)?\s*0?(\d{1,2})\s*e(?:pisode)?\s*0?(\d{1,2}))|(?:0?(\d{1,2})x0?(\d{1,2}))/i;
const highSignalWords = /\b(always|believe|better|care|choose|curious|deserve|fear|feel|good|hope|kind|learn|love|mistake|people|remember|right|sorry|team|truth|try|understand|want|welcome|worth)\b/i;

export function parseEpisodeMetadata(sourceName) {
  const match = sourceName.match(episodePattern);
  if (!match) return { season: undefined, episode: undefined, episodeTitle: sourceName.replace(/\.[^.]+$/, '') };
  const season = Number(match[1] || match[3]);
  const episode = Number(match[2] || match[4]);
  const title = sourceName
    .replace(match[0], '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_.-]+/g, ' ')
    .replace(/\b(transcript|subtitles?|captions?)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { season, episode, episodeTitle: title || undefined };
}

export function cleanTranscript(raw) {
  return raw
    .replace(/^WEBVTT.*$/gim, '')
    .replace(/^NOTE[\s\S]*?(?=\n\s*\n|$)/gim, '')
    .replace(/<[^>]+>/g, ' ')
    .split(/\r?\n/)
    .filter((line) => {
      const value = line.trim();
      return value && !/^\d+$/.test(value) && !cueTime.test(value) && !/^\[[^\]]+\]$/.test(value);
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sentenceList(raw) {
  const cleaned = cleanTranscript(raw);
  const parts = cleaned.match(/[^.!?]+(?:[.!?]+|$)/g) || [];
  const seen = new Set();
  return parts
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter((part) => {
      const normalized = part.toLowerCase();
      if (normalized.length < 28 || normalized.length > 240 || seen.has(normalized)) return false;
      seen.add(normalized);
      return part.split(/\s+/).length >= 5;
    });
}

export function scoreSentence(text) {
  const words = text.split(/\s+/).length;
  const signals = [];
  if (words >= 7 && words <= 28) signals.push('short enough to share');
  if (highSignalWords.test(text)) signals.push('wisdom language');
  if (/\b(you|we|I|it|this|that)\b/i.test(text)) signals.push('direct voice');
  if (/\b(always|never|sometimes|need|deserve|remember|believe|choose)\b/i.test(text)) signals.push('point of view');
  if (/[!?]$/.test(text)) signals.push('spoken emphasis');
  const score = signals.length + (words >= 8 && words <= 22 ? 1 : 0);
  return { score, signals };
}

export function extractCandidates(raw, sourceName, sourcePath = sourceName) {
  const sentences = sentenceList(raw);
  const metadata = parseEpisodeMetadata(sourceName);
  return sentences
    .map((text, index) => {
      const previous = sentences[index - 1];
      const next = sentences[index + 1];
      const { score, signals } = scoreSentence(text);
      return {
        id: `${slugify(sourcePath)}-${index + 1}`,
        sourceName,
        sourcePath,
        ...metadata,
        text,
        context: [previous, text, next].filter(Boolean).join(' '),
        score,
        signals,
        status: 'pending',
      };
    })
    .filter((candidate) => candidate.score >= 2)
    .sort((a, b) => b.score - a.score);
}

export function dedupeCandidates(candidates) {
  const unique = new Map();

  for (const candidate of candidates) {
    const key = normalizeCandidateText(candidate.text);
    const provenance = {
      sourceName: candidate.sourceName,
      sourcePath: candidate.sourcePath,
      season: candidate.season,
      episode: candidate.episode,
      episodeTitle: candidate.episodeTitle,
      context: candidate.context,
    };
    const candidateProvenance = candidate.provenance?.length ? candidate.provenance : [provenance];
    const existing = unique.get(key);

    if (!existing) {
      unique.set(key, {
        ...candidate,
        provenance: candidateProvenance,
        duplicateCount: Math.max(candidateProvenance.length - 1, 0),
      });
      continue;
    }

    const isBetter = candidate.score > existing.score;
    const sources = [...existing.provenance, ...candidateProvenance].filter((item, index, list) => (
      list.findIndex((entry) => entry.sourcePath === item.sourcePath) === index
    ));
    unique.set(key, {
      ...(isBetter ? candidate : existing),
      provenance: sources,
      duplicateCount: sources.length - 1,
      status: existing.status !== 'pending' ? existing.status : candidate.status,
    });
  }

  return [...unique.values()];
}

export function rankCandidates(candidates) {
  return dedupeCandidates(candidates)
    .sort((a, b) => (
      b.score - a.score
      || b.signals.length - a.signals.length
      || a.text.length - b.text.length
      || a.sourcePath.localeCompare(b.sourcePath)
      || a.id.localeCompare(b.id)
    ))
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

export function normalizeCandidateText(text) {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'transcript';
}

export function isTranscriptFile(fileName) {
  return /\.(?:txt|srt|vtt)$/i.test(fileName);
}

export function formatSource(candidate) {
  if (candidate.season && candidate.episode) {
    return `S${candidate.season} · E${candidate.episode}${candidate.episodeTitle ? ` · ${candidate.episodeTitle}` : ''}`;
  }
  return candidate.sourceName || candidate.sourcePath || 'Transcript';
}
