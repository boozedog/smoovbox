import { Hono } from "hono"
import { cors } from "hono/cors"
import { getModelList } from "./models"
import { handleAnthropicMessages } from "./handlers/anthropic"
import { handleOpenAIChatCompletions } from "./handlers/openai"

export function createApp() {
  const app = new Hono()

  app.use("*", cors())

  // Health / service info
  app.get("/", (c) => {
    return c.json({
      status: "ok",
      service: "smoovwrapper",
      version: "1.0.0",
      endpoints: {
        openai: "/v1/chat/completions",
        anthropic: ["/v1/messages", "/messages"],
        models: "/v1/models",
      },
    })
  })

  // Models list (OpenAI format)
  app.get("/v1/models", (c) => c.json(getModelList()))

  // Anthropic-compatible endpoints
  app.post("/v1/messages", handleAnthropicMessages)
  app.post("/messages", handleAnthropicMessages)

  // OpenAI-compatible endpoint
  app.post("/v1/chat/completions", handleOpenAIChatCompletions)

  return app
}
