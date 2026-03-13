import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { Bash, OverlayFs, defineCommand } from "just-bash"
import { spawnSync } from "child_process"
import { readFileSync } from "fs"
import { join } from "path"
import { logger } from "./logger"

const log = logger.child({ component: "mcp-bash" })

function loadPassthroughCommands(): string[] {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8"))
    return pkg.smoovwrapper?.passthrough ?? []
  } catch {
    return []
  }
}

function createPassthroughCommand(name: string) {
  return defineCommand(name, async (args) => {
    const result = spawnSync(name, args, {
      cwd: process.cwd(),
      env: process.env,
      encoding: "utf-8",
      timeout: 30_000,
    })
    return {
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      exitCode: result.status ?? 1,
    }
  })
}

export function createSmoovMcpServer() {
  const root = process.cwd()
  const bashEnv = new Bash({
    fs: new OverlayFs({ root, mountPoint: "/", allowSymlinks: true }),
    cwd: "/",
    defenseInDepth: false,
    customCommands: loadPassthroughCommands().map(createPassthroughCommand),
  })

  return createSdkMcpServer({
    name: "smoov",
    version: "1.0.0",
    tools: [
      tool(
        "bash",
        "Execute a bash command. Paths are relative to the project root.",
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
}
