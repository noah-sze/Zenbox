import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DbClient, LibraryEntity, MediaEntity } from '../db/client.js';
import { ThumbnailService } from './thumbnailService.js';

export interface CreateLibraryPayload {
  name: string;
  rootPath: string;
  isReadonly?: boolean;
  isDefault?: boolean;
}

export interface UpdateLibraryPayload {
  name?: string;
  isActive?: boolean;
  isReadonly?: boolean;
  isDefault?: boolean;
}

export class LibraryService {
  /**
   * Retrieves all storage libraries with computed asset counts and disk bytes
   */
  public static async listLibraries(): Promise<LibraryEntity[]> {
    const libs = DbClient.queryAll<LibraryEntity>(
      'SELECT * FROM libraries ORDER BY is_default DESC, name ASC'
    );

    const result: LibraryEntity[] = [];

    for (const lib of libs) {
      const stats = DbClient.queryOne<{ count: number; total_bytes: number }>(
        'SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_bytes FROM media WHERE library_id = ?',
        [lib.id]
      );
      result.push({
        ...lib,
        media_count: stats ? Number(stats.count) : 0,
        total_bytes: stats ? Number(stats.total_bytes) : 0
      });
    }

    return result;
  }

  /**
   * Gets a single library by ID
   */
  public static getLibrary(id: number): LibraryEntity | null {
    return DbClient.queryOne<LibraryEntity>('SELECT * FROM libraries WHERE id = ?', [id]);
  }

  /**
   * Gets the active default library (fallback to first active)
   */
  public static getDefaultLibrary(): LibraryEntity {
    const def = DbClient.queryOne<LibraryEntity>(
      'SELECT * FROM libraries WHERE is_default = 1 AND is_active = 1 LIMIT 1'
    );
    if (def) return def;

    const firstActive = DbClient.queryOne<LibraryEntity>(
      'SELECT * FROM libraries WHERE is_active = 1 ORDER BY id ASC LIMIT 1'
    );
    if (firstActive) return firstActive;

    throw new Error('未發現任何可用的儲存庫');
  }

  /**
   * Adds and mounts a new physical directory as a library
   */
  public static async createLibrary(payload: CreateLibraryPayload): Promise<LibraryEntity> {
    const trimmedName = payload.name.trim();
    if (!trimmedName) {
      throw new Error('儲存庫名稱不可為空');
    }

    const resolvedPath = path.resolve(payload.rootPath.trim());
    if (!existsSync(resolvedPath)) {
      // Auto-create directory if it doesn't exist
      await fs.mkdir(resolvedPath, { recursive: true });
    }

    // Check if name or path already exists
    const existingName = DbClient.queryOne<LibraryEntity>('SELECT id FROM libraries WHERE name = ?', [trimmedName]);
    if (existingName) {
      throw new Error(`儲存庫名稱「${trimmedName}」已存在`);
    }

    const existingPath = DbClient.queryOne<LibraryEntity>('SELECT id FROM libraries WHERE root_path = ?', [resolvedPath]);
    if (existingPath) {
      throw new Error(`該路徑已作為儲存庫被掛載: ${resolvedPath}`);
    }

    const nowIso = new Date().toISOString();
    const isDefault = payload.isDefault ? 1 : 0;
    const isReadonly = payload.isReadonly ? 1 : 0;

    if (isDefault) {
      DbClient.execute('UPDATE libraries SET is_default = 0');
    }

    const insertResult = DbClient.execute(
      `INSERT INTO libraries (name, root_path, is_default, is_active, is_readonly, created_at, updated_at) 
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      [trimmedName, resolvedPath, isDefault, isReadonly, nowIso, nowIso]
    );

    const newLib = this.getLibrary(Number(insertResult.lastInsertRowid));
    if (!newLib) {
      throw new Error('建立儲存庫失敗');
    }

    return newLib;
  }

  /**
   * Updates library settings
   */
  public static async updateLibrary(id: number, payload: UpdateLibraryPayload): Promise<LibraryEntity> {
    const lib = this.getLibrary(id);
    if (!lib) {
      throw new Error('找不到該儲存庫');
    }

    const nowIso = new Date().toISOString();

    if (payload.isDefault) {
      DbClient.execute('UPDATE libraries SET is_default = 0');
      DbClient.execute('UPDATE libraries SET is_default = 1, is_active = 1, updated_at = ? WHERE id = ?', [nowIso, id]);
    }

    if (payload.name) {
      const trimmed = payload.name.trim();
      const existing = DbClient.queryOne<LibraryEntity>('SELECT id FROM libraries WHERE name = ? AND id != ?', [trimmed, id]);
      if (existing) throw new Error(`名稱「${trimmed}」已被其他庫使用`);
      DbClient.execute('UPDATE libraries SET name = ?, updated_at = ? WHERE id = ?', [trimmed, nowIso, id]);
    }

    if (payload.isActive !== undefined) {
      if (!payload.isActive && lib.is_default) {
        throw new Error('預設儲存庫不能停用');
      }
      DbClient.execute('UPDATE libraries SET is_active = ?, updated_at = ? WHERE id = ?', [
        payload.isActive ? 1 : 0,
        nowIso,
        id
      ]);
    }

    if (payload.isReadonly !== undefined) {
      DbClient.execute('UPDATE libraries SET is_readonly = ?, updated_at = ? WHERE id = ?', [
        payload.isReadonly ? 1 : 0,
        nowIso,
        id
      ]);
    }

    return this.getLibrary(id)!;
  }

  /**
   * Unmounts/deletes a library from index while preserving original physical files on disk
   */
  public static async deleteLibrary(id: number): Promise<void> {
    const lib = this.getLibrary(id);
    if (!lib) {
      throw new Error('找不到該儲存庫');
    }

    if (lib.is_default) {
      throw new Error('預設儲存庫無法被刪除');
    }

    // 1. Clean thumbnail caches for media belonging to this library
    const mediaList = DbClient.queryAll<MediaEntity>('SELECT * FROM media WHERE library_id = ?', [id]);
    for (const media of mediaList) {
      const sm = ThumbnailService.getThumbnailPath(media, 'sm');
      const md = ThumbnailService.getThumbnailPath(media, 'md');
      if (existsSync(sm)) await fs.unlink(sm).catch(() => {});
      if (existsSync(md)) await fs.unlink(md).catch(() => {});
    }

    // 2. Remove SQLite records
    DbClient.execute('DELETE FROM media WHERE library_id = ?', [id]);
    DbClient.execute('DELETE FROM libraries WHERE id = ?', [id]);
  }
}
