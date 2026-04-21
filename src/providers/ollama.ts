import axios from 'axios';
import type { AIProvider, AIAnalysis, TestRunResult, EndpointConfig, GeneratedTestPlan } from '../types.ts';
import {
  buildFunctionalTestPlanPrompt,
  buildSecurityTestPlanPrompt,
  buildFunctionalAnalysisPrompt,
  buildSecurityAnalysisPrompt,
  parseTestPlan,
  parseAnalysisResponse,
} from './prompt.js';

export class OllamaProvider implements AIProvider {
  name = 'ollama';
  model: string;
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
    this.model = process.env.OLLAMA_MODEL ?? 'llama3';
  }

  private async generate(prompt: string): Promise<string> {
    const response = await axios.post(`${this.baseUrl}/api/generate`, {
      model: this.model,
      prompt,
      stream: false,
      format: 'json',
    });
    return response.data.response as string;
  }

  async generateFunctionalTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan> {
    return parseTestPlan(await this.generate(buildFunctionalTestPlanPrompt(endpoint, baseUrl)));
  }

  async generateSecurityTestPlan(endpoint: EndpointConfig, baseUrl: string): Promise<GeneratedTestPlan> {
    return parseTestPlan(await this.generate(buildSecurityTestPlanPrompt(endpoint, baseUrl)));
  }

  async analyze(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis> {
    return parseAnalysisResponse(await this.generate(buildFunctionalAnalysisPrompt(testResults, testPlans)));
  }

  async analyzeSecurity(testResults: TestRunResult, testPlans: GeneratedTestPlan[]): Promise<AIAnalysis> {
    return parseAnalysisResponse(await this.generate(buildSecurityAnalysisPrompt(testResults, testPlans)));
  }
}
