# Day 1 Reference — MCP Protocol Mastery

---

## JSON-RPC 2.0 — Wire Format

Every MCP message is JSON-RPC 2.0. Four fields on every request:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "word_count",
    "arguments": { "text": "hello world" }
  }
}
```

| Field | Type | Purpose |
|---|---|---|
| `jsonrpc` | string | Always `"2.0"` — version lock |
| `id` | number / string / null | Links request → response. Null = notification (no response expected) |
| `method` | string | What to call. Pattern: `namespace/verb` |
| `params` | object | Payload. Optional. |

**Success response:**
```json
{ "jsonrpc": "2.0", "id": 1, "result": { ... } }
```

**Error response:**
```json
{ "jsonrpc": "2.0", "id": 1, "error": { "code": -32600, "message": "Invalid request" } }
```

---

## The 3 Primitives

| Primitive | Backend analogy | When Claude uses it |
|---|---|---|
| **Tool** | POST endpoint | Execute an action, get a result |
| **Resource** | GET endpoint | Read context — file, DB, live data |
| **Prompt** | Stored procedure / template | Reusable multi-step workflow |

### Tool
- Claude calls it to DO something
- Receives structured params → returns content
- Method: `tools/call`

### Resource
- Claude reads it to KNOW something
- Static (fixed URI) or dynamic (URI template with variables)
- Method: `resources/read`
- **Key insight:** Resources are memory surfaces. An agent reads a Resource *before* acting to stay in context across the session. This is what separates agentic systems from one-shot tools.

### Prompt
- Claude gets it to FOLLOW a workflow
- Pre-defined template with parameter slots
- Method: `prompts/get`
- Returns a structured message array Claude uses as its instructions

---

## Transport: stdio

```
Claude Desktop process
    │
    ├──(stdin  JSON-RPC)──→ MCP Server (child process)
    └──(stdout JSON-RPC)←── MCP Server (child process)
```

- Server is spawned as a **child process** by Claude Desktop
- Communication: newline-delimited JSON over stdin/stdout
- **One client. Local machine only.**
- Lifecycle: server starts when Claude Desktop opens, stops when it closes
- Config location (Windows): `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "my-server": {
      "command": "node",
      "args": ["C:/absolute/path/to/index.js"],
      "env": { "MY_VAR": "value" }
    }
  }
}
```

**Use stdio when:** Claude Desktop integration, local DevOps tools, development, single-user

---

## Transport: HTTP+SSE

```
Client A ──POST /mcp──→ ┐
                         │  MCP HTTP Server (long-running process)
Client B ──POST /mcp──→ ┘
         ←── GET /sse ── server-sent events (streaming responses)
```

- Server is a **standalone HTTP process** (e.g. Express)
- Requests: HTTP POST. Streaming responses: SSE (text/event-stream)
- **Multiple clients. Session-isolated. Remote-capable.**
- Each client gets a `sessionId` — session state does not bleed between clients
- Auth: Bearer token middleware on every request
- Transport class: `StreamableHTTPServerTransport`

**Use HTTP+SSE when:** remote deploy, multi-user, production API, anything that needs a public URL

---

## Full Request Lifecycle (stdio)

```
1. User types prompt in Claude Desktop
2. Claude decides a tool call is needed
3. Claude Desktop serializes → JSON-RPC request → server stdin
4. MCP Server reads stdin, parses the JSON-RPC envelope
5. Server routes method ("tools/call") → registered handler
6. Handler executes logic (API call / file read / shell command)
7. Handler returns: { content: [...], isError?: boolean }
8. Server serializes → JSON-RPC response → stdout
9. Claude Desktop reads stdout, parses result.content
10. Claude incorporates result, continues generating
```

Synchronous from Claude's perspective — it waits for each tool response before continuing.

---

## Error Shape

**Never throw from a tool handler.** Return this instead:

```json
{
  "content": [{ "type": "text", "text": "GitHub API 403: rate limit exceeded. Retry after 60s." }],
  "isError": true
}
```

Why: Unhandled exceptions crash the server process. Claude gets nothing and the session dies.
With `isError: true`, Claude reads the failure message and can decide what to do (retry, skip, escalate).

**Rule:** Every tool handler wraps its logic in try/catch. Catch returns isError shape.

```typescript
try {
  const result = await doWork(params);
  return { content: [{ type: 'text', text: result }] };
} catch (err) {
  return {
    content: [{ type: 'text', text: `Error: ${err.message}` }],
    isError: true
  };
}
```

---

## MCP Method Reference

| Method | What it does |
|---|---|
| `initialize` | Handshake — client declares capabilities, server responds with its own |
| `tools/list` | Returns all registered tools with schemas |
| `tools/call` | Executes a tool |
| `resources/list` | Returns all registered resources |
| `resources/read` | Reads a specific resource by URI |
| `resources/templates/list` | Returns URI templates for dynamic resources |
| `prompts/list` | Returns all registered prompts |
| `prompts/get` | Returns a rendered prompt with arguments substituted |

---

## Content Types

Tool results and resource contents use typed content blocks:

```typescript
{ type: 'text', text: string }           // plain text or markdown
{ type: 'image', data: base64, mimeType: string }  // image
{ type: 'resource', resource: { uri, text, mimeType } }  // embedded resource
```

Most tools return `text`. Images for visual tools. Embedded resources for context-heavy responses.
