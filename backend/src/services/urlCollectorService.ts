import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DbClient, MediaEntity, MediaWithTags } from '../db/client.js';
import { LibraryService } from './libraryService.js';
import { MediaManageService, UploadOptions } from './mediaManageService.js';
import { ThumbnailService } from './thumbnailService.js';
import {
  writeSidecar,
  calculateQuickHash,
  ZENBOX_DIR_NAME,
  ensureHiddenDirectory,
  BookmarkMeta,
} from '../watcher/sidecar.js';

export interface CollectPreviewResult {
  type: 'direct_media' | 'bookmark';
  url: string;
  title: string;
  description?: string;
  domain: string;
  coverUrl?: string;
  favicon?: string;
}

export type CollectResult = {
  type: 'media';
  data: MediaWithTags;
};

export class UrlCollectorService {
  private static readonly USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Zenbox/0.1.0';

  /**
   * Sanitizes string to safe filename for Windows / Unix filesystems
   */
  public static sanitizeFilename(name: string): string {
    const sanitized = name
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim();
    return sanitized.slice(0, 100) || 'bookmark';
  }

  /**
   * Tests if URL points directly to a binary media or document file
   */
  public static isDirectMediaExtension(pathname: string): boolean {
    const ext = path.extname(pathname).toLowerCase();
    if (!ext) return false;
    const directExts = new Set([
      '.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.svg', '.bmp', '.ico',
      '.mp4', '.mov', '.webm', '.mkv', '.avi',
      '.pdf', '.zip', '.rar', '.7z', '.tar', '.gz',
      '.mp3', '.wav', '.flac', '.ogg', '.m4a',
      '.epub', '.docx', '.xlsx', '.pptx',
      '.apk', '.exe', '.dmg', '.iso'
    ]);
    return directExts.has(ext);
  }

  /**
   * Fetches metadata preview for a given URL without saving to disk
   */
  public static async previewUrl(rawUrl: string): Promise<CollectPreviewResult> {
    const trimmed = rawUrl.trim();
    const parsedUrl = new URL(trimmed);
    const domain = parsedUrl.hostname;

    // 1. Check if URL pathname has a direct binary media extension
    if (this.isDirectMediaExtension(parsedUrl.pathname)) {
      const baseFilename = path.basename(parsedUrl.pathname);
      return {
        type: 'direct_media',
        url: trimmed,
        title: decodeURIComponent(baseFilename),
        domain,
        coverUrl: trimmed,
      };
    }

    // 2. Fallback to HTTP inspection (determine if direct binary or webpage bookmark)
    try {
      const res = await fetch(trimmed, {
        headers: { 'User-Agent': this.USER_AGENT },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        return {
          type: 'bookmark',
          url: trimmed,
          title: domain,
          domain,
        };
      }

      const contentType = res.headers.get('content-type') || '';
      // If server returns non-HTML binary content, treat as direct file download
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
        const baseFilename = path.basename(parsedUrl.pathname) || 'download';
        return {
          type: 'direct_media',
          url: trimmed,
          title: decodeURIComponent(baseFilename),
          domain,
        };
      }

      // Stream first 64KB of HTML to parse head metadata
      const reader = res.body?.getReader();
      let html = '';
      if (reader) {
        const decoder = new TextDecoder('utf-8');
        let totalBytes = 0;
        while (totalBytes < 65536) {
          const { done, value } = await reader.read();
          if (done || !value) break;
          totalBytes += value.length;
          html += decoder.decode(value, { stream: true });
          if (html.includes('</head>')) break;
        }
        reader.cancel().catch(() => {});
      } else {
        html = await res.text();
      }

      const meta = this.parseHtmlMeta(html, trimmed);
      return {
        type: 'bookmark',
        url: trimmed,
        title: meta.title || domain,
        description: meta.description,
        domain,
        coverUrl: meta.ogImage,
        favicon: meta.favicon,
      };
    } catch {
      return {
        type: 'bookmark',
        url: trimmed,
        title: domain,
        domain,
      };
    }
  }

