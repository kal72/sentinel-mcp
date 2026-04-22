import fs from 'fs';
import path from 'path';
import type { AIAnalysis, TestRunResult, SingleTestResult, GeneratedTestPlan } from '../types.js';

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high: '🟠',
  medium: '🟡',
  low: '🔵',
};

const STATUS_EMOJI: Record<string, string> = {
  pass: '✅',
  fail: '❌',
  warning: '⚠️',
  error: '💥',
};

const OWASP_LABELS: Record<string, string> = {
  'A01-BrokenAccessControl': 'A01 Broken Access Control',
  'A02-CryptographicFailures': 'A02 Cryptographic Failures',
  'A03-Injection': 'A03 Injection',
  'A04-InsecureDesign': 'A04 Insecure Design',
  'A05-SecurityMisconfiguration': 'A05 Security Misconfiguration',
  'A06-VulnerableComponents': 'A06 Vulnerable Components',
  'A07-AuthFailures': 'A07 Auth Failures',
  'A08-DataIntegrityFailures': 'A08 Data Integrity Failures',
  'A09-LoggingFailures': 'A09 Logging Failures',
  'A10-SSRF': 'A10 SSRF',
};

function countByStatus(results: SingleTestResult[]): Record<string, number> {
  return results.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}

export function generateMarkdownReport(
  testResults: TestRunResult,
  analysis: AIAnalysis,
  testPlans: GeneratedTestPlan[],
  mode: 'functional' | 'security' = 'functional'
): string {
  const date = new Date(testResults.ranAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const allResults = testResults.endpoints.flatMap((e) => e.results);
  const totalTests = allResults.length;
  const counts = countByStatus(allResults);
  const totalGenerated = testPlans.reduce((s, p) => s + p.totalCases, 0);

  const lines: string[] = [];

  // Header
  const title = mode === 'security' ? '# API Security Test Report' : '# API Functional Test Report';
  const standard = mode === 'security' ? 'OWASP Top 10 2021' : 'Positive + Negative';
  lines.push(title);
  lines.push(``);
  lines.push(`| | |`);
  lines.push(`|---|---|`);
  lines.push(`| **Tanggal** | ${date} |`);
  lines.push(`| **Base URL** | \`${testResults.baseUrl}\` |`);
  lines.push(`| **AI Provider** | ${testResults.provider} (\`${testResults.model}\`) |`);
  lines.push(`| **Standard** | ${standard} |`);
  lines.push(`| **Endpoint ditest** | ${testResults.totalEndpoints} |`);
  lines.push(`| **Test cases (AI-generated)** | ${totalGenerated} |`);
  lines.push(``);

  // Score
  const score = analysis.overallScore;
  const scoreBar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
  lines.push(`## Skor Keseluruhan`);
  lines.push(``);
  lines.push(`\`${scoreBar}\` **${score}/100**`);
  lines.push(``);
  lines.push(`> ${analysis.summary}`);
  lines.push(``);

  // Summary table
  lines.push(`## Ringkasan Hasil`);
  lines.push(``);
  lines.push(`| Status | Jumlah | % |`);
  lines.push(`|--------|--------|---|`);
  for (const [s, emoji] of Object.entries(STATUS_EMOJI)) {
    const n = counts[s] ?? 0;
    const pct = totalTests > 0 ? Math.round((n / totalTests) * 100) : 0;
    lines.push(`| ${emoji} ${s} | ${n} | ${pct}% |`);
  }
  lines.push(``);

  // Test plan summary (AI thought process)
  lines.push(`## Test Plan yang Dibuat AI`);
  lines.push(``);
  for (const plan of testPlans) {
    const positive = plan.cases.filter((c) => c.type === 'positive').length;
    const negative = plan.cases.filter((c) => c.type === 'negative').length;
    const security = plan.cases.filter((c) => c.type === 'security').length;
    lines.push(`### \`${plan.method} ${plan.path}\` — ${plan.endpointName}`);
    lines.push(``);
    lines.push(`Total: **${plan.totalCases} test cases** — ${positive} positive · ${negative} negative · ${security} security`);
    lines.push(``);

    // Group security by OWASP
    const owaspGroups: Record<string, number> = {};
    for (const c of plan.cases.filter((c) => c.type === 'security')) {
      if (c.owaspCategory) {
        owaspGroups[c.owaspCategory] = (owaspGroups[c.owaspCategory] ?? 0) + 1;
      }
    }
    if (Object.keys(owaspGroups).length > 0) {
      lines.push(`OWASP coverage:`);
      for (const [cat, count] of Object.entries(owaspGroups)) {
        lines.push(`- ${OWASP_LABELS[cat] ?? cat}: ${count} test case(s)`);
      }
    }
    lines.push(``);
  }

  // Bug list
  if (analysis.bugs.length > 0) {
    lines.push(`## Daftar Bug`);
    lines.push(``);
    for (const bug of analysis.bugs) {
      const emoji = SEVERITY_EMOJI[bug.severity] ?? '⚪';
      lines.push(`### ${emoji} [${bug.severity.toUpperCase()}] \`${bug.endpoint}\``);
      lines.push(`- **Jenis Test:** ${bug.testType}`);
      lines.push(`- **Masalah:** ${bug.description}`);
      lines.push(`- **Fix:** ${bug.fix}`);
      lines.push(``);
    }
  }

  // Security issues grouped by OWASP
  if (analysis.securityIssues.length > 0) {
    lines.push(`## Temuan Keamanan (OWASP Top 10 2021)`);
    lines.push(``);

    const grouped: Record<string, typeof analysis.securityIssues> = {};
    for (const issue of analysis.securityIssues) {
      const cat = issue.owaspCategory ?? 'Uncategorized';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(issue);
    }

    for (const [cat, issues] of Object.entries(grouped)) {
      lines.push(`### ${OWASP_LABELS[cat] ?? cat}`);
      lines.push(``);
      for (const issue of issues) {
        const emoji = SEVERITY_EMOJI[issue.severity] ?? '⚪';
        lines.push(`#### ${emoji} ${issue.vulnerability} — \`${issue.endpoint}\``);
        lines.push(`- **Severity:** ${issue.severity.toUpperCase()}`);
        if (issue.cweId) lines.push(`- **CWE:** [${issue.cweId}](https://cwe.mitre.org/data/definitions/${issue.cweId.replace('CWE-', '')}.html)`);
        lines.push(`- **Detail:** ${issue.description}`);
        lines.push(`- **Mitigasi:** ${issue.recommendation}`);
        lines.push(``);
      }
    }
  }

  // Recommendations
  if (analysis.recommendations.length > 0) {
    lines.push(`## Rekomendasi Umum`);
    lines.push(``);
    for (const rec of analysis.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push(``);
  }

  // Detail per endpoint
  lines.push(`## Detail Eksekusi per Endpoint`);
  lines.push(``);

  for (const ep of testResults.endpoints) {
    lines.push(`### \`${ep.method} ${ep.path}\` — ${ep.endpoint}`);
    lines.push(``);

    for (const type of ['positive', 'negative', 'security'] as const) {
      const filtered = ep.results.filter((r) => r.type === type);
      if (filtered.length === 0) continue;

      const isSecurity = mode === 'security';
      const tableHeader = isSecurity
        ? `| # | Deskripsi | Status | Code | Latency | OWASP |`
        : `| # | Deskripsi | Status | Code | Latency |`;
      const tableDivider = isSecurity
        ? `|---|-----------|--------|------|---------|-------|`
        : `|---|-----------|--------|------|---------|`;

      lines.push(`**${type.charAt(0).toUpperCase() + type.slice(1)} Tests**`);
      lines.push(``);
      lines.push(tableHeader);
      lines.push(tableDivider);

      filtered.forEach((r, i) => {
        const emoji = STATUS_EMOJI[r.status] ?? '❓';
        const desc = r.description.slice(0, 45);

        let row = `| ${i + 1} | ${desc} | ${emoji} | ${r.statusCode ?? '-'} | ${r.latencyMs ?? '-'}ms |`;
        if (isSecurity) {
          row += ` ${r.owaspCategory ?? '-'} |`;
        }
        lines.push(row);

        const payloadParts: string[] = [];
        if (r.requestPathParams && Object.keys(r.requestPathParams).length > 0)
          payloadParts.push(`Path: \`${JSON.stringify(r.requestPathParams)}\``);
        if (r.requestQueryParams && Object.keys(r.requestQueryParams).length > 0)
          payloadParts.push(`Query: \`${JSON.stringify(r.requestQueryParams)}\``);
        if (r.requestBody && typeof r.requestBody === 'object' && Object.keys(r.requestBody as object).length > 0)
          payloadParts.push(`Body: \`${JSON.stringify(r.requestBody)}\``);

        if (payloadParts.length > 0) {
          const emptyCols = isSecurity ? '| | | | | |' : '| | | | |';
          lines.push(`| | **Payload:** ${payloadParts.join(' · ')} ${emptyCols.slice(4)}`);
        }

        if (r.notes) {
          const emptyCols = isSecurity ? '| | | | | |' : '| | | | |';
          lines.push(`| | _${r.notes.slice(0, 70)}_ ${emptyCols.slice(4)}`);
        }
      });
      lines.push(``);
    }
  }

  lines.push(`---`);
  lines.push(`_Generated by sentinel-mcp · Provider: ${testResults.provider} · Mode: ${mode}_`);

  return lines.join('\n');
}

export function saveReport(content: string, provider: string, mode: 'functional' | 'security' = 'functional'): string {
  const baseDir = process.env.REPORTS_DIR ?? './reports';
  const targetDir = path.resolve(baseDir, mode);
  fs.mkdirSync(targetDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${timestamp}-${provider}.md`;
  const filePath = path.resolve(targetDir, filename);

  fs.writeFileSync(filePath, content, 'utf-8');
  return filePath;
}
