import type { Context } from "hono"
import { queryClaude } from "../claude"
import { resolveModel, getModelId } from "../models"
import { parseOpenAIRequest } from "../formats/openai"
import type { OpenAIChatRequest } from "../types"

export async function handleOpenAIChatCompletions(c: Context) {
  try {
    const body = (await c.req.json()) as OpenAIChatRequest
    const model = resolveModel(body.model || "sonnet")
    const stream = body.stream ?? false
    const { prompt } = parseOpenAIRequest(body)
    const modelId = getModelId(model)
    const requestId = crypto.randomUUID().replace(/-/g, "").slice(0, 24)

    if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
      return c.json(
        { error: { message: "messages is required and must be a non-empty array", type: "invalid_request_error", code: "invalid_messages" } },
        400
      )
    }

    if (!stream) {
      return handleNonStreaming(c, prompt, model, modelId, requestId)
    }
    return handleStreaming(c, prompt, model, modelId, requestId)
  } catch (error) {
    return c.json(
      { error: { message: error instanceof Error ? error.message : "Unknown error", type: "server_error", code: null } },
      500
    )
  }
}

async function handleNonStreaming(
  c: Context,
  prompt: string,
  model: "opus" | "sonnet" | "haiku",
  modelId: string,
  requestId: string
) {
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
    id: `chatcmpl-${requestId}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: modelId,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: fullContent },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  })
}

async function handleStreaming(
  c: Context,
  prompt: string,
  model: "opus" | "sonnet" | "haiku",
  modelId: string,
  requestId: string
) {
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

        let isFirst = true
        let lastText = ""
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

              // Extract text from content_block_delta
              if (eventType === "content_block_delta") {
                const delta = (event as any).delta
                const text = delta?.text || ""
                if (text) {
                  lastText = text
                  const chunk = {
                    id: `chatcmpl-${requestId}`,
                    object: "chat.completion.chunk",
                    created: Math.floor(Date.now() / 1000),
                    model: modelId,
                    choices: [
                      {
                        index: 0,
                        delta: {
                          ...(isFirst ? { role: "assistant" as const } : {}),
                          content: text,
                        },
                        finish_reason: null,
                      },
                    ],
                  }
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`))
                  isFirst = false
                }
              }
            }
          }
        } finally {
          clearInterval(heartbeat)
        }

        // Send final chunk with finish_reason
        const doneChunk = {
          id: `chatcmpl-${requestId}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: modelId,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(doneChunk)}\n\n`))
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))

        controller.close()
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              error: { message: error instanceof Error ? error.message : "Unknown error", type: "server_error", code: null },
            })}\n\n`
          )
        )
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`))
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
