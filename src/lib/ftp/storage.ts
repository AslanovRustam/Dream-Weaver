/**
 * High-level storage layer. Path generation + URL building + image upload.
 * Sits on top of uploader.ts.
 *
 * Layout on the FTP server:
 *   /public_html/dream-weaver/{userIdShort}/{YYYY-MM}/{publicId}_{YYYYMMDD}_{random}.{ext}
 *
 * - userIdShort: first 8 chars of the auth.users.id (UUID) — enough to
 *   keep users isolated without leaking the full ID in URLs.
 * - publicId: separate uuid stored on generations.public_id, never the
 *   serial generations.id (which would leak activity volume).
 * - random suffix: 8 chars, anti-guess (URLs are public — see HANDOVER §5).
 */
import { randomBytes } from "node:crypto";
import { uploadFile, deleteFiles } from "./uploader";

export type ImageKind = "master" | "resize";
export type ImageFormat = "png" | "jpg";

export interface UploadResult {
  url: string; // public HTTPS URL
  ftpPath: string; // absolute path on FTP server
  filename: string; // bare filename
}

function getBasePath(): string {
  const p = process.env.FTP_BASE_PATH;
  if (!p) throw new Error("FTP_BASE_PATH must be set");
  return p.replace(/\/+$/, "");
}

function getBaseUrl(): string {
  const u = process.env.FTP_BASE_URL;
  if (!u) throw new Error("FTP_BASE_URL must be set");
  return u.replace(/\/+$/, "");
}

function shortUserId(userId: string): string {
  return userId.replace(/-/g, "").slice(0, 8);
}

function monthFolder(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function dateStamp(now = new Date()): string {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

function randomSuffix(): string {
  return randomBytes(4).toString("hex"); // 8 hex chars
}

export interface BuildPathArgs {
  userId: string;
  publicId: string;
  kind: ImageKind;
  format: ImageFormat;
  width?: number;
  height?: number;
}

export function buildPath(args: BuildPathArgs): { ftpPath: string; url: string; filename: string } {
  const base = getBasePath();
  const baseUrl = getBaseUrl();
  const user = shortUserId(args.userId);
  const month = monthFolder();
  const date = dateStamp();
  const suffix = randomSuffix();

  const dims = args.width && args.height ? `_${args.width}x${args.height}` : "";
  const filename = `${args.kind}_${args.publicId}_${date}${dims}_${suffix}.${args.format}`;

  const ftpPath = `${base}/${user}/${month}/${filename}`;
  const url = `${baseUrl}/${user}/${month}/${filename}`;

  return { ftpPath, url, filename };
}

/**
 * Upload an image buffer to FTP. Returns URL + path + filename.
 * Callers store these in generations.{image_url, ftp_path, filename}.
 */
export async function uploadImage(buffer: Buffer, args: BuildPathArgs): Promise<UploadResult> {
  const { ftpPath, url, filename } = buildPath(args);
  await uploadFile(buffer, ftpPath);
  return { url, ftpPath, filename };
}

/**
 * Delete all files of a card from FTP. Used by retention cron and
 * by hard-delete after grace period.
 */
export async function deleteCardFiles(ftpPaths: string[]): Promise<void> {
  await deleteFiles(ftpPaths);
}

/**
 * Decode a data URL (data:image/png;base64,...) into a Buffer + format.
 * Generation handlers receive images as base64 strings — this is the bridge.
 */
export function decodeDataUrl(dataUrl: string): { buffer: Buffer; format: ImageFormat } {
  const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl);
  if (!match) {
    // Fallback: treat as plain base64, assume PNG
    return { buffer: Buffer.from(dataUrl, "base64"), format: "png" };
  }
  const ext = match[1].toLowerCase();
  const format: ImageFormat = ext === "png" ? "png" : "jpg";
  return { buffer: Buffer.from(match[2], "base64"), format };
}
