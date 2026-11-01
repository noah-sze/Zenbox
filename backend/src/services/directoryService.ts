import fs from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { DbClient, LibraryEntity } from '../db/client.js';
import { LibraryService } from './libraryService.js';

export interface DirectoryDetail {
  directory: string;          // 相對路徑，如 "" 或 "2026/architecture"
  name: string;               // 顯示名稱，如 "architecture" 或 "根目錄"
  parentDirectory: string;    // 父目錄相對路徑，如 "2026"，頂層為 ""
  libraryId: number;          // 所屬庫 ID
  libraryName: string;        // 所屬庫名稱
  libraryRoot: string;        // 庫實體根目錄
  fullPath: string;           // 實體完整路徑
  mediaCount: number;         // 該目錄下直接包含的媒體數量
  totalRecursiveCount: number;// 包含所有子目錄的媒體總數
  totalBytes: number;         // 該目錄（直接及遞迴）媒體總檔案大小
  imageCount: number;         // 圖片數量
  videoCount: number;         // 影片數量
  subDirectoryCount: number;  // 直屬子目錄數量
  createdAt: string;          // 目錄建立時間 ISO
  updatedAt: string;          // 目錄最後修改時間 ISO
  isReadonly?: boolean;       // 是否唯讀
  isDefault?: boolean;        // 是否預設庫
}

export interface CreateDirectoryPayload {
  libraryId: number;
  directory: string;
}

