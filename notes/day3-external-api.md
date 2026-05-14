# Day 3 Reference — External API Server (GitHub Intelligence)

---

## Setup

```bash
mkdir day3-github-server && cd day3-github-server
npm init -y
npm install @modelcontextprotocol/sdk zod node-fetch dotenv
npm install -D typescript ts-node @types/node
```

`.env`:
```
GITHUB_TOKEN=ghp_yourtoken
```

Entry point — load env first:
```typescript
import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// ...
```

---

## The 4 Tools

| Tool | GitHub API | Returns |
|---|---|---|
| `get_repo_info` | `GET /repos/{owner}/{repo}` | stars, forks, language, open issues, description |
| `list_issues` | `GET /repos/{owner}/{repo}/issues` | title, number, state, created_at |
| `get_file_content` | `GET /repos/{owner}/{repo}/contents/{path}` | decoded file text |
| `search_repos` | `GET /search/repositories?q=...` | name, stars, description, URL |

---

## GitHub API Helper

```typescript
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BASE = 'https://api.github.com';

async function githubFetch(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'mcp-github-server/1.0',
    },
  });

  if (res.status === 429) {
    // Rate limit — wait and retry once
    const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return githubFetch(path);
  }

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: ${res.statusText}`);
  }

  return res.json();
}
```

---

## Tool Implementations

### get_repo_info
```typescript
const RepoInput = z.object({
  owner: z.string(),
  repo: z.string(),
});

// handler
const { owner, repo } = RepoInput.parse(args);
const data = await githubFetch(`/repos/${owner}/${repo}`) as any;
const text = [
  `**${data.full_name}**`,
  `Description: ${data.description ?? 'none'}`,
  `Language: ${data.language ?? 'unknown'}`,
  `Stars: ${data.stargazers_count.toLocaleString()}`,
  `Forks: ${data.forks_count.toLocaleString()}`,
  `Open issues: ${data.open_issues_count}`,
  `License: ${data.license?.name ?? 'none'}`,
  `URL: ${data.html_url}`,
].join('\n');
return { content: [{ type: 'text', text }] };
```

### list_issues
```typescript
const IssuesInput = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).default('open'),
  limit: z.number().int().min(1).max(30).default(10),
});

// handler
const { owner, repo, state, limit } = IssuesInput.parse(args);
const issues = await githubFetch(
  `/repos/${owner}/${repo}/issues?state=${state}&per_page=${limit}`
) as any[];
const text = issues
  .map(i => `#${i.number} [${i.state}] ${i.title}`)
  .join('\n');
return { content: [{ type: 'text', text: text || 'No issues found.' }] };
```

### get_file_content
```typescript
const FileInput = z.object({
  owner: z.string(),
  repo: z.string(),
  path: z.string(),
  ref: z.string().optional(),  // branch/tag/commit, defaults to default branch
});

// handler
const { owner, repo, path, ref } = FileInput.parse(args);
const qs = ref ? `?ref=${ref}` : '';
const data = await githubFetch(`/repos/${owner}/${repo}/contents/${path}${qs}`) as any;
if (data.encoding !== 'base64') {
  throw new Error('Unexpected encoding: ' + data.encoding);
}
const content = Buffer.from(data.content, 'base64').toString('utf8');
return { content: [{ type: 'text', text: content }] };
```

### search_repos
```typescript
const SearchInput = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(10).default(5),
});

// handler
const { query, limit } = SearchInput.parse(args);
const data = await githubFetch(
  `/search/repositories?q=${encodeURIComponent(query)}&per_page=${limit}&sort=stars`
) as any;
const text = data.items
  .map((r: any) => `**${r.full_name}** ⭐${r.stargazers_count}\n${r.description ?? ''}\n${r.html_url}`)
  .join('\n\n');
return { content: [{ type: 'text', text: text || 'No results.' }] };
```

---

## Output Format Rule

Return **markdown**, not raw JSON. Claude renders it. Raw JSON is readable but looks amateur.

```typescript
// Bad
return { content: [{ type: 'text', text: JSON.stringify(data) }] };

// Good
return { content: [{ type: 'text', text: `**${data.name}**: ${data.description}` }] };
```

---

## Security Rules

```typescript
// NEVER — raw string interpolation into file paths or URLs
const data = await githubFetch(`/repos/${owner}/${repo}/contents/${userInput}`);

// ALWAYS — validate first with Zod, then use the validated value
const { path } = FileInput.parse(args);  // Zod throws if path is invalid
const data = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`);

// NEVER — hardcoded token
const token = 'ghp_abc123';

// ALWAYS — environment variable
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN not set');
```

---

## Rate Limit Handling

GitHub API: 5000 requests/hour authenticated. Returns 429 when exceeded.

```typescript
if (res.status === 429) {
  const retryAfter = parseInt(res.headers.get('Retry-After') ?? '60', 10);
  await new Promise(r => setTimeout(r, retryAfter * 1000));
  return githubFetch(path);  // retry once
}
```

For secondary rate limits (search API): check `X-RateLimit-Remaining` header.

---

## Test Prompt for Claude Desktop

> "Audit microsoft/typescript — get repo info, list the top 5 open issues, and show me the README"

This should chain `get_repo_info` → `list_issues` → `get_file_content` in one conversation.
If Claude does this without prompting, your server is working correctly.

---

## Deliverable Checklist

- [ ] All 4 tools working
- [ ] `GITHUB_TOKEN` loaded from `.env` (not hardcoded)
- [ ] `.env.example` with `GITHUB_TOKEN=` (empty value)
- [ ] Rate limit retry logic in `githubFetch`
- [ ] All tool outputs are markdown, not raw JSON
- [ ] `isError: true` returned on API failure (not thrown)
- [ ] Screenshot: Claude auditing a real repo in one conversation
- [ ] Committed to `mcp-mastery/day3-github-server/`
