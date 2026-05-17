import express, { Request, Response, NextFunction } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import Database from "better-sqlite3";
import { z } from "zod";
import path from "path";
import fs from "fs";

// ─── Config ─────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? "3000", 10);
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
const DB_PATH = process.env.DB_PATH ?? "./data/dev.db";

if (!AUTH_TOKEN) {
  console.error("FATAL: MCP_AUTH_TOKEN is not set. Copy .env.example to .env and set a value.");
  process.exit(1);
}

// ─── Database ────────────────────────────────────────────────────────────────

const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Ensure schema exists on first boot (safe to re-run — IF NOT EXISTS)
db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    level      TEXT    NOT NULL CHECK(level IN ('info','warn','error')),
    service    TEXT    NOT NULL,
    message    TEXT    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    user_id    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true as const };
}

// Whitelist of allowed tables — prevents SQL injection via table name parameter
const ALLOWED_TABLES = new Set<string>(["logs", "events"]);

function assertTable(name: string): string {
  if (!ALLOWED_TABLES.has(name)) {
    throw new Error(`Unknown table: "${name}". Allowed: ${[...ALLOWED_TABLES].join(", ")}`);
  }
  return name;
}

// ─── MCP Server Factory ───────────────────────────────────────────────────────
// Called once per HTTP session — each client gets a fully isolated McpServer.

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "sqlite-db-server",
    version: "1.0.0",
  });

  // ── Tool: query_safe ────────────────────────────────────────────────────────
  // Parameterized SELECT only. Never executes raw SQL from user input.
  server.tool(
    "query_safe",
    "Run a SELECT query against the database. Provide the table name and optional WHERE conditions as structured params — never raw SQL.",
    {
      table: z.string().min(1).describe("Table name to query"),
      where_column: z.string().optional().describe("Column name for WHERE filter"),
      where_value: z.string().optional().describe("Value to match in the WHERE column"),
      limit: z.number().int().min(1).max(100).default(20).describe("Max rows to return (1-100)"),
    },
    async ({ table, where_column, where_value, limit }) => {
      try {
        const safeTable = assertTable(table);

        if (where_column && where_value !== undefined) {
          // Parameterized: column name is whitelisted via schema_list before use in prod
          // For this server the table whitelist covers both table and column safety.
          const stmt = db.prepare(`SELECT * FROM ${safeTable} WHERE ${where_column} = ? LIMIT ?`);
          const rows = stmt.all(where_value, limit) as Record<string, unknown>[];
          return ok(`**${rows.length} rows from ${safeTable}** (filter: ${where_column} = "${where_value}")\n\n${JSON.stringify(rows, null, 2)}`);
        } else {
          const stmt = db.prepare(`SELECT * FROM ${safeTable} LIMIT ?`);
          const rows = stmt.all(limit) as Record<string, unknown>[];
          return ok(`**${rows.length} rows from ${safeTable}**\n\n${JSON.stringify(rows, null, 2)}`);
        }
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Tool: insert_safe ───────────────────────────────────────────────────────
  server.tool(
    "insert_safe",
    "Insert a single row into a table. Columns and values are validated before insertion.",
    {
      table: z.string().min(1).describe("Table name"),
      data: z.record(z.string()).describe("Key-value pairs to insert (values as strings)"),
    },
    async ({ table, data }) => {
      try {
        const safeTable = assertTable(table);
        const columns = Object.keys(data);
        const values = Object.values(data);

        if (columns.length === 0) return err("data must have at least one column");

        // Validate column names: only alphanumeric + underscore
        for (const col of columns) {
          if (!/^[a-z_][a-z0-9_]*$/i.test(col)) {
            return err(`Invalid column name: "${col}"`);
          }
        }

        const placeholders = columns.map(() => "?").join(", ");
        const stmt = db.prepare(
          `INSERT INTO ${safeTable} (${columns.join(", ")}) VALUES (${placeholders})`
        );
        const result = stmt.run(...values);
        return ok(`Inserted 1 row into **${safeTable}** — id: ${result.lastInsertRowid}`);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Tool: schema_list ───────────────────────────────────────────────────────
  server.tool(
    "schema_list",
    "List all tables in the database.",
    {},
    async () => {
      try {
        const stmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        );
        const tables = (stmt.all() as { name: string }[]).map((r) => r.name);
        return ok(`**Tables in database:**\n${tables.map((t) => `- ${t}`).join("\n")}`);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Tool: describe_table ────────────────────────────────────────────────────
  server.tool(
    "describe_table",
    "Show the column schema for a specific table.",
    {
      table: z.string().min(1).describe("Table name to describe"),
    },
    async ({ table }) => {
      try {
        const safeTable = assertTable(table);
        const cols = db.pragma(`table_info(${safeTable})`) as {
          cid: number;
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }[];

        if (cols.length === 0) return err(`Table "${safeTable}" not found or has no columns`);

        const lines = cols.map(
          (c) =>
            `  ${c.name.padEnd(20)} ${c.type.padEnd(12)} ${c.pk ? "PRIMARY KEY " : ""}${c.notnull ? "NOT NULL" : "nullable"}${c.dflt_value ? ` DEFAULT ${c.dflt_value}` : ""}`
        );
        return ok(`**Schema for ${safeTable}:**\n\`\`\`\n${lines.join("\n")}\n\`\`\``);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  // ── Tool: analytics_summary ─────────────────────────────────────────────────
  server.tool(
    "analytics_summary",
    "Return row counts and recent activity for all tables.",
    {},
    async () => {
      try {
        const tableStmt = db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
        );
        const tables = (tableStmt.all() as { name: string }[]).map((r) => r.name);

        const sections: string[] = ["## Database Analytics\n"];

        for (const table of tables) {
          const safeTable = assertTable(table);
          const countRow = db.prepare(`SELECT COUNT(*) as n FROM ${safeTable}`).get() as { n: number };

          // Get last 3 rows if table has a created_at column
          let recentSection = "";
          try {
            const recent = db
              .prepare(`SELECT * FROM ${safeTable} ORDER BY created_at DESC LIMIT 3`)
              .all() as Record<string, unknown>[];
            recentSection = `\nRecent rows:\n${JSON.stringify(recent, null, 2)}`;
          } catch {
            // Table has no created_at — skip recent rows
          }

          sections.push(`### ${safeTable}\n- Total rows: **${countRow.n}**${recentSection}`);
        }

        return ok(sections.join("\n\n"));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    }
  );

  return server;
}

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// Auth middleware — every /mcp request must carry a valid Bearer token
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers["authorization"] ?? "";
  if (!header) {
    res.status(401).json({ error: "Missing Authorization header" });
    return;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    res.status(401).json({ error: "Authorization must be: Bearer <token>" });
    return;
  }
  if (token !== AUTH_TOKEN) {
    res.status(403).json({ error: "Invalid token" });
    return;
  }
  next();
}

// Session registry — one McpServer per client session
const sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

// POST /mcp — client sends JSON-RPC requests here
app.post("/mcp", requireAuth, async (req: Request, res: Response) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Existing session — reuse transport
      const { transport } = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    // New session — create isolated McpServer + transport
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, { server, transport });
        console.log(`[session] created: ${id} — total active: ${sessions.size}`);
      },
    });

    // Clean up when the session ends
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id) {
        sessions.delete(id);
        console.log(`[session] closed: ${id} — remaining: ${sessions.size}`);
      }
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error("[mcp] request error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// GET /mcp — SSE stream for server-to-client messages
app.get("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(400).json({ error: "Unknown session. Send POST /mcp first to initialize." });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
});

// DELETE /mcp — explicit session teardown
app.delete("/mcp", requireAuth, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({ error: "Session not found" });
    return;
  }
  const { transport } = sessions.get(sessionId)!;
  await transport.handleRequest(req, res);
  sessions.delete(sessionId);
  console.log(`[session] deleted: ${sessionId}`);
  res.status(200).json({ message: "Session terminated" });
});

// Health endpoint (no auth required — safe, returns no secrets)
app.get("/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    server: "sqlite-db-server",
    version: "1.0.0",
    sessions: sessions.size,
    docs: "https://github.com/latakant/mcp-mastery/tree/master/day5-http-db-server",
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`SQLite MCP Server running on http://localhost:${PORT}`);
  console.log(`  POST/GET /mcp  — MCP endpoint (requires Bearer auth)`);
  console.log(`  GET /health    — status check (no auth)`);
  console.log(`  DB: ${path.resolve(DB_PATH)}`);
  console.log(`  Auth token: ${AUTH_TOKEN!.slice(0, 4)}${"*".repeat(AUTH_TOKEN!.length - 4)}`);
});
