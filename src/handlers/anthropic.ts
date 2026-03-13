import type { Context } from "hono"
import { queryClaude } from "../claude"
import { resolveModel, getModelId } from "../models"
import { parseAnthropicRequest } from "../formats/anthropic"
import type { AnthropicRequest } from "../types"

export async function handleAnthropicMessages(c: Context) {
  try {
    const body = (await c.req.json()) as AnthropicRequest
    const model = resolveModel(body.model || "sonnet")
    const stream = body.stream ?? false
    const { prompt } = parseAnthropicRequest(body)
    const modelId = getModelId(model)

    if (!stream) {
      return handleNonStreaming(c, prompt, model, modelId)
    }
    return handleStreaming(c, prompt, model, modelId)
  } catch (error) {
    return c.json(
      {
        type: "error",
        error: {
          type: "api_error",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      500
    )
  }
}

async function handleNonStreaming(c: Context, prompt: string, model: "opus" | "sonnet" | "haiku", modelId: string) {
  let fullContent = ""
  const response = queryClaude({ prompt, model, stream: false })

  for await (const message of response) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          fullContent += block.text
        }
      }
    }
  }

  if (!fullContent) {
    fullContent = "I can help with that. Could you provide more details?"
  }

  return c.json({
    id: `msg_${Date.now()}`,
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: fullContent }],
    model: modelId,
    stop_reason: "end_turn",
    usage: { input_tokens: 0, output_tokens: 0 },
  })
}

async function handleStreaming(c: Context, prompt: string, model: "opus" | "sonnet" | "haiku", modelId: string) {
  const encoder = new TextEncoder()

  const readable = new ReadableStream({
    async start(controller) {
      try {
        const response = queryClaude({ prompt, model, stream: true })

        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`))
          } catch {
            clearInterval(heartbeat)
          }
        }, 15_000)

        const skipBlockIndices = new Set<number>()

        try {
          for await (const message of response) {
            if (message.type === "stream_event") {
              const event = message.event
              const eventType = event.type
              const eventIndex = (event as any).index as number | undefined

              // Filter out tool_use content blocks
              if (eventType === "content_block_start") {
                const block = (event as any).content_block
                if (block?.type === "tool_use") {
                  if (eventIndex !== undefined) skipBlockIndices.add(eventIndex)
                  continue
                }
              }

              if (eventIndex !== undefined && skipBlockIndices.has(eventIndex)) {
                continue
              }

              // Override message_delta to always show end_turn
              if (eventType === "message_delta") {
                const patched = {
                  ...event,
                  delta: { ...((event as any).delta || {}), stop_reason: "end_turn" },
                  usage: (event as any).usage || { output_tokens: 0 },
                }
                controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(patched)}\n\n`))
                continue
              }

              controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`))
            }
          }
        } finally {
          clearInterval(heartbeat)
        }

        controller.close()
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({
              type: "error",
              error: { type: "api_error", message: error instanceof Error ? error.message : "Unknown error" },
            })}\n\n`
          )
        )
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