  /**
   * Helper to parse OpenGraph, Twitter Card, and standard metadata from HTML head
   */
  public static parseHtmlMeta(html: string, baseUrl: string): {
    title?: string;
    description?: string;
    ogImage?: string;
    favicon?: string;
  } {
    const getMatch = (regex: RegExp): string | undefined => {
      const match = html.match(regex);
      return match ? match[1]?.trim() : undefined;
    };

    // Extract title (og:title -> twitter:title -> <title>)
    let title =
      getMatch(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+property=["']og:title["']/i) ||
      getMatch(/<meta\s+name=["']twitter:title["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:title["']/i) ||
      getMatch(/<title[^>]*>([^<]+)<\/title>/i);

    // Extract description (og:description -> twitter:description -> description)
    let description =
      getMatch(/<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+property=["']og:description["']/i) ||
      getMatch(/<meta\s+name=["']twitter:description["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:description["']/i) ||
      getMatch(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);

    // Extract image (og:image -> twitter:image)
    let ogImage =
      getMatch(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+property=["']og:image["']/i) ||
      getMatch(/<meta\s+name=["']twitter:image["']\s+content=["']([^"']+)["']/i) ||
      getMatch(/<meta\s+content=["']([^"']+)["']\s+name=["']twitter:image["']/i);

    // Extract favicon
    let favicon =
      getMatch(/<link\s+[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i) ||
      getMatch(/<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i);

    // Resolve relative URLs against baseUrl
    try {
      if (ogImage && !ogImage.startsWith('http://') && !ogImage.startsWith('https://')) {
        ogImage = new URL(ogImage, baseUrl).href;
      }
    } catch {
      ogImage = undefined;
    }

    try {
      if (favicon && !favicon.startsWith('http://') && !favicon.startsWith('https://')) {
        favicon = new URL(favicon, baseUrl).href;
      } else if (!favicon) {
        favicon = new URL('/favicon.ico', baseUrl).href;
      }
    } catch {
      favicon = undefined;
    }

    // Clean HTML entities in title & description
    if (title) {
      title = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }
    if (description) {
      description = description
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();
    }

    return { title, description, ogImage, favicon };
  }

  /**
   * Collects content from URL:
   * 1. Direct file link -> download and save binary file
   * 2. All other URLs -> save as .url bookmark with snapshot and sidecar
   */
  public static async collect(
    rawUrl: string,
    options: UploadOptions = {}
  ): Promise<CollectResult> {
    const trimmed = rawUrl.trim();
    const preview = await this.previewUrl(trimmed);

    // -----------------------------------------------------------------
    // Situation 1: Direct File Link (download and store original file)
    // -----------------------------------------------------------------
    if (preview.type === 'direct_media') {
      const res = await fetch(trimmed, {
        headers: { 'User-Agent': this.USER_AGENT },
      });
      if (!res.ok) {
        throw new Error(`無法存取遠端檔案: HTTP ${res.status}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let filename = path.basename(new URL(trimmed).pathname);
      let ext = path.extname(filename).toLowerCase();

      if (!ext) {
        if (contentType.includes('image/jpeg')) ext = '.jpg';
        else if (contentType.includes('image/png')) ext = '.png';
        else if (contentType.includes('image/webp')) ext = '.webp';
        else if (contentType.includes('video/mp4')) ext = '.mp4';
        else if (contentType.includes('application/pdf')) ext = '.pdf';
        else ext = '.bin';
        filename = `${filename || `collected_${Date.now()}`}${ext}`;
      }

      const created = await MediaManageService.uploadMedia(buffer, filename, {
        ...options,
        sourceUrl: trimmed,
        title: options.title || preview.title || path.basename(filename, ext),
      });

      return { type: 'media', data: created };
    }

    // -----------------------------------------------------------------
    // Situation 2: Webpage Bookmark (.url Shortcut + OG Snapshot + Sidecar)
    // -----------------------------------------------------------------
    return await this.collectBookmark(trimmed, preview, options);
  }

  /**
   * Saves a webpage bookmark as a physical .url file with snapshot and sidecar
   */
  private static async collectBookmark(
    url: string,
    preview: CollectPreviewResult,
    options: UploadOptions
  ): Promise<CollectResult> {
    const library = options.libraryId !== undefined
      ? LibraryService.getLibrary(options.libraryId)
      : LibraryService.getDefaultLibrary();

    if (!library) {
      throw new Error('指定的儲存庫不存在');
    }
    if (library.is_readonly) {
      throw new Error('該儲存庫為唯讀狀態，無法寫入');
    }

    // 1. Sanitize target directory
    const rawDir = (options.directory || '').replace(/\\/g, '/');
    const safeDirParts = rawDir.split('/').filter((p) => p && p !== '..' && p !== '.');
    const safeDir = safeDirParts.join('/');
    const targetFolder = safeDir ? path.join(library.root_path, safeDir) : library.root_path;
    await fs.mkdir(targetFolder, { recursive: true });

    // 2. Generate safe unique filename for .url shortcut
    const bookmarkTitle = (options.title || preview.title || preview.domain || 'bookmark').trim();
    const safeBase = this.sanitizeFilename(bookmarkTitle);
    let shortcutFilename = `${safeBase}.url`;
    let targetFilePath = path.join(targetFolder, shortcutFilename);
    let counter = 1;

    while (existsSync(targetFilePath)) {
      shortcutFilename = `${safeBase}_${counter}.url`;
      targetFilePath = path.join(targetFolder, shortcutFilename);
      counter++;
    }

    // 3. Write physical .url INI file
    const shortcutContent = `[InternetShortcut]\r\nURL=${url}\r\n`;
    await fs.writeFile(targetFilePath, shortcutContent, 'utf-8');

    // 4. Download and process OpenGraph snapshot if available
    let hasSnapshot = false;
    let snapshotWidth = 0;
    let snapshotHeight = 0;

    if (preview.coverUrl) {
      try {
        const imgRes = await fetch(preview.coverUrl, {
          headers: { 'User-Agent': this.USER_AGENT },
          signal: AbortSignal.timeout(6000),
        });

        if (imgRes.ok) {
          const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
          const meta = await sharp(imgBuffer).metadata();
          if (meta.width && meta.height) {
            snapshotWidth = meta.width;
            snapshotHeight = meta.height;

            // Save persistent snapshot inside local .zenbox directory
            const zenboxDir = path.join(targetFolder, ZENBOX_DIR_NAME);
            await ensureHiddenDirectory(zenboxDir);
            const snapshotFilePath = path.join(zenboxDir, `${shortcutFilename}.preview.webp`);

            await sharp(imgBuffer)
              .webp({ quality: 85 })
              .toFile(snapshotFilePath);

            hasSnapshot = true;

            // Also proactively generate thumbnail cache
            const relativePath = path.relative(library.root_path, targetFilePath).replace(/\\/g, '/');
            const mediaStub = {
              library_id: library.id,
              relative_path: relativePath,
              filename: shortcutFilename,
            } as MediaEntity;

            const smThumbPath = ThumbnailService.getThumbnailPath(mediaStub, 'sm');
            const mdThumbPath = ThumbnailService.getThumbnailPath(mediaStub, 'md');

            await ThumbnailService.init();
            await sharp(imgBuffer)
              .resize({ width: 400, withoutEnlargement: true, fit: 'inside' })
              .webp({ quality: 80 })
              .toFile(smThumbPath);

            await sharp(imgBuffer)
              .resize({ width: 1200, withoutEnlargement: true, fit: 'inside' })
              .webp({ quality: 85 })
              .toFile(mdThumbPath);
          }
        }
      } catch (err) {
        console.warn(`[UrlCollector] Failed downloading snapshot for ${shortcutFilename}:`, err);
      }
    }

    // 5. Write Sidecar JSON (.zenbox/{filename}.json)
    const nowIso = new Date().toISOString();
    const bookmarkMeta: BookmarkMeta = {
      url,
      domain: preview.domain,
      description: options.notes || preview.description || '',
      favicon: preview.favicon || '',
      hasSnapshot,
    };

    const sidecarData = {
      title: bookmarkTitle,
      tags: options.tags || [],
      addedAt: nowIso,
      sourceUrl: url,
      notes: options.notes || preview.description || '',
      hash: await calculateQuickHash(targetFilePath).catch(() => ''),
      bookmark: bookmarkMeta,
    };

    await writeSidecar(targetFilePath, sidecarData);

    // 6. Insert Media record into SQLite
    const relativePath = path.relative(library.root_path, targetFilePath).replace(/\\/g, '/');
    const stat = await fs.stat(targetFilePath);

    const insertResult = DbClient.execute(
      `INSERT INTO media (
        library_id, filename, relative_path, directory, filepath, mime_type, file_size,
        width, height, duration, hash, title, notes, source_url, added_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        library.id,
        shortcutFilename,
        relativePath,
        safeDir,
        targetFilePath,
        'application/x-url',
        Number(stat.size),
        snapshotWidth,
        snapshotHeight,
        0,
        sidecarData.hash,
        bookmarkTitle,
        sidecarData.notes,
        url,
        nowIso,
        nowIso,
      ]
    );

    const mediaId = Number(insertResult.lastInsertRowid);

    // 7. Associate Tags in SQLite
    if (options.tags && options.tags.length > 0) {
      for (const rawTag of options.tags) {
        const tagName = rawTag.trim().toLowerCase();
        if (!tagName) continue;
        DbClient.execute('INSERT OR IGNORE INTO tags (name, created_at) VALUES (?, ?)', [
          tagName,
          nowIso,
        ]);
        const tag = DbClient.queryOne<{ id: number }>('SELECT id FROM tags WHERE name = ?', [
          tagName,
        ]);
        if (tag) {
          DbClient.execute(
            'INSERT OR IGNORE INTO media_tags (media_id, tag_id) VALUES (?, ?)',
            [mediaId, tag.id]
          );
        }
      }
    }

    const createdMedia = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [
      mediaId,
    ]);

    if (!createdMedia) {
      throw new Error('書籤建立失敗');
    }

    return {
      type: 'media',
      data: {
        ...createdMedia,
        tags: options.tags || [],
      },
    };
  }
}
