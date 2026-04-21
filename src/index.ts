import 'dotenv/config';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runApiTest, listProviders } from './tools/apiTest.js';
import { runSecurityTest } from './tools/securityTest.js';

const server = new McpServer({
  name: 'sentinel-mcp',
  version: '1.0.0',
});

// ─── Tool 1: run_api_test (positive + negative) ───────────────────────────────
server.registerTool(
  'run_api_test',
  {
    description: 'Run positive and negative functional tests on API endpoints. AI generates test cases automatically and analyzes results.',
    inputSchema: z.object({
      endpoint: z.string().optional().describe('Endpoint name to test, or omit to test all'),
      provider: z.enum(['ollama', 'claude', 'openai', 'gemini']).optional(),
      suite_file: z.string().optional().describe('Path to YAML test suite file'),
    }),
  },
  async (input) => {
    try {
      const result = await runApiTest({ ...input });
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Error: ${msg}` }], isError: true };
    }
  }
);

// ─── Tool 2: run_security_test (OWASP Top 10) ────────────────────────────────
server.registerTool(
  'run_security_test',
  {
    description: 'Run OWASP Top 10 2021 security tests on API endpoints. AI generates attack test cases (SQLi, XSS, SSRF, Auth bypass, IDOR, etc.) and analyzes vulnerabilities.',
    inputSchema: z.object({
      endpoint: z.string().optional().describe('Endpoint name to test, or omit to test all'),
      provider: z.enum(['ollama', 'claude', 'openai', 'gemini']).optional()
        .describe('AI provider. claude or openai recommended for deeper security analysis'),
      suite_file: z.string().optional().describe('Path to YAML test suite file'),
    }),
  },
  async (input) => {
    try {
      const result = await runSecurityTest({ ...input });
      return { content: [{ type: 'text', text: result }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: 'text', text: `❌ Error: ${msg}` }], isError: true };
    }
  }
);

// ─── Tool 3: list_providers ───────────────────────────────────────────────────
server.registerTool(
  'list_providers',
  {
    description: 'List all available AI providers and the current default',
    inputSchema: z.object({}),
  },
  async () => {
    const result = await listProviders();
    return { content: [{ type: 'text', text: result }] };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[sentinel-mcp] Server running — tools: run_api_test, run_security_test, list_providers');
