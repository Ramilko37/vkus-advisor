import { spawn } from "node:child_process";

const children = [
  spawn("node", ["server.mjs"], { stdio: "inherit" }),
  spawn("vite", ["--host", "127.0.0.1", "--port", "5173", "--strictPort"], { stdio: "inherit" }),
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
