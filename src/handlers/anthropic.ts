import type { Context } from "hono"
import type { Logger } from "pino"
import { queryClaude } from "../claude"
import { resolveModel, getModelId } from "../models"
import { parseAnthropicRequest } from "../formats/anthropic"
import type { AnthropicRequest } from "../types"

export async function handleAnthropicMessages(c: Context) {
  const log: Logger = c.get("log")
  try {
    const body = (await c.req.json()) as AnthropicRequest
    const model = resolveModel(body.model || "sonnet")
    const stream = body.stream ?? false
    const { prompt } = parseAnthropicRequest(body)
    const modelId = getModelId(model)

    log.info({ model, modelId, stream, messageCount: body.messages?.length }, "anthropic request")

    if (!stream) {
      return handleNonStreaming(c, log, prompt, model, modelId)
    }
    return handleStreaming(c, log, prompt, model, modelId)
  } catch (error) {
    log.error({ err: error }, "anthropic handler error")
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

async function handleNonStreaming(c: Context, log: Logger, prompt: string, model: "opus" | "sonnet" | "haiku", modelId: string) {
  let fullContent = ""
  const response = queryClaude({ prompt, model, stream: false })

  for await (const message of response) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          fullContent += block.text
        }
      }
    } else {
      log.debug({ messageType: message.type, message }, "sdk message")
    }
  }

  if (!fullContent) {
    fullContent = "I can help with that. Could you provide more details?"
  }

  log.info({ responseLength: fullContent.length }, "anthropic non-streaming response complete")

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

async function handleStreaming(c: Context, log: Logger, prompt: string, model: "opus" | "sonnet" | "haiku", modelId: string) {
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

        // Multi-turn collapsing state: the SDK emits a full message
        // lifecycle (message_start → content → message_delta → message_stop)
        // per internal turn. We collapse these into a single lifecycle.
        let seenFirstMessageStart = false
        let nextEmittedBlockIndex = 0
        let skipBlockIndices = new Set<number>()
        let turnBlockMap = new Map<number, number>()
        let lastMessageDelta: any = null

        try {
          for await (const message of response) {
            if (message.type === "stream_event") {
              const event = message.event
              const eventType = event.type
              const eventIndex = (event as any).index as number | undefined

              // Skip noisy per-token deltas at debug level
              if (eventType !== "content_block_delta") {
                log.debug({ eventType, eventIndex }, "stream event")
              }

              // message_start: only emit the first one
              if (eventType === "message_start") {
                if (!seenFirstMessageStart) {
                  seenFirstMessageStart = true
                  controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`))
                } else {
                  // New turn — reset per-turn block tracking
                  skipBlockIndices = new Set<number>()
                  turnBlockMap = new Map<number, number>()
                }
                continue
              }

              // message_stop: suppress — emitted after loop ends
              if (eventType === "message_stop") {
                continue
              }

              // message_delta: buffer the latest — emitted after loop ends
              if (eventType === "message_delta") {
                lastMessageDelta = event
                continue
              }

              // Filter out tool_use content blocks
              if (eventType === "content_block_start") {
                const block = (event as any).content_block
                if (block?.type === "tool_use") {
                  if (eventIndex !== undefined) skipBlockIndices.add(eventIndex)
                  continue
                }
                // Re-index and emit
                if (eventIndex !== undefined) {
                  const remappedIndex = nextEmittedBlockIndex++
                  turnBlockMap.set(eventIndex, remappedIndex)
                  controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ ...event, index: remappedIndex })}\n\n`))
                } else {
                  controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`))
                }
                continue
              }

              // Skip events for tool_use blocks
              if (eventIndex !== undefined && skipBlockIndices.has(eventIndex)) {
                continue
              }

              // Re-index content_block_delta and content_block_stop
              if ((eventType === "content_block_delta" || eventType === "content_block_stop") && eventIndex !== undefined) {
                const remappedIndex = turnBlockMap.get(eventIndex)
                if (remappedIndex !== undefined) {
                  controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify({ ...event, index: remappedIndex })}\n\n`))
                }
                continue
              }

              // Forward any other events as-is
              controller.enqueue(encoder.encode(`event: ${eventType}\ndata: ${JSON.stringify(event)}\n\n`))
            } else {
              log.debug({ messageType: message.type }, "sdk message")
            }
          }
        } finally {
          clearInterval(heartbeat)
        }

        // Emit the final message_delta (patched with end_turn) and message_stop
        if (lastMessageDelta) {
          const patched = {
            ...lastMessageDelta,
            delta: { ...((lastMessageDelta as any).delta || {}), stop_reason: "end_turn" },
            usage: (lastMessageDelta as any).usage || { output_tokens: 0 },
          }
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify(patched)}\n\n`))
        }
        controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`))

        log.info("anthropic streaming response complete")
        controller.close()
      } catch (error) {
        log.error({ err: error }, "anthropic streaming error")
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
