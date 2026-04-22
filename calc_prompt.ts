import {
  buildFunctionalAnalysisPrompt
} from './src/providers/prompt.ts';

const numEndpoints = 6;
const casesPerEndpoint = 12;

const manyPlans = Array.from({ length: numEndpoints }).map((_, i) => ({
  endpointName: `endpoint-${i}`,
  method: "GET",
  path: `/api/v1/test-${i}`,
  totalCases: casesPerEndpoint,
  cases: Array.from({ length: casesPerEndpoint }).map((_, j) => ({
    id: `tc-${j}`,
    type: "positive",
    description: "Realistic test case description that is about 50 characters long.",
    expectedBehavior: "API should return 200 OK and valid data."
  }))
}));

const manyResults = {
  ranAt: new Date().toISOString(),
  provider: "lmstudio",
  model: "qwen2.5-coder",
  baseUrl: "http://localhost:8080",
  totalEndpoints: numEndpoints,
  endpoints: manyPlans.map(p => ({
    endpoint: p.endpointName,
    method: p.method,
    path: p.path,
    results: p.cases.map(c => ({
      type: c.type,
      description: c.description,
      status: "pass",
      statusCode: 200,
      latencyMs: 50,
      responseBody: { message: "Success", data: { id: 1, name: "Sample" } }
    }))
  }))
};

const p3_large = buildFunctionalAnalysisPrompt(manyResults as any, manyPlans as any);

console.log("Prompt lengths (characters) for 6 endpoints:");
console.log("3. Functional Analysis (6 endpoints):", p3_large.length);
console.log("Approx tokens (chars/4):", Math.round(p3_large.length / 4));
