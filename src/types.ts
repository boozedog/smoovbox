export type ClaudeModel = "opus" | "sonnet" | "haiku"

export interface QueryOptions {
  prompt: string
  model: ClaudeModel
  stream: boolean
}

// OpenAI types

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface OpenAIChatRequest {
  model: string
  messages: OpenAIChatMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
}

export interface OpenAIChatResponse {
  id: string
  object: "chat.completion"
  created: number
  model: string
  choices: {
    index: number
    message: { role: "assistant"; content: string }
    finish_reason: "stop" | "length" | null
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export interface OpenAIChatChunk {
  id: string
  object: "chat.completion.chunk"
  created: number
  model: string
  choices: {
    index: number
    delta: { role?: "assistant"; content?: string }
    finish_reason: "stop" | "length" | null
  }[]
}

// Anthropic types

export interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | { type: string; text?: string }[]
}

export interface AnthropicRequest {
  model: string
  messages: AnthropicMessage[]
  system?: string | { type: string; text?: string }[]
  stream?: boolean
  max_tokens?: number
}

export interface AnthropicResponse {
  id: string
  type: "message"
  role: "assistant"
  content: { type: "text"; text: string }[]
  model: string
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence"
  usage: { input_tokens: number; output_tokens: number }
}
