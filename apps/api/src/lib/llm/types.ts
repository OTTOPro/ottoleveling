export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** When true, requests `response_format: { type: 'json_object' }`. */
  jsonMode?: boolean;
}

export interface LLMProvider {
  complete(messages: ChatMessage[], options?: CompletionOptions): Promise<string>;
}
