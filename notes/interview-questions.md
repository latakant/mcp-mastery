# MCP Interview Questions — Day by Day

Each day builds knowledge that maps directly to an interview question.
Know the answer from your own build experience — not from this file.

---

## Day 1 — Protocol (What is MCP / how does it work)

**Q: What is MCP?**
> A protocol that gives language models structured access to external capabilities — tools to execute actions, resources to read context, prompts to follow workflows. Wire format is JSON-RPC 2.0.

**Q: Walk me through a tool call end to end.**
> User prompt → Claude decides tool is needed → Claude Desktop serializes JSON-RPC → sends to server stdin → server routes to handler → handler executes → returns `{ content, isError }` → server writes to stdout → Claude Desktop parses → Claude continues.

**Q: What's the difference between stdio and HTTP transport?**
> stdio = child process, local only, one client, Claude Desktop spawns it via stdin/stdout.
> HTTP+SSE = long-running HTTP server, multiple clients, session-isolated, remote-capable, needs auth middleware.

**Q: What are the 4 fields in a JSON-RPC request?**
> `jsonrpc` (always "2.0"), `id` (links to response, null for notifications), `method` (namespace/verb), `params` (optional payload).

**Q: What does `isError: true` do?**
> Signals a tool failure to Claude without crashing the server. Claude reads the error message and decides what to do next. If you throw instead, the process can crash and Claude gets nothing.

---

## Day 2 — Tool Design (Build quality / single responsibility)

**Q: How do you decide where to draw the boundary between tools?**
> Single responsibility. If a tool name has "and" in it, split it. One tool that does word count + char count + reading time can't fail independently. Three focused tools compose better — Claude can chain only what it needs and each can fail without breaking the others.

**Q: How do you validate tool inputs?**
> Zod schema on every handler. Parse before touching any logic. If Zod throws, catch it and return `isError: true` with the validation message. Never trust `args` directly.

**Q: What happens if a tool throws an uncaught exception?**
> The server process can crash. Claude gets no response. That's why every tool handler wraps logic in try/catch and returns `isError: true` on failure. Production tools never throw.

**Q: How do you wire an MCP server to Claude Desktop?**
> Edit `%APPDATA%\Claude\claude_desktop_config.json`. Add the server under `mcpServers` with `command` (node) and `args` (absolute path to built JS file). Restart Claude Desktop. Check the developer settings for a green dot.

---

## Day 3 — External APIs (Production mindset)

**Q: How do you handle rate limits from a third-party API?**
> Check for 429 response. Read `Retry-After` header. Wait that many seconds. Retry once. If it fails again, return `isError: true` with a clear message. Never silently swallow 429s.

**Q: How do you store API tokens in an MCP server?**
> `.env` file, loaded with `dotenv`. Never hardcoded. Never logged. `.env.example` in the repo with key names but empty values. `.env` in `.gitignore`.

**Q: Why return markdown from tools instead of raw JSON?**
> Claude renders markdown. Raw JSON is readable but looks unprocessed. Structured markdown (headers, bold, lists) means Claude can use the output directly without extra formatting work. It also signals you thought about the consumer.

**Q: How do you prevent a tool from executing arbitrary user-supplied SQL or paths?**
> Validate inputs with Zod first. For SQL: parameterized queries only — never string-concatenate user input. For file paths: `path.resolve()` then check the result starts with the allowed root. If it doesn't, return isError before any operation.

---

## Day 4 — Resources (Context engineering / agent architecture)

**Q: What's the difference between a Tool and a Resource in practice?**
> Tool = POST, Claude acts. Resource = GET, Claude reads context before acting. Resources are memory surfaces — an agent reads a resource to stay in context across multiple tool calls. Without resources, every call is stateless.

**Q: What's a dynamic resource?**
> A resource with a URI template — variables in the URI that resolve to different content. `file://logs/{date}` resolves to a different log file depending on the date the caller passes. Registered via `ResourceTemplate`.

**Q: What's a Prompt primitive and when do you use it?**
> A stored workflow template with parameter slots. Claude gets a rendered message array and follows it as instructions. Use when you have a repeatable multi-step operation — summarize logs, explain a test failure, generate release notes — that you want to invoke consistently without rewriting the instructions each time.

**Q: Describe an agentic workflow using all 3 primitives.**
> Read a log resource for context → call an analyze tool on that log → use an explain prompt to format the findings into a structured report. Each primitive does one job: Resource = context, Tool = action, Prompt = workflow shaping.

---

## Day 5 — HTTP Transport (Production architecture)

