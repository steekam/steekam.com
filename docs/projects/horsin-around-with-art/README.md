# Horsin' Around with Art

This devlog preserves the context needed to continue the BoJack Horseman visual
essay in a later session. It covers the shipped experience, the creative gap,
the next iteration, and the checks that protect the work.

Live page: <https://steekam.me/projects/horsin-around-with-art/>

## Project intent

Build a playful visual story about the real artworks hidden in *BoJack
Horseman*. Show each scene beside its art-historical reference, explain what is
happening in the episode, and explore what the borrowed composition adds.

The piece should feel like wandering through a clever, slightly unruly gallery.
Research gives it authority. The show's visual jokes give it life.

## Current state

The first public version shipped on September 19, 2026, through
[pull request 1](https://github.com/steekam/steekam.com/pull/1). The merged commit
is `087bd7a`.

The experience includes:

- An essay mode with five scroll-linked scene-to-art reveals.
- A gallery mode with paired images and detail dialogs.
- Chapters on Botticelli, Hockney, Monet, Millais, and Van Gogh.
- Scene context, interpretation, image credits, rights notes, and sources.
- Two original editorial interludes.
- A custom social preview image and structured search metadata.
- Responsive layouts and reduced-motion behavior.

The implementation lives in:

- `src/pages/projects/horsin-around-with-art.astro`
- `src/components/art-essay/ArtEssay.astro`
- `src/components/art-essay/story-data.json`
- `public/images/horsin-around-with-art/`
- `tests/art-essay.spec.mjs`
- `scripts/verify-art-essay.mjs`

## Creative diagnosis

The final build missed one of the original goals: whimsy.

The visual system has movement and atmosphere, but the writing is dry. Most
chapters follow the same rhythm: identify the scene, establish the artwork,
qualify the interpretation, and close with a sober observation. The repeated
source language keeps the claims honest, but it also makes the narrator sound
like a museum label.

Specific symptoms:

- The voice explains the joke more often than it participates in it.
- Several paragraphs carry similar disclaimers about creator intent.
- Chapter titles and pull quotes are polished but solemn.
- The five chapters use nearly identical argumentative shapes.
- The page says that the show is funny, while rarely being funny itself.

Keep the rigor. Change the temperature.

## Voice for the next pass

Write like an observant friend pausing the episode to say, “Wait, look at the
wall.” The friend knows art history, loves the show, and does not need to prove
either fact.

Aim for:

- Dry wit, specific images, and small surprises.
- Sentence-length variation and stronger comic timing.
- A distinct narrative shape for each chapter.
- Concrete scene details before interpretation.
- Confidence about documented facts and restraint about inferred meaning.
- Occasional BoJack-shaped bleakness without imitating the show's dialogue.

Avoid:

- Canned enthusiasm, listicle language, and tour-guide patter.
- Puns in every heading.
- Generic claims that a painting “mirrors,” “echoes,” or “reflects” a character.
- Repeating a creator-intent disclaimer in every chapter.
- Treating tragedy as a punchline, especially in the Sarah Lynn chapter.
- Invented quotations, production anecdotes, or symbolism.

The target is wit in the observation, not decoration pasted onto the sentence.

## Next iteration

Use the essay copy as the next tracer bullet. Do not redesign the whole page
before the new voice works in one chapter.

1. Rewrite the Botticelli chapter as a voice prototype.
2. Read it aloud and cut any sentence that sounds like wall text.
3. Confirm that every factual statement remains supported by the existing
   sources.
4. Test the chapter in both essay and gallery modes.
5. Compare it with the current copy and decide whether the voice is playful,
   clear, and still trustworthy.
6. Apply the approved voice to the remaining four chapters, the introduction,
   mode labels, interludes, and coda.
7. Run the complete verification loop.

Questions worth testing:

- Can the page open with a sharper comic premise than “art jokes”?
- Can source caveats move into one editorial note instead of five paragraphs?
- Can each chapter hinge on one memorable visual detail?
- Can the gallery labels behave like tiny punchlines without hiding useful
  information?
- Can the interludes feel like discoveries rather than pauses?
- Does the coda earn a final turn, or merely repeat the thesis?

## Editorial rules

Protect these boundaries during the rewrite:

- Separate documented facts from interpretation.
- Attribute claims about an episode, artwork, or production choice.
- Do not imply creator intent without a direct source.
- Preserve every image credit, rights note, and source link.
- Keep spoilers explicit near the start.
- Retain the unofficial fan-made disclaimer.
- Use William Zinsser's editorial lens: clear subjects, active verbs, concrete
  nouns, human cadence, and ruthless cutting.

The content verifier expects each chapter story to contain 120–190 words. If a
shorter chapter reads better, change that constraint deliberately in
`scripts/verify-art-essay.mjs`; do not pad the prose to satisfy it.

## Verify changes

Run the focused acceptance loop:

```sh
npm run verify:art-essay
```

The command checks story data, known type-check baselines, the production build,
browser behavior, reduced motion, mobile layouts, console errors, and six
deterministic screenshots in `review-artifacts/`.

Run the SEO verifier through the regular build:

```sh
npm run build
```

Before publishing a copy iteration, review:

- The hero and first chapter at desktop width.
- Every gallery card and dialog.
- The complete essay at 390 × 844.
- Reduced-motion behavior.
- Credits, links, and factual claims against `story-data.json`.
- The live title, description, canonical URL, social image, and structured data.

Known unrelated type diagnostics are recorded in
`scripts/verify-art-essay.mjs`. New diagnostics fail the focused verifier.

## Assets and provenance

Scene images and artwork references live in
`public/images/horsin-around-with-art/essay/`. Generated editorial images live
in `public/images/horsin-around-with-art/generated/`.

Read these files before replacing generated work:

- `public/images/horsin-around-with-art/generated/provenance.txt`
- `public/images/horsin-around-with-art/seo/provenance.txt`

Do not overwrite an asset without updating its provenance, credit, alt text,
and rights note.

## Devlog

### 2026-09-20 — Opened the whimsy pass

Recorded the post-launch assessment: the structure and interactions work, but
the copy remains too formal. The next session should prototype the new voice in
the Botticelli chapter before changing the rest of the essay.

### 2026-09-19 — Shipped the first visual essay

Replaced the original guessing game with a sourced visual story, added gallery
mode, rewrote the initial copy, generated editorial art, added SEO metadata,
verified the experience, merged pull request 1, and deployed to Cloudflare
Pages.

## Update this file

After each meaningful iteration:

1. Add a dated entry under **Devlog**.
2. Record the decision and why it changed the piece.
3. Update **Current state** and **Next iteration**.
4. Note any new source, asset provenance, constraint, or known issue.
5. Record the verification result and the deployed commit or pull request.

