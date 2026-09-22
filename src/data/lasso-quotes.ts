export type LassoQuote = {
  id: string;
  text: string;
  speaker: string;
  season: number;
  episode: number;
  episodeTitle: string;
  situation: string;
  context?: string;
  note: string;
  themes: string[];
  visual: string;
  visualAlt: string;
  visualNote: string;
};

const illustrations: Record<string, string> = {
  'curious-not-judgmental': '/images/the-lasso-way/believe-clubhouse.webp',
  'be-a-goldfish': '/images/the-lasso-way/biscuits-office.webp',
  'hope-and-belief': '/images/the-lasso-way/rainy-training-ground.webp',
  'right-thing': '/images/the-lasso-way/locker-room-believe.webp',
  'struck-by-lightning': '/images/the-lasso-way/pub-darts.webp',
  'better-place': '/images/the-lasso-way/rainy-training-ground.webp',
  'psychologically-healthy': '/images/the-lasso-way/biscuits-office.webp',
  dreams: '/images/the-lasso-way/pub-darts.webp',
};

export const lassoIllustrationFor = (id: string) => illustrations[id] || '/images/the-lasso-way/locker-room-believe.webp';

export const lassoQuotes: LassoQuote[] = [
  {
    id: 'curious-not-judgmental',
    text: 'Be curious, not judgmental.',
    speaker: 'Ted Lasso',
    season: 1,
    episode: 8,
    episodeTitle: 'The Diamond Dogs',
    situation: 'When you judge too quickly',
    context: 'During a darts game, Ted answers Rupert’s judgment with a question about curiosity.',
    note: 'Swap the verdict for a question. Curiosity leaves room for what you cannot see.',
    themes: ['curiosity', 'conflict', 'leadership', 'relationships'],
    visual: lassoIllustrationFor('curious-not-judgmental'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'be-a-goldfish',
    text: 'Be a goldfish.',
    speaker: 'Ted Lasso',
    season: 1,
    episode: 2,
    episodeTitle: 'Biscuits',
    situation: 'When one mistake owns the day',
    context: 'After a rough match, Ted reminds the team that the last play does not have to follow them into the next one.',
    note: 'Let it teach you. Then return to now.',
    themes: ['mistakes', 'confidence', 'pressure', 'reset'],
    visual: lassoIllustrationFor('be-a-goldfish'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'hope-and-belief',
    text: 'I believe in hope. I believe in belief.',
    speaker: 'Ted Lasso',
    season: 1,
    episode: 10,
    episodeTitle: 'The Hope That Kills You',
    situation: 'When hope feels foolish',
    context: 'With relegation hanging over Richmond, Ted chooses belief while the rest of the club braces for the worst.',
    note: 'Hope is staying open to one more possibility.',
    themes: ['hope', 'failure', 'resilience', 'teamwork'],
    visual: lassoIllustrationFor('hope-and-belief'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'right-thing',
    text: 'Doing the right thing is never the wrong thing.',
    speaker: 'Ted Lasso',
    season: 2,
    episode: 3,
    episodeTitle: 'Do the Right-est Thing',
    situation: 'When easy and right split',
    context: 'Ted tells Rebecca that the right choice still counts when it costs the win.',
    note: 'Control your next move, not the applause.',
    themes: ['courage', 'values', 'leadership', 'integrity'],
    visual: lassoIllustrationFor('right-thing'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'struck-by-lightning',
    text: "You deserve someone who makes you feel like you've been struck by lightning.",
    speaker: 'Roy Kent',
    season: 2,
    episode: 1,
    episodeTitle: 'Goodbye Earl',
    situation: 'When fine is not enough',
    context: 'Roy gives Keeley a blunt standard for love: being with someone should feel electric.',
    note: 'Being chosen is not being cherished. Do not mistake peace for resignation.',
    themes: ['love', 'self-worth', 'relationships', 'standards'],
    visual: lassoIllustrationFor('struck-by-lightning'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'better-place',
    text: 'I think things come into our lives to help us get from one place to a better one.',
    speaker: 'Ted Lasso',
    season: 2,
    episode: 1,
    episodeTitle: 'Goodbye Earl',
    situation: 'When something ends too soon',
    context: 'Ted makes sense of a painful ending by imagining it as a move toward a better place.',
    note: 'An ending can hurt without making the whole thing a mistake.',
    themes: ['grief', 'change', 'moving on', 'perspective'],
    visual: lassoIllustrationFor('better-place'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'psychologically-healthy',
    text: "I'm not sure you realize how psychologically healthy that actually is.",
    speaker: 'Ted Lasso',
    season: 1,
    episode: 2,
    episodeTitle: 'Biscuits',
    situation: 'When being yourself feels small',
    context: 'Ted notices Rebecca’s honest reaction and treats it as a sign of health, not something to hide.',
    note: 'Self-acceptance need not be dramatic. Stop auditioning for another identity.',
    themes: ['self-worth', 'identity', 'confidence', 'acceptance'],
    visual: lassoIllustrationFor('psychologically-healthy'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
  {
    id: 'dreams',
    text: "If we see each other in our dreams, let's goof around a little bit, pretend like we don't know each other.",
    speaker: 'Ted Lasso',
    season: 1,
    episode: 1,
    episodeTitle: 'Pilot',
    situation: 'When goodbye needs softness',
    context: 'On the flight to London, Ted gives a goodbye permission to be tender and a little ridiculous.',
    note: 'Tenderness need not be solemn. Silliness can carry love.',
    themes: ['friendship', 'goodbyes', 'love', 'humor'],
    visual: lassoIllustrationFor('dreams'),
    visualAlt: 'Original illustration for The Lasso Away.',
    visualNote: 'Original illustration.',
  },
];

export const lassoThemes = [...new Set(lassoQuotes.flatMap((quote) => quote.themes))].sort();
