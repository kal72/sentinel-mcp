import { z } from 'zod';
import { getProvider, PROVIDER_NAMES } from '../providers/factory.js';
import { runFromPlans } from '../runner/runner.js';
import { loadTestSuite } from '../runner/loader.js';
import { generateMarkdownReport, saveReport } from '../reports/generator.js';
import { mergeAnalyses } from '../providers/prompt.js';
import type { GeneratedTestPlan, TestRunResult, AIAnalysis } from '../types.js';

export const runApiTestSchema = z.object({
  endpoint: z.string().optional().describe('Specific endpoint name, or omit to test all'),
  provider: z.enum(['ollama', 'lmstudio', 'claude', 'openai', 'gemini']).optional(),
  suite_file: z.string().optional().describe('Custom path to YAML test suite file'),
  suite_dir: z.string().optional().describe('Path to directory containing YAML test suite files'),
});

export type RunApiTestInput = z.infer<typeof runApiTestSchema>;

export async function runApiTest(input: RunApiTestInput): Promise<string> {
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
    `**Phase 1 — AI membuat functional test plan** (${provider.name} / ${provider.model})\n`,
  ];

  // Phase 1: AI generates functional test plans (positive + negative only)
  console.error(`[run_api_test] Phase 1: generating functional test plans...`);
  const testPlans: GeneratedTestPlan[] = [];
  for (const endpoint of endpoints) {
    const plan = await provider.generateFunctionalTestPlan(endpoint, baseUrl);
    testPlans.push(plan);
    const pos = plan.cases.filter((c) => c.type === 'positive').length;
    const neg = plan.cases.filter((c) => c.type === 'negative').length;
    logs.push(`- \`${endpoint.name}\`: ${plan.totalCases} test cases — ${pos} positive · ${neg} negative`);
  }

  // Phase 2: Execute
  console.error(`[run_api_test] Phase 2: executing ${testPlans.reduce((s, p) => s + p.totalCases, 0)} test cases...`);
  logs.push(`\n**Phase 2 — Menjalankan test cases...**\n`);
  const testResults = await runFromPlans(suite, testPlans, provider.name, provider.model);

  // Phase 3: Analyze per endpoint to minimize context length
  console.error(`[run_api_test] Phase 3: analyzing results per endpoint...`);
  logs.push(`**Phase 3 — AI menganalisis hasil per endpoint...**\n`);

  const analyses: AIAnalysis[] = [];
  for (const endpointResult of testResults.endpoints) {
    const endpointPlan = testPlans.find((p) => p.endpointName === endpointResult.endpoint);
    const miniResult: TestRunResult = {
      ...testResults,
      totalEndpoints: 1,
      endpoints: [endpointResult],
    };

    console.error(`  [analyzer] Analyzing: ${endpointResult.endpoint}...`);
    const singleAnalysis = await provider.analyze(miniResult, endpointPlan ? [endpointPlan] : []);
    analyses.push(singleAnalysis);
  }

  const analysis = mergeAnalyses(analyses);

  const reportMd = generateMarkdownReport(testResults, analysis, testPlans, 'functional');
  const savedPath = saveReport(reportMd, provider.name, 'functional');

  const allResults = testResults.endpoints.flatMap((e) => e.results);
  const pass = allResults.filter((r) => r.status === 'pass').length;
  const fail = allResults.filter((r) => r.status === 'fail').length;
  const warn = allResults.filter((r) => r.status === 'warning').length;

  return [
    logs.join('\n'),
    `---`,
    `## Hasil Functional Testing`,
    ``,
    `**Provider:** ${provider.name} (\`${provider.model}\`)`,
    `**Endpoint:** ${testResults.totalEndpoints} · **Test cases:** ${allResults.length}`,
    `**Hasil:** ✅ ${pass} pass · ❌ ${fail} fail · ⚠️ ${warn} warning`,
    `**Skor:** ${analysis.overallScore}/100`,
    ``,
    `### Ringkasan`,
    analysis.summary,
    ``,
    analysis.bugs.length > 0
      ? `### Bug Ditemukan (${analysis.bugs.length})\n` +
      analysis.bugs
        .map((b) => `- **[${b.severity.toUpperCase()}]** \`${b.endpoint}\`: ${b.description}\n  _Fix: ${b.fix}_`)
        .join('\n')
      : `### Tidak ada bug ✅`,
    ``,
    `**Report:** \`${savedPath}\``,
    ``,
    `> Untuk security testing, gunakan tool \`run_security_test\``,
  ].filter(Boolean).join('\n');
}

export async function listProviders(): Promise<string> {
  const current = process.env.DEFAULT_PROVIDER ?? 'ollama';
  const lines = PROVIDER_NAMES.map((p) => (p === current ? `- **${p}** ← default` : `- ${p}`));
  return `## Provider yang tersedia\n\n${lines.join('\n')}\n\nUbah \`DEFAULT_PROVIDER\` di \`.env\` untuk mengganti default.`;
}
