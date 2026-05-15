# MCP Mastery — Concept Map
# Every concept, where it lands, where it deepens.
# Last updated: 2026-05-15

---

## The Full Map

| Concept | Day Introduced | Day Deepened |
|---------|---------------|--------------|
| Tool boundary design | Day 2 | Day 6 |
| Zod validation | Day 3 | Day 6 |
| Auth / env secrets | Day 3 | Day 5 (server-side Bearer) |
| `isError: true` | Day 3 | Day 4 (valid state nuance) |
| Rate limit retry | Day 3 | — |
| Static resources | Day 4 | Day 6 |
| Dynamic resources | Day 4 | Day 6 |
| Prompts | Day 4 | Day 6 |
| HTTP transport | Day 5 | Day 7 (deploy) |
| Session isolation | Day 5 | — |
| Multiple tools / composition | Day 6 | — |
| Deploy / public URL | Day 7 | — |

---

## Why the sequence is this order

```
Day 2  Tool boundary design first — before any external system.
       You must know how to decompose before you add network complexity.

Day 3  Defense layers — because external APIs introduce failure modes.
       Auth, validation, error contracts, retry all arrive together.

Day 4  Resources — only after tools are solid.
       Resources need tools to be useful. Tool → Resource → Prompt is the natural chain.

Day 5  HTTP — only after all 3 primitives are understood.
       Changing transport doesn't change the primitives. But you must know the primitives
       before transport complexity is introduced.

Day 6  Composition — only after every individual concept is locked in.
       Multiple tools + resources + prompts in one server. This is where everything
       learned on Days 2–5 runs simultaneously.

Day 7  Deploy — last, intentionally.
       "localhost" is not a portfolio. But deploy without a solid server is just
       a broken URL. The server has to be complete before it goes live.
```

---

## The nuance each "Day Deepened" adds

| Concept | Introduced as | Deepened to |
|---------|--------------|-------------|
| Tool boundary design | One tool = one job | Multiple tools that compose in a real workflow |
| Zod validation | Validate inputs before network | Validate across 4 tools + resources + prompts |
| Auth / env secrets | Protect upstream API (GITHUB_TOKEN) | Protect your own server (Bearer middleware) |
| `isError: true` | Always return on failure | Know the difference: system failure vs valid empty state |
| Static resources | Fixed URI, fixed file | Mix of file types, MIME types, real project context |
| Dynamic resources | URI template with one param | Multiple templates serving different data types |
| Prompts | Single workflow template | Three prompts: explain · commit · release notes |
| HTTP transport | Concept introduced | Actually deployed to Railway with a public URL |

---

## What "Day Deepened = —" means

Rate limit retry, session isolation, and deploy/public URL are introduced once and not revisited.

- **Rate limit retry** — the pattern is complete at Day 3. Retry once, respect Retry-After, fail clean. No further nuance needed.
- **Session isolation** — introduced at Day 5 as an architecture constraint. Day 6 and 7 inherit it but don't expand on it.
- **Deploy / public URL** — Day 7 is the final day. Nothing deepens after it.

---

## Reading this map

A concept with `Day Deepened = Day 6` means Day 6 is where it gets tested under real complexity.
Day 6 is the portfolio server — 4 tools, resources, prompts, all running together.
Every concept that deepens at Day 6 is being stress-tested at that point.

If Day 6 breaks, it's because one of those concepts wasn't fully understood.
That's intentional. Day 6 is the integration exam.
