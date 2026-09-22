---
name: The Lasso Way
description: A clubhouse field guide to Ted Lasso quote discovery.
colors:
  clubhouse-navy: "#102e35"
  navy-deep: "#0a2026"
  paper-cream: "#f5f0dd"
  belief-yellow: "#efc84b"
  richmond-red: "#c95849"
  ink-soft: "#c1c5b1"
typography:
  display:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "clamp(3.6rem, 8vw, 7.9rem)"
    fontWeight: 400
    lineHeight: 0.84
    letterSpacing: "-0.09em"
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.7rem"
    fontWeight: 700
    letterSpacing: "0.16em"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "0.76rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  sm: "0"
  pill: "999px"
spacing:
  sm: "0.65rem"
  md: "1rem"
  lg: "2rem"
  xl: "5rem"
components:
  button-primary:
    backgroundColor: "{colors.paper-cream}"
    textColor: "{colors.clubhouse-navy}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.85rem"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.paper-cream}"
    rounded: "{rounded.sm}"
    padding: "0.6rem 0.85rem"
  search-input:
    backgroundColor: "transparent"
    textColor: "{colors.paper-cream}"
    rounded: "{rounded.sm}"
    padding: "0.7rem 1rem"
  tag-chip:
    backgroundColor: "transparent"
    textColor: "{colors.ink-soft}"
    rounded: "{rounded.pill}"
    padding: "0.5rem 0.85rem"
---

# Design System: The Lasso Way

## Overview

The Lasso Way is a standalone mini-project inside the site. It feels like a worn football clubhouse and a folded matchday programme: navy paint, paper cream, belief yellow, Richmond red, ink rules, and generous editorial type.

The experience has two jobs: find a line for a situation, then browse the full quote field by theme. Episode evidence stays visible. Scene references stay honest about their source.

## Colors

- Clubhouse navy is the working surface.
- Navy deep is the page ground.
- Paper cream holds the selected quote.
- Belief yellow marks action and focus.
- Richmond red marks source links and small moments of emphasis.
- Ink soft carries supporting copy.

## Typography

Georgia or Times New Roman gives quotes a human, editorial voice. System sans-serif handles controls, labels, and evidence. Display type is large, tight, and short enough to read in one breath.

## Layout

Use a wide, quiet canvas with a 1.5rem minimum gutter. Let the selected quote carry the main visual weight, then follow it with the searchable field list. Keep metadata near the quote it proves.

## Elevation & Depth

No gradients. No hard offset shadows. Depth comes from paper cream against navy, thin rules, image crops, and small shifts on interaction.

## Shapes

Quote cards and buttons use square corners. Tags may use a pill shape because they are filters, not containers. Borders stay thin and warm.

## Components

- Primary buttons use paper cream on navy.
- Secondary buttons remain transparent with a quiet border.
- Search fields use a bottom rule, not a floating box.
- Tags expose their active state with belief yellow.
- Quote rows pair the line with its episode and source.
- Original illustrations are used until licensed stills are available.

## Do's and Don'ts

- Do keep the selected line central.
- Do show season, episode, title, and source link.
- Do keep fan-made and licensing language visible.
- Do preserve keyboard focus and reduced motion.
- Do cut copy until every word earns its place.
- Don't add eyebrow copy above the hero.
- Don't imply original art is an official still.
- Don't use actor likenesses without a licensed or user-supplied asset.
