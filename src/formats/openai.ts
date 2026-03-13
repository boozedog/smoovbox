import type { OpenAIChatRequest } from "../types"

export function parseOpenAIRequest(body: OpenAIChatRequest): { prompt: string; system: string } {
  const parts: string[] = []
  let systemContext = ""

  for (const msg of body.messages) {
    switch (msg.role) {
      case "system":
        systemContext += msg.content + "\n"
        break
      case "user":
        parts.push(`Human: ${msg.content}`)
        break
      case "assistant":
        parts.push(`Assistant: ${msg.content}`)
        break
    }
  }

  const conversationParts = parts.join("\n\n")
  const prompt = systemContext.trim()
    ? `${systemContext.trim()}\n\n${conversationParts}`
    : conversationParts

  return { prompt, system: systemContext.trim() }
}
