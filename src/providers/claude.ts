import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIAnalysis, TestRunResult, EndpointConfig, GeneratedTestPlan } from '../types.js';
import {
  buildFunctionalTestPlanPrompt,
  buildSecurityTestPlanPrompt,
  buildFunctionalAnalysisPrompt,
  buildSecurityAnalysisPrompt,
  parseTestPlan,
  parseAnalysisResponse,
} from './prompt.js';

export class ClaudeProvider implements AIProvider {
  name = 'claude';
  model = 'claude-sonnet-4-6';
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  private async ask(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });
    return (message.content[0] as { text: string }).text;
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