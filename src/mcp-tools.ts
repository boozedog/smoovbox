import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { Bash, ReadWriteFs } from "just-bash"
import { logger } from "./logger"

const log = logger.child({ component: "mcp-bash" })

const bashEnv = new Bash({
  fs: new ReadWriteFs({ root: "/" }),
  cwd: process.cwd(),
})

export const smoovMcpServer = createSdkMcpServer({
  name: "smoov",
  version: "1.0.0",
  tools: [
    tool(
      "bash",
      "Execute a bash command in a sandboxed environment with full filesystem access. Supports cat, grep, sed, awk, find, ls, mkdir, cp, mv, rm, head, tail, sort, uniq, wc, diff, cut, tr, jq, and more.",
      {
        command: z.string().describe("The bash command to execute"),
        cwd: z.string().optional().describe("Working directory for the command"),
      },
      async (args) => {
        try {
          log.debug({ command: args.command, cwd: args.cwd }, "executing command")
          const result = await bashEnv.exec(args.command, {
            ...(args.cwd ? { cwd: args.cwd } : {}),
          })
          const output = result.stdout || result.stderr || "(no output)"
          if (result.exitCode !== 0) {
            log.warn({ command: args.command, exitCode: result.exitCode, stderrLength: result.stderr.length }, "command failed")
            return {
              content: [{ type: "text", text: `${output}\n(exit code: ${result.exitCode})` }],
              isError: true,
            }
          }
          log.debug({ command: args.command, exitCode: 0, stdoutLength: result.stdout.length }, "command succeeded")
          return { content: [{ type: "text", text: output }] }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error)
          log.error({ command: args.command, err: error }, "command execution error")
          return {
            content: [{ type: "text", text: `Error: ${msg}` }],
            isError: true,
          }
        }
      }
    ),
  ],
})
