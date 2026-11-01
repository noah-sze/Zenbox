import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { DbClient, LibraryEntity } from './client.js';
import { FileWatcher } from '../watcher/fileWatcher.js';
import { removeSidecar, ensureHiddenDirectory } from '../watcher/sidecar.js';

/**
 * Recursively walks a directory and collects all file paths
 */
async function walkDirectory(currentDir: string): Promise<string[]> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  const filePaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      // Skip hidden folders (.git, etc.)
      if (!entry.name.startsWith('.')) {
        const subFiles = await walkDirectory(fullPath);
        filePaths.push(...subFiles);
      }
    } else if (entry.isFile()) {
      filePaths.push(fullPath);
    }
  }

  return filePaths;
}

export async function runFullIndexScan(targetLibraryId?: number): Promise<{ totalScanned: number; durationMs: number }> {
  const startTime = Date.now();
  let libraries: LibraryEntity[];

  if (targetLibraryId !== undefined) {
    const lib = DbClient.queryOne<LibraryEntity>('SELECT * FROM libraries WHERE id = ?', [targetLibraryId]);
    libraries = lib ? [lib] : [];
  } else {
    libraries = DbClient.queryAll<LibraryEntity>('SELECT * FROM libraries WHERE is_active = 1');
  }

  console.log(`[Indexer] Running recursive full scan on ${libraries.length} libraries...`);

  const watcher = new FileWatcher();
  let count = 0;

  for (const lib of libraries) {
    if (!existsSync(lib.root_path)) {
      console.warn(`[Indexer] Library #${lib.id} [${lib.name}] path does not exist, skipping: ${lib.root_path}`);
      continue;
    }

    console.log(`[Indexer] Scanning Library #${lib.id} [${lib.name}]: ${lib.root_path}`);
    const rootZenbox = path.join(lib.root_path, '.zenbox');
    if (existsSync(rootZenbox)) {
      await ensureHiddenDirectory(rootZenbox);
    }
    const allFiles = await walkDirectory(lib.root_path);

    for (const filePath of allFiles) {
      if (!CONFIG.isFileSupported(filePath)) continue;

      try {
        await watcher.processMediaFile(filePath, lib.id, lib.root_path);
        count++;
      } catch (err) {
        console.error(`[Indexer] Error indexing ${filePath}:`, err);
      }
    }
    // Clean up indexed media that no longer exists on disk (cold delete detection)
    const existingMedia = DbClient.queryAll<{ id: number; filepath: string; filename: string }>(
      'SELECT id, filepath, filename FROM media WHERE library_id = ?',
      [lib.id]
    );
    for (const item of existingMedia) {
      if (!existsSync(item.filepath)) {
        DbClient.execute('DELETE FROM media WHERE id = ?', [item.id]);
        await removeSidecar(item.filepath).catch(() => {});
        console.log(`[Indexer] Cleaned missing file index & sidecar: ${item.filename}`);
      }
    }
  }

  const durationMs = Date.now() - startTime;
  console.log(`[Indexer] Recursive scan complete: ${count} media files processed in ${durationMs}ms`);
  return { totalScanned: count, durationMs };
}

