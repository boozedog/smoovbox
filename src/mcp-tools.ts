import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { Bash, ReadWriteFs } from "just-bash"

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
          const result = await bashEnv.exec(args.command, {
            ...(args.cwd ? { cwd: args.cwd } : {}),
          })
          const output = result.stdout || result.stderr || "(no output)"
          if (result.exitCode !== 0) {
            return {
              content: [{ type: "text", text: `${output}\n(exit code: ${result.exitCode})` }],
              isError: true,
            }
          }
          return { content: [{ type: "text", text: output }] }
        } catch (error) {
          return {
            content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
            isError: true,
          }
        }
      }
    ),
  ],
})
