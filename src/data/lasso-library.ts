import approvedData from '../../public/data/lasso-approved.json';
import reviewData from '../../public/data/lasso-review.json';
import { lassoIllustrationFor, lassoQuotes, type LassoQuote } from './lasso-quotes';

type ApprovedQuote = {
  id: string;
  text: string;
  season: number;
  episode: number;
  episodeTitle: string;
};

type ReviewCandidate = ApprovedQuote & { context?: string };

const themeRules: Array<[string, string[]]> = [
  ['acceptance', ['accept', 'who he is', 'being yourself']],
  ['change', ['change', 'growing', 'better version', 'from one place']],
  ['confidence', ['believe', 'belief', 'best version', 'stunning']],
  ['conflict', ['wrong', 'battling', 'opponent', 'get to you']],
  ['courage', ['try', 'scary', 'right thing', 'quit']],
  ['friendship', ['together', 'helping people', 'connected']],
  ['grief', ['love forever', 'baggage', 'divorced', 'leave people well']],
  ['hope', ['hope', 'work out', 'dream big']],
  ['identity', ['myself', 'yourself', 'who he is']],
  ['integrity', ['right thing', 'own up']],
  ['love', ['love', 'darling', 'care about']],
  ['perspective', ['humility', 'wins and losses', 'good times']],
  ['resilience', ['keep trying', 'never quit', 'get through']],
  ['self-worth', ['deserve', 'best', 'protect me']],
  ['values', ['right thing', 'should exist']],
];

const themesFor = (text: string) => {
  const lowerText = text.toLowerCase();
  const themes = themeRules
    .filter(([, signals]) => signals.some((signal) => lowerText.includes(signal)))
    .map(([theme]) => theme);

  return themes.length ? themes.slice(0, 4) : ['perspective'];
};

const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const reviewCandidates = reviewData.candidates as ReviewCandidate[];
const contextById = new Map(reviewCandidates.map((quote) => [quote.id, quote.context || '']));
const contextByText = new Map(reviewCandidates.map((quote) => [normalize(quote.text), quote.context || '']));

