import chokidar from 'chokidar';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { DbClient, LibraryEntity, MediaEntity } from '../db/client.js';
import { ThumbnailService } from '../services/thumbnailService.js';
import { ensureSidecar, readSidecar, writeSidecar, removeSidecar, calculateQuickHash, SidecarData } from './sidecar.js';

interface UnlinkGraceEntry {
  media: MediaEntity;
  sidecar: SidecarData;
  libraryId: number;
  originalPath: string;
  timer: NodeJS.Timeout;
}

export class LibraryWatcherManager {
  private watchers = new Map<number, chokidar.FSWatcher>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private unlinkGraceBuffer = new Map<string, UnlinkGraceEntry>(); // key: hash

  public async start(): Promise<void> {
    const activeLibs = DbClient.queryAll<LibraryEntity>(
      'SELECT * FROM libraries WHERE is_active = 1'
    );

    for (const lib of activeLibs) {
      this.watchLibrary(lib);
    }
  }

  public watchLibrary(lib: LibraryEntity): void {
    if (this.watchers.has(lib.id)) {
      this.unwatchLibrary(lib.id);
    }

    if (!existsSync(lib.root_path)) {
      console.warn(`[Watcher] Library path does not exist, skipping: ${lib.root_path}`);
      return;
    }

    console.log(`[Watcher] Watching Library #${lib.id} [${lib.name}]: ${lib.root_path}`);

    const watcher = chokidar.watch(lib.root_path, {
      ignored: /(^|[\/\\])(\..|\.zenbox).*|.*\.json$|.*\.tmp\..*/, // Ignore dotfiles, .zenbox, sidecar JSON directly, and temp files
      persistent: true,
      ignoreInitial: false,
      awaitWriteFinish: {
        stabilityThreshold: 1000,
        pollInterval: 200
      }
    });

    watcher
      .on('add', (filePath) => this.handleFileEvent(lib, 'add', filePath))
      .on('change', (filePath) => this.handleFileEvent(lib, 'change', filePath))
      .on('unlink', (filePath) => this.handleFileUnlink(lib, filePath))
      .on('error', (error) => console.error(`[Watcher #${lib.id}] Error:`, error));

    this.watchers.set(lib.id, watcher);
  }

  public unwatchLibrary(libId: number): void {
    const watcher = this.watchers.get(libId);
    if (watcher) {
      watcher.close().catch(() => {});
      this.watchers.delete(libId);
      console.log(`[Watcher] Unwatched Library #${libId}`);
    }
  }

  public async stop(): Promise<void> {
    for (const watcher of this.watchers.values()) {
      await watcher.close();
    }
    this.watchers.clear();

    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    for (const entry of this.unlinkGraceBuffer.values()) {
      clearTimeout(entry.timer);
    }
    this.unlinkGraceBuffer.clear();
  }

