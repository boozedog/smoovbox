import type { AnthropicRequest } from "../types"

export function parseAnthropicRequest(body: AnthropicRequest): { prompt: string; system: string } {
  let systemContext = ""
  if (body.system) {
    if (typeof body.system === "string") {
      systemContext = body.system
    } else if (Array.isArray(body.system)) {
      systemContext = body.system
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
    }
  }

  const conversationParts = body.messages
    ?.map((m) => {
      const role = m.role === "assistant" ? "Assistant" : "Human"
      let content: string
      if (typeof m.content === "string") {
        content = m.content
      } else if (Array.isArray(m.content)) {
        content = m.content
          .filter((block) => block.type === "text" && block.text)
          .map((block) => block.text!)
          .join("")
      } else {
        content = String(m.content)
      }
      return `${role}: ${content}`
    })
    .join("\n\n") || ""

  const prompt = systemContext
    ? `${systemContext}\n\n${conversationParts}`
    : conversationParts

  return { prompt, system: systemContext }
}
