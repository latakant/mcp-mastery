# Day 6 Reference — Local DevOps MCP Server (Portfolio Piece)

---

## Why This Project

- **Demonstrable in 5 minutes**: Run tests, read logs, check git — every developer knows what these do.
- **Solves real pain**: Context switching between terminal, IDE, and browser is where flow dies.
- **CTO-readable**: "Claude can run your tests and explain failures" needs zero explanation.
- **Uses all 3 primitives**: tools + resources + prompts in one server = proof of full MCP fluency.

---

## Architecture

```
day6-portfolio-server/
├── src/
│   ├── index.ts            ← entry: create server, connect transport
│   ├── tools/
│   │   ├── tests.ts        ← run_tests
│   │   ├── git.ts          ← git_status
│   │   ├── logs.ts         ← read_logs
│   │   └── env.ts          ← env_check
│   ├── resources/
│   │   ├── files.ts        ← file://src/{path}
│   │   └── testResults.ts  ← db://test-results/{date}
│   └── prompts/
│       ├── explain.ts      ← explain_failure
│       ├── commit.ts       ← generate_commit
│       └── release.ts      ← release_notes
├── .env.example
├── README.md
└── package.json
```

Each file exports a registration function: `registerTestTools(server)`, `registerGitTools(server)`, etc.
`index.ts` calls them all. Clean separation, easy to extend.

---

## index.ts Pattern

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerTestTools } from './tools/tests.js';
import { registerGitTools } from './tools/git.js';
import { registerLogTools } from './tools/logs.js';
import { registerEnvTools } from './tools/env.js';
import { registerFileResources } from './resources/files.js';
import { registerTestResultResources } from './resources/testResults.js';
import { registerExplainPrompt } from './prompts/explain.js';
import { registerCommitPrompt } from './prompts/commit.js';
import { registerReleasePrompt } from './prompts/release.js';