  private handleFileEvent(lib: LibraryEntity, event: 'add' | 'change', filePath: string): void {
    if (!CONFIG.isFileSupported(filePath)) {
      return;
    }

    // Debounce to ensure file writes and copying are completely finished
    if (this.debounceTimers.has(filePath)) {
      clearTimeout(this.debounceTimers.get(filePath)!);
    }

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(filePath);
      try {
        if (event === 'add') {
          // Check if this is a moved / renamed file from another location
          const quickHash = await calculateQuickHash(filePath).catch(() => '');
          if (quickHash && this.unlinkGraceBuffer.has(quickHash)) {
            const matched = this.unlinkGraceBuffer.get(quickHash)!;
            if (matched.originalPath !== filePath) {
              clearTimeout(matched.timer);
              this.unlinkGraceBuffer.delete(quickHash);

              await this.selfHealMovedMedia(lib, filePath, matched);
              return;
            }
          }
        }

        await this.processMediaFile(filePath, lib.id, lib.root_path);
        console.log(`[Watcher #${lib.id}] Processed ${event}: ${path.basename(filePath)}`);
      } catch (err) {
        console.error(`[Watcher #${lib.id}] Failed processing ${filePath}:`, err);
      }
    }, CONFIG.WATCHER_DEBOUNCE_MS);

    this.debounceTimers.set(filePath, timer);
  }

  /**
   * Self-heals moved / renamed media by re-binding sidecar, index, and thumbnail cache
   */
  private async selfHealMovedMedia(
    lib: LibraryEntity,
    newFilePath: string,
    matched: UnlinkGraceEntry
  ): Promise<void> {
    const filename = path.basename(newFilePath);
    const relativePath = path.relative(lib.root_path, newFilePath).replace(/\\/g, '/');
    const parsedDir = path.dirname(relativePath);
    const directory = parsedDir === '.' ? '' : parsedDir.replace(/\\/g, '/');
    const nowIso = new Date().toISOString();

    console.log(`[Watcher #${lib.id}] Self-healing moved media: ${matched.media.relative_path} -> ${relativePath}`);

    // 1. Migrate sidecar metadata to new location and cleanup old one
    await writeSidecar(newFilePath, matched.sidecar);
    await removeSidecar(matched.originalPath);

    // 2. Fast-rename existing thumbnail caches to match new relative path
    const oldSm = ThumbnailService.getThumbnailPath(matched.media, 'sm');
    const oldMd = ThumbnailService.getThumbnailPath(matched.media, 'md');
    const newMediaStub = { ...matched.media, library_id: lib.id, relative_path: relativePath };
    const newSm = ThumbnailService.getThumbnailPath(newMediaStub, 'sm');
    const newMd = ThumbnailService.getThumbnailPath(newMediaStub, 'md');

    if (existsSync(oldSm)) await fs.rename(oldSm, newSm).catch(() => {});
    if (existsSync(oldMd)) await fs.rename(oldMd, newMd).catch(() => {});

    // 3. Update SQLite media record
    DbClient.execute(
      `UPDATE media SET 
        library_id = ?,
        filename = ?,
        relative_path = ?,
        directory = ?,
        filepath = ?,
        updated_at = ?
      WHERE id = ?`,
      [lib.id, filename, relativePath, directory, newFilePath, nowIso, matched.media.id]
    );

    console.log(`[Watcher #${lib.id}] Successfully self-healed media #${matched.media.id}`);
  }

  public async processMediaFile(
    filePath: string,
    libraryId = 1,
    rootPath = CONFIG.ORIGINALS_DIR
  ): Promise<void> {
    const stat = await fs.stat(filePath);
    const filename = path.basename(filePath);
    const relativePath = path.relative(rootPath, filePath).replace(/\\/g, '/');
    const parsedDir = path.dirname(relativePath);
    const directory = parsedDir === '.' ? '' : parsedDir.replace(/\\/g, '/');
    
    // 1. Ensure sidecar JSON exists and compute fast hash
    const sidecar = await ensureSidecar(filePath);
    const quickHash = sidecar.hash || (await calculateQuickHash(filePath).catch(() => ''));

    // Determine MIME type
    const mimeType = CONFIG.detectMimeType(filePath);
    const nowIso = new Date().toISOString();

    // 2. Insert or update Media record in SQLite based on (library_id, relative_path)
    const existing = DbClient.queryOne<MediaEntity>(
      'SELECT id FROM media WHERE library_id = ? AND relative_path = ?',
      [libraryId, relativePath]
    );

    let mediaId: number;

    if (existing) {
      mediaId = existing.id;
      DbClient.execute(
        `UPDATE media SET 
          filename = ?,
          directory = ?,
          filepath = ?,
          file_size = ?, 
          hash = ?,
          title = ?, 
          notes = ?, 
          source_url = ?, 
          updated_at = ? 
        WHERE id = ?`,
        [
          filename,
          directory,
          filePath,
          Number(stat.size),
          quickHash,
          sidecar.title || filename,
          sidecar.notes || '',
          sidecar.sourceUrl || '',
          nowIso,
          mediaId
        ]
      );
    } else {
      const result = DbClient.execute(
        `INSERT INTO media (
          library_id, filename, relative_path, directory, filepath, mime_type, file_size, 
          hash, title, notes, source_url, added_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          libraryId,
          filename,
          relativePath,
          directory,
          filePath,
          mimeType,
          Number(stat.size),
          quickHash,
          sidecar.title || filename,
          sidecar.notes || '',
          sidecar.sourceUrl || '',
          sidecar.addedAt || nowIso,
          nowIso
        ]
      );
      mediaId = Number(result.lastInsertRowid);
    }

    // 3. Synchronize Tags and Media-Tags relations
    await this.syncTagsForMedia(mediaId, sidecar.tags || []);

    // 4. Enqueue thumbnail and dimension extraction for images, videos, and bookmarks
    const mediaItem = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (mediaItem) {
      if (mediaItem.mime_type.startsWith('image/') || mediaItem.mime_type.startsWith('video/')) {
        ThumbnailService.generateThumbnails(mediaItem).catch((err) => {
          console.error(`[Watcher] Error generating thumbnails for ${filename}:`, err);
        });
      } else if (mediaItem.mime_type === 'application/x-url') {
        const dir = path.dirname(mediaItem.filepath);
        const snapshotPath = path.join(dir, '.zenbox', `${mediaItem.filename}.preview.webp`);
        if (existsSync(snapshotPath)) {
          ThumbnailService.extractImageMetadata(snapshotPath).then((dims) => {
            if (dims.width > 0 && dims.height > 0) {
              DbClient.execute('UPDATE media SET width = ?, height = ? WHERE id = ?', [
                dims.width, dims.height, mediaItem.id
              ]);
            }
          }).catch(() => {});
          ThumbnailService.getOrGenerateThumbnail(mediaItem, 'sm').catch(() => {});
          ThumbnailService.getOrGenerateThumbnail(mediaItem, 'md').catch(() => {});
        }
      }
    }
  }

  private async syncTagsForMedia(mediaId: number, tags: string[]): Promise<void> {
    const nowIso = new Date().toISOString();

    // Remove old associations
    DbClient.execute('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);

    for (const rawTag of tags) {
      const normalized = rawTag.trim().toLowerCase();
      if (!normalized) continue;

      // Upsert tag
      DbClient.execute(
        'INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)',
        [normalized, nowIso]
      );

      const tagRow = DbClient.queryOne<{ id: number }>(
        'SELECT id FROM tags WHERE name = ?',
        [normalized]
      );

      if (tagRow) {
        DbClient.execute(
          'INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)',
          [mediaId, tagRow.id]
        );
      }
    }
  }

  private async handleFileUnlink(lib: LibraryEntity, filePath: string): Promise<void> {
    const relativePath = path.relative(lib.root_path, filePath).replace(/\\/g, '/');
    console.log(`[Watcher #${lib.id}] File removed: ${relativePath}`);

    const existing = DbClient.queryOne<MediaEntity>(
      'SELECT * FROM media WHERE library_id = ? AND relative_path = ?',
      [lib.id, relativePath]
    );

    if (!existing) {
      await removeSidecar(filePath);
      return;
    }

    const sidecar = await readSidecar(filePath);
    const hashKey = existing.hash || sidecar?.hash;

    if (hashKey) {
      // Buffer in grace period for 3500ms to detect if it's a move/rename operation
      if (this.unlinkGraceBuffer.has(hashKey)) {
        clearTimeout(this.unlinkGraceBuffer.get(hashKey)!.timer);
      }

      const timer = setTimeout(async () => {
        this.unlinkGraceBuffer.delete(hashKey);
        // Grace period expired, perform actual removal
        DbClient.execute('DELETE FROM media WHERE id = ?', [existing.id]);
        await removeSidecar(filePath);
        console.log(`[Watcher #${lib.id}] Grace period expired, removed index & sidecar for: ${relativePath}`);
      }, 3500);

      this.unlinkGraceBuffer.set(hashKey, {
        media: existing,
        sidecar: sidecar || { title: existing.title, tags: [], addedAt: existing.added_at, hash: hashKey },
        libraryId: lib.id,
        originalPath: filePath,
        timer
      });

      console.log(`[Watcher #${lib.id}] Unlink buffered in grace cache (hash: ${hashKey.slice(0, 8)}...): ${relativePath}`);
      return;
    }

    // Fallback if no hash exists
    DbClient.execute('DELETE FROM media WHERE id = ?', [existing.id]);
    await removeSidecar(filePath);
    console.log(`[Watcher #${lib.id}] Cleared index & sidecar for: ${relativePath}`);
  }
}

// Backward-compatible alias
export const FileWatcher = LibraryWatcherManager;

