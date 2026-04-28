import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });
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
      provider: z.enum(['ollama', 'claude', 'openai', 'gemini', 'lmstudio', 'openrouter']).optional(),
      suite_file: z.string().optional().describe('Path to YAML test suite file'),
      suite_dir: z.string().optional().describe('Path to directory containing YAML test suite files. All .yaml/.yml files will be loaded and merged'),
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
      provider: z.enum(['ollama', 'lmstudio', 'claude', 'openai', 'gemini', 'openrouter']).optional()
        .describe('AI provider. For best security analysis, prefer claude or openai or openrouter'),
      suite_file: z.string().optional().describe('Path to YAML test suite file'),
      suite_dir: z.string().optional().describe('Path to directory containing YAML test suite files. All .yaml/.yml files will be loaded and merged'),
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

// ─── Tool 4: get_test_suite_format ────────────────────────────────────────────
server.registerTool(
  'get_test_suite_format',
  {
    description: 'Get the required YAML format of the API test suite. Use this to understand how to write or generate test suites for sentinel-mcp.',
    inputSchema: z.object({}),
  },
  async () => {
    const format = `
Sentinel-MCP Test Suite Format (YAML)
=====================================
A test suite consists of an array of endpoint objects or an object containing a 'baseUrl' and 'endpoints' array.

Supported fields for each endpoint:
- name (string, required): A unique identifier or name for the endpoint.
- method (string, required): HTTP method (GET, POST, PUT, PATCH, DELETE).
- path (string, required): The URL path (e.g., /api/v1/users).
- auth (boolean, optional): Set to true to indicate the endpoint requires Authorization.
- expectedStatus (number, optional): The expected HTTP status code for a successful request (e.g., 200, 201).
- headers (object, optional): Key-value pairs of HTTP headers.
- body (object, optional): The JSON payload to send with the request.
- queryParams (object, optional): Key-value pairs for URL query parameters (?key=value).
- pathParams (object, optional): Key-value pairs to replace path variables (e.g., /users/:id or /users/{id}).
- description (string, optional): Context/rules for the AI (e.g., "limit is optional, name is required max 50 chars").
- requiredFields (array of strings, optional): Explicit list of mandatory fields in body or queryParams.
- expectedFields (array of strings, optional): Fields expected to be present in the JSON response.
- tags (array of strings, optional): Tags for categorizing the endpoint.

Example YAML:
---
baseUrl: http://localhost:8080

endpoints:
  - name: get-user-profile
    method: GET
    path: /api/v1/profile
    auth: true
    expectedStatus: 200
    expectedFields:
      - id
      - username
      - email
      - role

  - name: search-users
    method: GET
    path: /api/v1/users
    auth: true
    queryParams:
      role: "admin"
      limit: "10"
    requiredFields:
      - role
    description: "limit and offset are optional. role is required to be either admin or user."
    expectedStatus: 200

  - name: get-user-by-id
    method: GET
    path: /api/v1/users/:id
    auth: true
    pathParams:
      id: "123"
    expectedStatus: 200

  - name: create-product
    method: POST
    path: /api/v1/products
    auth: true
    expectedStatus: 201
    headers:
      Content-Type: application/json
    body:
      name: "New Product"
      price: 99.99
      discount: 5
    requiredFields:
      - name
      - price
    description: "discount is optional. price cannot be negative."
    expectedFields:
      - productId
      - createdAt
`;
    return { content: [{ type: 'text', text: format }] };
  }
);

// ─── Start ────────────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('[sentinel-mcp] Server running — tools: run_api_test, run_security_test, list_providers, get_test_suite_format');
