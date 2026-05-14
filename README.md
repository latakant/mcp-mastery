# MCP Mastery — 7-Day Builder Journey

Learning MCP (Model Context Protocol) by building real servers, not following tutorials.

**Goal:** One deployed production-grade MCP server + portfolio repo + interview narrative.

**Stack:** TypeScript · Node.js 22 · Claude Desktop · Railway

---

## Daily Progress

| Day | Topic | Status | Artifact |
|-----|-------|--------|----------|
| 0 | Environment + Repo Setup | ✅ Done | This repo |
| 1 | Protocol Mastery | ⬜ | `day1-protocol-notes.md` |
| 2 | First stdio Server | ⬜ | `day2-wordcount/` |
| 3 | External API Server | ⬜ | `day3-github-server/` |
| 4 | Resources | ⬜ | `day4-resource-server/` |
| 5 | HTTP + Database | ⬜ | `day5-http-db-server/` |
| 6 | Portfolio Build | ⬜ | `day6-portfolio-server/` → own repo |
| 7 | Deploy + Interview Prep | ⬜ | Live URL + screen recording |

---

## What I'm Building

**Day 6 target (portfolio piece):** Local DevOps MCP Server

Gives Claude operational access to a dev environment:
- Run tests and explain failures
- Read git status and generate commit messages
- Tail logs by service
- Verify environment variables

All three MCP primitives: tools + resources + prompts.

---

## Key Decisions

- **Tool boundary design** — single-responsibility tools compose better than one mega-tool
- **Resources are memory surfaces** — not just data endpoints, persistent context for agents
- **Shadow-first** — observe before enforce (same principle as Cortex governance layer)
- **Deploy on Day 7** — localhost is not production

---

## Protocol Stack Context

```
MCP    model ↔ tool          capability layer   (this repo)
A2A    agent ↔ agent         coordination layer (next)
Cortex governance layer      when/whether to act (C:/luv/Cortex)
```

---

*Started: 2026-05-14*
