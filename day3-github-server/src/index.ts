import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE_URL = "https://api.github.com";

const headers: Record<string, string> = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "mcp-github-intelligence/1.0",
};
if (GITHUB_TOKEN) {
  headers["Authorization"] = `Bearer ${GITHUB_TOKEN}`;
}

// Retry once on 429 (rate limit)
async function githubFetch(url: string, retries = 1): Promise<any> {
  const res = await fetch(url, { headers });
  if (res.status === 429 && retries > 0) {
    const wait = parseInt(res.headers.get("Retry-After") ?? "5", 10);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return githubFetch(url, retries - 1);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(`GitHub API ${res.status}: ${body.message ?? res.statusText}`);
  }
  return res.json();
}

function errorResponse(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

const server = new McpServer({
  name: "github-intelligence",
  version: "1.0.0",
});

// ─── Tool 1: get_repo_info ──────────────────────────────────────────────────
server.tool(
  "get_repo_info",
  "Get stars, forks, open issues count, language, and metadata for a GitHub repo",
  {
    owner: z.string().min(1).describe("Repository owner (username or org)"),
    repo: z.string().min(1).describe("Repository name"),
  },
  async ({ owner, repo }) => {
    try {
      const d = await githubFetch(`${BASE_URL}/repos/${owner}/${repo}`);
      return {
        content: [{
          type: "text",
          text: [
            `## ${d.full_name}`,
            `**Description:** ${d.description ?? "No description"}`,
            `**Language:** ${d.language ?? "Unknown"}`,
            `**Stars:** ${d.stargazers_count.toLocaleString()}`,
            `**Forks:** ${d.forks_count.toLocaleString()}`,
            `**Open Issues:** ${d.open_issues_count.toLocaleString()}`,
            `**License:** ${d.license?.spdx_id ?? "None"}`,
            `**Default Branch:** ${d.default_branch}`,
            `**Created:** ${new Date(d.created_at).toLocaleDateString()}`,
            `**Last Push:** ${new Date(d.pushed_at).toLocaleDateString()}`,
            `**URL:** ${d.html_url}`,
          ].join("\n"),
        }],
      };
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }
);

// ─── Tool 2: list_issues ───────────────────────────────────────────────────
server.tool(
  "list_issues",
  "List issues for a GitHub repo, filtered by state",
  {
    owner: z.string().min(1).describe("Repository owner"),
    repo: z.string().min(1).describe("Repository name"),
    state: z.enum(["open", "closed", "all"]).default("open").describe("Issue state"),
    limit: z.number().int().min(1).max(30).default(10).describe("Number of issues to return (max 30)"),
  },
  async ({ owner, repo, state, limit }) => {
    try {
      const items = await githubFetch(
        `${BASE_URL}/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`
      );
      // Filter out pull requests (GitHub issues endpoint includes PRs)
      const issues = items.filter((i: any) => !i.pull_request);
      if (!issues.length) {
        return { content: [{ type: "text", text: `No ${state} issues found in ${owner}/${repo}.` }] };
      }
      const lines = issues.map((i: any) =>
        `**#${i.number}** [${i.state.toUpperCase()}] ${i.title}\n` +
        `  @${i.user.login} · ${new Date(i.created_at).toLocaleDateString()} · ${i.comments} comments`
      );
      return {
        content: [{
          type: "text",
          text: [`## ${owner}/${repo} — ${state} issues`, "", ...lines].join("\n\n"),
        }],
      };
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }
);

// ─── Tool 3: get_file_content ──────────────────────────────────────────────
server.tool(
  "get_file_content",
  "Get decoded content of any file in a GitHub repo",
  {
    owner: z.string().min(1).describe("Repository owner"),
    repo: z.string().min(1).describe("Repository name"),
    path: z.string().min(1).describe("File path within the repo (e.g. README.md, src/index.ts)"),
    ref: z.string().optional().describe("Branch, tag, or commit SHA (defaults to default branch)"),
  },
  async ({ owner, repo, path, ref }) => {
    try {
      const url = ref
        ? `${BASE_URL}/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`
        : `${BASE_URL}/repos/${owner}/${repo}/contents/${path}`;
      const d = await githubFetch(url);
      if (d.type !== "file") {
        return errorResponse(`${path} is a ${d.type}, not a file`);
      }
      if (d.size > 100_000) {
        return errorResponse(`File is ${d.size} bytes — too large to display (max 100 KB)`);
      }
      const content = Buffer.from(d.content, "base64").toString("utf-8");
      return {
        content: [{
          type: "text",
          text: [`## ${d.path}`, `*${d.size.toLocaleString()} bytes · SHA: ${d.sha.slice(0, 8)}*`, "", content].join("\n"),
        }],
      };
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }
);

// ─── Tool 4: search_repos ─────────────────────────────────────────────────
server.tool(
  "search_repos",
  "Search GitHub repositories by query string, sorted by stars",
  {
    query: z.string().min(1).describe("Search query (e.g. 'mcp server typescript', 'nestjs stars:>500')"),
    limit: z.number().int().min(1).max(20).default(8).describe("Number of results (max 20)"),
  },
  async ({ query, limit }) => {
    try {
      const d = await githubFetch(
        `${BASE_URL}/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`
      );
      if (!d.items.length) {
        return { content: [{ type: "text", text: `No repositories found for: "${query}"` }] };
      }
      const lines = d.items.map((r: any, i: number) =>
        `**${i + 1}. [${r.full_name}](${r.html_url})**\n` +
        `  ${r.description ?? "No description"}\n` +
        `  ⭐ ${r.stargazers_count.toLocaleString()} · ${r.language ?? "Unknown"} · Updated ${new Date(r.updated_at).toLocaleDateString()}`
      );
      return {
        content: [{
          type: "text",
          text: [
            `## Search: "${query}"`,
            `*${d.total_count.toLocaleString()} total matches — showing top ${d.items.length}*`,
            "",
            ...lines,
          ].join("\n\n"),
        }],
      };
    } catch (err: any) {
      return errorResponse(err.message);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("GitHub Intelligence MCP server running on stdio");
}

main();
