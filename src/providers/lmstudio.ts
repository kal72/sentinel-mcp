import OpenAI from 'openai';
import type { AIProvider, AIAnalysis, TestRunResult, EndpointConfig, GeneratedTestPlan } from '../types.js';
import {
    buildFunctionalTestPlanPrompt,
    buildSecurityTestPlanPrompt,
    buildFunctionalAnalysisPrompt,
    buildSecurityAnalysisPrompt,
    parseTestPlan,
    parseAnalysisResponse,
} from './prompt.js';

// LM Studio exposes an OpenAI-compatible API at localhost:1234/v1
// No API key required — any placeholder string works
// Start the server: LM Studio → Developer tab → Start Server

const SYSTEM_PROMPT = 'You are an expert API security engineer and QA analyst. Always respond with valid JSON only.';

export class LMStudioProvider implements AIProvider {
    name = 'lmstudio';
    model: string;
    private client: OpenAI;

    constructor() {
        this.client = new OpenAI({
            baseURL: process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234/v1',
            apiKey: 'lmstudio', // LM Studio does not require a real key
        });
        this.model = process.env.LMSTUDIO_MODEL ?? '';
    }

    private async ask(prompt: string): Promise<string> {
        // If no model set in env, fetch the first loaded model from LM Studio
        if (!this.model) {
            this.model = await this.getLoadedModel();
        }

        const completion = await this.client.chat.completions.create({
            model: this.model,
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: prompt },
            ],
            temperature: 0.1,    // low temperature for deterministic JSON output
            max_tokens: 4096,
        });

        return completion.choices[0].message.content ?? '{}';
    }

    // Auto-detect which model is currently loaded in LM Studio
    private async getLoadedModel(): Promise<string> {
        try {
            const models = await this.client.models.list();
            const first = models.data[0];
            if (!first) {
                throw new Error(
                    'No model loaded in LM Studio.\n' +
                    'Open LM Studio → load a model → start the server, then try again.'
                );
            }
            console.error(`[lmstudio] Auto-detected model: ${first.id}`);
            return first.id;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(
                `Cannot connect to LM Studio at ${process.env.LMSTUDIO_BASE_URL ?? 'http://localhost:1234'}.\n` +
                `Make sure LM Studio is running and the server is started (Developer tab → Start Server).\n` +
                `Original error: ${msg}`
            );
        }
    }

    async generateFunctionalTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan> {
        return parseTestPlan(await this.ask(buildFunctionalTestPlanPrompt(endpoint, baseUrl)));
    }

    async generateSecurityTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan> {
        return parseTestPlan(await this.ask(buildSecurityTestPlanPrompt(endpoint, baseUrl)));
    }

    async analyze(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis> {
        return parseAnalysisResponse(await this.ask(buildFunctionalAnalysisPrompt(testResults, testPlans)));
    }

    async analyzeSecurity(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis> {
        return parseAnalysisResponse(await this.ask(buildSecurityAnalysisPrompt(testResults, testPlans)));
    }
}