const server = new Server(
  { name: 'devops-server', version: '1.0.0' },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

registerTestTools(server);
registerGitTools(server);
registerLogTools(server);
registerEnvTools(server);
registerFileResources(server);
registerTestResultResources(server);
registerExplainPrompt(server);
registerCommitPrompt(server);
registerReleasePrompt(server);

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Tools

### run_tests
```typescript
import { execSync } from 'child_process';

// handler
const TEST_COMMAND = process.env.TEST_COMMAND ?? 'npm test';
const PROJECT_ROOT = process.env.PROJECT_ROOT!;

try {
  const output = execSync(TEST_COMMAND, {
    cwd: PROJECT_ROOT,
    timeout: 120_000,
    encoding: 'utf8',
  });
  return { content: [{ type: 'text', text: `✅ Tests passed\n\n${output}` }] };
} catch (err: any) {
  return {
    content: [{ type: 'text', text: `❌ Tests failed\n\n${err.stdout ?? ''}\n${err.stderr ?? ''}` }],
    isError: true,
  };
}
```

### git_status
```typescript
import { execSync } from 'child_process';

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: process.env.PROJECT_ROOT, encoding: 'utf8' }).trim();
}

// handler
const branch = git('branch --show-current');
const status = git('status --short');
const log = git('log --oneline -5');
const text = `**Branch:** ${branch}\n\n**Changes:**\n${status || '(clean)'}\n\n**Recent commits:**\n${log}`;
return { content: [{ type: 'text', text }] };
```

### read_logs
```typescript
const ReadLogsInput = z.object({
  service: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  lines: z.number().int().min(1).max(500).default(50),
});

// handler
const { service, lines } = ReadLogsInput.parse(args);
const logFile = path.join(process.env.LOG_DIR!, `${service}.log`);

// Path traversal guard
if (!logFile.startsWith(process.env.LOG_DIR!)) {
  throw new Error('Invalid log path');
}

try {
  const content = execSync(`tail -n ${lines} "${logFile}"`, { encoding: 'utf8' });
  return { content: [{ type: 'text', text: content }] };
} catch {
  return { content: [{ type: 'text', text: `No log found for service: ${service}` }], isError: true };
}
```

### env_check
```typescript
const EnvCheckInput = z.object({
  keys: z.array(z.string()).min(1),
});

// handler — check PRESENCE only, never return values
const { keys } = EnvCheckInput.parse(args);
const results = keys.map(k => ({
  key: k,
  present: !!process.env[k],
}));
const lines = results.map(r => `${r.present ? '✅' : '❌'} ${r.key}`).join('\n');
const allPresent = results.every(r => r.present);
return {
  content: [{ type: 'text', text: lines }],
  isError: !allPresent,
};
```

---

## Resources

### file://src/{path}
```typescript
// Dynamic resource — reads any source file
// URI: file://src/tools/git.ts

const match = uri.match(/^file:\/\/src\/(.+)$/);
if (match) {
  const filePath = path.join(process.env.PROJECT_ROOT!, 'src', match[1]);
  // Path traversal guard
  const srcRoot = path.join(process.env.PROJECT_ROOT!, 'src');
  if (!filePath.startsWith(srcRoot)) throw new Error('Path traversal');
  const text = await fs.readFile(filePath, 'utf8');
  return { contents: [{ uri, mimeType: 'text/plain', text }] };
}
```

---

## Prompts

### explain_failure
```typescript
// Returns a message that tells Claude to explain a test failure
messages: [
  {
    role: 'user',
    content: {
      type: 'text',
      text: `The following test suite failed:\n\n${args.output}\n\nExplain:\n1. What broke and why\n2. Which file/function caused it\n3. Suggested fix in 3 steps or less`,
    },
  },
]
```

### generate_commit
```typescript
// Returns a message that tells Claude to write a conventional commit from a diff
messages: [
  {
    role: 'user',
    content: {
      type: 'text',
      text: `Write a conventional commit message for this diff:\n\n${args.diff}\n\nFormat: type(scope): description\n\nTypes: feat, fix, refactor, test, docs, chore\nMax 72 chars. No period at end.`,
    },
  },
]
```

### release_notes
```typescript
// Returns a message that tells Claude to generate release notes from git log
messages: [
  {
    role: 'user',
    content: {
      type: 'text',
      text: `Generate release notes from this git log:\n\n${args.log}\n\nFormat:\n## What's New\n- ...\n\n## Bug Fixes\n- ...\n\n## Breaking Changes\n- none (or list them)`,
    },
  },
]
```

---

## README Structure (CTO-grade)

Must answer these questions in this order:

```markdown
## Problem
Developers waste 30% of review time context-switching between terminal, logs, and code.
Claude can run your tests, read logs, and inspect git — but only if you give it the tools.

## Solution
A local MCP server that gives Claude direct operational access to your dev environment.

## Demo
[GIF here — Claude calling run_tests → explain_failure in one prompt]

## Install
git clone ...
cp .env.example .env  # fill in PROJECT_ROOT and LOG_DIR
node dist/index.js

## Example Prompts
- "Run the tests and explain any failures"
- "What changed since last commit? Write a commit message."
- "Check if all required env vars are present for production"
```

---

## Security Checklist — Day 6

**`run_tests`:** The test command comes from `process.env.TEST_COMMAND`, not from tool input. Never accept shell commands as tool arguments — that's remote code execution.

**`read_logs`:** Service name maps to a fixed log directory (`LOG_DIR/service-name.log`). Run through `safePath()`. Reject `../` sequences before touching the filesystem.

**`git_status`:** Runs `git` in `process.env.PROJECT_ROOT`. Never accept the project path as tool input. Working directory is fixed at server start.

**`env_check`:** Returns only presence/absence of env var names — never their values. "GITHUB_TOKEN is set" is safe. Returning the actual token value is not.

**Confused deputy (all tools):** The server runs with your local credentials. A caller cannot escalate beyond what your OS user can do, but don't make it easier: scope each tool to its minimum required access.

---

## Deliverable Checklist

- [ ] All 4 tools working
- [ ] Static + dynamic resources working
- [ ] All 3 prompts working
- [ ] Module structure: tools/ resources/ prompts/ as separate files
- [ ] Screen recording / GIF (30 seconds minimum) — Claude running tests + explaining failure
- [ ] README: Problem → Demo → Install → Example prompts (no fluff)
- [ ] MCP Inspector trace screenshot
- [ ] Own GitHub repo (not inside mcp-mastery)
- [ ] `.env.example` with descriptions for all 3 vars
- [ ] Security checklist above — verified for all 4 tools
