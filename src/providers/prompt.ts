import type {
  EndpointConfig,
  GeneratedTestPlan,
  TestRunResult,
  AIAnalysis,
} from '../types.ts';

// ─── Shared helpers ───────────────────────────────────────────────────────────

const JSON_SCHEMA_CASE = [
  '{',
  '  "endpointName": "<name>",',
  '  "method": "<method>",',
  '  "path": "<path>",',
  '  "totalCases": <number>,',
  '  "cases": [',
  '    {',
  '      "id": "tc-001",',
  '      "type": "positive|negative|security",',
  '      "description": "what this test checks",',
  '      "method": "<method>",',
  '      "path": "<path>",',
  '      "headers": {},',
  '      "body": {},',
  '      "queryParams": {},',
  '      "pathParams": {},',
  '      "expectedBehavior": "what a correct API should do",',
  '      "expectedStatus": 200,',
  '      "owaspCategory": "A03-Injection",',
  '      "owaspRationale": "why this maps to this OWASP category"',
  '    }',
  '  ]',
  '}',
].join('\n');

function fillSchema(endpoint: EndpointConfig): string {
  return JSON_SCHEMA_CASE
    .replace(/<name>/g, endpoint.name)
    .replace(/<method>/g, endpoint.method)
    .replace(/<path>/g, endpoint.path);
}

function parseJSON<T>(raw: string): T {
  // 1. Clean markdown backticks and surrounding text
  let cleaned = raw.replace(/^```[\w]*\n?/m, '').replace(/```\s*$/m, '').trim();

  // 2. Isolate the JSON object
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    console.error('[sentinel] JSON Parse Error. AI output was invalid JSON.');
    console.error('[sentinel] Problematic snippet:', cleaned.slice(0, 500));
    throw err;
  }
}

// ─── Data Pruning Helpers (Minimize Context Length) ─────────────

function pruneTestResults(results: TestRunResult) {
  return {
    ...results,
    endpoints: results.endpoints.map(ep => ({
      ...ep,
      results: ep.results.map(r => {
        const { responseHeaders, ...rest } = r; // Strip headers to save tokens
        // Truncate long bodies
        if (typeof rest.responseBody === 'string' && rest.responseBody.length > 500) {
          rest.responseBody = rest.responseBody.substring(0, 500) + '...[TRUNCATED]';
        }
        return rest;
      })
    }))
  };
}

function pruneTestPlans(plans: GeneratedTestPlan[]) {
  return plans.map(p => ({
    endpointName: p.endpointName,
    cases: p.cases.map(c => ({
      id: c.id,
      type: c.type,
      description: c.description,
      expectedBehavior: c.expectedBehavior,
      owaspCategory: c.owaspCategory
    }))
  }));
}

// ─── Prompt 1: Positive + Negative test plan ──────────────────────────────────

export function buildFunctionalTestPlanPrompt(endpoint: EndpointConfig, baseUrl: string): string {
  const hasInputs = !!(endpoint.body || endpoint.queryParams || endpoint.pathParams || (endpoint.requiredFields && endpoint.requiredFields.length > 0));
  const info = JSON.stringify({ baseUrl, ...endpoint }, null, 2);

  const sections = [
    'You are a senior QA engineer.',
    'Generate a FUNCTIONAL test plan (positive and negative only) for this API endpoint.',
    '',
    '### MANDATORY RULES FOR PAYLOADS:',
    '- EVERY test case MUST have a UNIQUE payload. Do NOT reuse the same data across different cases.',
    '- For "Boundary values", use actual min/max/limit values (e.g., page=0, page=99999, size=100).',
    '- For "Realistic data", use diverse and creative human-like data.',
    '- IMPORTANT: Read the "description" field carefully. If it mentions optional parameters (like Search, CategoryID, etc.), you MUST include them in your test cases even if they are not explicitly defined in a schema.',
    '- Ensure the "queryParams" and "body" reflect the specific goal of that test case.',
    '',
    'Endpoint info:',
    info,
    '',
  ];

  if (!hasInputs) {
    sections.push(
      'CRITICAL: This endpoint has NO defined inputs (no body, queryParams, or pathParams).',
      'Do NOT invent or hallucinate fields to test. Only test reachability and basic constraints.',
      ''
    );
  }

  sections.push(
    '1. POSITIVE TESTS — valid inputs that should succeed',
    hasInputs ? '   - Happy path with all required fields' : '   - Happy path (basic reachability check)',
    hasInputs ? '   - Boundary values (min/max allowed)' : '',
    hasInputs ? '   - Optional fields present then absent (CRITICAL: Use all optional parameters mentioned in the description)' : '',
    hasInputs ? '   - REALISTIC DATA VARIATIONS (CRITICAL):' : '',
    hasInputs ? '     * Be a realistic user. Use real human names (e.g., "Budi Santoso", not "test").' : '',
    hasInputs ? '     * Use contextually accurate values.' : '',
    hasInputs ? '     * Inject international UTF-8 characters and Emojis.' : '',
    '',
    '2. NEGATIVE TESTS — invalid inputs that must return proper 4xx errors',
  );

  if (hasInputs) {
    sections.push(
      '   - HUMAN FAT-FINGER ERRORS (Realistic Mistakes):',
      '     * Trailing/leading invisible spaces',
      '     * Integers typed with commas/dots by mistake',
      '     * Valid email format but completely invalid TLD',
      '   - Missing required fields',
      '   - Wrong data types (string instead of int, etc.)',
      '   - Field length violations (too short/long)',
      '   - Empty string, null, whitespace-only values',
      '   - Out-of-range values',
      '   - Malformed formats',
      '   - Completely empty body',
      '   - Unexpected/extra fields',
    );
  } else {
    if (endpoint.auth) {
      sections.push('   - Unauthorized access (request without token)');
    }
    sections.push(
      `   - Invalid HTTP methods (e.g., call POST or DELETE instead of ${endpoint.method})`,
    );
  }

  sections.push(
    '',
    'Rules:',
    '- type must be "positive" or "negative" only — NO security cases here',
    '- owaspCategory and owaspRationale must be omitted (null)',
    `- Minimum: ${hasInputs ? '4 positive cases and 8 negative cases' : '2 positive cases and 2 negative cases'}`,
    '- DATA REALISM: Never use generic placeholders like "test", "foo", "string", or "123". Emulate real human input.',
    '- Output raw JSON only:',
    fillSchema(endpoint),
  );

  return sections.filter(s => s !== '').join('\n');
}

