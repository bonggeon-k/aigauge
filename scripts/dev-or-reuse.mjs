import { spawn } from "node:child_process";
import net from "node:net";

const host = process.env.TAURI_DEV_HOST || "127.0.0.1";
const port = Number(process.env.TAURI_DEV_PORT || "1420");

const canConnect = (targetHost, targetPort) =>
  new Promise((resolve) => {
    const socket = net.createConnection({ host: targetHost, port: targetPort });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });

const waitForever = () =>
  new Promise((resolve) => {
    const timer = setInterval(() => {
      // keep process alive while Tauri dev is running
    }, 60_000);
    const stop = () => {
      clearInterval(timer);
      resolve();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

const main = async () => {
  const running = await canConnect(host, port);
  if (running) {
    console.log(`Reusing existing dev server on http://${host}:${port}`);
    await waitForever();
    return;
  }

  console.log(`Starting dev server on http://${host}:${port}`);
  const args = ["dev", "--host", host, "--port", String(port), "--strictPort"];
  const child =
    process.platform === "win32"
      ? spawn("cmd.exe", ["/d", "/s", "/c", `pnpm ${args.join(" ")}`], {
          stdio: "inherit",
          env: process.env,
        })
      : spawn("pnpm", args, {
          stdio: "inherit",
          env: process.env,
        });

  const forward = (signal) => {
    if (!child.killed) {
      child.kill(signal);
    }
  };
  process.once("SIGINT", () => forward("SIGINT"));
  process.once("SIGTERM", () => forward("SIGTERM"));

  await new Promise((resolve, reject) => {
    child.once("exit", (code) => {
      if (code === 0 || code === null) {
        resolve();
      } else {
        reject(new Error(`dev server exited with code ${code}`));
      }
    });
    child.once("error", reject);
  });
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
