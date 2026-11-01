import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export const ZENBOX_DIR_NAME = '.zenbox';

export interface BookmarkMeta {
  url: string;
  domain?: string;
  description?: string;
  favicon?: string;
  hasSnapshot?: boolean;
}

export interface SidecarData {
  title?: string;
  tags: string[];
  addedAt: string;
  sourceUrl?: string;
  notes?: string;
  hash?: string;
  bookmark?: BookmarkMeta;
  collection?: {
    id: string;
    title?: string;
    order?: number;
    total?: number;
  };
  meta?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  trash?: {
    trashedAt: string;
    originalLibraryId: number;
    originalRelativePath: string;
    originalDirectory: string;
  };
}

/**
 * Ensures directory exists and applies native platform hidden attributes
 * - Windows: attrib +h (FILE_ATTRIBUTE_HIDDEN)
 * - macOS: chflags hidden
 * - Linux: Natural dot-prefix convention (.zenbox)
 */
export async function ensureHiddenDirectory(dirPath: string): Promise<void> {
  if (!existsSync(dirPath)) {
    await fs.mkdir(dirPath, { recursive: true });
  }

  // Windows platform: apply FILE_ATTRIBUTE_HIDDEN
  if (process.platform === 'win32') {
    execFile('attrib', ['+h', dirPath], () => {});
  } else if (process.platform === 'darwin') {
    execFile('chflags', ['hidden', dirPath], () => {});
  }
}

/**
 * Calculates a high-speed fingerprint (SHA-256 of head 64KB + tail 64KB + file size)
 * Extremely fast (< 0.1ms) with virtually zero CPU / IO load
 */
export async function calculateQuickHash(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const fileSize = stat.size;
  const chunkSize = 64 * 1024; // 64KB

  const hash = crypto.createHash('sha256');
  hash.update(`size:${fileSize}:`);

  const fileHandle = await fs.open(filePath, 'r');
  try {
    if (fileSize <= chunkSize * 2) {
      const buffer = Buffer.alloc(fileSize);
      await fileHandle.read(buffer, 0, fileSize, 0);
      hash.update(buffer);
    } else {
      const headBuffer = Buffer.alloc(chunkSize);
      await fileHandle.read(headBuffer, 0, chunkSize, 0);
      hash.update(headBuffer);

      const tailBuffer = Buffer.alloc(chunkSize);
      await fileHandle.read(tailBuffer, 0, chunkSize, fileSize - chunkSize);
      hash.update(tailBuffer);
    }
  } finally {
    await fileHandle.close();
  }

  return hash.digest('hex');
}

/**
 * Returns the standard Scheme C hidden .zenbox sidecar path for any media file
 * Example: folder/.zenbox/image.json
 */
export function getSidecarPath(mediaPath: string): string {
  const dir = path.dirname(mediaPath);
  const ext = path.extname(mediaPath);
  const base = path.basename(mediaPath, ext);
  return path.join(dir, ZENBOX_DIR_NAME, `${base}.json`);
}

/**
 * Legacy sidecar path (same directory as mediaPath) for backward compatibility
 */
export function getLegacySidecarPath(mediaPath: string): string {
  const dir = path.dirname(mediaPath);
  const ext = path.extname(mediaPath);
  const base = path.basename(mediaPath, ext);
  return path.join(dir, `${base}.json`);
}

/**
 * Atomically writes sidecar metadata to disk in .zenbox/ with native hidden attribute
 */
export async function writeSidecar(mediaPath: string, data: SidecarData): Promise<void> {
  const sidecarPath = getSidecarPath(mediaPath);
  const zenboxDir = path.dirname(sidecarPath);

  await ensureHiddenDirectory(zenboxDir);

  const jsonContent = JSON.stringify(data, null, 2);
  const tempPath = `${sidecarPath}.tmp.${Date.now()}`;
  await fs.writeFile(tempPath, jsonContent, 'utf-8');
  await fs.rename(tempPath, sidecarPath);
}

/**
 * Reads sidecar data from disk, with auto-migration from legacy location
 */
export async function readSidecar(mediaPath: string): Promise<SidecarData | null> {
  const primaryPath = getSidecarPath(mediaPath);
  const legacyPath = getLegacySidecarPath(mediaPath);

  // 1. Check primary .zenbox/ location
  try {
    const content = await fs.readFile(primaryPath, 'utf-8');
    return JSON.parse(content) as SidecarData;
  } catch {
    // 2. Fallback to legacy path if exists, and auto-migrate to .zenbox/
    try {
      const legacyContent = await fs.readFile(legacyPath, 'utf-8');
      const parsed = JSON.parse(legacyContent) as SidecarData;
      // Auto-migrate to .zenbox/
      await writeSidecar(mediaPath, parsed);
      await fs.unlink(legacyPath).catch(() => {});
      console.log(`[Sidecar] Migrated legacy sidecar to .zenbox: ${path.basename(mediaPath)}`);
      return parsed;
    } catch {
      return null;
    }
  }
}

/**
 * Ensures a sidecar .json file exists in .zenbox/.
 * If not found, initializes it with standard default metadata and hash.
 */
export async function ensureSidecar(mediaPath: string, defaultTitle?: string): Promise<SidecarData> {
  const existing = await readSidecar(mediaPath);
  if (existing) {
    if (!Array.isArray(existing.tags)) {
      existing.tags = [];
    }
    // Lazily backfill hash if missing
    if (!existing.hash && existsSync(mediaPath)) {
      try {
        existing.hash = await calculateQuickHash(mediaPath);
        await writeSidecar(mediaPath, existing);
      } catch {}
    }
    return existing;
  }

  const ext = path.extname(mediaPath);
  const title = defaultTitle || path.basename(mediaPath, ext);
  let hash = '';
  if (existsSync(mediaPath)) {
    try {
      hash = await calculateQuickHash(mediaPath);
    } catch {}
  }

  const initialData: SidecarData = {
    title,
    tags: [],
    addedAt: new Date().toISOString(),
    notes: '',
    hash
  };

  await writeSidecar(mediaPath, initialData);
  return initialData;
}

/**
 * Safely removes sidecar JSON file and cleans empty .zenbox directory
 */
export async function removeSidecar(mediaPath: string): Promise<void> {
  const sidecarPath = getSidecarPath(mediaPath);
  const legacyPath = getLegacySidecarPath(mediaPath);

  if (existsSync(sidecarPath)) await fs.unlink(sidecarPath).catch(() => {});
  if (existsSync(legacyPath)) await fs.unlink(legacyPath).catch(() => {});

  const zenboxDir = path.dirname(sidecarPath);
  try {
    if (existsSync(zenboxDir)) {
      const remaining = await fs.readdir(zenboxDir);
      if (remaining.length === 0) {
        await fs.rmdir(zenboxDir).catch(() => {});
      }
    }
  } catch {}
}

