import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  DbClient,
  CollectionEntity,
  CollectionWithItems,
  MediaEntity,
  MediaWithTags,
} from '../db/client.js';
import { LibraryService } from './libraryService.js';
import { MediaManageService } from './mediaManageService.js';
import {
  readSidecar,
  writeSidecar,
  ensureHiddenDirectory,
  ZENBOX_DIR_NAME,
} from '../watcher/sidecar.js';

export interface CreateCollectionPayload {
  title: string;
  notes?: string;
  sourceUrl?: string;
  tags?: string[];
  directory?: string;
  libraryId?: number;
  mediaIds: number[];
  coverMediaId?: number;
}

export interface UpdateCollectionPayload {
  title?: string;
  notes?: string;
  sourceUrl?: string;
  tags?: string[];
  directory?: string;
  libraryId?: number;
  mediaIds?: number[];
  coverMediaId?: number;
}

export interface ListCollectionsQuery {
  libraryId?: number;
  directory?: string;
  tags?: string;
  q?: string;
  page?: number;
  limit?: number;
  isTrashed?: boolean | number;
}

export class CollectionService {
  /**
   * Helper to resolve the physical manifest path for a collection in .zenbox/collections/
   */
  public static getManifestPath(rootPath: string, directory: string, uuid: string): string {
    const targetFolder = directory ? path.join(rootPath, directory) : rootPath;
    return path.join(targetFolder, ZENBOX_DIR_NAME, 'collections', `${uuid}.json`);
  }

  /**
   * Creates a mixed-media polymorphic collection with atomic dual-write (SQLite + Disk Manifest + Sidecars)
   */
  public static async createCollection(
    payload: CreateCollectionPayload
  ): Promise<CollectionWithItems> {
    if (!payload.mediaIds || payload.mediaIds.length === 0) {
      throw new Error('合集必須至少包含一個媒體項目');
    }

    const title = payload.title.trim();
    if (!title) {
      throw new Error('請輸入合集標題');
    }

    // 0. Resolve Library
    const library = payload.libraryId !== undefined
      ? LibraryService.getLibrary(payload.libraryId)
      : LibraryService.getDefaultLibrary();

    if (!library) {
      throw new Error('指定的儲存庫不存在');
    }
    if (library.is_readonly) {
      throw new Error('該儲存庫為唯讀狀態，無法建立合集');
    }

    // Sanitize directory
    const rawDir = (payload.directory || '').replace(/\\/g, '/');
    const safeDirParts = rawDir.split('/').filter((p) => p && p !== '..' && p !== '.');
    const safeDir = safeDirParts.join('/');

    // 1. Fetch member media items in the specified order
    const placeholders = payload.mediaIds.map(() => '?').join(',');
    const mediaRows = DbClient.queryAll<MediaEntity>(
      `SELECT * FROM media WHERE id IN (${placeholders})`,
      payload.mediaIds
    );

    // Map according to requested order
    const mediaMap = new Map<number, MediaEntity>(mediaRows.map((m) => [m.id, m]));
    const orderedMedia: MediaEntity[] = [];
    for (const id of payload.mediaIds) {
      const item = mediaMap.get(id);
      if (item) orderedMedia.push(item);
    }

    if (orderedMedia.length === 0) {
      throw new Error('合集成員項目無效');
    }

    // 2. Compute collection statistics (Mixed-Media support)
    const itemCount = orderedMedia.length;
    const imageCount = orderedMedia.filter((m) => m.mime_type.startsWith('image/')).length;
    const videoCount = orderedMedia.filter((m) => m.mime_type.startsWith('video/')).length;
    const totalBytes = orderedMedia.reduce((acc, m) => acc + m.file_size, 0);

    // Cover selection: specified cover -> first image -> first item
    let coverId = payload.coverMediaId;
    if (!coverId || !mediaMap.has(coverId)) {
      const firstImage = orderedMedia.find((m) => m.mime_type.startsWith('image/'));
      coverId = firstImage ? firstImage.id : orderedMedia[0].id;
    }

    const uuid = `col_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const nowIso = new Date().toISOString();
    const finalTags = (payload.tags || []).map((t) => t.trim().toLowerCase()).filter(Boolean);

    // 3. Insert into SQLite `collections` table
    const insertResult = DbClient.execute(
      `INSERT INTO collections (
        uuid, library_id, directory, title, notes, source_url, cover_media_id,
        item_count, image_count, video_count, total_bytes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuid,
        library.id,
        safeDir,
        title,
        payload.notes || '',
        payload.sourceUrl || '',
        coverId,
        itemCount,
        imageCount,
        videoCount,
        totalBytes,
        nowIso,
        nowIso,
      ]
    );

