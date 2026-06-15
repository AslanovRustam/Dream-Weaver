/**
 * Low-level FTP operations. Stateless — fresh connection per call.
 * basic-ftp needs a real Node net.Socket, so this only works in Node
 * runtime (not Cloudflare Workers).
 *
 * We deliberately avoid connection pooling: serverless-friendly, simpler
 * lifecycle, no leaked sockets if a handler crashes mid-upload. The
 * ~1-2s handshake cost per upload is fine because uploads run in the
 * background after we already returned the image to the user.
 */
import { Readable } from "node:stream";
import { Client } from "basic-ftp";

export interface FtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  secure?: boolean;
}

function getFtpConfig(): FtpConfig {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const password = process.env.FTP_PASS;
  if (!host || !user || !password) {
    throw new Error("FTP_HOST / FTP_USER / FTP_PASS must be set in environment");
  }
  return {
    host,
    port: Number(process.env.FTP_PORT ?? 21),
    user,
    password,
    secure: process.env.FTP_SECURE === "true",
  };
}

async function withClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const config = getFtpConfig();
  const client = new Client(30_000);
  client.ftp.verbose = false;
  try {
    await client.access(config);
    return await fn(client);
  } finally {
    client.close();
  }
}

/**
 * Upload a buffer to remotePath. Creates parent directories as needed.
 * Overwrites if file exists (we never reuse filenames, so this is safe).
 */
export async function uploadFile(buffer: Buffer, remotePath: string): Promise<void> {
  await withClient(async (client) => {
    const dir = remotePath.slice(0, remotePath.lastIndexOf("/"));
    if (dir) await client.ensureDir(dir);
    const stream = Readable.from(buffer);
    await client.uploadFrom(stream, remotePath.slice(remotePath.lastIndexOf("/") + 1));
  });
}

/**
 * Delete a remote file. Silent if file doesn't exist.
 */
export async function deleteFile(remotePath: string): Promise<void> {
  await withClient(async (client) => {
    const dir = remotePath.slice(0, remotePath.lastIndexOf("/"));
    const name = remotePath.slice(remotePath.lastIndexOf("/") + 1);
    try {
      if (dir) await client.cd(dir);
      await client.remove(name, /* ignoreError */ true);
    } catch {
      // file or dir may not exist — treat as success
    }
  });
}

/**
 * Delete a list of files. Reuses one connection.
 */
export async function deleteFiles(remotePaths: string[]): Promise<void> {
  if (remotePaths.length === 0) return;
  await withClient(async (client) => {
    for (const path of remotePaths) {
      const dir = path.slice(0, path.lastIndexOf("/"));
      const name = path.slice(path.lastIndexOf("/") + 1);
      try {
        if (dir) await client.cd(dir);
        await client.remove(name, /* ignoreError */ true);
        await client.cd("/");
      } catch {
        // ignore per-file errors
      }
    }
  });
}

/**
 * Quick connectivity probe — opens connection, lists root, closes.
 * Used by health-checks and the admin panel.
 */
export async function ping(): Promise<{ ok: true; cwd: string } | { ok: false; error: string }> {
  try {
    return await withClient(async (client) => {
      const cwd = await client.pwd();
      return { ok: true as const, cwd };
    });
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
