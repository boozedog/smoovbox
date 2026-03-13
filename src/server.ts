import { Hono } from "hono"
import { cors } from "hono/cors"
import type { Logger } from "pino"
import { getModelList } from "./models"
import { handleAnthropicMessages } from "./handlers/anthropic"
import { handleOpenAIChatCompletions } from "./handlers/openai"
import { createRequestLogger } from "./logger"

type Env = {
  Variables: {
    requestId: string
    log: Logger
  }
}

export function createApp() {
  const app = new Hono<Env>()

  app.use("*", cors())

  // Request logging middleware
  app.use("*", async (c, next) => {
    const requestId = crypto.randomUUID()
    c.set("requestId", requestId)
    const log = createRequestLogger(c.req.method, c.req.path, requestId)
    c.set("log", log)

    const start = Date.now()
    log.info("request received")

    await next()

    const duration = Date.now() - start
    log.info({ status: c.res.status, duration }, "request completed")
  })

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
