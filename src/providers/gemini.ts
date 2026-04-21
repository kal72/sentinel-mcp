import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIProvider, AIAnalysis, TestRunResult, EndpointConfig, GeneratedTestPlan } from '../types.js';
import {
  buildFunctionalTestPlanPrompt,
  buildSecurityTestPlanPrompt,
  buildFunctionalAnalysisPrompt,
  buildSecurityAnalysisPrompt,
  parseTestPlan,
  parseAnalysisResponse,
} from './prompt.js';

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  model: string;
  private client: GoogleGenerativeAI;

  constructor() {
    this.client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  }

  private async ask(prompt: string): Promise<string> {
    const genModel = this.client.getGenerativeModel({
      model: this.model,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await genModel.generateContent(prompt);
    return result.response.text();
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