// ─── Prompt 2: Security-only test plan (OWASP Top 10) ────────────────────────

export function buildSecurityTestPlanPrompt(endpoint: EndpointConfig, baseUrl: string): string {
  const info = JSON.stringify({ baseUrl, ...endpoint }, null, 2);
  return [
    'You are a senior API penetration tester and OWASP expert.',
    'Generate a SECURITY-ONLY test plan for this API endpoint, mapped to OWASP Top 10 2021.',
    '',
    'Endpoint info:',
    info,
    '',
    'Cover ALL relevant OWASP categories below:',
    '',
    'A01 — Broken Access Control',
    '  - Request with no Authorization header',
    '  - Request with expired JWT token',
    '  - Request with malformed/fake JWT (e.g. alg:none attack)',
    '  - IDOR: change resource ID in path to another user ID (e.g. /users/2, /users/99999)',
    '  - Privilege escalation: use regular user token to call admin-only action',
    '  - Force browsing: access resource owned by another account',
    '',
    'A02 — Cryptographic Failures',
    '  - Check if response contains raw passwords, secret keys, or tokens',
    '  - Check if sensitive data appears in URL query params',
    '',
    'A03 — Injection',
    "  - SQL injection: ' OR 1=1--",
    "  - SQL injection: '; DROP TABLE users;--",
    "  - SQL injection: ' AND '1'='1",
    '  - NoSQL injection: {"$gt": ""}',
    '  - NoSQL injection: {"$where": "1==1"}',
    '  - Command injection: ; ls -la',
    '  - Command injection: | whoami',
    '  - XSS reflected: <script>alert(1)</script>',
    '  - XSS reflected: <img src=x onerror=alert(1)>',
    '  - SSTI (template injection): {{7*7}}',
    '  - SSTI: <%= 7*7 %>',
    '  - LDAP injection: *)(uid=*))(|(uid=*',
    '',
    'A04 — Insecure Design',
    '  - Business logic bypass: negative price (-1), quantity=0',
    '  - Sequential resource ID enumeration',
    '  - Rate limit test: send 20 rapid identical requests',
    '  - Large payload/headers for basic DoS protection check',
    '',
    'A05 — Security Misconfiguration',
    '  - Send malformed JSON to trigger verbose error (check for stack traces)',
    '  - HTTP TRACE method',
    '  - HTTP OPTIONS method (check allowed methods)',
    '  - Missing security headers check (X-Content-Type-Options, etc.)',
    '',
    'A07 — Identification and Authentication Failures',
    '  - Common weak credentials: admin/admin, admin/password, test/test',
    '  - Empty credentials',
    '  - Very long password (>1000 chars) for DoS',
    '',
    'A08 — Software and Data Integrity Failures',
    '  - Mass assignment: inject isAdmin:true, role:"admin", permissions:["all"]',
    '  - Parameter pollution: duplicate query params with conflicting values',
    '',
    'A09 — Security Logging Failures',
    '  - Send attack payload and check if any error reveals internal details',
    '',
    'A10 — SSRF (Server-Side Request Forgery)',
    '  - URL/webhook field: http://localhost',
    '  - URL/webhook field: http://169.254.169.254/latest/meta-data/',
    '  - URL/webhook field: http://0.0.0.0',
    '  - Filename/path field: ../../etc/passwd',
    '  - Filename/path field: ..\\..\\windows\\system32\\drivers\\etc\\hosts',
    '',
    'Rules:',
    '- type must be "security" for ALL cases',
    '- Every case MUST have owaspCategory and owaspRationale',
    '- Minimum: 20 security test cases covering at least 6 OWASP categories',
    '- Make payloads specific to this endpoint — inject into relevant fields',
    '- Path may vary for IDOR tests',
    '- Output raw JSON only:',
    fillSchema(endpoint),
  ].join('\n');
}

