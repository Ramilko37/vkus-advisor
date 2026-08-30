import { spawn } from "node:child_process";

const portArgIndex = process.argv.findIndex((arg) => arg === "--port" || arg === "-p");
const vitePort = portArgIndex >= 0 && process.argv[portArgIndex + 1] ? process.argv[portArgIndex + 1] : "5173";

const children = [
  spawn("node", ["server.mjs"], { stdio: "inherit" }),
  spawn("vite", ["--host", "127.0.0.1", "--port", vitePort, "--strictPort"], { stdio: "inherit" }),
];

for (const child of children) {
  child.on("exit", (code) => {
    for (const other of children) {
      if (other !== child && !other.killed) other.kill("SIGTERM");
    }
    process.exit(code ?? 0);
  });
}

process.on("SIGINT", () => {
  for (const child of children) child.kill("SIGINT");
});
