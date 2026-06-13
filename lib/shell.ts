import "server-only";

import { spawn } from "node:child_process";

interface CommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  input?: string;
  onStderr?: (chunk: string) => void;
  onStdout?: (chunk: string) => void;
  timeoutMs?: number;
}

interface CommandResult {
  stderr: string;
  stdout: string;
}

export class CommandError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message);
    this.name = "CommandError";
  }
}

const MAX_CAPTURED_OUTPUT = 1_000_000;

function appendOutput(current: string, chunk: Buffer): string {
  if (current.length >= MAX_CAPTURED_OUTPUT) {
    return current;
  }

  return (current + chunk.toString()).slice(0, MAX_CAPTURED_OUTPUT);
}

export function runCommand(
  command: string,
  args: string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");

            setTimeout(() => child.kill("SIGKILL"), 5_000).unref();
          }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = appendOutput(stdout, chunk);
      options.onStdout?.(chunk.toString());
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = appendOutput(stderr, chunk);
      options.onStderr?.(chunk.toString());
    });

    child.on("error", (error) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      reject(error);
    });

    child.on("close", (exitCode) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      if (timedOut) {
        reject(
          new CommandError(
            `${command} timed out after ${options.timeoutMs}ms`,
            command,
            exitCode,
            stderr,
          ),
        );
        return;
      }

      if (exitCode !== 0) {
        reject(
          new CommandError(
            `${command} exited with code ${exitCode}`,
            command,
            exitCode,
            stderr,
          ),
        );
        return;
      }

      resolve({ stdout, stderr });
    });

    child.stdin.end(options.input);
  });
}