// ─── Prompt 3: Analyze functional results ────────────────────────────────────

export function buildFunctionalAnalysisPrompt(
  testResults: TestRunResult,
  testPlans: GeneratedTestPlan[]
): string {
  return [
    'You are a senior QA engineer.',
    'Analyze these API functional test results (positive and negative tests only).',
    '',
    'Test Plans:',
    JSON.stringify(pruneTestPlans(testPlans), null, 2),
    '',
    'Actual Results:',
    JSON.stringify(pruneTestResults(testResults), null, 2),
    '',
    'Analysis requirements:',
    '1. POSITIVE: correct status code, correct response fields, latency < 2000ms?',
    '2. NEGATIVE: proper 4xx returned? Is the error message informative and safe?',
    '',
    'Severity:',
    '- critical: API crashes or returns 500 on normal input',
    '- high: wrong status code, missing required fields in response',
    '- medium: slow response, unhelpful error messages',
    '- low: minor inconsistencies, non-standard responses',
    '',
    'Return ONLY valid JSON — no securityIssues (set to empty array):',
    '{',
    '  "summary": "2-3 sentence summary of functional quality",',
    '  "overallScore": <0-100>,',
    '  "bugs": [',
    '    {',
    '      "endpoint": "name",',
    '      "testType": "positive|negative",',
    '      "severity": "critical|high|medium|low",',
    '      "description": "what went wrong",',
    '      "fix": "concrete fix recommendation"',
    '    }',
    '  ],',
    '  "securityIssues": [],',
    '  "recommendations": ["general functional improvements"]',
    '}',
  ].join('\n');
}

// ─── Prompt 4: Analyze security results (OWASP) ───────────────────────────────

export function buildSecurityAnalysisPrompt(
  testResults: TestRunResult,
  testPlans: GeneratedTestPlan[]
): string {
  return [
    'You are a senior API penetration tester and OWASP Top 10 2021 expert.',
    'Analyze these API security test results.',
    '',
    'Security Test Plans (what was attempted):',
    JSON.stringify(pruneTestPlans(testPlans), null, 2),
    '',
    'Actual Results (what happened):',
    JSON.stringify(pruneTestResults(testResults), null, 2),
    '',
    'For each test case, determine:',
    '- Was the attack rejected properly (4xx or specific safe error)?',
    '- Did the API leak any internal info (stack traces, SQL errors, file paths)?',
    '- Did any injection payload get reflected or executed?',
    '- Did any unauthorized request succeed (2xx)?',
    '',
    'Severity classification:',
    '- critical: immediately exploitable (SQLi works, auth bypass, IDOR succeeds)',
    '- high: significant flaw (verbose errors, mass assignment, no rate limit)',
    '- medium: partial information leak, non-standard error handling',
    '- low: missing security headers, minor misconfiguration',
    '',
    'Return ONLY valid JSON — no bugs array (set to empty array):',
    '{',
    '  "summary": "2-3 sentence executive security posture summary",',
    '  "overallScore": <0-100>,',
    '  "bugs": [],',
    '  "securityIssues": [',
    '    {',
    '      "endpoint": "name",',
    '      "owaspCategory": "A03-Injection",',
    '      "vulnerability": "SQL Injection",',
    '      "severity": "critical|high|medium|low",',
    '      "description": "what was found and why it is dangerous",',
    '      "recommendation": "specific mitigation with code example",',
    '      "cweId": "CWE-89"',
    '    }',
    '  ],',
    '  "recommendations": ["general security hardening suggestions"]',
    '}',
  ].join('\n');
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

export function parseTestPlan(raw: string): GeneratedTestPlan {
  return parseJSON<GeneratedTestPlan>(raw);
}

export function parseAnalysisResponse(raw: string): AIAnalysis {
  try {
    return parseJSON<AIAnalysis>(raw);
  } catch {
    return {
      summary: 'Analysis parsing failed. Raw: ' + raw.slice(0, 300),
      bugs: [],
      securityIssues: [],
      recommendations: ['Check provider response format.'],
      overallScore: 0,
    };
  }
}

/**
 * Merges multiple AIAnalysis results into one (used for per-endpoint analysis)
 */
export function mergeAnalyses(analyses: AIAnalysis[]): AIAnalysis {
  if (analyses.length === 0) {
    return {
      summary: 'No results to analyze.',
      bugs: [],
      securityIssues: [],
      recommendations: [],
      overallScore: 0
    };
  }

  if (analyses.length === 1) return analyses[0];

  return {
    summary: analyses.map(a => a.summary).join('\n\n'),
    overallScore: Math.round(analyses.reduce((sum, a) => sum + a.overallScore, 0) / analyses.length),
    bugs: analyses.flatMap(a => a.bugs),
    securityIssues: analyses.flatMap(a => a.securityIssues),
    recommendations: [...new Set(analyses.flatMap(a => a.recommendations))]
  };
}
