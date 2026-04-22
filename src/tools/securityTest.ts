import { z } from 'zod';
import { getProvider } from '../providers/factory.js';
import { runFromPlans } from '../runner/runner.js';
import { loadTestSuite } from '../runner/loader.js';
import { generateMarkdownReport, saveReport } from '../reports/generator.js';
import { mergeAnalyses } from '../providers/prompt.js';
import type { GeneratedTestPlan, TestRunResult, AIAnalysis } from '../types.js';

export const runSecurityTestSchema = z.object({
  endpoint: z.string().optional().describe('Specific endpoint name, or omit to test all'),
  provider: z.enum(['ollama', 'lmstudio', 'claude', 'openai', 'gemini']).optional()
    .describe('AI provider. For best security analysis, prefer claude or openai'),
  suite_file: z.string().optional().describe('Custom path to YAML test suite file'),
  suite_dir: z.string().optional().describe('Path to directory containing YAML test suite files'),
});

export type RunSecurityTestInput = z.infer<typeof runSecurityTestSchema>;

const OWASP_CATEGORIES = [
  'A01 Broken Access Control',
  'A02 Cryptographic Failures',
  'A03 Injection (SQLi, XSS, SSTI, Command)',
  'A04 Insecure Design',
  'A05 Security Misconfiguration',
  'A07 Authentication Failures',
  'A08 Data Integrity / Mass Assignment',
  'A09 Logging Failures',
  'A10 SSRF',
];

