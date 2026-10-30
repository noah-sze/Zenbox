import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { DbClient, MediaEntity, MediaWithTags } from '../db/client.js';
import { ensureSidecar, readSidecar, writeSidecar, removeSidecar, calculateQuickHash } from '../watcher/sidecar.js';
import { ThumbnailService } from './thumbnailService.js';
import { LibraryService } from './libraryService.js';

export interface UploadOptions {
  title?: string;
  notes?: string;
  sourceUrl?: string;
  tags?: string[];
  directory?: string;
  libraryId?: number;
}

export interface UpdateMediaPayload {
  title?: string;
  notes?: string;
  sourceUrl?: string;
  tags?: string[];
}

export class MediaManageService {
  /**
   * Securely saves an uploaded file, creates sidecar JSON, and registers it
   */
  public static async uploadMedia(
    buffer: Buffer,
    rawFilename: string,
    options: UploadOptions = {}
  ): Promise<MediaWithTags> {
    // 0. Resolve target storage library
    const library = options.libraryId !== undefined
      ? LibraryService.getLibrary(options.libraryId)
      : LibraryService.getDefaultLibrary();

    if (!library) {
      throw new Error('指定的儲存庫不存在');
    }
    if (library.is_readonly) {
      throw new Error('該儲存庫為唯讀狀態，無法上傳');
    }

    // 1. Sanitize filename to prevent Path Traversal
    const safeBase = path.basename(rawFilename).replace(/[^\w.-]/g, '_');
    const ext = path.extname(safeBase).toLowerCase();

    if (!CONFIG.SUPPORTED_EXTENSIONS.has(ext)) {
      throw new Error(`不支援的檔案類型: ${ext}`);
    }

    // Sanitize directory to prevent path traversal
    const rawDir = (options.directory || '').replace(/\\/g, '/');
    const safeDirParts = rawDir.split('/').filter((p) => p && p !== '..' && p !== '.');
    const safeDir = safeDirParts.join('/');

    const targetFolder = safeDir ? path.join(library.root_path, safeDir) : library.root_path;
    await fs.mkdir(targetFolder, { recursive: true });

    const nameWithoutExt = path.basename(safeBase, ext);
    let finalFilename = safeBase;
    let targetPath = path.join(targetFolder, finalFilename);

    // If file already exists, append timestamp
    if (existsSync(targetPath)) {
      finalFilename = `${nameWithoutExt}_${Date.now()}${ext}`;
      targetPath = path.join(targetFolder, finalFilename);
    }

    const relativePath = safeDir ? `${safeDir}/${finalFilename}` : finalFilename;

    // 2. Write original media to disk
    await fs.writeFile(targetPath, buffer);

    // Compute fast fingerprint hash
    const quickHash = await calculateQuickHash(targetPath).catch(() => '');

    // 3. Write sidecar JSON in .zenbox/
    const title = options.title || nameWithoutExt;
    const nowIso = new Date().toISOString();
    const sidecarData = {
      title,
      tags: (options.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean),
      addedAt: nowIso,
      notes: options.notes || '',
      sourceUrl: options.sourceUrl || '',
      hash: quickHash
    };
    await writeSidecar(targetPath, sidecarData);

    // 4. Register in SQLite
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.gif': 'image/gif',
      '.avif': 'image/avif',
      '.svg': 'image/svg+xml',
      '.mp4': 'video/mp4',
      '.mov': 'video/quicktime',
      '.webm': 'video/webm'
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';

    const insertResult = DbClient.execute(
      `INSERT INTO media (
        library_id, filename, relative_path, directory, filepath, mime_type, file_size, 
        hash, title, notes, source_url, added_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        library.id,
        finalFilename,
        relativePath,
        safeDir,
        targetPath,
        mimeType,
        buffer.length,
        quickHash,
        title,
        sidecarData.notes,
        sidecarData.sourceUrl,
        nowIso,
        nowIso
      ]
    );

    const mediaId = Number(insertResult.lastInsertRowid);


    // 5. Insert tags into SQLite
    for (const tag of sidecarData.tags) {
      DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [tag, nowIso]);
      const tagRow = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tag]);
      if (tagRow) {
        DbClient.execute('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)', [mediaId, tagRow.id]);
      }
    }

    const createdMedia = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!createdMedia) {
      throw new Error('媒體記錄建立失敗');
    }

    // 6. Trigger thumbnail generation in background queue
    if (mimeType.startsWith('image/')) {
      ThumbnailService.generateThumbnails(createdMedia).catch((err) => {
        console.error(`[Upload] Thumbnail generation error for ${finalFilename}:`, err);
      });
    }

    return {
      ...createdMedia,
      tags: sidecarData.tags
    };
  }

  /**
   * Updates media metadata with dual-write consistency
   */
  public static async updateMedia(
    mediaId: number,
    payload: UpdateMediaPayload
  ): Promise<MediaWithTags> {
    const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!media) {
      throw new Error('找不到該媒體項目');
    }

    const nowIso = new Date().toISOString();
    const updatedTitle = payload.title !== undefined ? payload.title : media.title;
    const updatedNotes = payload.notes !== undefined ? payload.notes : media.notes;
    const updatedSource = payload.sourceUrl !== undefined ? payload.sourceUrl : media.source_url;

    // 1. Update SQLite media table
    DbClient.execute(
      `UPDATE media SET 
        title = ?, 
        notes = ?, 
        source_url = ?, 
        updated_at = ? 
      WHERE id = ?`,
      [updatedTitle, updatedNotes, updatedSource, nowIso, mediaId]
    );

    // 2. Update tags if provided
    let finalTags: string[];
    if (payload.tags !== undefined) {
      finalTags = payload.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      DbClient.execute('DELETE FROM media_tags WHERE media_id = ?', [mediaId]);
      for (const tag of finalTags) {
        DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [tag, nowIso]);
        const tagRow = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tag]);
        if (tagRow) {
          DbClient.execute('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)', [mediaId, tagRow.id]);
        }
      }
    } else {
      const existingTagRows = DbClient.queryAll<{ name: string }>(
        `SELECT t.name FROM tags t 
         INNER JOIN media_tags mt ON t.id = mt.tag_id 
         WHERE mt.media_id = ?`,
        [mediaId]
      );
      finalTags = existingTagRows.map((r) => r.name);
    }

    // 3. Atomically update sidecar JSON
    const sidecar = (await readSidecar(media.filepath)) || (await ensureSidecar(media.filepath));
    sidecar.title = updatedTitle;
    sidecar.notes = updatedNotes;
    sidecar.sourceUrl = updatedSource;
    sidecar.tags = finalTags;
    await writeSidecar(media.filepath, sidecar);

    return {
      ...media,
      title: updatedTitle,
      notes: updatedNotes,
      source_url: updatedSource,
      updated_at: nowIso,
      tags: finalTags
    };
  }

  /**
   * Deletes a media file, sidecar JSON, cache thumbnails, and SQLite references
   */
  public static async deleteMedia(mediaId: number): Promise<void> {
    const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!media) {
      throw new Error('找不到該媒體項目');
    }

    // 1. Remove physical media file
    if (existsSync(media.filepath)) {
      await fs.unlink(media.filepath);
    }

    // 2. Remove sidecar JSON in .zenbox/
    await removeSidecar(media.filepath);

    // 3. Remove cached thumbnails
    const smThumb = ThumbnailService.getThumbnailPath(media, 'sm');
    const mdThumb = ThumbnailService.getThumbnailPath(media, 'md');
    if (existsSync(smThumb)) await fs.unlink(smThumb);
    if (existsSync(mdThumb)) await fs.unlink(mdThumb);

    // 4. Remove from SQLite (media_tags will be CASCADE deleted)
    DbClient.execute('DELETE FROM media WHERE id = ?', [mediaId]);
  }

  /**
   * Renames a tag globally across SQLite and all associated Sidecar JSON files
   */
  public static async renameTag(oldName: string, newName: string): Promise<number> {
    const normOld = oldName.trim().toLowerCase();
    const normNew = newName.trim().toLowerCase();
    if (!normOld || !normNew || normOld === normNew) return 0;

    const oldTag = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [normOld]);
    if (!oldTag) return 0;

    // Find all media items having this tag
    const mediaList = DbClient.queryAll<MediaEntity>(
      `SELECT m.* FROM media m
       INNER JOIN media_tags mt ON m.id = mt.media_id
       WHERE mt.tag_id = ?`,
      [oldTag.id]
    );

    // Insert or get target new tag
    const nowIso = new Date().toISOString();
    DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [normNew, nowIso]);
    const newTag = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [normNew]);

    if (newTag) {
      for (const m of mediaList) {
        DbClient.execute('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)', [m.id, newTag.id]);
      }
    }

    // Remove old associations and tag from SQLite
    DbClient.execute('DELETE FROM media_tags WHERE tag_id = ?', [oldTag.id]);
    DbClient.execute('DELETE FROM tags WHERE id = ?', [oldTag.id]);

    // Update all sidecar JSON files on disk
    for (const m of mediaList) {
      const sidecar = await readSidecar(m.filepath);
      if (sidecar && Array.isArray(sidecar.tags)) {
        sidecar.tags = sidecar.tags.map((t) => (t.toLowerCase() === normOld ? normNew : t));
        // Deduplicate
        sidecar.tags = Array.from(new Set(sidecar.tags));
        await writeSidecar(m.filepath, sidecar);
      }
    }

    return mediaList.length;
  }

  /**
   * Deletes a tag globally across SQLite and all associated Sidecar JSON files
   */
  public static async deleteTag(tagName: string): Promise<number> {
    const norm = tagName.trim().toLowerCase();
    const tag = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [norm]);
    if (!tag) return 0;

    const mediaList = DbClient.queryAll<MediaEntity>(
      `SELECT m.* FROM media m
       INNER JOIN media_tags mt ON m.id = mt.media_id
       WHERE mt.tag_id = ?`,
      [tag.id]
    );

    DbClient.execute('DELETE FROM media_tags WHERE tag_id = ?', [tag.id]);
    DbClient.execute('DELETE FROM tags WHERE id = ?', [tag.id]);

    for (const m of mediaList) {
      const sidecar = await readSidecar(m.filepath);
      if (sidecar && Array.isArray(sidecar.tags)) {
        sidecar.tags = sidecar.tags.filter((t) => t.toLowerCase() !== norm);
        await writeSidecar(m.filepath, sidecar);
      }
    }

    return mediaList.length;
  }
}