export class DirectoryService {
  /**
   * 遞迴掃描實體磁碟目錄，排除隱藏與內部資料夾
   */
  private static async scanDiskDirectories(rootPath: string, currentRel = ''): Promise<string[]> {
    const currentAbs = currentRel ? path.join(rootPath, currentRel) : rootPath;
    if (!existsSync(currentAbs)) return [];

    const found: string[] = [];
    try {
      const entries = await fs.readdir(currentAbs, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === '.zenbox') {
          continue;
        }

        const childRel = currentRel ? `${currentRel}/${entry.name}`.replace(/\\/g, '/') : entry.name;
        found.push(childRel);

        const subChildren = await this.scanDiskDirectories(rootPath, childRel);
        found.push(...subChildren);
      }
    } catch (err) {
      console.warn(`[DirectoryService] 讀取目錄失敗 ${currentAbs}:`, err);
    }
    return found;
  }

  /**
   * 獲取指定儲存庫（或所有活躍庫）的所有文件夾詳細清單
   */
  public static async listDirectories(libraryId?: number): Promise<DirectoryDetail[]> {
    let targetLibraries: LibraryEntity[];
    if (libraryId !== undefined) {
      const lib = LibraryService.getLibrary(libraryId);
      targetLibraries = lib ? [lib] : [];
    } else {
      targetLibraries = DbClient.queryAll<LibraryEntity>(
        'SELECT * FROM libraries WHERE is_active = 1 ORDER BY is_default DESC, name ASC'
      );
    }

    const allResults: DirectoryDetail[] = [];

    for (const lib of targetLibraries) {
      if (!existsSync(lib.root_path)) continue;

      // 1. 取得實體磁碟上的所有目錄
      const diskDirs = await this.scanDiskDirectories(lib.root_path);

      // 2. 取得資料庫中該庫媒體出現的所有目錄與媒體統計
      interface MediaStatRow {
        directory: string;
        mime_type: string;
        file_size: number;
      }
      const mediaRows = DbClient.queryAll<MediaStatRow>(
        'SELECT directory, mime_type, file_size FROM media WHERE library_id = ? AND is_trashed = 0',
        [lib.id]
      );

      // 3. 聯集所有目錄（包括根目錄 ""）
      const directorySet = new Set<string>(['']);
      for (const d of diskDirs) {
        directorySet.add(d);
      }
      for (const row of mediaRows) {
        const norm = (row.directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        directorySet.add(norm);
        // 同時將中介父目錄也加入集合
        if (norm) {
          const parts = norm.split('/');
          let curr = '';
          for (const p of parts) {
            curr = curr ? `${curr}/${p}` : p;
            directorySet.add(curr);
          }
        }
      }

      const dirList = Array.from(directorySet);

      // 4. 針對每個目錄計算直屬媒體數據
      const directStats = new Map<string, { count: number; bytes: number; images: number; videos: number }>();
      for (const d of dirList) {
        directStats.set(d, { count: 0, bytes: 0, images: 0, videos: 0 });
      }

      for (const row of mediaRows) {
        const norm = (row.directory || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
        const stat = directStats.get(norm);
        if (stat) {
          stat.count += 1;
          stat.bytes += Number(row.file_size || 0);
          if (row.mime_type.startsWith('image/')) stat.images += 1;
          else if (row.mime_type.startsWith('video/')) stat.videos += 1;
        }
      }

      // 5. 構建每個目錄的詳細資訊（含遞迴總計與子目錄數量）
      for (const dir of dirList) {
        const direct = directStats.get(dir) || { count: 0, bytes: 0, images: 0, videos: 0 };

        // 遞迴統計：該目錄本身 + 任何以 "dir/" 開頭的子目錄
        let totalRecursiveCount = 0;
        let totalBytes = 0;
        let imageCount = 0;
        let videoCount = 0;
        let subDirectoryCount = 0;

        for (const [otherDir, stat] of directStats.entries()) {
          const isMatch = dir === '' || otherDir === dir || otherDir.startsWith(`${dir}/`);
          if (isMatch) {
            totalRecursiveCount += stat.count;
            totalBytes += stat.bytes;
            imageCount += stat.images;
            videoCount += stat.videos;
          }
        }

        // 計算直屬子目錄數量
        for (const otherDir of dirList) {
          if (!otherDir) continue;
          if (dir === '') {
            if (!otherDir.includes('/')) {
              subDirectoryCount += 1;
            }
          } else {
            if (otherDir.startsWith(`${dir}/`)) {
              const remainder = otherDir.slice(dir.length + 1);
              if (!remainder.includes('/')) {
                subDirectoryCount += 1;
              }
            }
          }
        }

        const fullPath = dir ? path.join(lib.root_path, dir) : lib.root_path;
        let createdAt = lib.created_at;
        let updatedAt = lib.updated_at;

        if (existsSync(fullPath)) {
          try {
            const st = statSync(fullPath);
            createdAt = st.birthtime ? st.birthtime.toISOString() : lib.created_at;
            updatedAt = st.mtime ? st.mtime.toISOString() : lib.updated_at;
          } catch {
            // 保留預設值
          }
        }

        const name = dir === '' ? lib.name : path.basename(dir);
        const parentDirectory = dir.includes('/') ? dir.slice(0, dir.lastIndexOf('/')) : '';

        allResults.push({
          directory: dir,
          name,
          parentDirectory,
          libraryId: lib.id,
          libraryName: lib.name,
          libraryRoot: lib.root_path,
          fullPath,
          mediaCount: direct.count,
          totalRecursiveCount,
          totalBytes,
          imageCount,
          videoCount,
          subDirectoryCount,
          createdAt,
          updatedAt,
          isReadonly: lib.is_readonly === 1,
          isDefault: lib.is_default === 1,
        });
      }
    }

    // 依庫與目錄路徑排序（根目錄優先，其餘按字母）
    return allResults.sort((a, b) => {
      if (a.libraryId !== b.libraryId) return a.libraryId - b.libraryId;
      if (a.directory === '') return -1;
      if (b.directory === '') return 1;
      return a.directory.localeCompare(b.directory);
    });
  }

  /**
   * 在指定儲存庫中建立新的實體目錄
   */
  public static async createDirectory(payload: CreateDirectoryPayload): Promise<DirectoryDetail> {
    const lib = LibraryService.getLibrary(payload.libraryId);
    if (!lib) {
      throw new Error('指定的儲存庫不存在');
    }
    if (lib.is_readonly === 1) {
      throw new Error('該儲存庫為唯讀狀態，無法新建文件夾');
    }

    // 規範化並清洗目錄名稱，防止 Path Traversal
    const rawDir = (payload.directory || '').trim();
    if (!rawDir) {
      throw new Error('文件夾名稱不可為空');
    }

    // 排除 Windows / POSIX 非法字元
    const sanitizedParts = rawDir
      .replace(/\\/g, '/')
      .split('/')
      .map((p) => p.trim())
      .filter((p) => p && p !== '.' && p !== '..');

    if (sanitizedParts.length === 0) {
      throw new Error('請輸入有效的文件夾名稱');
    }

    const invalidCharRegex = /[<>:"|?*]/;
    for (const part of sanitizedParts) {
      if (invalidCharRegex.test(part)) {
        throw new Error(`文件夾名稱含有非法字元: ${part}`);
      }
    }

    const sanitizedDir = sanitizedParts.join('/');
    const targetAbs = path.resolve(lib.root_path, sanitizedDir);
    const libRootAbs = path.resolve(lib.root_path);

    // 確保路徑完全位於儲存庫目錄下
    if (!targetAbs.startsWith(libRootAbs)) {
      throw new Error('非法的文件夾路徑');
    }

    // 若磁碟上不存在則建立
    if (!existsSync(targetAbs)) {
      await fs.mkdir(targetAbs, { recursive: true });
    }

    const name = path.basename(sanitizedDir);
    const parentDirectory = sanitizedDir.includes('/')
      ? sanitizedDir.slice(0, sanitizedDir.lastIndexOf('/'))
      : '';

    const nowIso = new Date().toISOString();
    return {
      directory: sanitizedDir,
      name,
      parentDirectory,
      libraryId: lib.id,
      libraryName: lib.name,
      libraryRoot: lib.root_path,
      fullPath: targetAbs,
      mediaCount: 0,
      totalRecursiveCount: 0,
      totalBytes: 0,
      imageCount: 0,
      videoCount: 0,
      subDirectoryCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      isReadonly: false,
      isDefault: lib.is_default === 1,
    };
  }
}
