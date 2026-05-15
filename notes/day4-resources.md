# Day 4 Reference — Resources (Context Engineering)

---

## All 6 Primitives (Interview Filter)

The spec has 6 primitives across two sides. Most people only know 3. Knowing all 6 is a filter.

**Server-exposed (what you build):**
| Primitive | Control | Analogy |
|---|---|---|
| Tool | LLM decides when to call | POST — execute action |
| Resource | Application decides when to surface | GET — read context |
| Prompt | User decides when to invoke | Stored workflow template |

**Client-exposed (what the host provides to you):**
| Primitive | What it does |
|---|---|
| Sampling | Server requests an LLM completion — your server asks Claude to generate text mid-operation |
| Elicitation | Server asks the *user* for more input mid-operation (e.g., "which branch?") |
| Roots | Host tells your server which filesystem paths are in scope |

### Elicitation in practice

Without elicitation, your `get_file_content` tool fails if the caller doesn't specify a branch.
With elicitation, the server can pause and ask: "Which branch should I use? (main, dev, release-1.2)"

```typescript
// Server sends an elicitation request to the client
const result = await server.elicitInput({
  message: 'Which branch should I read from?',
  requestedSchema: {
    type: 'object',
    properties: {
      branch: { type: 'string', description: 'Branch name' },
    },
    required: ['branch'],
  },
});

if (result.action === 'accept') {
  const { branch } = result.content;
  // proceed with the user-supplied branch
}
```

You won't implement this on Day 4. Understand the concept. The interview question is: "Name all 6 MCP primitives."

---

## Tool vs Resource — The Real Distinction

| | Tool | Resource |
|---|---|---|
| Analogy | POST — perform an action | GET — read context |
| Claude's intent | "Do this for me" | "Let me read this first" |
| State effect | May change state | Read-only |
| When used | Before/after reasoning | To inform reasoning |

**Key insight:** Resources are memory surfaces. Claude reads a Resource to stay in context before acting. Without resources, every tool call is stateless. With resources, Claude can read your codebase, logs, or configuration before writing a single line.

---

## Static Resources

Fixed URI. Content doesn't change based on input.

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs/promises';

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'file:///project/README.md',
      name: 'Project README',
      description: 'Project documentation and overview',
      mimeType: 'text/markdown',
    },
    {
      uri: 'file:///project/package.json',
      name: 'package.json',
      description: 'Dependency list and scripts',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  if (uri === 'file:///project/README.md') {
    const text = await fs.readFile('README.md', 'utf8');
    return {
      contents: [{ uri, mimeType: 'text/markdown', text }],
    };
  }

  if (uri === 'file:///project/package.json') {
    const text = await fs.readFile('package.json', 'utf8');
    return {
      contents: [{ uri, mimeType: 'application/json', text }],
    };
  }

  throw new Error(`Resource not found: ${uri}`);
});
```

---

## Dynamic Resources (ResourceTemplate)

URI with variables. Content changes based on input.

```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/index.js';

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [],
  resourceTemplates: [
    new ResourceTemplate(
      'file://logs/{date}',           // URI template — {date} is the variable
      {
        name: 'Log file by date',
        description: 'Application log for a specific date (YYYY-MM-DD)',
        mimeType: 'text/plain',
      }
    ),
    new ResourceTemplate(
      'repo/{name}/summary',
      {
        name: 'Repository summary',
        description: 'Cached summary for a repository',
        mimeType: 'text/markdown',
      }
    ),
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  // Match file://logs/{date}
  const logMatch = uri.match(/^file:\/\/logs\/(\d{4}-\d{2}-\d{2})$/);
  if (logMatch) {
    const date = logMatch[1];
    const logPath = path.join(process.env.LOG_DIR!, `app-${date}.log`);
    try {
      const text = await fs.readFile(logPath, 'utf8');
      return { contents: [{ uri, mimeType: 'text/plain', text }] };
    } catch {
      return { contents: [{ uri, mimeType: 'text/plain', text: `No log found for ${date}` }] };
    }
  }

  throw new Error(`Resource not found: ${uri}`);
});
```

---

## Prompts

Prompts are reusable message templates. Claude gets the rendered message array and uses it as its instructions.

```typescript
import {
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: [
    {
      name: 'summarize_logs',
      description: 'Summarize application logs for a given date',
      arguments: [
        { name: 'date', description: 'Log date (YYYY-MM-DD)', required: true },
        { name: 'focus', description: 'What to focus on (errors/warnings/all)', required: false },
      ],
    },
  ],
}));

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;

  if (name === 'summarize_logs') {
    const date = promptArgs?.date ?? 'today';
    const focus = promptArgs?.focus ?? 'errors';
    return {
      description: 'Summarize logs prompt',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Read the log resource for ${date}, then summarize all ${focus}. Group by severity. List top 3 most frequent issues.`,
          },
        },
      ],
    };
  }

  throw new Error(`Prompt not found: ${name}`);
});
```

---

## The 3-Primitive Workflow (Prove You Understand)

```
Step 1: Resource → read context
  Claude reads: file://logs/2026-05-14
  → gets today's log file content

Step 2: Tool → act on context
  Claude calls: analyze_errors({ log_content: "..." })
  → returns structured error frequency table

Step 3: Prompt → format the output
  Claude uses: summarize_report prompt
  → returns structured markdown report
```

If you can demo this 3-step chain in Claude Desktop, you understand how agentic workflows are composed. This is the interview moment.

---

## Capabilities Declaration

When you add resources and/or prompts, declare them in the Server constructor:

```typescript
const server = new Server(
  { name: 'resource-server', version: '1.0.0' },
  {
    capabilities: {
      tools: {},       // if you have tools
      resources: {},   // add this for resources
      prompts: {},     // add this for prompts
    },
  }
);
```

Without this, Claude Desktop won't know to ask for resources/prompts.

---

## File Safety — Path Traversal Prevention

Never let user input escape the allowed directory:

```typescript
import path from 'path';

const ALLOWED_ROOT = process.env.LOG_DIR!;

function safePath(userInput: string): string {
  const resolved = path.resolve(ALLOWED_ROOT, userInput);
  if (!resolved.startsWith(ALLOWED_ROOT)) {
    throw new Error('Path traversal detected');
  }
  return resolved;
}
```

---

## Security Checklist — Day 4

**Path traversal:** Every dynamic resource that reads a file must run through `safePath()` before any `fs` call. No exceptions.

**URI validation:** In `ReadResourceRequestSchema`, if the URI doesn't match a known pattern, return an error — don't throw. Throwing crashes the handler.

**Confused deputy:** Resources should serve files from a fixed root (`process.env.LOG_DIR`, `process.env.PROJECT_ROOT`). Never accept an absolute path from the URI as-is.

---

## Deliverable Checklist

- [ ] Static resources: README.md and package.json readable via `resources/read`
- [ ] Dynamic resource: `file://logs/{date}` resolves to real log files
- [ ] At least one Prompt that parameterizes a workflow
- [ ] 3-step Resource → Tool → Prompt chain demonstrated in Claude Desktop
- [ ] Path traversal prevention on any user-supplied file path
- [ ] Screenshot: Claude using all 3 primitives in sequence
- [ ] Committed to `mcp-mastery/day4-resource-server/`
