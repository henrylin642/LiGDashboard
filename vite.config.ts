import { defineConfig, type PreviewServer, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";

type Middleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

export default defineConfig({
  plugins: [react(), internalDataSyncPlugin()],
});

function internalDataSyncPlugin() {
  return {
    name: "internal-data-sync-plugin",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(createSyncMiddleware(server.config.root ?? process.cwd()));
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use(createSyncMiddleware(server.config.root ?? process.cwd()));
    },
  };
}

function createSyncMiddleware(rootDir: string): Middleware {
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith("/api/internal-data-sync")) {
      next();
      return;
    }
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ success: false, message: "Method Not Allowed" }));
      return;
    }

    runInternalSync(rootDir)
      .then((files) => {
        res.statusCode = 200;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: true,
            files,
            message: "資料更新完成",
          })
        );
      })
      .catch((error) => {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            success: false,
            message: error instanceof Error ? error.message : String(error),
          })
        );
      });
  };
}

async function runInternalSync(rootDir: string): Promise<string[]> {
  const host = process.env.DASHBOARD_SYNC_HOST?.trim() || "web1";
  const remoteDir =
    process.env.DASHBOARD_SYNC_REMOTE?.trim() || "/opt/deploy_dashboard/data";
  const filesEnv = process.env.DASHBOARD_SYNC_FILES?.trim();
  const files =
    filesEnv?.split(",").map((item) => item.trim()).filter(Boolean) ?? [
      "scandata.csv",
      "obj_click_log.csv",
    ];

  const localDataDir = path.resolve(rootDir, "public/data");
  await fs.mkdir(localDataDir, { recursive: true });

  for (const file of files) {
    await copyFileFromRemote(host, remoteDir, file, localDataDir);
  }

  return files;
}

function copyFileFromRemote(
  host: string,
  remoteDir: string,
  filename: string,
  localDir: string
): Promise<void> {
  const remotePath = `${host}:${path.posix.join(
    normalizeRemoteDir(remoteDir),
    filename
  )}`;
  const localPath = path.join(localDir, filename);

  return new Promise((resolve, reject) => {
    const child = spawn("scp", [remotePath, localPath], {
      stdio: "inherit",
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`scp ${remotePath} exited with code ${code}`));
      }
    });
  });
}

function normalizeRemoteDir(dir: string): string {
  const normalized = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  return normalized === "" ? "." : normalized;
}
