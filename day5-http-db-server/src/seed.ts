import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = process.env.DB_PATH ?? "./data/dev.db";
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS logs (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    level     TEXT    NOT NULL CHECK(level IN ('info','warn','error')),
    service   TEXT    NOT NULL,
    message   TEXT    NOT NULL,
    created_at TEXT   NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT    NOT NULL,
    payload    TEXT    NOT NULL,
    user_id    TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

const insertLog = db.prepare(
  "INSERT INTO logs (level, service, message) VALUES (?, ?, ?)"
);
const insertEvent = db.prepare(
  "INSERT INTO events (type, payload, user_id) VALUES (?, ?, ?)"
);

const logSeed = db.transaction(() => {
  insertLog.run("info",  "api-gateway",  "Server started on port 3000");
  insertLog.run("info",  "auth-service", "JWT secret loaded");
  insertLog.run("warn",  "api-gateway",  "Rate limit threshold at 80%");
  insertLog.run("error", "db-service",   "Connection pool exhausted — retrying");
  insertLog.run("info",  "db-service",   "Connection pool recovered");
  insertLog.run("info",  "auth-service", "User login: user_001");
  insertLog.run("warn",  "api-gateway",  "Deprecated endpoint called: /v1/ping");
  insertLog.run("error", "auth-service", "Token verification failed: expired");
  insertLog.run("info",  "api-gateway",  "Health check passed");
  insertLog.run("info",  "db-service",   "Vacuum completed — 12ms");
});

const eventSeed = db.transaction(() => {
  insertEvent.run("user.signup",    '{"plan":"free"}',           "user_001");
  insertEvent.run("user.login",     '{"method":"password"}',     "user_001");
  insertEvent.run("order.created",  '{"amount":4999,"currency":"INR"}', "user_001");
  insertEvent.run("payment.success",'{"gateway":"razorpay"}',    "user_001");
  insertEvent.run("user.signup",    '{"plan":"pro"}',            "user_002");
  insertEvent.run("order.created",  '{"amount":9999,"currency":"INR"}', "user_002");
  insertEvent.run("order.cancelled",'{"reason":"user_request"}', "user_002");
  insertEvent.run("payment.failed", '{"gateway":"razorpay","code":"INSUFFICIENT_FUNDS"}', "user_002");
});

logSeed();
eventSeed();

db.close();
console.log(`Seeded dev.db at ${DB_PATH} — 10 logs + 8 events`);
