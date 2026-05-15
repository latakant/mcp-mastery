# MCP Developer Training — Day 0→3 Strategic Consolidation
# From "Tool User" → "Capability Architect"
# Source: Chat 3 — 2026-05-15

---

## The Threshold Crossed

MCP is no longer "Claude plugins."
MCP is **protocol-governed capability infrastructure.**

```
Model + Tools + Resources + Prompts = Agentic System

Without MCP:  static context · no execution · no external memory
With MCP:     APIs · files · DBs · search · automation · reusable workflows
```

Enterprise analogy:
```
REST:  App ↔ Server
MCP:   Model ↔ Capability Ecosystem
```

---

## The 3 Primitives

| Primitive | Mental Model | Does | Examples |
|-----------|-------------|------|---------|
| **Tool** | POST endpoint | Action — "do something" | Call GitHub, run SQL, deploy |
| **Resource** | GET endpoint | Read — "get something" | Read file, fetch logs, load policy |
| **Prompt** | Workflow template / SOP | Reuse — "follow a system" | Incident triage, code review, research |

---

## Day 1 — The Protocol Layer

JSON-RPC 2.0 is not "just JSON." It is a **deterministic machine contract.**

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {} }
```

| Field | Role |
|-------|------|
| `jsonrpc` | Protocol version lock |
| `id` | Request-response correlation |
| `method` | Capability being invoked |
| `params` | Execution payload |

**Architecture shift:** "function call" → "protocol message"

**Transport:**
- `stdio` = local process capability (Claude Desktop, single machine, dev)
- `HTTP+SSE` = distributed capability infrastructure (production, multi-user, remote)

**Critical rule — Resilience > purity:**
```
Throw → capability dies
isError: true → system survives
```

---

## Day 2 — Tool Boundary Engineering

**Bad:** Fat tool `analyze_text()` — mixed responsibilities, no composability
**Good:** `word_count()` · `char_count()` · `reading_time()` — one tool, one job

**Core principle:** Claude orchestrates. Small tools compose, debug, scale, and govern better.

**System design law:** Modular tools > Smart tools

What you actually learned: **capability decomposition** — backend modularity transformed into AI infrastructure.

---

## Day 3 — Defensive MCP (5 Defense Layers)

"Now the network can fail." This is where toy MCP ends.

New attack surface: bad inputs · auth leakage · rate limits · 404s · 403s · downtime · malformed data

### Layer 1 — Zod Validation
```typescript
owner: z.string().min(1)
```
Rule: Validate BEFORE compute. BEFORE network. BEFORE cost.

Hidden superpower: Zod generates Claude-readable schema. Your `.describe()` calls are runtime instructions for the model — you are programming Claude's tool-use quality.

### Layer 2 — Secrets Isolation
```typescript
process.env.GITHUB_TOKEN
```
Rule: Source code is public by default. Secrets are runtime only.
Pattern: `.env` (gitignored) + `.env.example` (ships) + optional auth fallback.

### Layer 3 — Catch Everything
```typescript
try { ... } catch (err) { return { content: [...], isError: true } }
```
Rule: Tool failure ≠ Server failure. One bad request must not terminate capability infrastructure.

### Layer 4 — Rate Limit Strategy
```typescript
429 → Retry-After header → retry once → graceful failure
```
Rule: Be a good ecosystem citizen. Controlled retry + graceful failure. Never infinite retries.

### Layer 5 — Output Contracts
Bad: raw JSON blob
Good: structured markdown (`## repo`, `**Stars:** ...`)
Rule: Claude reasons faster from semantic structure than raw payload. Output formatting is part of protocol design.

---

## Day 3's True Lesson

> Tools are adapters. Adapters need contracts, safety, and transformation.

**MCP server full responsibility map:**
1. Accept request
2. Validate input
3. Authenticate
4. Execute capability
5. Handle failure
6. Transform output
7. Return protocol-safe response

**The real definition of what you built:**
Not "call API" → "Safely operationalize capability for AI systems"

Beginner says: "I built a tool."
Reality: you built a contract · security boundary · runtime adapter · failure policy · output interface.

---

## Current MCP Maturity

| Area | What you know |
|------|--------------|
| Protocol | JSON-RPC 2.0 wire format |
| Capability types | Tools / Resources / Prompts |
| Execution | stdio / HTTP+SSE |
| Design | Single responsibility decomposition |
| Safety | Validation · secrets · error contracts · retry |
| UX | Structured markdown output |

**MCP = Capability Governance Layer** (not a tool caller)

---

## Day 4 Preview — Resources

Major shift: **from action systems → context systems**

```
Tools    = hands   (Claude acts)
Resources = memory  (Claude thinks with external data)
Prompts  = process  (Claude follows a system)
```

Once Resources arrive, you stop building "tool bots" and start building **Knowledge Operating Systems.**

Progression: Backend Engineer → MCP Systems Builder → **Context Architect** (Day 4+)
