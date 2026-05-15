# Day 2 Reference — First stdio Server

---

## SDK Setup

```bash
mkdir day2-wordcount && cd day2-wordcount
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install -D typescript ts-node @types/node
```

`tsconfig.json` minimum:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist"
  }
}
```

---

## Minimal stdio Server

```typescript
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const server = new Server(
  { name: 'text-tools', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// Declare tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'word_count',
      description: 'Count words in text',
      annotations: {
        readOnlyHint: true,    // does not modify any state
        idempotentHint: true,  // same input always returns same output
      },
      inputSchema: {
        type: 'object',
        properties: { text: { type: 'string', description: 'Text to count' } },
        required: ['text'],
      },
    },
  ],
}));

// Handle tool calls
const WordCountInput = z.object({ text: z.string().min(1) });

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'word_count') {
    const { text } = WordCountInput.parse(args);
    const count = text.trim().split(/\s+/).filter(Boolean).length;
    return {
      content: [{ type: 'text', text: `${count} words` }],
    };
  }

  return {
    content: [{ type: 'text', text: `Unknown tool: ${name}` }],
    isError: true,
  };
});

// Start
const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Tool Annotations

Add to every tool declaration. Three lines. Hosts use these to decide retry behavior and confirmation prompts.

```typescript
annotations: {
  readOnlyHint: true,       // tool does NOT modify external state
  destructiveHint: false,   // tool does NOT destroy or delete data
  idempotentHint: true,     // calling it N times = same as calling once
}
```

All three text analysis tools are read-only and idempotent — annotate them as such.
A `delete_file` tool would have `destructiveHint: true` and `idempotentHint: false`.
Interview answer: "I annotate tools so the host can make smarter decisions about when to confirm before running."

---

## Tool Boundary Design

**Bad — one mega tool:**
```
analyze_text(text) → word count + char count + reading time
```
Claude can't pick and choose. One failure breaks everything. Arguments balloon.

**Good — three focused tools:**
```
word_count(text)    → count words
char_count(text, includeSpaces?) → count characters
reading_time(text)  → estimate at 200 wpm
```
Single responsibility. Claude composes them. Each can fail independently.

**Rule:** If your tool name has "and" in it, split it.

---

## Text Analysis Tools — Implementation

### word_count
```typescript
const count = text.trim().split(/\s+/).filter(Boolean).length;
return { content: [{ type: 'text', text: `${count} words` }] };
```

### char_count
```typescript
const CharCountInput = z.object({
  text: z.string(),
  include_spaces: z.boolean().default(true),
});
// ...
const chars = include_spaces ? text.length : text.replace(/\s/g, '').length;
return { content: [{ type: 'text', text: `${chars} characters` }] };
```

### reading_time
```typescript
const WPM = 200;
const words = text.trim().split(/\s+/).filter(Boolean).length;
const minutes = Math.ceil(words / WPM);
return {
  content: [{ type: 'text', text: `~${minutes} min read (${words} words at ${WPM} wpm)` }],
};
```

---

## Zod Validation Pattern

Always validate with Zod inside the handler. Never trust `args` directly.

```typescript
const MyInput = z.object({
  text: z.string().min(1, 'text cannot be empty'),
  limit: z.number().int().positive().optional().default(10),
});

try {
  const { text, limit } = MyInput.parse(args);
  // use text and limit — both are typed and validated
} catch (err) {
  if (err instanceof z.ZodError) {
    return {
      content: [{ type: 'text', text: `Invalid input: ${err.issues.map(e => e.message).join(', ')}` }],
      isError: true,
    };
  }
  throw err;
}
```

---

## Error Handling Pattern (full)

```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'word_count') {
      const { text } = WordCountInput.parse(args);
      const count = text.trim().split(/\s+/).filter(Boolean).length;
      return { content: [{ type: 'text', text: `${count} words` }] };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    return {
      content: [{ type: 'text', text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
});
```

---

## Wiring to Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "text-tools": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\day2-wordcount\\dist\\index.js"]
    }
  }
}
```

Build first: `npx tsc` → creates `dist/index.js`

Restart Claude Desktop after editing the config. Check: hamburger menu → Settings → Developer → MCP Servers — should show `text-tools` with a green dot.

---

## MCP Inspector

Test without Claude Desktop:
```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

Opens at `http://localhost:5173`. Shows:
- tools/list response
- Raw JSON-RPC request/response for every call
- Errors highlighted

Screenshot the JSON-RPC log. That's your wire-format proof.

---

## Deliverable Checklist

- [ ] `word_count`, `char_count`, `reading_time` — all working
- [ ] Zod validation on every tool input
- [ ] Try/catch returning `isError: true` — no unhandled throws
- [ ] Green dot in Claude Desktop developer settings
- [ ] Screenshot: Claude calling all 3 tools in one message
- [ ] Screenshot: MCP Inspector JSON-RPC log
- [ ] Committed to `mcp-mastery/day2-wordcount/`
