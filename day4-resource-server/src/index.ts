import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

const server = new McpServer({
  name: "file-log-resource-server",
  version: "1.0.0",
});

// ═══════════════════════════════════════════════════════════════════════════
// RESOURCES — Claude reads these BEFORE acting (memory surfaces)
// ═══════════════════════════════════════════════════════════════════════════

// Static Resource 1: Project README
// Teaching point: static URI → always the same file
server.resource(
  "project-readme",
  "file:///project/README.md",
  { description: "Project README — overview, goals, setup instructions" },
  async (uri) => {
    const text = readFile(path.join(DATA_DIR, "README.md"))
      ?? "README.md not found in data directory.";
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
  }
);

// Static Resource 2: Changelog
// Teaching point: this is what Claude reads BEFORE calling analyze_changelog
server.resource(
  "project-changelog",
  "file:///project/CHANGELOG.md",
  { description: "Project changelog — all versions, features, and fixes" },
  async (uri) => {
    const text = readFile(path.join(DATA_DIR, "CHANGELOG.md"))
      ?? "CHANGELOG.md not found in data directory.";
    return { contents: [{ uri: uri.href, mimeType: "text/markdown", text }] };
  }
);

// Static Resource 3: package.json (dependency context)
server.resource(
  "project-package",
  "file:///project/package.json",
  { description: "Project dependencies and npm scripts" },
  async (uri) => {
    const text = readFile(path.join(DATA_DIR, "package.json"))
      ?? "package.json not found in data directory.";
    return { contents: [{ uri: uri.href, mimeType: "application/json", text }] };
  }
);

// Dynamic Resource: log by date
// Teaching point: URI template → {date} becomes a parameter
// Claude can ask for ANY date — server resolves to the right file
server.resource(
  "log-by-date",
  new ResourceTemplate("file://logs/{date}", { list: undefined }),
  { description: "Application log for a specific date. Use format YYYY-MM-DD." },
  async (uri, { date }) => {
    const logPath = path.join(DATA_DIR, "logs", `${date}.log`);
    const text = readFile(logPath)
      ?? `No log found for ${date}.\nAvailable logs: ${listAvailableLogs()}`;
    return { contents: [{ uri: uri.href, mimeType: "text/plain", text }] };
  }
);

function listAvailableLogs(): string {
  try {
    return fs.readdirSync(path.join(DATA_DIR, "logs"))
      .filter(f => f.endsWith(".log"))
      .map(f => f.replace(".log", ""))
      .join(", ");
  } catch {
    return "none";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOOL — Claude calls this AFTER reading the changelog resource
// ═══════════════════════════════════════════════════════════════════════════

server.tool(
  "analyze_changelog",
  "Analyze changelog text for bug trends, feature momentum, and release cadence. Read the changelog resource first.",
  {
    changelog: z.string().min(1).describe("Full changelog text (read from file:///project/CHANGELOG.md)"),
    focus: z.enum(["bugs", "features", "releases", "all"]).default("all")
      .describe("What to analyze"),
  },
  async ({ changelog, focus }) => {
    try {
      const lines = changelog.split("\n");

      const versions  = lines.filter(l => /^#+\s+\[?v?\d+\.\d+/.test(l));
      const bugLines  = lines.filter(l => /fix|bug|patch|hotfix/i.test(l) && l.trim().startsWith("-"));
      const featLines = lines.filter(l => /feat|add|new|impl|support/i.test(l) && l.trim().startsWith("-"));
      const breaking  = lines.filter(l => /break|breaking|BREAKING|major/i.test(l));

      const out: string[] = ["## Changelog Analysis"];

      if (focus === "releases" || focus === "all") {
        out.push(
          "### Release Cadence",
          `**Versions found:** ${versions.length}`,
          versions.length ? `**Most recent:** ${versions[0].replace(/^#+\s+/, "")}` : "No version headers found.",
        );
      }
      if (focus === "bugs" || focus === "all") {
        out.push(
          "### Bug Fix Patterns",
          `**Total fixes:** ${bugLines.length}`,
          bugLines.length
            ? bugLines.slice(0, 5).map(l => `- ${l.trim().replace(/^-\s*/, "")}`).join("\n")
            : "No bug fixes detected.",
        );
      }
      if (focus === "features" || focus === "all") {
        out.push(
          "### Feature Momentum",
          `**Total features:** ${featLines.length}`,
          featLines.length
            ? featLines.slice(0, 5).map(l => `- ${l.trim().replace(/^-\s*/, "")}`).join("\n")
            : "No features detected.",
        );
      }
      if (breaking.length > 0) {
        out.push(
          "### ⚠️ Breaking Changes",
          `**Count:** ${breaking.length}`,
          breaking.slice(0, 3).map(l => `- ${l.trim()}`).join("\n"),
        );
      }

      return { content: [{ type: "text", text: out.join("\n\n") }] };
    } catch (err: any) {
      return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT — Claude follows this AFTER the tool produces analysis
// ═══════════════════════════════════════════════════════════════════════════

server.prompt(
  "generate_report",
  "Generate a structured project health report. Use after reading the changelog and running analyze_changelog.",
  {
    project_name: z.string().describe("Name of the project"),
    date_range:   z.string().describe("Date range covered (e.g. 'last 30 days', 'v1.0–v2.0')"),
    focus_area:   z.string().optional().describe("Optional focus: bugs | features | performance"),
  },
  async ({ project_name, date_range, focus_area }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: [
          `Generate a structured project health report for **${project_name}** covering **${date_range}**.`,
          "",
          focus_area ? `Focus on: ${focus_area}` : "Cover all areas: bugs, features, release cadence.",
          "",
          "Structure:",
          "1. **Executive Summary** — 2 sentences: overall health + trend direction",
          "2. **Release Cadence** — how frequently are versions shipping?",
          "3. **Bug Trend** — fix rate improving or worsening?",
          "4. **Feature Momentum** — what is being built?",
          "5. **Risk Flags** — breaking changes, regressions, anomalies",
          "6. **Single Recommendation** — one clear next action",
          "",
          "Rules: No filler. Every sentence carries information. Be direct.",
        ].join("\n"),
      },
    }],
  })
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("File + Log Resource MCP server running on stdio");
}

main();
