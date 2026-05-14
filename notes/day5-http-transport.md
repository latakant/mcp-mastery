# Day 5 Reference — HTTP+SSE Transport + SQLite Database Server

---

## Why HTTP+SSE

stdio = one process, one client, local only.
HTTP+SSE = long-running server, multiple clients, remote-capable.

After today, you can deploy an MCP server to Railway and give anyone a URL to use it.

---

## Setup

```bash
mkdir day5-http-db-server && cd day5-http-db-server
npm init -y
npm install @modelcontextprotocol/sdk express better-sqlite3 zod dotenv
npm install -D typescript ts-node @types/node @types/express @types/better-sqlite3
```

`.env`:
```
DB_PATH=./data/dev.db
AUTH_TOKEN=your-secret-bearer-token
PORT=3000
```

---

## Server Structure

```typescript
import express from 'express';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const app = express();
app.use(express.json());

// Auth middleware — every request must have Bearer token
app.use((req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${process.env.AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

// Session map — each client gets an isolated MCP server instance
const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>();

app.post('/mcp', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string | undefined;

  let session = sessionId ? sessions.get(sessionId) : undefined;

  if (!session) {
    // New client — create isolated server + transport
    const server = createMcpServer();  // your factory function
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport });
      },
    });
    await server.connect(transport);
    session = { server, transport };
  }

  await session.transport.handleRequest(req, res, req.body);
});

// SSE endpoint for server-sent events
app.get('/sse', async (req, res) => {
  const sessionId = req.headers['mcp-session-id'] as string;
  const session = sessions.get(sessionId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  await session.transport.handleSseRequest(req, res);
});

app.listen(process.env.PORT ?? 3000, () => {
  console.log(`MCP server on port ${process.env.PORT ?? 3000}`);
});
```

---

## SQLite Database Setup

```typescript
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DB_PATH!;
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create tables if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    payload TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);
```

---

## The 5 Tools

### query_safe — parameterized SELECT only
```typescript
const QueryInput = z.object({
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, 'Invalid table name'),
  where: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(20),
});

// handler
const { table, where, limit } = QueryInput.parse(args);
// Table name is validated by regex — safe to interpolate
// where clause is user-supplied — never execute it raw
const stmt = db.prepare(`SELECT * FROM ${table} LIMIT ?`);
const rows = stmt.all(limit);
return {
  content: [{ type: 'text', text: JSON.stringify(rows, null, 2) }],
};
```

**Security rule:** Table names validated by regex (alphanumeric + underscore). WHERE clause: never interpolate user input as raw SQL. Use parameterized queries or build a safe filter builder.

### insert_safe — validated INSERT
```typescript
const InsertInput = z.object({
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/),
  data: z.record(z.union([z.string(), z.number(), z.null()])),
});

// handler
const { table, data } = InsertInput.parse(args);
const keys = Object.keys(data);
const placeholders = keys.map(() => '?').join(', ');
const stmt = db.prepare(
  `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`
);
const result = stmt.run(...Object.values(data));
return {
  content: [{ type: 'text', text: `Inserted row id: ${result.lastInsertRowid}` }],
};
```

### schema_list — list all tables
```typescript
const rows = db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
).all() as { name: string }[];
const text = rows.map(r => r.name).join('\n') || 'No tables found.';
return { content: [{ type: 'text', text }] };
```

### describe_table — column info
```typescript
const DescribeInput = z.object({
  table: z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]*/),
});
const { table } = DescribeInput.parse(args);
const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
const text = cols
  .map(c => `${c.name} ${c.type}${c.notnull ? ' NOT NULL' : ''}${c.pk ? ' PRIMARY KEY' : ''}`)
  .join('\n');
return { content: [{ type: 'text', text: text || 'Table not found.' }] };
```

### analytics_summary — row counts + activity
```typescript
const tables = (db.prepare(
  `SELECT name FROM sqlite_master WHERE type='table'`
).all() as { name: string }[]).map(r => r.name);

const summary = tables.map(t => {
  const count = (db.prepare(`SELECT COUNT(*) as n FROM ${t}`).get() as any).n;
  return `${t}: ${count} rows`;
}).join('\n');
return { content: [{ type: 'text', text: summary }] };
```

---

## Session Isolation

Each client that connects gets its own server instance. Sessions cannot see each other's state.

```typescript
// On new connection — create isolated instance
const server = createMcpServer();

// Store by session ID
sessions.set(sessionId, { server, transport });

// Cleanup on disconnect
transport.onclose = () => {
  sessions.delete(sessionId);
};
```

This is what makes HTTP+SSE multi-user safe.

---

## Security Checklist

```
✅ Auth token checked on every request (middleware)
✅ Table names validated by regex before interpolation
✅ Column values always parameterized (never string-concatenated into SQL)
✅ Row count limit enforced (max 100)
✅ No raw SQL execution from user input
✅ DB_PATH and AUTH_TOKEN from env, never hardcoded
```

---

## Testing Without Claude Desktop

Use curl or Postman:
```bash
# List tools
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'

# Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Authorization: Bearer your-token" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"schema_list","arguments":{}}}'
```

---

## Deliverable Checklist

- [ ] Server runs on `localhost:3000`
- [ ] Auth middleware rejects requests without valid token (returns 401)
- [ ] All 5 tools working via HTTP POST
- [ ] Session isolation: two curl sessions don't share state
- [ ] No raw SQL from user input — all parameterized
- [ ] Claude can query and insert via HTTP transport in Claude Desktop
- [ ] Committed to `mcp-mastery/day5-http-db-server/`
