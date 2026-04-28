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

export class OpenRouterProvider implements AIProvider {
  name = 'openrouter';
  model: string;
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      defaultHeaders: {
        'HTTP-Referer': 'https://github.com/kal72/sentinel-mcp', // Optional, for OpenRouter rankings
        'X-Title': 'Sentinel MCP', // Optional, for OpenRouter rankings
      },
    });
    this.model = process.env.OPENROUTER_MODEL ?? 'openai/gpt-oss-20b:free';
  }

  private async ask(prompt: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are an expert API analyst. Always respond with valid JSON only.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,
        max_tokens: 4096,
      });

      if (!completion.choices || completion.choices.length === 0) {
        console.error('[openrouter] Error: No choices returned from AI provider.');
        console.error('[openrouter] Full response:', JSON.stringify(completion, null, 2));
        throw new Error('AI provider returned an empty response.');
      }

      return completion.choices[0].message.content ?? '{}';
    } catch (err) {
      console.error('[openrouter] API Error:', err);
      throw err;
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
