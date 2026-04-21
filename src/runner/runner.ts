import axios, { AxiosError } from 'axios';
import type {
  GeneratedTestCase,
  GeneratedTestPlan,
  EndpointTestResult,
  SingleTestResult,
  TestRunResult,
  TestSuite,
} from '../types.js';

// ─── HTTP executor ────────────────────────────────────────────────────────────

async function executeRequest(
  testCase: GeneratedTestCase,
  baseUrl: string,
  authToken?: string
): Promise<SingleTestResult> {
  const start = Date.now();

  // Build full URL with query params
  const url = new URL(`${baseUrl}${testCase.path}`);
  if (testCase.queryParams) {
    for (const [k, v] of Object.entries(testCase.queryParams)) {
      url.searchParams.set(k, v);
    }
  }

  // Build headers — inject auth if endpoint needs it and token is available
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(testCase.headers ?? {}),
  };
  if (authToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const res = await axios({
      method: testCase.method,
      url: url.toString(),
      headers,
      data: testCase.body ?? undefined,
      timeout: 12_000,
      validateStatus: () => true,
    });

    const latencyMs = Date.now() - start;
    const expectedStatus = testCase.expectedStatus;
    const actualStatus = res.status;

    // Determine pass/fail based on test type
    let status: SingleTestResult['status'];
    let notes: string | undefined;

    if (testCase.type === 'positive') {
      status = expectedStatus && actualStatus !== expectedStatus ? 'fail' : 'pass';
      if (status === 'fail') notes = `Expected ${expectedStatus}, got ${actualStatus}`;
      if (latencyMs > 2000) { status = 'warning'; notes = `Slow response: ${latencyMs}ms`; }
    } else if (testCase.type === 'negative') {
      status = actualStatus >= 400 && actualStatus < 500 ? 'pass' : 'fail';
      if (status === 'fail') notes = `Expected 4xx for invalid input, got ${actualStatus}`;
    } else {
      // security — pass means the attack was rejected
      status = actualStatus >= 400 ? 'pass' : 'warning';
      if (status === 'warning') notes = `Security probe not rejected — got ${actualStatus}. Needs manual verification.`;
    }

    return {
      type: testCase.type,
      description: testCase.description,
      status,
      statusCode: actualStatus,
      latencyMs,
      responseBody: actualStatus < 500 ? res.data : '[server error]',
      responseHeaders: res.headers as Record<string, string>,
      notes,
      owaspCategory: testCase.owaspCategory,
      owaspRationale: testCase.owaspRationale,
      expectedBehavior: testCase.expectedBehavior,
    };
  } catch (err) {
    const e = err as AxiosError;
    return {
      type: testCase.type,
      description: testCase.description,
      status: 'error',
      latencyMs: Date.now() - start,
      error: e.message,
      notes: 'Request failed (network error or timeout)',
      owaspCategory: testCase.owaspCategory,
      expectedBehavior: testCase.expectedBehavior,
    };
  }
}

// ─── Main runner — execute AI-generated test plan ─────────────────────────────

export async function executeTestPlan(
  plan: GeneratedTestPlan,
  baseUrl: string,
  authToken?: string
): Promise<EndpointTestResult> {
  console.error(`  [runner] ${plan.endpointName}: executing ${plan.totalCases} AI-generated test cases...`);

  const results: SingleTestResult[] = [];

  for (const tc of plan.cases) {
    const result = await executeRequest(tc, baseUrl, authToken);
    results.push(result);
    const icon = result.status === 'pass' ? '✓' : result.status === 'fail' ? '✗' : '~';
    console.error(`    ${icon} [${tc.type}] ${tc.description.slice(0, 60)}`);
  }

  return {
    endpoint: plan.endpointName,
    method: plan.method,
    path: plan.path,
    results,
  };
}

// ─── Orchestrate full test run ─────────────────────────────────────────────────

export async function runFromPlans(
  suite: TestSuite,
  plans: GeneratedTestPlan[],
  providerName: string,
  providerModel: string
): Promise<TestRunResult> {
  const baseUrl = suite.baseUrl ?? process.env.TARGET_API_BASE_URL ?? 'http://localhost:3000';
  const authToken = process.env.TARGET_API_TOKEN;

  const endpointResults: EndpointTestResult[] = [];

  for (const plan of plans) {
    const result = await executeTestPlan(plan, baseUrl, authToken);
    endpointResults.push(result);
  }

  return {
    ranAt: new Date().toISOString(),
    provider: providerName,
    model: providerModel,
    baseUrl,
    totalEndpoints: endpointResults.length,
    endpoints: endpointResults,
  };
}