    const collectionId = Number(insertResult.lastInsertRowid);

    // 4. Link member items with sequence in `collection_items`
    for (let i = 0; i < orderedMedia.length; i++) {
      DbClient.execute(
        'INSERT INTO collection_items (collection_id, media_id, sort_order) VALUES (?, ?, ?)',
        [collectionId, orderedMedia[i].id, i + 1]
      );
    }

    // 5. Link collection tags
    for (const tag of finalTags) {
      DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [tag, nowIso]);
      const tagRow = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tag]);
      if (tagRow) {
        DbClient.execute('INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)', [
          collectionId,
          tagRow.id,
        ]);
      }
    }

    // 6. Disk Dual-Write: Collection Manifest in .zenbox/collections/
    const manifestPath = this.getManifestPath(library.root_path, safeDir, uuid);
    await ensureHiddenDirectory(path.dirname(manifestPath));

    const manifestData = {
      id: uuid,
      title,
      notes: payload.notes || '',
      sourceUrl: payload.sourceUrl || '',
      tags: finalTags,
      coverMediaId: coverId,
      itemCount,
      imageCount,
      videoCount,
      totalBytes,
      items: orderedMedia.map((m, idx) => ({
        id: m.id,
        filename: m.filename,
        relativePath: m.relative_path,
        mimeType: m.mime_type,
        order: idx + 1,
      })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await fs.writeFile(manifestPath, JSON.stringify(manifestData, null, 2), 'utf-8');

    // 7. Update member Sidecars to reflect collection membership
    for (let i = 0; i < orderedMedia.length; i++) {
      const m = orderedMedia[i];
      try {
        const sidecar = (await readSidecar(m.filepath)) || {
          tags: [],
          addedAt: m.added_at,
        };
        sidecar.collection = {
          id: uuid,
          title,
          order: i + 1,
          total: itemCount,
        };
        await writeSidecar(m.filepath, sidecar);
      } catch (err) {
        console.warn(`[CollectionService] Failed updating member sidecar for ${m.filename}:`, err);
      }
    }

    const created = await this.getCollection(collectionId);
    if (!created) {
      throw new Error('合集建立失敗');
    }
    return created;
  }

  /**
   * Retrieves single collection with ordered member media and tags
   */
  public static async getCollection(idOrUuid: number | string): Promise<CollectionWithItems | null> {
    const isNum = typeof idOrUuid === 'number' || /^\d+$/.test(String(idOrUuid));
    const collection = DbClient.queryOne<CollectionEntity>(
      isNum ? 'SELECT * FROM collections WHERE id = ?' : 'SELECT * FROM collections WHERE uuid = ?',
      [idOrUuid]
    );

    if (!collection) return null;

    // Fetch ordered member items
    const itemRows = DbClient.queryAll<MediaEntity & { sort_order: number }>(
      `SELECT m.*, ci.sort_order
       FROM media m
       INNER JOIN collection_items ci ON m.id = ci.media_id
       WHERE ci.collection_id = ?
       ORDER BY ci.sort_order ASC`,
      [collection.id]
    );

    // Hydrate each member item with its own tags
    const items: Array<MediaWithTags & { sort_order: number }> = itemRows.map((m) => {
      const tagRows = DbClient.queryAll<{ name: string }>(
        `SELECT t.name FROM tags t
         INNER JOIN media_tags mt ON t.id = mt.tag_id
         WHERE mt.media_id = ?`,
        [m.id]
      );
      return {
        ...m,
        tags: tagRows.map((r) => r.name),
      };
    });

    // Fetch collection tags
    const collectionTagRows = DbClient.queryAll<{ name: string }>(
      `SELECT t.name FROM tags t
       INNER JOIN collection_tags ct ON t.id = ct.tag_id
       WHERE ct.collection_id = ?`,
      [collection.id]
    );

    // Fetch cover media
    let cover: MediaEntity | null = null;
    if (collection.cover_media_id) {
      cover = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [collection.cover_media_id]);
    }
    if (!cover && items.length > 0) {
      cover = items[0];
    }

    return {
      ...collection,
      tags: collectionTagRows.map((r) => r.name),
      cover,
      items,
    };
  }

  /**
   * Lists collections with filtering and search
   */
  public static async listCollections(
    query: ListCollectionsQuery = {}
  ): Promise<{ data: CollectionWithItems[]; count: number; page: number; limit: number }> {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 24));
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const queryParams: (string | number)[] = [];

    const isTrashedVal = query.isTrashed ? 1 : 0;
    whereClauses.push('c.is_trashed = ?');
    queryParams.push(isTrashedVal);

    if (query.libraryId !== undefined) {
      whereClauses.push('c.library_id = ?');
      queryParams.push(query.libraryId);
    }

    if (query.directory !== undefined) {
      if (query.directory === '') {
        whereClauses.push("c.directory = ''");
      } else {
        whereClauses.push('(c.directory = ? OR c.directory LIKE ?)');
        queryParams.push(query.directory, `${query.directory}/%`);
      }
    }

    if (query.q && query.q.trim()) {
      const pattern = `%${query.q.trim()}%`;
      whereClauses.push('(c.title LIKE ? OR c.notes LIKE ?)');
      queryParams.push(pattern, pattern);
    }

    const rawTags = query.tags
      ? query.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    let collectionsList: CollectionEntity[];

    if (rawTags.length > 0) {
      const placeholders = rawTags.map(() => '?').join(',');
      whereClauses.push(`t.name IN (${placeholders})`);
      queryParams.push(...rawTags);

      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const sql = `
        SELECT c.*
        FROM collections c
        INNER JOIN collection_tags ct ON c.id = ct.collection_id
        INNER JOIN tags t ON ct.tag_id = t.id
        ${whereStr}
        GROUP BY c.id
        HAVING COUNT(DISTINCT t.id) = ?
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
      `;
      collectionsList = DbClient.queryAll<CollectionEntity>(sql, [...queryParams, rawTags.length, limit, offset]);
    } else {
      const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
      const sql = `
        SELECT c.*
        FROM collections c
        ${whereStr}
        ORDER BY c.created_at DESC, c.id DESC
        LIMIT ? OFFSET ?
      `;
      collectionsList = DbClient.queryAll<CollectionEntity>(sql, [...queryParams, limit, offset]);
    }

    // Hydrate each collection
    const results: CollectionWithItems[] = [];
    for (const col of collectionsList) {
      const hydrated = await this.getCollection(col.id);
      if (hydrated) results.push(hydrated);
    }

    return {
      data: results,
      count: results.length,
      page,
      limit,
    };
  }

  /**
   * Updates collection metadata or reorders members
   */
  public static async updateCollection(
    id: number,
    payload: UpdateCollectionPayload
  ): Promise<CollectionWithItems> {
    const existing = await this.getCollection(id);
    if (!existing) {
      throw new Error('找不到該合集');
    }

    const library = LibraryService.getLibrary(existing.library_id);
    if (!library) {
      throw new Error('合集所屬儲存庫不存在');
    }

    const nowIso = new Date().toISOString();
    const updatedTitle = payload.title !== undefined ? payload.title.trim() : existing.title;
    const updatedNotes = payload.notes !== undefined ? payload.notes : existing.notes;
    const updatedSource = payload.sourceUrl !== undefined ? payload.sourceUrl : existing.source_url;

    // Handle members reorder or replacement if provided
    let coverId = payload.coverMediaId !== undefined ? payload.coverMediaId : existing.cover_media_id;

    if (payload.mediaIds && payload.mediaIds.length > 0) {
      const placeholders = payload.mediaIds.map(() => '?').join(',');
      const rows = DbClient.queryAll<MediaEntity>(
        `SELECT * FROM media WHERE id IN (${placeholders})`,
        payload.mediaIds
      );
      const mediaMap = new Map(rows.map((r) => [r.id, r]));

      const reordered: MediaEntity[] = [];
      for (const mid of payload.mediaIds) {
        const item = mediaMap.get(mid);
        if (item) reordered.push(item);
      }

      // Re-link collection_items in SQLite
      DbClient.execute('DELETE FROM collection_items WHERE collection_id = ?', [id]);
      for (let i = 0; i < reordered.length; i++) {
        DbClient.execute(
          'INSERT INTO collection_items (collection_id, media_id, sort_order) VALUES (?, ?, ?)',
          [id, reordered[i].id, i + 1]
        );
      }

      // Recalculate stats
      const itemCount = reordered.length;
      const imageCount = reordered.filter((m) => m.mime_type.startsWith('image/')).length;
      const videoCount = reordered.filter((m) => m.mime_type.startsWith('video/')).length;
      const totalBytes = reordered.reduce((acc, m) => acc + m.file_size, 0);

      if (!coverId || !mediaMap.has(coverId)) {
        const firstImg = reordered.find((m) => m.mime_type.startsWith('image/'));
        coverId = firstImg ? firstImg.id : reordered[0].id;
      }

      DbClient.execute(
        `UPDATE collections SET
          title = ?, notes = ?, source_url = ?, cover_media_id = ?,
          item_count = ?, image_count = ?, video_count = ?, total_bytes = ?,
          updated_at = ?
        WHERE id = ?`,
        [
          updatedTitle,
          updatedNotes,
          updatedSource,
          coverId,
          itemCount,
          imageCount,
          videoCount,
          totalBytes,
          nowIso,
          id,
        ]
      );
    } else {
      DbClient.execute(
        `UPDATE collections SET
          title = ?, notes = ?, source_url = ?, cover_media_id = ?, updated_at = ?
        WHERE id = ?`,
        [updatedTitle, updatedNotes, updatedSource, coverId, nowIso, id]
      );
    }

    // Handle tags update
    if (payload.tags !== undefined) {
      const finalTags = payload.tags.map((t) => t.trim().toLowerCase()).filter(Boolean);
      DbClient.execute('DELETE FROM collection_tags WHERE collection_id = ?', [id]);
      for (const tag of finalTags) {
        DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [tag, nowIso]);
        const tagRow = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [tag]);
        if (tagRow) {
          DbClient.execute(
            'INSERT OR IGNORE INTO collection_tags (collection_id, tag_id) VALUES (?, ?)',
            [id, tagRow.id]
          );
        }
      }
    }

    // Update disk manifest
    const updated = await this.getCollection(id);
    if (updated) {
      const manifestPath = this.getManifestPath(library.root_path, updated.directory, updated.uuid);
      await ensureHiddenDirectory(path.dirname(manifestPath));
      await fs.writeFile(
        manifestPath,
        JSON.stringify(
          {
            id: updated.uuid,
            title: updated.title,
            notes: updated.notes,
            sourceUrl: updated.source_url,
            tags: updated.tags,
            coverMediaId: updated.cover_media_id,
            itemCount: updated.item_count,
            imageCount: updated.image_count,
            videoCount: updated.video_count,
            totalBytes: updated.total_bytes,
            items: updated.items.map((m, idx) => ({
              id: m.id,
              filename: m.filename,
              relativePath: m.relative_path,
              mimeType: m.mime_type,
              order: idx + 1,
            })),
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
          },
          null,
          2
        ),
        'utf-8'
      );
    }

    return updated!;
  }

  /**
   * Helper to resolve the trash manifest path for a collection in .zenbox/trash/collections/
   */
  public static getTrashManifestPath(rootPath: string, uuid: string): string {
    return path.join(rootPath, ZENBOX_DIR_NAME, 'trash', 'collections', `${uuid}.json`);
  }

  /**
   * Moves a collection to trash (.zenbox/trash/collections/ and is_trashed = 1 in SQLite)
   */
  public static async moveToTrash(id: number): Promise<void> {
    const existing = await this.getCollection(id);
    if (!existing) {
      throw new Error('找不到該合集');
    }
    if (existing.is_trashed === 1) return;

    const library = LibraryService.getLibrary(existing.library_id) || LibraryService.getDefaultLibrary();
    if (library) {
      const origManifest = this.getManifestPath(library.root_path, existing.directory, existing.uuid);
      const trashManifest = this.getTrashManifestPath(library.root_path, existing.uuid);
      await ensureHiddenDirectory(path.dirname(trashManifest));
      if (existsSync(origManifest)) {
        await fs.rename(origManifest, trashManifest).catch(() => {});
      }
    }

    const nowIso = new Date().toISOString();
    DbClient.execute(
      'UPDATE collections SET is_trashed = 1, trashed_at = ? WHERE id = ?',
      [nowIso, id]
    );
  }

  /**
   * Restores a trashed collection back to active collections
   */
  public static async restoreCollection(id: number): Promise<void> {
    const existing = await this.getCollection(id);
    if (!existing) {
      throw new Error('找不到該合集');
    }
    if (existing.is_trashed !== 1) {
      throw new Error('該合集未在垃圾桶中');
    }

    const library = LibraryService.getLibrary(existing.library_id) || LibraryService.getDefaultLibrary();
    if (library) {
      const origManifest = this.getManifestPath(library.root_path, existing.directory, existing.uuid);
      const trashManifest = this.getTrashManifestPath(library.root_path, existing.uuid);
      await ensureHiddenDirectory(path.dirname(origManifest));
      if (existsSync(trashManifest)) {
        await fs.rename(trashManifest, origManifest).catch(() => {});
      }
    }

    DbClient.execute(
      'UPDATE collections SET is_trashed = 0, trashed_at = NULL WHERE id = ?',
      [id]
    );
  }

  /**
   * Permanently deletes a collection and its manifest
   */
  public static async deletePermanently(id: number, keepFiles = true): Promise<void> {
    const existing = await this.getCollection(id);
    if (!existing) {
      return;
    }

    const library = LibraryService.getLibrary(existing.library_id);

    // 1. If keepFiles is false, permanently remove physical media items
    if (!keepFiles) {
      for (const item of existing.items) {
        try {
          await MediaManageService.deletePermanently(item.id);
        } catch (err) {
          console.warn(`[CollectionService] Failed deleting media file ${item.filename}:`, err);
        }
      }
    } else {
      // Clear collection metadata from member sidecars
      for (const item of existing.items) {
        try {
          const sidecar = await readSidecar(item.filepath);
          if (sidecar && sidecar.collection) {
            delete sidecar.collection;
            await writeSidecar(item.filepath, sidecar);
          }
        } catch {}
      }
    }

    // 2. Remove collection manifest from disk (check both regular and trash paths)
    if (library) {
      const regularManifest = this.getManifestPath(library.root_path, existing.directory, existing.uuid);
      const trashManifest = this.getTrashManifestPath(library.root_path, existing.uuid);
      if (existsSync(regularManifest)) await fs.unlink(regularManifest).catch(() => {});
      if (existsSync(trashManifest)) await fs.unlink(trashManifest).catch(() => {});
    }

    // 3. Remove from SQLite (CASCADE deletes collection_items and collection_tags)
    DbClient.execute('DELETE FROM collections WHERE id = ?', [id]);
  }

  /**
   * Disbands or moves a collection to trash
   */
  public static async deleteCollection(id: number): Promise<void> {
    await this.moveToTrash(id);
  }
}
