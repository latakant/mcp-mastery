# MCP Mastery — 7-Day Builder Journey

Learning MCP (Model Context Protocol) by building real servers, not following tutorials.

**Goal:** One deployed production-grade MCP server + portfolio repo + interview narrative.
**Stack:** TypeScript · Node.js 22 · better-sqlite3 · Express · Zod · Railway

---

## Daily Progress

| Day | Topic | Status | Artifact |
|-----|-------|--------|----------|
| 0 | Environment + Repo Setup | ✅ Done | This repo |
| 1 | Protocol Mastery | ✅ Done | `day1-protocol-notes.md` |
| 2 | First stdio Server | ✅ Done | `day2-wordcount/` |
| 3 | External API Server | ✅ Done | `day3-github-server/` |
| 4 | Resources + Prompts | ✅ Done | `day4-resource-server/` |
| 5 | HTTP + Database | ✅ Done | `day5-http-db-server/` |
| 6 | Portfolio Build | ✅ Done | [local-devops-server](https://github.com/latakant/local-devops-server) |
| 7 | Deploy + Interview Prep | ✅ Done | [mcp-sqlite-server on Render](https://mcp-sqlite-server-yfg5.onrender.com/health) |

---

## The Two Maps Everything Points To

Every day in this journey builds toward understanding two things:
how Claude *thinks through a problem* using MCP, and how an MCP server *works at the infrastructure level*.

---

### Map 1 — The Cognitive Flow (what Claude does)

```
USER PROBLEM
     ↓
Prompt          — goal framing: constrains HOW Claude thinks, not just what it outputs
     ↓
Resource        — context: what Claude knows before acting
     ↓
Tool            — action: what Claude does in the world
     ↓
Output          — solution: structured, traceable, explainable
```

This is the MCP mental model. Not "call a function." A complete cognitive loop.

---

### Map 2 — The Infrastructure Stack (what the server does)

```
HTTP                — transport layer: how requests arrive
  ↓
Auth                — who is allowed to call this server
  ↓
Session Isolation   — each client gets its own MCP runtime
  ↓
MCP Runtime         — McpServer: routes requests to the right tool/resource/prompt
```

And inside each tool call:

```
Claude
  ↓
JSON-RPC            — the wire format: { jsonrpc, id, method, params }
  ↓
Transport           — stdio (local) or HTTP+SSE (multi-client)
  ↓
MCP Server          — receives the request, dispatches to handler
  ↓
Input               — arguments from Claude
  ↓
Validation          — Zod schema check (before any logic runs)
  ↓
Logic               — the actual work: shell exec, DB query, file read
  ↓
Structured Error    — { content: [...], isError: true } — never throw
```

---

## Day-by-Day: What Was Learned and Where It Fits

---

### Day 1 — Protocol Mastery

**What was learned:**
JSON-RPC 2.0 anatomy: every message is `{ jsonrpc, id, method, params }`.
The 3 primitives: Tool (POST/action) · Resource (GET/context) · Prompt (template/constraint).
The two transports: stdio for local Claude Desktop, HTTP+SSE for multi-client production.

**Where it fits in the maps:**

_Request Pipeline:_ Day 1 is the conceptual backbone of the full pipeline. Before writing any code, the question is: "what travels over the wire?" The answer is JSON-RPC, and understanding it means every error, every tool call, every response has a predictable shape.

```
Claude → JSON-RPC → Transport → MCP Server    ← this whole chain is Day 1 theory
```

_Cognitive Flow:_ Day 1 is where the 3 primitives are defined but not yet felt. You know Tool = action, Resource = context, Prompt = template. But you haven't used them together, so the flow is abstract.

---

### Day 2 — First stdio Server (Text Analysis)

**What was learned:**
`McpServer` + `StdioServerTransport` wired together.
Zod schema validation on tool inputs.
`isError: true` for structured error responses — never `throw`.
Tool boundary design: 3 single-responsibility tools (`word_count`, `char_count`, `reading_time`) instead of one `analyze_text` mega-tool.

**Where it fits in the maps:**

_Request Pipeline:_ The bottom half of the pipeline becomes real for the first time.

```
Input → Validation (Zod) → Logic → Structured Error    ← Day 2 is this layer
```

The insight about single-responsibility tools is a permanent design rule: tools compose better when each does one thing. Claude can chain `word_count` → `reading_time` as separate calls. A mega-tool would force it to parse composite output.

_Cognitive Flow:_ Tool (Action) is live. Resource and Prompt are still future work. The output is a structured response — the first time you see Claude receive clean, typed data from a tool instead of raw text.

---

### Day 3 — External API Server (GitHub Intelligence)

**What was learned:**
Real-world tool integration: HTTP client, environment variables for auth (`process.env.GITHUB_TOKEN`).
Error handling for external services: rate limits (429), network failures, non-200 responses.
Return structured markdown output from tools, not raw JSON — Claude reads it better.
Security rule internalized: `NEVER db.exec(userInput.sql)` — always parameterized.

**Where it fits in the maps:**

_Request Pipeline:_ The Logic layer gets real complexity. Logic is no longer pure computation — it calls the network, can fail, must retry, must return `isError: true` gracefully.

```
Logic               — external API call, timeout, retry, format markdown
  ↓
Structured Error    — { content: [...], isError: true } on every failure path
```

_Cognitive Flow:_ Tool (Action) deepens. The tool is no longer computing a formula — it is fetching live data, formatting it for Claude to reason over, and returning structured context. The output of `get_repo_info` feeds directly into the next reasoning step.

---

### Day 4 — Resources + Prompts (File + Log Server)

**What was learned:**
Static resources (fixed URI) vs dynamic resources (`ResourceTemplate` with parameters like `file://logs/{date}`).
Prompts as reusable reasoning templates — not just formatting, but structured instructions for how Claude should think.
The 3-primitive workflow: Resource (read changelog) → Tool (analyze it) → Prompt (generate structured report).

**Where it fits in the maps:**

_Cognitive Flow:_ **This is the day the top map becomes real.** Before Day 4, the Cognitive Flow was theoretical. After Day 4, you have built all three primitives and connected them:

```
USER PROBLEM
     ↓
Prompt (generate_report)     — constrains how Claude structures the analysis
     ↓
Resource (project-changelog) — Claude reads context before calling the tool
     ↓
Tool (analyze_changelog)     — Claude acts on the context it just loaded
     ↓
Output                       — structured health report
```

The key insight: Resources are *memory surfaces*. Not data endpoints. Claude reads a resource to have context before acting — the same way a senior engineer reads the changelog before diagnosing a bug.

_Request Pipeline:_ ResourceTemplate wires the `{date}` parameter into the URI resolution. Prompts wire a message template into Claude's reasoning context. Both are MCP Server features, not transport features.

---

### Day 5 — HTTP Transport + Database

**What was learned:**
`StreamableHTTPServerTransport` instead of stdio — multi-client capable.
Express middleware layer: JSON parsing, Bearer token auth (401 vs 403).
Session isolation: `Map<sessionId, { server, transport }>` — each HTTP client gets its own MCP runtime.
Parameterized SQLite queries via `better-sqlite3` — ALLOWED_TABLES whitelist, never raw SQL from user input.

**Where it fits in the maps:**

_Infrastructure Stack:_ **This is the day the Infrastructure Map becomes real.**

```
HTTP                — Express app.post('/mcp'), app.get('/mcp')
  ↓
Auth                — requireAuth middleware: Bearer token, 401/403 enforcement
  ↓
Session Isolation   — Map<sessionId, McpServer> — two clients can't see each other
  ↓
MCP Runtime         — createMcpServer() per session, not one global server
```

Before Day 5, MCP was a single process talking to a single client (stdio). Day 5 makes it multi-client infrastructure. The session map is the key architectural decision: one `McpServer` per session means state is isolated. You can't leak tool call history between clients.

_Cognitive Flow:_ The same 5 tools (`query_safe`, `insert_safe`, `schema_list`, `describe_table`, `analytics_summary`) follow the full pipeline. The difference is the transport layer is now HTTP — but from the Cognitive Flow perspective, Tool → Output looks identical. Transport is invisible to the reasoning layer. That invisibility is by design.

---

### Day 6 — Portfolio Build (Local DevOps MCP Server)

**Repo:** [github.com/latakant/local-devops-server](https://github.com/latakant/local-devops-server)

**What was learned:**
Prompts as *behavioral governance*, not just formatting. `explain_failure` forces Claude through: observation → recent changes → causal chain → root cause → fix. It prohibits jumping to solutions. This is the difference between a prompt template and a reasoning constraint.

Observability as infrastructure: `logger.ts` writes structured JSON per tool call. `metrics.ts` tracks calls/errors/timing. Both are first-class, not afterthoughts.

Failure orchestration: `run_tests` failure output includes an explicit next-step hint: `Use read_logs then explain_failure`. This is designed — the tool's output is formatted to feed the next tool in the chain.

**Where it fits in the maps:**

_Cognitive Flow:_ **This is the day the map runs end-to-end on a real problem.**

```
USER PROBLEM     — "Why is my deployment failing?"
     ↓
Prompt           — explain_failure: forces causal reasoning path (5 steps, 3 PROHIBITED shortcuts)
     ↓
Resource         — file://src/{path}: loads the failing module for context
                   db://test-results/{date}: loads historical baseline for comparison
     ↓
Tool             — run_tests → read_logs → env_check (failure orchestration chain)
     ↓
Output           — root cause + one specific fix, not a guess
```

_Infrastructure Stack:_ stdio transport (local DevOps tools must run locally), but the full pipeline is instrumented.

```
Claude → JSON-RPC → StdioTransport → McpServer
  ↓
Input → Validation (Zod) → Logic → Structured Error
         ↓
       logger.ts          ← instruments every tool call
       metrics.ts         ← exposed as mcp://devops/metrics resource
```

The two verdicts Day 6 closes:
- Prompts are not templates. They are behavioral governance — constraints on how Claude reasons, not just how it formats output.
- Observability is not optional. If you don't know which tools fail most, you can't improve the system.

---

## The Full Picture

After Day 6, both maps are fully built:

```
MAP 1 — COGNITIVE FLOW            MAP 2 — INFRASTRUCTURE STACK

USER PROBLEM                      HTTP (Day 5: Express)
     ↓                              ↓
Prompt (Day 4+6: constraint)      Auth (Day 5: Bearer middleware)
     ↓                              ↓
Resource (Day 4: context surface) Session Isolation (Day 5: Map<id, McpServer>)
     ↓                              ↓
Tool (Day 2: action)              MCP Runtime (Day 2: McpServer + transport)
     ↓                              ↓
Output (Day 2: structured)        Request Pipeline:
                                    Claude → JSON-RPC (Day 1)
                                      → Transport (Day 2: stdio, Day 5: HTTP)
                                      → McpServer → Input → Validation (Day 2: Zod)
                                      → Logic (Day 3: external, Day 5: DB)
                                      → Structured Error (Day 2: isError: true)
```

Day 7 adds deployment (Railway) and the interview narrative.

---

## Key Design Rules (from experience, not theory)

| Rule | Where it came from |
|------|--------------------|
| Single-responsibility tools compose better | Day 2: `word_count` vs one `analyze_text` |
| Resources are memory surfaces, not data endpoints | Day 4: changelog resource before tool call |
| Never raw SQL — always parameterized | Day 3/5: security rule, first stated then built |
| Prompts constrain reasoning, not just format | Day 6: `explain_failure` prohibits shortcuts |
| Sessions must be isolated | Day 5: one `McpServer` per client, not one global |
| `isError: true` on every failure path | Day 2: never throw from a tool handler |
| Observability is infrastructure | Day 6: `logger.ts` + `metrics.ts` are first-class |

---

## Protocol Stack

```
MCP    model ↔ tool          capability layer   (this repo)
A2A    agent ↔ agent         coordination layer (next)
Cortex governance layer      when/whether to act (C:/luv/Cortex)
```

---

## Live Deployment

**Day 5 server deployed on Render:**
```
https://mcp-sqlite-server-yfg5.onrender.com
```

| Endpoint | Auth required | What it does |
|----------|--------------|-------------|
| `GET /health` | No | Server status + session count |
| `POST /mcp` | Yes — `Bearer mcp-demo-2026` | MCP JSON-RPC endpoint |
| `GET /mcp` | Yes | SSE stream for server→client messages |

Test it live:
```bash
curl https://mcp-sqlite-server-yfg5.onrender.com/health
```

> Free tier — first request after inactivity takes ~50s to wake. Subsequent requests are fast.

---

*Started: 2026-05-14 · Day 7 complete: 2026-05-17*