**Q: How do you make an MCP server multi-user safe?**
> Session isolation. Each new client gets its own `Server` instance and its own `StreamableHTTPServerTransport`. Session state is stored in a map keyed by session ID. No shared mutable state across sessions.

**Q: How do you authenticate HTTP transport requests?**
> Bearer token middleware on every route before the MCP handler. If `Authorization` header is missing or doesn't match the expected token, return 401 immediately. Token stored in env, never hardcoded.

**Q: Why use parameterized queries even for table names?**
> Table names can't be parameterized in SQL (only values can). So validate table names with a regex — alphanumeric + underscore only — before interpolating them. This prevents SQL injection through the table name vector while still allowing safe queries.

**Q: What is SSE and why does HTTP transport need it?**
> Server-Sent Events — a one-way stream from server to client over a persistent HTTP connection. MCP uses it for the server to push results back to the client. The client sends requests via POST, the server streams responses via SSE. This is what makes HTTP transport work for streaming tool results.

---

## Day 6 — Portfolio Design (Architecture thinking)

**Q: Walk me through your Day 6 portfolio server.**
> Local DevOps MCP Server. Four tools: run_tests (executes test suite, returns structured output), git_status (branch + staged changes + recent commits), read_logs (tail any service log by name), env_check (verify required vars are present — never reveals values). Resources for source files and log files. Three prompts: explain_failure (given test output, explain what broke), generate_commit (given diff, write conventional commit), release_notes (given git log range, generate notes). All 3 primitives in one server.

**Q: Why separate tools into individual files?**
> Single responsibility at the module level. `tools/tests.ts` only knows about running tests. `tools/git.ts` only knows about git. Each exports a `register(server)` function. `index.ts` calls them all. Easy to test in isolation, easy to extend without touching unrelated code.

**Q: How do you prevent a tool from reading arbitrary files?**
> `path.resolve()` the user-supplied path against the allowed root. Then check `resolved.startsWith(allowedRoot)`. If not, return `isError: true` without touching the filesystem. This blocks `../../etc/passwd` and all other traversal attempts.

**Q: What would you add to this server in a v2?**
> A few directions: (1) HTTP transport so multiple developers on a team can share one server, (2) a `run_migration` tool for database work, (3) caching for `git_status` since it's called frequently. The current version is single-user stdio — right for a portfolio demo, wrong for a team.

---

## Day 7 — Deployment + Positioning

**Q: How do you deploy an MCP server?**
> For HTTP transport: Railway. `npm install -g @railway/cli`, `railway login`, `railway init`, `railway up`. Set env vars in the Railway dashboard. Get a public URL. For stdio transport — it's local by design, but you can package it as an npm package so developers install it globally.

**Q: What's the difference between an MCP server and a REST API?**
> A REST API is designed for code to call. An MCP server is designed for a language model to call. The schema for each tool is written in a way Claude can understand — description fields are prose, not just types. The response format uses `content` blocks with types rather than arbitrary JSON. The transport (stdio or SSE) is optimized for the Claude Desktop and API integration pattern.

**Q: What's the hardest part of MCP design?**
> Tool boundary design. The instinct is to make one tool that does everything. But single-responsibility tools compose better — Claude can chain only what it needs, each can fail independently, and each is easier to test. The second hardest is deciding what goes in a Resource vs a Tool. Context that Claude should read before acting = Resource. Action Claude should take = Tool.

**Q: Where does MCP fit in the broader AI protocol landscape?**
> MCP = capability layer (what can the model access?). A2A/ACP = coordination layer (how do agents talk to each other?). Governance layer (should the agent act right now, given the project phase?) = what Cortex does. They're orthogonal. You can use all three on the same project.

---

## Quick Reference — Questions Most Likely to Come Up

| Day built | Question | What they're testing |
|---|---|---|
| 1 | Walk me through a tool call end to end | Protocol fluency |
| 1 | stdio vs HTTP — when do you use each? | Deployment awareness |
| 2 | How do you decide tool boundaries? | Architecture thinking |
| 2 | What happens if a tool throws? | Production mindset |
| 3 | How do you handle rate limits? | Resilience |
| 3 | How do you secure a tool? | Security baseline |
| 4 | Tool vs Resource — real difference? | Agent architecture |
| 5 | How do you make it multi-user safe? | Scalability thinking |
| 6 | Walk me through your portfolio server | Real experience proof |
| 7 | What would you add in v2? | Growth mindset |

The answer that separates hireable from medium:
> It comes from your own build, has a specific story, and includes something that went wrong.
> Smooth definitions sound memorized. Friction sounds like experience.
