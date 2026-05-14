# Day 1 — Protocol Mastery Notes

---

## JSON-RPC 2.0 Request Anatomy

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "word_count", "arguments": { "text": "hello world" } }
}
```

| Field | Always present | Purpose |
|---|---|---|
| `jsonrpc` | yes | Always `"2.0"` — version lock |
| `id` | yes (null for notifications) | Links request to response |
| `method` | yes | What to call — namespace/verb e.g. `tools/call` |
| `params` | optional | Payload |

---

## The 3 Primitives

| Primitive | Backend analogy | What it does |
|---|---|---|
| Tool | POST endpoint | Execute an action, return a result |
| Resource | GET endpoint | Read data — file, DB row, live feed |
| Prompt | Stored procedure / template | Reusable workflow, parameterized |

---

## Transport: stdio

- MCP server runs as a **child process** spawned by Claude Desktop
- Communication: newline-delimited JSON over **stdin** (request in) and **stdout** (response out)
- One client only. Local machine only. No network involved.
- Claude Desktop spawns the process on startup, kills it on close
- Config: `%APPDATA%\Claude\claude_desktop_config.json`
  ```json
  {
    "mcpServers": {
      "my-server": {
        "command": "node",
        "args": ["C:/absolute/path/to/index.js"]
      }
    }
  }
  ```
- Use when: Claude Desktop integration, local DevOps tools, single developer

---

## Transport: HTTP+SSE

- Server is a **long-running HTTP process** (Express etc.)
- Requests: client sends `POST /mcp` with JSON-RPC body
- Responses: server streams back via **SSE** (`GET /sse`, `text/event-stream`)
- **Multiple clients, each with their own session ID** — sessions are isolated, no state bleed
- Auth: Bearer token middleware on every request
- Transport class: `StreamableHTTPServerTransport`
- Use when: remote deploy, multi-user, production API, anything needing a public URL

---

## Full Request Lifecycle

```
1.  User types a prompt in Claude Desktop
2.  Claude decides a tool call is needed
3.  Claude Desktop serializes → JSON-RPC request → stdin of server process
4.  MCP Server reads stdin, parses the JSON-RPC envelope
5.  Server routes method ("tools/call") → registered handler
6.  Handler executes logic (API call / file read / shell command)
7.  Handler returns: { content: [...], isError?: boolean }
8.  Server serializes → JSON-RPC response → stdout
9.  Claude Desktop reads stdout, parses result.content
10. Claude uses result to continue generating
```

Claude waits synchronously at step 3–9 before continuing.

---

## Error Shape

```json
{
  "content": [{ "type": "text", "text": "GitHub API returned 403: rate limit exceeded" }],
  "isError": true
}
```

Never throw from a tool handler. Catch everything and return `isError: true`.
Unhandled exceptions crash the server process — Claude gets nothing.

---

## Key Insight

Resources are **memory surfaces**. This matters because agents need persistent context
across a session. Without resources, every tool call is stateless. With resources,
Claude reads your codebase, logs, or config *before* acting. That is the difference
between a one-shot tool and an agentic system.
