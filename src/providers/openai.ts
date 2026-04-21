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

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  model: string;
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = process.env.OPENAI_MODEL ?? 'gpt-4o-mini';
  }

  private async ask(prompt: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: 'You are an expert API analyst. Always respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 4096,
    });
    return completion.choices[0].message.content ?? '{}';
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