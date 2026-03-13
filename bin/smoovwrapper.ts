#!/usr/bin/env bun
import { createApp } from "../src/server"
import { logger } from "../src/logger"

const args = process.argv.slice(2)
const portIndex = args.indexOf("--port")
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3456
const host = "127.0.0.1"

const app = createApp()

const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.fetch,
  idleTimeout: 255,
})

logger.info(
  {
    host,
    port: server.port,
    endpoints: [
      "GET  /",
      "GET  /v1/models",
      "POST /v1/messages",
      "POST /messages",
      "POST /v1/chat/completions",
    ],
  },
  "smoovwrapper started"
)
