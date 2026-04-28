import type { AIProvider, ProviderName } from '../types.js';
import { OllamaProvider } from './ollama.js';
import { ClaudeProvider } from './claude.js';
import { OpenAIProvider } from './openai.js';
import { GeminiProvider } from './gemini.js';
import { LMStudioProvider } from './lmstudio.js';
import { OpenRouterProvider } from './openrouter.js';

export function getProvider(name?: string): AIProvider {
  const selected = (name ?? process.env.DEFAULT_PROVIDER ?? 'ollama').toLowerCase() as ProviderName;

  switch (selected) {
    case 'claude':
      return new ClaudeProvider();
    case 'openai':
      return new OpenAIProvider();
    case 'gemini':
      return new GeminiProvider();
    case 'lmstudio':
      return new LMStudioProvider();
    case 'openrouter':
      return new OpenRouterProvider();
    case 'ollama':
    default:
      return new OllamaProvider();
  }
}

export const PROVIDER_NAMES: ProviderName[] = ['ollama', 'lmstudio', 'claude', 'openai', 'gemini', 'openrouter'];