export async function runSecurityTest(input: RunSecurityTestInput): Promise<string> {
  const provider = getProvider(input.provider);
  const suite = loadTestSuite({ suite_file: input.suite_file, suite_dir: input.suite_dir });
  const baseUrl = suite.baseUrl ?? process.env.TARGET_API_BASE_URL ?? 'http://localhost:3000';

  const endpoints = input.endpoint
    ? suite.endpoints.filter((e) => e.name === input.endpoint)
    : suite.endpoints;

  if (endpoints.length === 0) {
    return `❌ Endpoint "${input.endpoint}" tidak ditemukan di suite file.`;
  }

  const logs: string[] = [
    `**Phase 1 — AI membuat security test plan** (${provider.name} / ${provider.model})`,
    `_Standard: OWASP Top 10 2021_\n`,
    `Coverage yang akan ditest:`,
    ...OWASP_CATEGORIES.map((c) => `- ${c}`),
    ``,
  ];

  // Phase 1: AI generates security test plans (OWASP)
  console.error(`[run_security_test] Phase 1: generating OWASP security test plans...`);
  const testPlans: GeneratedTestPlan[] = [];
  for (const endpoint of endpoints) {
    console.error(`  [planner] Security plan for: ${endpoint.name}`);
    const plan = await provider.generateSecurityTestPlan(endpoint, baseUrl);
    testPlans.push(plan);

    // Count by OWASP category
    const owaspCount: Record<string, number> = {};
    for (const c of plan.cases) {
      if (c.owaspCategory) owaspCount[c.owaspCategory] = (owaspCount[c.owaspCategory] ?? 0) + 1;
    }
    logs.push(`**\`${endpoint.name}\`** — ${plan.totalCases} security test cases:`);
    for (const [cat, count] of Object.entries(owaspCount)) {
      logs.push(`  - ${cat}: ${count} cases`);
    }
    logs.push(``);
  }

  // Phase 2: Execute security test cases
  const totalCases = testPlans.reduce((s, p) => s + p.totalCases, 0);
  console.error(`[run_security_test] Phase 2: executing ${totalCases} security test cases...`);
  logs.push(`**Phase 2 — Menjalankan ${totalCases} security test cases...**\n`);
  const testResults = await runFromPlans(suite, testPlans, provider.name, provider.model);

  // Phase 3: AI security analysis per endpoint to minimize context length
  console.error(`[run_security_test] Phase 3: AI OWASP analysis per endpoint...`);
  logs.push(`**Phase 3 — AI menganalisis per endpoint dengan standar OWASP...**\n`);

  const analyses: AIAnalysis[] = [];
  for (const endpointResult of testResults.endpoints) {
    const endpointPlan = testPlans.find((p) => p.endpointName === endpointResult.endpoint);
    const miniResult: TestRunResult = {
      ...testResults,
      totalEndpoints: 1,
      endpoints: [endpointResult],
    };

    console.error(`  [analyzer] Security analysis for: ${endpointResult.endpoint}...`);
    const singleAnalysis = await provider.analyzeSecurity(miniResult, endpointPlan ? [endpointPlan] : []);
    analyses.push(singleAnalysis);
  }

  const analysis = mergeAnalyses(analyses);

  const reportMd = generateMarkdownReport(testResults, analysis, testPlans, 'security');
  const savedPath = saveReport(reportMd, provider.name, 'security');

  const allResults = testResults.endpoints.flatMap((e) => e.results);
  const pass = allResults.filter((r) => r.status === 'pass').length;
  const fail = allResults.filter((r) => r.status === 'fail').length;
  const warn = allResults.filter((r) => r.status === 'warning').length;

  const criticalIssues = analysis.securityIssues.filter((s) => s.severity === 'critical');
  const highIssues = analysis.securityIssues.filter((s) => s.severity === 'high');

  // Group by OWASP for summary
  const owaspSummary: Record<string, number> = {};
  for (const issue of analysis.securityIssues) {
    if (issue.owaspCategory) {
      owaspSummary[issue.owaspCategory] = (owaspSummary[issue.owaspCategory] ?? 0) + 1;
    }
  }

  return [
    logs.join('\n'),
    `---`,
    `## Hasil Security Testing (OWASP Top 10 2021)`,
    ``,
    `**Provider:** ${provider.name} (\`${provider.model}\`)`,
    `**Endpoint:** ${testResults.totalEndpoints} · **Test cases:** ${allResults.length}`,
    `**Hasil:** ✅ ${pass} ditolak (aman) · ❌ ${fail} lolos (berbahaya) · ⚠️ ${warn} perlu review`,
    `**Security Score:** ${analysis.overallScore}/100`,
    ``,
    `### Ringkasan`,
    analysis.summary,
    ``,
    Object.keys(owaspSummary).length > 0
      ? `### Temuan per OWASP Category\n` +
      Object.entries(owaspSummary)
        .map(([cat, n]) => `- **${cat}**: ${n} issue(s)`)
        .join('\n')
      : '',
    ``,
    criticalIssues.length > 0
      ? `### 🔴 Critical Vulnerabilities (${criticalIssues.length})\n` +
      criticalIssues
        .map((s) => [
          `- **${s.vulnerability}** — \`${s.endpoint}\` (${s.owaspCategory}${s.cweId ? ` · ${s.cweId}` : ''})`,
          `  ${s.description}`,
          `  _Fix: ${s.recommendation}_`,
        ].join('\n'))
        .join('\n')
      : `### Tidak ada critical vulnerability 🎉`,
    ``,
    highIssues.length > 0
      ? `### 🟠 High Severity (${highIssues.length})\n` +
      highIssues
        .map((s) => `- **${s.vulnerability}** — \`${s.endpoint}\`: ${s.description}`)
        .join('\n')
      : '',
    ``,
    analysis.securityIssues.filter((s) => !['critical', 'high'].includes(s.severity)).length > 0
      ? `### Temuan Lainnya\n` +
      analysis.securityIssues
        .filter((s) => !['critical', 'high'].includes(s.severity))
        .map((s) => `- **[${s.severity.toUpperCase()}]** ${s.vulnerability} — \`${s.endpoint}\``)
        .join('\n')
      : '',
    ``,
    analysis.recommendations.length > 0
      ? `### Rekomendasi Umum\n` + analysis.recommendations.map((r) => `- ${r}`).join('\n')
      : '',
    ``,
    `**Report lengkap:** \`${savedPath}\``,
  ].filter(Boolean).join('\n');
}
