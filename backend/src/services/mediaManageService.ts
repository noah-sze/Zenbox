import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from '../config.js';
import { DbClient, MediaEntity, MediaWithTags } from '../db/client.js';
import { ensureSidecar, readSidecar, writeSidecar, removeSidecar, calculateQuickHash, getSidecarPath, ensureHiddenDirectory } from '../watcher/sidecar.js';
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
  directory?: string;
  libraryId?: number;
  filename?: string;
}

export class MediaManageService {
  /**
   * Fetches remote media URL, writes to originals, and indexes into SQLite & Sidecar
   */
  public static async collectUrl(
    url: string,
    options: UploadOptions = {}
  ): Promise<MediaWithTags> {
    const parsedUrl = new URL(url);
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Zenbox/0.1.0'
      }
    });

    if (!res.ok) {
      throw new Error(`無法存取遠端網址: HTTP ${res.status}`);
    }

    const contentType = res.headers.get('content-type') || '';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract filename from URL pathname or derive from title
    let rawFilename = path.basename(parsedUrl.pathname);
    let ext = path.extname(rawFilename).toLowerCase();

    if (!ext || CONFIG.IGNORED_EXTENSIONS.has(ext)) {
      if (contentType.includes('image/jpeg')) ext = '.jpg';
      else if (contentType.includes('image/png')) ext = '.png';
      else if (contentType.includes('image/webp')) ext = '.webp';
      else if (contentType.includes('image/gif')) ext = '.gif';
      else if (contentType.includes('image/avif')) ext = '.avif';
      else if (contentType.includes('image/svg')) ext = '.svg';
      else if (contentType.includes('video/mp4')) ext = '.mp4';
      else if (contentType.includes('video/webm')) ext = '.webm';
      else if (contentType.includes('video/quicktime')) ext = '.mov';
      else if (contentType.includes('application/pdf')) ext = '.pdf';
      else if (contentType.includes('text/markdown')) ext = '.md';
      else if (contentType.includes('text/plain')) ext = '.txt';
      else ext = ext || '.bin';

      const baseName = options.title
        ? options.title.trim().replace(/[^\w.-]/g, '_')
        : (rawFilename ? rawFilename.replace(/\.[^/.]+$/, '') : `collected_${Date.now()}`);
      rawFilename = `${baseName}${ext}`;
    }

    return await this.uploadMedia(buffer, rawFilename, {
      ...options,
      sourceUrl: url,
      title: options.title || path.basename(rawFilename, ext)
    });
  }

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

    if (CONFIG.IGNORED_EXTENSIONS.has(ext) || CONFIG.IGNORED_FILENAMES.has(safeBase.toLowerCase())) {
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

    // 4. Register in SQLite with dynamic MIME detection
    const mimeType = CONFIG.detectMimeType(finalFilename);

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

    // 6. Trigger thumbnail generation in background queue (both images and videos)
    if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) {
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

    let currentFilePath = media.filepath;
    let currentRelativePath = media.relative_path;
    let currentDirectory = media.directory;
    let currentFilename = media.filename;
    let currentLibraryId = media.library_id;

    // Check if moving directory, library, or renaming file
    const targetLibraryId = payload.libraryId !== undefined ? payload.libraryId : media.library_id;
    const library = targetLibraryId ? LibraryService.getLibrary(targetLibraryId) : LibraryService.getDefaultLibrary();

    if (library) {
      const ext = path.extname(media.filename).toLowerCase();
      let targetFilename = currentFilename;
      if (payload.filename && payload.filename.trim()) {
        const safeBase = path.basename(payload.filename.trim(), ext).replace(/[^\w.-]/g, '_');
        if (safeBase) {
          targetFilename = `${safeBase}${ext}`;
        }
      }

      let safeDir = currentDirectory;
      if (payload.directory !== undefined) {
        const rawDir = (payload.directory || '').replace(/\\/g, '/');
        const safeDirParts = rawDir.split('/').filter((p) => p && p !== '..' && p !== '.');
        safeDir = safeDirParts.join('/');
      }

      const targetFolder = safeDir ? path.join(library.root_path, safeDir) : library.root_path;
      const targetPath = path.join(targetFolder, targetFilename);

      if (targetPath !== currentFilePath) {
        await fs.mkdir(targetFolder, { recursive: true });

        // Handle collision
        let finalPath = targetPath;
        let finalFilename = targetFilename;
        if (existsSync(finalPath) && finalPath !== currentFilePath) {
          const nameWithoutExt = path.basename(targetFilename, ext);
          finalFilename = `${nameWithoutExt}_${Date.now()}${ext}`;
          finalPath = path.join(targetFolder, finalFilename);
        }

        // Move physical media file
        if (existsSync(currentFilePath)) {
          await fs.rename(currentFilePath, finalPath);
        }

        // Move sidecar file in .zenbox/
        const oldSidecarPath = getSidecarPath(currentFilePath);
        const newSidecarPath = getSidecarPath(finalPath);
        await ensureHiddenDirectory(path.dirname(newSidecarPath));
        if (existsSync(oldSidecarPath)) {
          await fs.rename(oldSidecarPath, newSidecarPath);
        }

        currentFilePath = finalPath;
        currentFilename = finalFilename;
        currentDirectory = safeDir;
        currentRelativePath = safeDir ? `${safeDir}/${finalFilename}` : finalFilename;
        currentLibraryId = library.id;
      }
    }

    // 1. Update SQLite media table
    DbClient.execute(
      `UPDATE media SET 
        title = ?, 
        notes = ?, 
        source_url = ?, 
        directory = ?,
        filename = ?,
        relative_path = ?,
        filepath = ?,
        library_id = ?,
        updated_at = ? 
      WHERE id = ?`,
      [
        updatedTitle,
        updatedNotes,
        updatedSource,
        currentDirectory,
        currentFilename,
        currentRelativePath,
        currentFilePath,
        currentLibraryId,
        nowIso,
        mediaId
      ]
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
    const sidecar = (await readSidecar(currentFilePath)) || (await ensureSidecar(currentFilePath));
    sidecar.title = updatedTitle;
    sidecar.notes = updatedNotes;
    sidecar.sourceUrl = updatedSource;
    sidecar.tags = finalTags;
    await writeSidecar(currentFilePath, sidecar);

    return {
      ...media,
      title: updatedTitle,
      notes: updatedNotes,
      source_url: updatedSource,
      directory: currentDirectory,
      filename: currentFilename,
      relative_path: currentRelativePath,
      filepath: currentFilePath,
      library_id: currentLibraryId,
      updated_at: nowIso,
      tags: finalTags
    };
  }

  /**
   * Moves a media file and its sidecar to .zenbox/trash/files/ and marks is_trashed in SQLite
   */
  public static async moveToTrash(mediaId: number): Promise<void> {
    const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!media) {
      throw new Error('找不到該媒體項目');
    }
    if (media.is_trashed === 1) {
      return;
    }

    const library = LibraryService.getLibrary(media.library_id) || LibraryService.getDefaultLibrary();
    if (!library) {
      throw new Error('找不到媒體所屬的儲存庫');
    }

    const trashFilesDir = path.join(library.root_path, '.zenbox', 'trash', 'files');
    await ensureHiddenDirectory(trashFilesDir);

    const safeTrashFilename = `${media.id}_${media.filename}`;
    const targetTrashPath = path.join(trashFilesDir, safeTrashFilename);

    // 1. Physically move original file to .zenbox/trash/files/
    if (existsSync(media.filepath)) {
      await fs.rename(media.filepath, targetTrashPath);
    }

    // 2. Read existing sidecar and inject trash metadata
    const nowIso = new Date().toISOString();
    const sidecar = (await readSidecar(media.filepath)) || {
      title: media.title,
      tags: [],
      addedAt: media.added_at,
      notes: media.notes,
      sourceUrl: media.source_url
    };

    sidecar.trash = {
      trashedAt: nowIso,
      originalLibraryId: media.library_id,
      originalRelativePath: media.relative_path,
      originalDirectory: media.directory
    };

    // Remove old sidecar in original folder
    await removeSidecar(media.filepath);

    // Write updated sidecar to trash folder
    await writeSidecar(targetTrashPath, sidecar);

    // 3. Mark trashed in SQLite (preserving original paths for restore)
    DbClient.execute(
      `UPDATE media SET
        is_trashed = 1,
        trashed_at = ?,
        original_relative_path = ?,
        original_directory = ?,
        filepath = ?,
        relative_path = ?,
        directory = ?
       WHERE id = ?`,
      [
        nowIso,
        media.relative_path,
        media.directory,
        targetTrashPath,
        `.zenbox/trash/files/${safeTrashFilename}`,
        '.zenbox/trash/files',
        media.id
      ]
    );
  }

  /**
   * Restores a trashed media file back to its original directory
   */
  public static async restoreMedia(mediaId: number): Promise<MediaWithTags> {
    const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!media) {
      throw new Error('找不到該媒體項目');
    }
    if (media.is_trashed !== 1) {
      throw new Error('該媒體未在垃圾桶中');
    }

    const library = LibraryService.getLibrary(media.library_id) || LibraryService.getDefaultLibrary();
    if (!library) {
      throw new Error('找不到媒體所屬的儲存庫');
    }

    const origDir = media.original_directory || '';
    const origRel = media.original_relative_path || media.filename;
    const targetDir = origDir ? path.join(library.root_path, origDir) : library.root_path;
    await fs.mkdir(targetDir, { recursive: true });

    let targetFilename = path.basename(origRel);
    let targetPath = path.join(targetDir, targetFilename);

    // Avoid collision if a file with same name was created while in trash
    if (existsSync(targetPath)) {
      const ext = path.extname(targetFilename);
      const name = path.basename(targetFilename, ext);
      targetFilename = `${name}_restored_${Date.now()}${ext}`;
      targetPath = path.join(targetDir, targetFilename);
    }
    const newRelativePath = origDir ? `${origDir}/${targetFilename}` : targetFilename;

    // 1. Physically move file back to original location
    if (existsSync(media.filepath)) {
      await fs.rename(media.filepath, targetPath);
    }

    // 2. Read sidecar from trash, clear trash metadata, and write back
    const sidecar = (await readSidecar(media.filepath)) || {
      title: media.title,
      tags: [],
      addedAt: media.added_at
    };
    delete sidecar.trash;

    await removeSidecar(media.filepath);
    await writeSidecar(targetPath, sidecar);

    // 3. Mark restored in SQLite
    DbClient.execute(
      `UPDATE media SET
        is_trashed = 0,
        trashed_at = NULL,
        original_relative_path = '',
        original_directory = '',
        filename = ?,
        filepath = ?,
        relative_path = ?,
        directory = ?
       WHERE id = ?`,
      [targetFilename, targetPath, newRelativePath, origDir, media.id]
    );

    const tagRows = DbClient.queryAll<{ name: string }>(
      `SELECT t.name FROM tags t
       INNER JOIN media_tags mt ON t.id = mt.tag_id
       WHERE mt.media_id = ?`,
      [media.id]
    );

    return {
      ...media,
      filename: targetFilename,
      filepath: targetPath,
      relative_path: newRelativePath,
      directory: origDir,
      is_trashed: 0,
      trashed_at: null,
      original_relative_path: '',
      original_directory: '',
      tags: tagRows.map((r) => r.name)
    };
  }

  /**
   * Permanently and irreversibly deletes a media file, sidecar, thumbnails, and database record
   */
  public static async deletePermanently(mediaId: number): Promise<void> {
    const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
    if (!media) {
      return;
    }

    // 1. Remove physical media file
    if (existsSync(media.filepath)) {
      await fs.unlink(media.filepath).catch(() => {});
    }

    // 2. Remove sidecar JSON
    await removeSidecar(media.filepath);

    // 3. Remove cached thumbnails
    const smThumb = ThumbnailService.getThumbnailPath(media, 'sm');
    const mdThumb = ThumbnailService.getThumbnailPath(media, 'md');
    if (existsSync(smThumb)) await fs.unlink(smThumb).catch(() => {});
    if (existsSync(mdThumb)) await fs.unlink(mdThumb).catch(() => {});

    // 4. Remove from SQLite (media_tags will be CASCADE deleted)
    DbClient.execute('DELETE FROM media WHERE id = ?', [mediaId]);
  }

  /**
   * Soft delete - moves to trash
   */
  public static async deleteMedia(mediaId: number): Promise<void> {
    await this.moveToTrash(mediaId);
  }

  /**
   * Empties all trashed media items permanently
   */
  public static async emptyTrash(libraryId?: number): Promise<{ count: number; bytesFreed: number }> {
    let sql = 'SELECT * FROM media WHERE is_trashed = 1';
    const params: number[] = [];
    if (libraryId !== undefined) {
      sql += ' AND library_id = ?';
      params.push(libraryId);
    }
    const trashedMedia = DbClient.queryAll<MediaEntity>(sql, params);

    let bytesFreed = 0;
    for (const m of trashedMedia) {
      bytesFreed += m.file_size || 0;
      await this.deletePermanently(m.id);
    }

    return { count: trashedMedia.length, bytesFreed };
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

  /**
   * Batch moves multiple media items to trash
   */
  public static async batchMoveToTrash(mediaIds: number[]): Promise<number> {
    let successCount = 0;
    for (const id of mediaIds) {
      try {
        await this.moveToTrash(id);
        successCount++;
      } catch (err) {
        console.warn(`[Batch] Failed moving media #${id} to trash:`, err);
      }
    }
    return successCount;
  }

  /**
   * Batch updates tags (add and/or remove) across multiple media items
   */
  public static async batchUpdateTags(
    mediaIds: number[],
    addTags: string[] = [],
    removeTags: string[] = []
  ): Promise<number> {
    const normAdd = addTags.map((t) => t.trim().toLowerCase()).filter(Boolean);
    const normRemove = new Set(removeTags.map((t) => t.trim().toLowerCase()).filter(Boolean));
    const nowIso = new Date().toISOString();

    let affectedCount = 0;

    for (const id of mediaIds) {
      const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [id]);
      if (!media) continue;

      // 1. Fetch current tags
      const currentTagRows = DbClient.queryAll<{ name: string }>(
        `SELECT t.name FROM tags t
         INNER JOIN media_tags mt ON t.id = mt.tag_id
         WHERE mt.media_id = ?`,
        [id]
      );
      const tagSet = new Set(currentTagRows.map((r) => r.name.toLowerCase()));

      // 2. Apply modifications
      for (const t of normAdd) tagSet.add(t);
      for (const t of normRemove) tagSet.delete(t);

      const finalTags = Array.from(tagSet);

      // 3. Update SQLite media_tags
      DbClient.execute('DELETE FROM media_tags WHERE media_id = ?', [id]);
      for (const tag of finalTags) {
        DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [tag, nowIso]);
        const tagRow = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tag]);
        if (tagRow) {
          DbClient.execute('INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)', [id, tagRow.id]);
        }
      }

      // 4. Update disk sidecar
      const sidecar = (await readSidecar(media.filepath)) || {
        title: media.title,
        tags: [],
        addedAt: media.added_at
      };
      sidecar.tags = finalTags;
      await writeSidecar(media.filepath, sidecar);

      affectedCount++;
    }

    return affectedCount;
  }

  /**
   * Batch moves media items to a target directory and/or storage library
   */
  public static async batchMoveDirectory(
    mediaIds: number[],
    targetLibraryId: number | undefined,
    targetDirectory: string
  ): Promise<number> {
    let successCount = 0;

    for (const id of mediaIds) {
      try {
        await this.updateMedia(id, {
          directory: targetDirectory,
          libraryId: targetLibraryId
        });
        successCount++;
      } catch (err) {
        console.warn(`[Batch] Failed moving media #${id} to dir:`, err);
      }
    }

    return successCount;
  }
}

