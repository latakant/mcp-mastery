# Day 1 — Protocol Mind Map

```
MCP PROTOCOL — COMPLETE MENTAL MODEL
═══════════════════════════════════════════════════════════════════

  WIRE FORMAT
  ──────────────────────────────────────────
  JSON-RPC 2.0
  ┌─────────────┬──────────────────────────────────────────────┐
  │ jsonrpc     │ always "2.0"                                 │
  │ id          │ links request ↔ response  (null=notification)│
  │ method      │ namespace/verb  e.g. tools/call              │
  │ params      │ payload (optional)                           │
  └─────────────┴──────────────────────────────────────────────┘

  3 PRIMITIVES
  ──────────────────────────────────────────
  Tool         POST endpoint    → execute action, return result
  Resource     GET endpoint     → read context before acting
  Prompt       Stored template  → reusable parameterized workflow

                     ↑
       KEY INSIGHT: Resource = memory surface
       Agents read Resources to stay in context
       across multiple tool calls. Without this
       → every call is stateless.

  2 TRANSPORTS
  ──────────────────────────────────────────
  stdio                          HTTP + SSE
  ───────────────────────────    ─────────────────────────────
  child process (spawned by      long-running HTTP server
  Claude Desktop)
                                 POST /mcp   ← requests
  stdin  ← JSON-RPC request      GET  /sse   ← streamed responses
  stdout → JSON-RPC response
                                 multiple clients, session-isolated
  1 client, local only           auth: Bearer token on every req
  no network                     transport: StreamableHTTPServerTransport

  use when: Claude Desktop,      use when: remote deploy,
  local DevOps, single user      multi-user, public URL

  REQUEST LIFECYCLE (stdio)
  ──────────────────────────────────────────
  1. User types prompt
  2. Claude decides → tool call needed
  3. Claude Desktop → JSON-RPC → server stdin
  4. Server parses envelope
  5. Routes method → handler
  6. Handler executes (API / file / shell)
  7. Handler returns { content, isError? }
  8. Server → JSON-RPC → stdout
  9. Claude Desktop parses result.content
  10. Claude continues generating

  ↑ synchronous — Claude waits at step 3–9

  ERROR SHAPE
  ──────────────────────────────────────────
  {
    "content": [{ "type": "text", "text": "what went wrong" }],
    "isError": true
  }

  NEVER throw → server crashes → Claude gets nothing
  ALWAYS catch → return isError: true → Claude decides next step

  METHOD NAMESPACE
  ──────────────────────────────────────────
  initialize              handshake — exchange capabilities
  tools/list              what tools exist + their schemas
  tools/call              execute a tool
  resources/list          what resources exist
  resources/read          read a resource by URI
  resources/templates/list  dynamic URI templates
  prompts/list            what prompts exist
  prompts/get             render a prompt with arguments

═══════════════════════════════════════════════════════════════════
```
