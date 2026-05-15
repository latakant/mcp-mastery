# Day 7 Reference — Deploy + Interview Weaponization

---

## Why Deploy Matters

"I built an MCP server" = every bootcamp grad.
"Here's the URL, configure Claude Desktop with this one line" = you end the interview differently.

localhost is not production. A public URL is proof.

---

## Railway Deploy (Fastest Path)

```bash
npm install -g @railway/cli
railway login
cd day6-portfolio-server
railway init
# Select: create a new project

railway up
# → get your public URL
```

Add to `package.json`:
```json
{
  "scripts": {
    "start": "node dist/index.js",
    "build": "tsc"
  }
}
```

Railway auto-detects Node.js, runs `npm run build` then `npm start`.

### Environment Variables on Railway
Set via Railway dashboard → your project → Variables:
```
PROJECT_ROOT=/app
LOG_DIR=/app/logs
TEST_COMMAND=npm test
AUTH_TOKEN=<generate a strong random token>
```

Note: For the portfolio server (stdio), you'll likely keep it local and deploy the HTTP version (Day 5 server pattern). Local DevOps tools don't make sense on a remote server. Deploy the Day 5 HTTP+SSE server pattern with a useful demo database instead.

---

## Final Portfolio Repo — Checklist

```
day6-portfolio-server/  (own GitHub repo, not inside mcp-mastery)
├── src/
│   ├── index.ts
│   ├── tools/
│   ├── resources/
│   └── prompts/
├── dist/               ← gitignored, built by tsc
├── .env.example        ← every key with description
├── README.md           ← CTO-grade (see Day 6 notes)
├── package.json
└── tsconfig.json
```

**What the README must have:**
1. Problem statement (one sentence)
2. Demo GIF (non-negotiable — shows don't tell)
3. Install (3 commands, copy-pasteable)
4. Claude Desktop config snippet (copy-paste ready)
5. Example prompts (3 real ones that show value)
6. MCP Inspector screenshot (wire-format proof)

---

## Demo Asset Stack

| Asset | How to get it | Where it goes |
|---|---|---|
| Screen recording / GIF | OBS or ShareX → convert to GIF via ezgif.com | README.md |
| Claude Desktop config | `claude_desktop_config.json` snippet | README install section |
| MCP Inspector trace | Screenshot of JSON-RPC logs | README or `/assets/` folder |
| Public URL | Railway deploy | README header |

All four or the portfolio is incomplete.

---

## Interview Answer Prep

Understand these — don't memorize. Real answers have friction and specifics. Smooth answers sound memorized.

### "What is MCP?"
> "A protocol that gives language models structured access to external capabilities — tools to execute actions, resources to read context, prompts to follow workflows. The wire format is JSON-RPC 2.0. It's what lets Claude call your code instead of just generating text."

### "Tool vs Resource — what's the difference?"
> "A tool is a POST — it does something and returns a result. A resource is a GET — it gives Claude context to read before acting. The non-obvious part is that resources are memory surfaces. In an agentic workflow, Claude reads a resource to stay in context across multiple tool calls. Without resources, every call is stateless."

### "stdio vs HTTP+SSE — when do you use each?"
> "stdio is for local, single-client use — Claude Desktop on your machine. HTTP+SSE is for remote, multi-user, production. The key difference is session isolation: HTTP gives each client its own server state. That's what makes it safe to run as a shared service."

### "How do you handle errors in a tool?"
> "Never throw. Catch everything and return `{ content: [...], isError: true }`. If you throw, the server process can crash and Claude gets nothing. With isError, Claude reads the failure message and can decide what to do next — retry, skip, escalate, or tell the user. Error handling is the difference between a demo and production code."

### "How do you secure a tool that accesses the filesystem?"
> "Two things: input validation before touching the filesystem, and a path traversal guard after resolving the path. `path.resolve()` expands `../` sequences. Then I check that the resolved path starts with the allowed root. If it doesn't, I return isError before any file operation. I also validate file/directory names with a regex that rejects anything except alphanumeric and hyphens."

### "Why MCP instead of a custom API or function calling?"
> "Two reasons. First, ecosystem: MCP is the protocol both Anthropic and OpenAI adopted — VS Code Copilot, Cursor, Claude Desktop all support it. Build once, every major AI client can connect. Second, standardization: function calling is model-specific and format-specific. MCP gives you a typed schema, a wire format, error shapes, and session management out of the box. A custom API means reinventing all of that, then re-implementing it for every client."

### "What was the hardest design decision?"
> "Tool boundary design. On Day 2 I built a text analysis server. The instinct was one `analyze_text` tool that returns everything. But if word count fails, you lose char count too. And Claude can't selectively call parts of it. Splitting into three focused tools — word_count, char_count, reading_time — means each can fail independently, Claude can chain only what it needs, and each is easier to test. That judgment shows up in every server I've built since."

---

## What Gets You Hired

| | |
|---|---|
| Weak | "I built a tutorial MCP server that counts words" |
| Medium | "I built a GitHub Intelligence Server with 4 tools, handles rate limits, returns markdown" |
| Hireable | "I built a DevOps automation server that gives Claude operational access to a dev environment — run tests, read logs, check git. Here's the URL. Here's a 30-second demo. Here's the MCP Inspector trace showing the wire format." |

The URL and the demo are what separate medium from hireable. Everything else is table stakes.

---

## Final Scorecard

| Item | Done? |
|---|---|
| Day 6 portfolio server — all 3 primitives | |
| Own GitHub repo | |
| Deployed URL (Railway) | |
| Screen recording / GIF in README | |
| MCP Inspector trace screenshot | |
| README: Problem → Demo → Install → Prompts | |
| `.env.example` with descriptions | |
| At least one test file | |
| Can answer all 6 interview questions without notes | |