const sceneContextOverrides: Record<string, string> = {
  'data-transcripts-s01e02-biscuits-srt-46': 'In the team room, Ted gives Nate a safe way to speak up by turning anonymous player feedback into a suggestion box.',
  'data-transcripts-s02e08-man-city-srt-154': 'As Rebecca gets ready to meet someone, Ted notices her nerves and steadies her with a simple compliment.',
  'data-transcripts-s01e01-pilot-srt-102': 'While the evening around them looks glamorous, Ted admits that a good time can still feel wrong when it is not what you need.',
  'data-transcripts-s01e08-the-diamond-dogs-srt-263': 'During a Diamond Dogs conversation, the fallout from Rebecca’s marriage makes its way to the surface, along with the choices she still carries.',
  'data-transcripts-s02e11-midnight-train-to-royston-srt-174': 'Edwin Akufo explains to Sam why he is breaking up his father’s empire, even though he knows the contradiction in his own wealth.',
  'data-transcripts-s01e06-two-aces-srt-27': 'After Sarah wins her first match, Ted separates the quality of the performance from the result on the scoreboard.',
  'data-transcripts-s02e01-goodbye-earl-srt-228': 'Roy tells Keeley that love should feel electric, not like something she has agreed to tolerate.',
  'data-transcripts-s02e02-lavender-srt-312': 'Ted welcomes Sharon to Richmond and hopes her arrival gives the club the lift it needs.',
  'data-transcripts-s02e03-do-the-right-est-thing-srt-241': 'After Sam walks away from the Dubai Air campaign, Ted reminds him that integrity can cost you a result.',
  'data-transcripts-s02e01-goodbye-earl-srt-279': 'After a difficult spell, Ted explains how Sharon helped him hold the joy, grief, and absurdity of football in the same frame.',
  'data-transcripts-s02e11-midnight-train-to-royston-srt-184': 'Rebecca praises Keeley’s instinct for helping people, then asks whether she wants more authority of her own.',
  'data-transcripts-s01e07-make-rebecca-great-again-srt-229': 'Rebecca’s mother defends her while also asking her to face the part she played in a broken relationship.',
  'data-transcripts-s01e03-trent-crimm-the-independent-srt-268': 'On press day, Ted tells Trent that coaching means helping young players become better people, not just better footballers.',
  'data-transcripts-s01e08-the-diamond-dogs-srt-75': 'Ted turns a joke about endorsements into a point about conviction: opportunities work better when you believe in what you are offering.',
  'data-transcripts-s02e05-rainbow-srt-41': 'In a conversation about plans that keep changing, Ted reassures the room that a messy path can still land somewhere good.',
  'data-transcripts-s02e10-no-weddings-and-a-funeral-srt-298': 'Jamie admits that Keeley helped him return to Richmond and believe he could become a better man.',
  'data-transcripts-s02e10-no-weddings-and-a-funeral-srt-231': 'Ted tells Sharon how his father’s death shaped his habit of looking for the hurt beneath people’s behavior.',
  'data-transcripts-s01e09-all-apologies-srt-44': 'During a Diamond Dogs confession, Nate uses an old school prank to explain how hard it is to face harm you caused.',
  'data-transcripts-s02e10-no-weddings-and-a-funeral-srt-49': 'While mourning her father, Rebecca admits that love can outlast the ways a person disappointed her.',
  'data-transcripts-s01e09-all-apologies-srt-238': 'When someone asks him to choose between loyalty and his own needs, Ted gives them permission to do what is right for themselves.',
  'data-transcripts-s02e05-rainbow-srt-92': 'Keeley turns a conversation about dating into a branding joke, arguing that even love needs a clear sense of what it is.',
  'data-transcripts-s02e11-midnight-train-to-royston-srt-191': 'Rebecca and Keeley talk about ambition, and one admits that the other made a bigger dream feel possible.',
  'data-transcripts-s02e03-do-the-right-est-thing-srt-304': 'After Sam chooses principle over the Dubai Air campaign, Ted reminds him that the right choice still counts when it costs the match.',
  'data-transcripts-s02e07-headspace-srt-114': 'In therapy, Ted and Sharon circle the loneliness of being constantly reachable while still feeling unseen.',
  'data-transcripts-s01e05-tan-lines-srt-247': 'Ted talks through the end of his marriage and admits he has treated perseverance like a promise he cannot break.',
  'data-transcripts-s02e08-man-city-srt-300': 'After a painful loss, Ted explains that trying still matters when the result can take something from you.',
  'data-transcripts-s02e08-man-city-srt-110': 'Ted tells Henry that their time together matters, even as he admits he is still learning how to show up as a father.',
  'data-transcripts-s02e06-the-signal-srt-210': 'Ted uses a friend’s breakup story to argue that care sometimes means staying patient after the first attempt fails.',
  'data-transcripts-s02e03-do-the-right-est-thing-srt-128': 'Roy explains that good coaching means anticipating the next move before the other side sees it.',
  'data-transcripts-s02e08-man-city-srt-98': 'Ted talks about his father by separating love for the person from forgiveness for the harm.',
  'data-transcripts-s01e03-trent-crimm-the-independent-srt-188': 'Trent challenges Ted over the team partying after a loss; Ted refuses to let the scoreboard define the work.',
  'data-transcripts-s01e06-two-aces-srt-203': 'A tense conversation about Jamie’s climb to the Premier League becomes a warning against fighting every person who offers help.',
  'data-transcripts-s02e10-no-weddings-and-a-funeral-srt-245': 'At her father’s funeral, Rebecca admits that loving someone can survive a lot of baggage and hurt.',
  'data-transcripts-s01e02-biscuits-srt-65': 'Ted invites the team to leave anonymous feedback, giving Nate a safe way to speak up.',
  'data-transcripts-s01e04-for-the-children-srt-217': 'Rebecca recruits Keeley for a public appearance and asks her to be the capable partner she trusts.',
  'data-transcripts-s02e07-headspace-srt-161': 'A therapy session gets too close for comfort, and one person asks for space instead of another explanation.',
  'data-transcripts-s02e10-no-weddings-and-a-funeral-srt-241': 'Rebecca explains why she stays kind to Rupert: distance and composure keep his cruelty from reaching her.',
  'data-transcripts-s02e06-the-signal-srt-119': 'Ted shares the advice he received after his divorce: leave people with dignity when you leave them.',
  'data-transcripts-s02e02-lavender-srt-113': 'In therapy, Ted drops the optimism and names the loneliness underneath his habit of keeping everyone at arm’s length.',
  'data-transcripts-s01e09-all-apologies-srt-121': 'A strained relationship reaches for a handshake, and Ted argues that care gives people a way back to each other.',
  'data-transcripts-s02e05-rainbow-srt-117': 'Higgins tells a story about his marriage, landing on the idea that the strongest public face is simply an honest one.',
  'data-transcripts-s02e07-headspace-srt-8': 'A newspaper conversation turns into a lesson about humility: self-importance shrinks when attention moves outward.',
};

const contextFor = (id: string, text: string) => sceneContextOverrides[id] || contextById.get(id) || contextByText.get(normalize(text)) || '';

const withContext = (quote: LassoQuote): LassoQuote => ({
  ...quote,
  context: quote.context || contextFor(quote.id, quote.text),
});

export const lassoLibrary: LassoQuote[] = (approvedData.quotes as ApprovedQuote[]).map((quote) => ({
  id: quote.id,
  text: quote.text,
  speaker: 'Episode transcript',
  season: quote.season,
  episode: quote.episode,
  episodeTitle: quote.episodeTitle,
  situation: `From ${quote.episodeTitle}.`,
  context: contextFor(quote.id, quote.text),
  note: '',
  themes: themesFor(quote.text),
  visual: lassoIllustrationFor(quote.id),
  visualAlt: 'Original illustration for The Lasso Way.',
  visualNote: 'Original illustration.',
}));

export const lassoAllQuotes: LassoQuote[] = [
  ...lassoQuotes.map(withContext),
  ...lassoLibrary.filter((quote) => !lassoQuotes.some((featured) => normalize(featured.text) === normalize(quote.text))),
];

export const lassoLibraryThemes = [...new Set(lassoLibrary.flatMap((quote) => quote.themes))].sort();
export const lassoAllThemes = [...new Set(lassoAllQuotes.flatMap((quote) => quote.themes))].sort();
