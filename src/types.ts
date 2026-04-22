// ─── Test Suite Types ─────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface EndpointConfig {
    name: string;
    method: HttpMethod;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    queryParams?: Record<string, string>;
    pathParams?: Record<string, string>;
    description?: string; // Text to tell AI which fields are required/optional or other rules
    requiredFields?: string[]; // Explicit list of mandatory fields (body or query)
    expectedStatus?: number;
    expectedFields?: string[];
    auth?: boolean; // include Authorization header
    tags?: string[];
}

export interface TestSuite {
    baseUrl?: string;
    endpoints: EndpointConfig[];
}

// ─── Test Result Types ────────────────────────────────────────────────────────

export type TestType = 'positive' | 'negative' | 'security';
export type TestStatus = 'pass' | 'fail' | 'warning' | 'error';

export interface SingleTestResult {
    type: TestType;
    description: string;
    status: TestStatus;
    statusCode?: number;
    latencyMs?: number;
    responseBody?: unknown;
    responseHeaders?: Record<string, string>;
    error?: string;
    notes?: string;
    // from AI-generated test case
    owaspCategory?: OwaspCategory;
    owaspRationale?: string;
    expectedBehavior?: string;
}

export interface EndpointTestResult {
    endpoint: string;
    method: string;
    path: string;
    results: SingleTestResult[];
}

export interface TestRunResult {
    ranAt: string;
    provider: string;
    model: string;
    baseUrl: string;
    totalEndpoints: number;
    endpoints: EndpointTestResult[];
}

// ─── AI-Generated Test Case Types ────────────────────────────────────────────

export type OwaspCategory =
    | 'A01-BrokenAccessControl'
    | 'A02-CryptographicFailures'
    | 'A03-Injection'
    | 'A04-InsecureDesign'
    | 'A05-SecurityMisconfiguration'
    | 'A06-VulnerableComponents'
    | 'A07-AuthFailures'
    | 'A08-DataIntegrityFailures'
    | 'A09-LoggingFailures'
    | 'A10-SSRF';

export interface GeneratedTestCase {
    id: string;                        // e.g. "tc-001"
    type: TestType;
    description: string;               // human-readable intent
    method: HttpMethod;
    path: string;
    headers?: Record<string, string>;
    body?: unknown;
    queryParams?: Record<string, string>;
    pathParams?: Record<string, string>;
    expectedBehavior: string;          // what a secure/correct API should do
    expectedStatus?: number;
    owaspCategory?: OwaspCategory;     // only for security tests
    owaspRationale?: string;           // why this maps to that OWASP category
}

export interface GeneratedTestPlan {
    endpointName: string;
    method: string;
    path: string;
    totalCases: number;
    cases: GeneratedTestCase[];
}

// ─── AI Provider Types ────────────────────────────────────────────────────────

export interface AIAnalysis {
    summary: string;
    bugs: BugEntry[];
    securityIssues: SecurityIssue[];
    recommendations: string[];
    overallScore: number; // 0-100
}

export interface BugEntry {
    endpoint: string;
    testType: TestType;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    fix: string;
}

export interface SecurityIssue {
    endpoint: string;
    owaspCategory: OwaspCategory;
    vulnerability: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
    cweId?: string; // e.g. "CWE-89"
}

export interface AIProvider {
    name: string;
    model: string;
    generateFunctionalTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan>;
    analyze(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis>;
    generateSecurityTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan>;
    analyzeSecurity(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis>;
}

export type ProviderName = 'ollama' | 'claude' | 'openai' | 'gemini' | 'lmstudio';