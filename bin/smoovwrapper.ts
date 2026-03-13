#!/usr/bin/env bun
import { createApp } from "../src/server"

const args = process.argv.slice(2)
const portIndex = args.indexOf("--port")
const port = portIndex !== -1 ? parseInt(args[portIndex + 1], 10) : 3456
const host = "127.0.0.1"

const app = createApp()

const server = Bun.serve({
  port,
  hostname: host,
  fetch: app.fetch,
})

console.log(`smoovwrapper running at http://${host}:${server.port}`)
console.log()
console.log("Endpoints:")
console.log(`  GET  /              — service info`)
console.log(`  GET  /v1/models     — list models`)
console.log(`  POST /v1/messages   — Anthropic API`)
console.log(`  POST /messages      — Anthropic API`)
console.log(`  POST /v1/chat/completions — OpenAI API`)
console.log()
console.log("Usage with OpenAI-compatible clients:")
console.log(`  OPENAI_API_KEY=dummy OPENAI_BASE_URL=http://${host}:${server.port}/v1 your-tool`)
console.log()
console.log("Usage with Anthropic-compatible clients:")
console.log(`  ANTHROPIC_API_KEY=dummy ANTHROPIC_BASE_URL=http://${host}:${server.port} your-tool`)
