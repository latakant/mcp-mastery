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

// ── Tool declarations ─────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'word_count',
      description: 'Count the number of words in a piece of text.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to count words in' },
        },
        required: ['text'],
      },
    },
    {
      name: 'char_count',
      description: 'Count characters in text, with or without spaces.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to count characters in' },
          include_spaces: {
            type: 'boolean',
            description: 'Whether to include spaces in the count (default: true)',
          },
        },
        required: ['text'],
      },
    },
    {
      name: 'reading_time',
      description: 'Estimate how long it takes to read a piece of text at 200 words per minute.',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to estimate reading time for' },
        },
        required: ['text'],
      },
    },
  ],
}));

// ── Zod schemas ───────────────────────────────────────────────────────────────

const WordCountInput = z.object({ text: z.string().min(1, 'text cannot be empty') });

const CharCountInput = z.object({
  text: z.string().min(1, 'text cannot be empty'),
  include_spaces: z.boolean().default(true),
});

const ReadingTimeInput = z.object({ text: z.string().min(1, 'text cannot be empty') });

// ── Tool handlers ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === 'word_count') {
      const { text } = WordCountInput.parse(args);
      const count = text.trim().split(/\s+/).filter(Boolean).length;
      return {
        content: [{ type: 'text', text: `**${count} words**` }],
      };
    }

    if (name === 'char_count') {
      const { text, include_spaces } = CharCountInput.parse(args);
      const count = include_spaces ? text.length : text.replace(/\s/g, '').length;
      const label = include_spaces ? 'characters (with spaces)' : 'characters (without spaces)';
      return {
        content: [{ type: 'text', text: `**${count} ${label}**` }],
      };
    }

    if (name === 'reading_time') {
      const { text } = ReadingTimeInput.parse(args);
      const words = text.trim().split(/\s+/).filter(Boolean).length;
      const WPM = 200;
      const minutes = Math.ceil(words / WPM);
      return {
        content: [
          {
            type: 'text',
            text: `**~${minutes} min read** (${words} words at ${WPM} wpm)`,
          },
        ],
      };
    }

    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  } catch (err) {
    const message = err instanceof z.ZodError
      ? `Invalid input: ${err.issues.map((e) => e.message).join(', ')}`
      : err instanceof Error
        ? err.message
        : String(err);
    return {
      content: [{ type: 'text', text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
