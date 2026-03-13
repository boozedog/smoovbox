import { query } from "@anthropic-ai/claude-agent-sdk"
import { execSync } from "child_process"
import { existsSync } from "fs"
import { fileURLToPath } from "url"
import { join, dirname } from "path"
import { createSmoovMcpServer } from "./mcp-tools"
import { logger } from "./logger"
import type { ClaudeModel } from "./types"

const log = logger.child({ component: "claude" })

const BLOCKED_BUILTIN_TOOLS = [
  "Read", "Write", "Edit", "MultiEdit",
  "Bash", "Glob", "Grep", "NotebookEdit",
  "WebFetch", "WebSearch", "TodoWrite",
]

const MCP_SERVER_NAME = "smoov"

const ALLOWED_MCP_TOOLS = [
  `mcp__${MCP_SERVER_NAME}__bash`,
]

function resolveClaudeExecutable(): string {
  // 1. Try the SDK's bundled cli.js
  try {
    const sdkPath = fileURLToPath(import.meta.resolve("@anthropic-ai/claude-agent-sdk"))
    const sdkCliJs = join(dirname(sdkPath), "cli.js")
    if (existsSync(sdkCliJs)) return sdkCliJs
  } catch {}

  // 2. Try the system-installed claude binary
  try {
    const claudePath = execSync("which claude", { encoding: "utf-8" }).trim()
    if (claudePath && existsSync(claudePath)) return claudePath
  } catch {}

  throw new Error("Could not find Claude Code executable. Install via: npm install -g @anthropic-ai/claude-code")
}

const claudeExecutable = resolveClaudeExecutable()

export interface QueryClaudeOptions {
  prompt: string
  model: ClaudeModel
  stream: boolean
}

export function queryClaude(opts: QueryClaudeOptions) {
  log.debug({ model: opts.model, stream: opts.stream, promptLength: opts.prompt.length }, "starting claude query")
  log.trace({ prompt: opts.prompt }, "full prompt")
  return query({
    prompt: opts.prompt,
    options: {
      maxTurns: 100,
      model: opts.model,
      pathToClaudeCodeExecutable: claudeExecutable,
      includePartialMessages: opts.stream,
      disallowedTools: [...BLOCKED_BUILTIN_TOOLS],
      allowedTools: [...ALLOWED_MCP_TOOLS],
      mcpServers: {
        [MCP_SERVER_NAME]: createSmoovMcpServer(),
      },
    },
  })
}
