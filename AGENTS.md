# AGENTS.md

This file is for human-agent collaboration in this repo.

## Product Context

- Project: `Get2MD`
- Goal: export Get notes into Markdown with a local-first workflow.
- Product shape: public landing page + separate tool page.
- Current stage: lightweight MVP, not a SaaS product.

## Core Constraints

- Do not add login, database, or cloud sync unless explicitly requested.
- Treat `API Key` and `Client ID` as sensitive data in all docs and UI copy.
- Keep the product local-first in wording and behavior.
- Prefer simple static frontend changes over adding frameworks unless clearly needed.

## User-Facing Copy Rules

- Website copy must speak to end users, not to collaborators or agents.
- Do not mention implementation process in the UI.
- Do not write phrases like:
  - "I changed..."
  - "You asked me to..."
  - "Based on your feedback..."
  - "This was moved to the homepage..."
- Do not expose design rationale or edit history inside the product UI.
- Show only information that helps a visitor understand the product, trust it, and use it.

## Homepage Direction

- Keep the first screen light, calm, and easy to scan.
- The hero should answer only:
  - what this tool is
  - why it is useful
  - what the main action is
- Move detailed explanation lower on the page.
- Privacy and FAQ content can live on the homepage, but the hero should not feel crowded.

## Design Preferences

- Prefer a modern, restrained product feel over a generic marketing page.
- Strong visual atmosphere is okay, but it should not overpower clarity.
- Avoid stuffing too much text into the hero.
- Prefer concise sections, clear hierarchy, and scroll-based reading.
- Keep components clean and structured; avoid decorative clutter.

## Working Notes

- Existing project docs:
  - `README.md`
  - `docs/PRD.md`
  - `docs/PROGRESS.md`
- Add new decisions to focused docs under `docs/` instead of bloating README.
