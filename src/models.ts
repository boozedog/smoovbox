import type { ClaudeModel } from "./types"

const MODEL_MAP: Record<string, ClaudeModel> = {
  // Shorthand
  opus: "opus",
  sonnet: "sonnet",
  haiku: "haiku",
  // OpenAI-style
  "gpt-4": "opus",
  "gpt-4o": "sonnet",
  "gpt-4o-mini": "haiku",
  // Claude names (short)
  "claude-opus-4": "opus",
  "claude-sonnet-4": "sonnet",
  "claude-haiku-4": "haiku",
  // Claude names (dated)
  "claude-opus-4-20250514": "opus",
  "claude-sonnet-4-20250514": "sonnet",
  "claude-haiku-4-5-20251001": "haiku",
  // With provider prefix
  "claude-code-cli/claude-opus-4": "opus",
  "claude-code-cli/claude-sonnet-4": "sonnet",
  "claude-code-cli/claude-haiku-4": "haiku",
}

export function resolveModel(model: string): ClaudeModel {
  if (MODEL_MAP[model]) return MODEL_MAP[model]

  // Fuzzy match
  if (model.includes("opus")) return "opus"
  if (model.includes("haiku")) return "haiku"
  return "sonnet"
}

const MODEL_ID_MAP: Record<ClaudeModel, string> = {
  opus: "claude-opus-4-20250514",
  sonnet: "claude-sonnet-4-20250514",
  haiku: "claude-haiku-4-5-20251001",
}

export function getModelId(model: ClaudeModel): string {
  return MODEL_ID_MAP[model]
}

export function getModelList() {
  return {
    object: "list",
    data: [
      { id: "claude-opus-4-20250514", object: "model", owned_by: "anthropic", created: Math.floor(Date.now() / 1000) },
      { id: "claude-sonnet-4-20250514", object: "model", owned_by: "anthropic", created: Math.floor(Date.now() / 1000) },
      { id: "claude-haiku-4-5-20251001", object: "model", owned_by: "anthropic", created: Math.floor(Date.now() / 1000) },
    ],
  }
}
