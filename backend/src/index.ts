import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { CONFIG } from './config.js';
import { DbClient, MediaEntity, MediaWithTags, TagEntity } from './db/client.js';
import { runFullIndexScan } from './db/indexer.js';
import { ThumbnailService, ThumbnailSize } from './services/thumbnailService.js';
import { MediaManageService, UpdateMediaPayload } from './services/mediaManageService.js';
import { LibraryService, CreateLibraryPayload, UpdateLibraryPayload } from './services/libraryService.js';
import { DirectoryService, CreateDirectoryPayload } from './services/directoryService.js';
import { StatsService } from './services/statsService.js';
import { AuthService } from './auth/authService.js';
import { streamFileWithRange } from './utils/stream.js';
import { LibraryWatcherManager } from './watcher/fileWatcher.js';
import {
  CollectionService,
  CreateCollectionPayload,
  UpdateCollectionPayload,
  ListCollectionsQuery,
} from './services/collectionService.js';
import { UrlCollectorService } from './services/urlCollectorService.js';
import { readSidecar } from './watcher/sidecar.js';

const app = new Hono();
const watcherManager = new LibraryWatcherManager();

// Enable CORS for frontend development
app.use('/*', cors());

// Global Authentication Middleware
app.use('/api/*', AuthService.middleware());

// -------------------------------------------------------------
// Authentication Endpoints
// -------------------------------------------------------------

// Check auth status
app.get('/api/auth/status', (c) => {
  const isRequired = AuthService.isAuthRequired();
  let isAuthenticated = false;

  if (!isRequired) {
    isAuthenticated = true;
  } else {
    const authHeader = c.req.header('authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      isAuthenticated = AuthService.verifyToken(authHeader.substring(7).trim());
    }
  }

  return c.json({
    authRequired: isRequired,
    authenticated: isAuthenticated
  });
});

// Login endpoint
app.post('/api/auth/login', async (c) => {
  const body = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  const isValid = AuthService.validatePassword(body.password || '');

  if (!isValid) {
    return c.json({ error: '密碼錯誤' }, 401);
  }

  const token = AuthService.generateToken();
  return c.json({
    success: true,
    token
  });
});

// -------------------------------------------------------------
// System & Health Endpoints
// -------------------------------------------------------------

// Health check endpoint
app.get('/api/health', (c) => {
  return c.json({
    status: 'ok',
    version: '0.1.0',
    mode: 'local-first',
    timestamp: new Date().toISOString()
  });
});

// System objective stats (media counts, disk consumption, tag frequencies)
app.get('/api/stats', async (c) => {
  const stats = await StatsService.getStats();
  return c.json({ data: stats });
});

// -------------------------------------------------------------
// Storage Libraries Management Endpoints
// -------------------------------------------------------------

// List all storage libraries with media count and total disk usage
app.get('/api/libraries', async (c) => {
  try {
    const libs = await LibraryService.listLibraries();
    return c.json({ data: libs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '讀取儲存庫失敗';
    return c.json({ error: message }, 500);
  }
});

// Mount / create a new storage library
app.post('/api/libraries', async (c) => {
  try {
    const body = await c.req.json<CreateLibraryPayload>();
    const newLib = await LibraryService.createLibrary(body);

    // Start watching immediately if active
    if (newLib.is_active) {
      watcherManager.watchLibrary(newLib);
      // Trigger background initial scan for this new library
      runFullIndexScan(newLib.id).catch((err) => {
        console.error(`[Indexer] Error during initial scan of Library #${newLib.id}:`, err);
      });
    }

    return c.json({
      success: true,
      data: newLib
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '掛載儲存庫失敗';
    return c.json({ error: message }, 400);
  }
});

// Update storage library settings
app.patch('/api/libraries/:id', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const body = await c.req.json<UpdateLibraryPayload>();
    const updated = await LibraryService.updateLibrary(id, body);

    // Sync watcher state
    if (updated.is_active) {
      watcherManager.watchLibrary(updated);
    } else {
      watcherManager.unwatchLibrary(updated.id);
    }

    return c.json({
      success: true,
      data: updated
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新儲存庫失敗';
    return c.json({ error: message }, 400);
  }
});

// Unmount / delete storage library (preserves physical files on disk)
app.delete('/api/libraries/:id', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    watcherManager.unwatchLibrary(id);
    await LibraryService.deleteLibrary(id);
    return c.json({
      success: true,
      message: '已卸載儲存庫'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '卸載失敗';
    return c.json({ error: message }, 400);
  }
});

// Manual re-scan of a specific library
app.post('/api/libraries/:id/scan', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const summary = await runFullIndexScan(id);
    return c.json({
      success: true,
      libraryId: id,
      ...summary
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '掃描失敗';
    return c.json({ error: message }, 500);
  }
});

// -------------------------------------------------------------
// Media Query & Streaming Endpoints
// -------------------------------------------------------------

// List all directories with detailed asset statistics, optionally scoped to a library
app.get('/api/directories', async (c) => {
  const libraryId = c.req.query('libraryId') ? Number(c.req.query('libraryId')) : undefined;
  try {
    const dirs = await DirectoryService.listDirectories(libraryId);
    return c.json({ data: dirs });
  } catch (err) {
    const message = err instanceof Error ? err.message : '讀取文件夾失敗';
    return c.json({ error: message }, 500);
  }
});

// Create a new folder on disk under a specific storage library
app.post('/api/directories', async (c) => {
  try {
    const body = await c.req.json<CreateDirectoryPayload>();
    const created = await DirectoryService.createDirectory(body);
    return c.json({
      success: true,
      data: created
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '建立文件夾失敗';
    return c.json({ error: message }, 400);
  }
});

// Get media items with library, directory, keyword, sorting, and tag filtering
app.get('/api/media', async (c) => {
  const libraryId = c.req.query('libraryId') ? Number(c.req.query('libraryId')) : undefined;
  const tagQuery = c.req.query('tags');
  const dirQuery = c.req.query('dir'); // e.g. "2026/architecture" or "" for root
  const keywordQuery = c.req.query('q')?.trim(); // keyword search across title, filename, notes
  const sortParam = (c.req.query('sort') || 'added_desc').toLowerCase();
  const operator = (c.req.query('op') || 'AND').toUpperCase(); // AND | OR
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 24));
  const offset = (page - 1) * limit;

  // Multi-dimensional sort whitelist mapping to prevent SQL injection
  const SORT_MAP: Record<string, string> = {
    added_desc: 'm.added_at DESC, m.id DESC',
    added_asc: 'm.added_at ASC, m.id ASC',
    size_desc: 'm.file_size DESC, m.id DESC',
    size_asc: 'm.file_size ASC, m.id ASC',
    title_asc: 'm.title ASC, m.id ASC',
    title_desc: 'm.title DESC, m.id DESC'
  };
  const orderBySql = SORT_MAP[sortParam] || SORT_MAP['added_desc'];

  // Base filters on media table
  const whereClauses: string[] = [];
  const queryParams: (string | number)[] = [];

  const isTrashed = c.req.query('is_trashed') === '1' || c.req.query('trash') === 'true' ? 1 : 0;
  whereClauses.push('m.is_trashed = ?');
  queryParams.push(isTrashed);

  if (libraryId !== undefined) {
    whereClauses.push('m.library_id = ?');
    queryParams.push(libraryId);
  }

  if (dirQuery !== undefined) {
    const isExact = c.req.query('exact') === '1' || c.req.query('exact') === 'true';
    if (isExact) {
      whereClauses.push('m.directory = ?');
      queryParams.push(dirQuery);
    } else {
      if (dirQuery === '') {
        // 當過濾庫根目錄且已指定 libraryId 時，涵蓋該庫下全部媒體
        if (libraryId === undefined) {
          whereClauses.push('m.directory = ?');
          queryParams.push('');
        }
      } else {
        whereClauses.push('(m.directory = ? OR m.directory LIKE ?)');
        queryParams.push(dirQuery, `${dirQuery}/%`);
      }
    }
  }

  if (keywordQuery) {
    const likePattern = `%${keywordQuery}%`;
    whereClauses.push('(m.title LIKE ? OR m.filename LIKE ? OR m.notes LIKE ?)');
    queryParams.push(likePattern, likePattern, likePattern);
  }

  const typeQuery = c.req.query('type')?.toLowerCase();
  if (typeQuery === 'image') {
    whereClauses.push("m.mime_type LIKE 'image/%'");
  } else if (typeQuery === 'video') {
    whereClauses.push("m.mime_type LIKE 'video/%'");
  } else if (typeQuery === 'document') {
    whereClauses.push("NOT (m.mime_type LIKE 'image/%' OR m.mime_type LIKE 'video/%' OR m.mime_type = 'application/x-url')");
  } else if (typeQuery === 'bookmark') {
    whereClauses.push("m.mime_type = 'application/x-url'");
  }

  const rawTags = tagQuery
    ? tagQuery.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
    : [];

  let mediaItems: MediaEntity[];

  if (rawTags.length > 0) {
    const placeholders = rawTags.map(() => '?').join(',');
    whereClauses.push(`t.name IN (${placeholders})`);
    queryParams.push(...rawTags);

    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    if (operator === 'OR') {
      const sql = `
        SELECT DISTINCT m.*
        FROM media m
        INNER JOIN media_tags mt ON m.id = mt.media_id
        INNER JOIN tags t ON mt.tag_id = t.id
        ${whereStr}
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `;
      mediaItems = DbClient.queryAll<MediaEntity>(sql, [...queryParams, limit, offset]);
    } else {
      // AND logic: Media must match all specified tags
      const sql = `
        SELECT m.*
        FROM media m
        INNER JOIN media_tags mt ON m.id = mt.media_id
        INNER JOIN tags t ON mt.tag_id = t.id
        ${whereStr}
        GROUP BY m.id
        HAVING COUNT(DISTINCT t.id) = ?
        ORDER BY ${orderBySql}
        LIMIT ? OFFSET ?
      `;
      mediaItems = DbClient.queryAll<MediaEntity>(sql, [...queryParams, rawTags.length, limit, offset]);
    }
  } else {
    const whereStr = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const sql = `
      SELECT m.* 
      FROM media m 
      ${whereStr} 
      ORDER BY ${orderBySql} 
      LIMIT ? OFFSET ?
    `;
    mediaItems = DbClient.queryAll<MediaEntity>(sql, [...queryParams, limit, offset]);
  }

  // Hydrate each media item with its associated tags (and bookmark metadata if applicable)
  const result: MediaWithTags[] = await Promise.all(
    mediaItems.map(async (item) => {
      const tagRows = DbClient.queryAll<{ name: string }>(
        `SELECT t.name 
         FROM tags t 
         INNER JOIN media_tags mt ON t.id = mt.tag_id 
         WHERE mt.media_id = ?`,
        [item.id]
      );
      if (item.mime_type === 'application/x-url') {
        const sidecar = await readSidecar(item.filepath).catch(() => null);
        if (sidecar?.bookmark) {
          item.bookmark = sidecar.bookmark;
        }
      }
      return {
        ...item,
        tags: tagRows.map((r) => r.name)
      };
    })
  );

  return c.json({
    data: result,
    page,
    limit,
    count: result.length
  });
});

// Single media item details
app.get('/api/media/:id', async (c) => {
  const mediaId = Number(c.req.param('id'));
  const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const tagRows = DbClient.queryAll<{ name: string }>(
    `SELECT t.name FROM tags t 
     INNER JOIN media_tags mt ON t.id = mt.tag_id 
     WHERE mt.media_id = ?`,
    [mediaId]
  );

  if (media.mime_type === 'application/x-url') {
    const sidecar = await readSidecar(media.filepath).catch(() => null);
    if (sidecar?.bookmark) {
      media.bookmark = sidecar.bookmark;
    }
  }

  return c.json({
    data: {
      ...media,
      tags: tagRows.map((r) => r.name)
    }
  });
});

// Serve media thumbnail (sm: 400px, md: 1200px)
app.get('/api/media/:id/thumbnail', async (c) => {
  const mediaId = Number(c.req.param('id'));
  const sizeParam = (c.req.query('size') || 'sm').toLowerCase();
  const size: ThumbnailSize = sizeParam === 'md' ? 'md' : 'sm';

  const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  const thumbPath = await ThumbnailService.getOrGenerateThumbnail(media, size);
  if (!thumbPath) {
    return c.json({ error: 'Thumbnail unavailable' }, 404);
  }

  try {
    const fileBuffer = await fs.readFile(thumbPath);
    return new Response(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=86400, immutable',
        'Content-Length': String(fileBuffer.length)
      }
    });
  } catch {
    return c.json({ error: 'Failed to read thumbnail' }, 500);
  }
});

// Serve raw media file with HTTP 206 Partial Content (Range streaming for videos and large images)
app.get('/api/media/:id/raw', async (c) => {
  const mediaId = Number(c.req.param('id'));
  const media = DbClient.queryOne<MediaEntity>('SELECT * FROM media WHERE id = ?', [mediaId]);
  if (!media) {
    return c.json({ error: 'Media not found' }, 404);
  }

  if (!existsSync(media.filepath)) {
    return c.json({ error: 'Original file not found on disk' }, 404);
  }

  try {
    const isDownload = c.req.query('download') === '1' || c.req.query('download') === 'true';
    const response = await streamFileWithRange(c, media.filepath, media.mime_type);
    if (isDownload) {
      response.headers.set(
        'Content-Disposition',
        `attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}`
      );
    }
    return response;
  } catch (err) {
    console.error(`[Stream] Error streaming ${media.filename}:`, err);
    return c.json({ error: 'Streaming error' }, 500);
  }
});

// -------------------------------------------------------------
// Media Management & Dual-Write Mutation Endpoints
// -------------------------------------------------------------

// Preview remote URL metadata (social post, direct media, or webpage bookmark)
app.post('/api/collect/preview', async (c) => {
  try {
    const body = await c.req.json<{ url: string }>();
    if (!body.url || !body.url.trim()) {
      return c.json({ error: '請輸入有效的 URL' }, 400);
    }
    const preview = await UrlCollectorService.previewUrl(body.url.trim());
    return c.json({
      success: true,
      data: preview
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析預覽失敗';
    return c.json({ error: message }, 400);
  }
});

// Collect media or bookmark from remote URL with smart triage
app.post('/api/collect', async (c) => {
  try {
    const body = await c.req.json<{
      url: string;
      title?: string;
      notes?: string;
      tags?: string[];
      directory?: string;
      libraryId?: number;
    }>();

    if (!body.url || !body.url.trim()) {
      return c.json({ error: '請輸入有效的 URL' }, 400);
    }

    const result = await UrlCollectorService.collect(body.url.trim(), {
      title: body.title,
      notes: body.notes,
      tags: body.tags,
      directory: body.directory,
      libraryId: body.libraryId
    });

    return c.json({
      success: true,
      type: result.type,
      data: result.data
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '收錄失敗';
    console.error('[Collect] Error:', err);
    return c.json({ error: message }, 400);
  }
});

// Upload media file (multipart/form-data)
app.post('/api/upload', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body['file'];

    if (!file || !(file instanceof File)) {
      return c.json({ error: '未檢測到上傳檔案' }, 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Parse optional metadata parameters
    const title = typeof body['title'] === 'string' ? body['title'] : undefined;
    const notes = typeof body['notes'] === 'string' ? body['notes'] : undefined;
    const sourceUrl = typeof body['sourceUrl'] === 'string' ? body['sourceUrl'] : undefined;
    const directory = typeof body['directory'] === 'string' ? body['directory'] : undefined;
    const libraryId = typeof body['libraryId'] === 'string' && body['libraryId'] ? Number(body['libraryId']) : undefined;
    let tags: string[] = [];

    if (typeof body['tags'] === 'string') {
      try {
        const parsed = JSON.parse(body['tags']);
        if (Array.isArray(parsed)) tags = parsed;
      } catch {
        tags = body['tags'].split(',').map((t) => t.trim()).filter(Boolean);
      }
    }

    const created = await MediaManageService.uploadMedia(buffer, file.name, {
      title,
      notes,
      sourceUrl,
      tags,
      directory,
      libraryId
    });

    return c.json({
      success: true,
      data: created
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '上傳失敗';
    console.error('[Upload] Error:', err);
    return c.json({ error: message }, 500);
  }
});

// Update media metadata (atomic dual-write)
app.patch('/api/media/:id', async (c) => {
  const mediaId = Number(c.req.param('id'));
  const body = await c.req.json<UpdateMediaPayload>().catch(() => ({}));

  try {
    const updated = await MediaManageService.updateMedia(mediaId, body);
    return c.json({
      success: true,
      data: updated
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新失敗';
    return c.json({ error: message }, 400);
  }
});

// Update tags only (backward-compatibility convenience)
app.put('/api/media/:id/tags', async (c) => {
  const mediaId = Number(c.req.param('id'));
  const body = await c.req.json<{ tags: string[] }>().catch(() => ({ tags: [] }));
  try {
    const updated = await MediaManageService.updateMedia(mediaId, { tags: body.tags });
    return c.json({
      success: true,
      mediaId,
      tags: updated.tags
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新標籤失敗';
    return c.json({ error: message }, 400);
  }
});

// Delete media item (soft-delete to trash)
app.delete('/api/media/:id', async (c) => {
  const mediaId = Number(c.req.param('id'));
  try {
    await MediaManageService.moveToTrash(mediaId);
    return c.json({
      success: true,
      mediaId,
      message: '已移至垃圾桶'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '刪除失敗';
    return c.json({ error: message }, 400);
  }
});

// Explicitly move media item to trash
app.post('/api/media/:id/trash', async (c) => {
  const mediaId = Number(c.req.param('id'));
  try {
    await MediaManageService.moveToTrash(mediaId);
    return c.json({
      success: true,
      mediaId,
      message: '已移至垃圾桶'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '移至垃圾桶失敗';
    return c.json({ error: message }, 400);
  }
});

// Restore media item from trash
app.post('/api/media/:id/restore', async (c) => {
  const mediaId = Number(c.req.param('id'));
  try {
    const restored = await MediaManageService.restoreMedia(mediaId);
    return c.json({
      success: true,
      data: restored,
      message: '已還原'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '還原失敗';
    return c.json({ error: message }, 400);
  }
});

// Permanently delete media item
app.delete('/api/media/:id/permanent', async (c) => {
  const mediaId = Number(c.req.param('id'));
  try {
    await MediaManageService.deletePermanently(mediaId);
    return c.json({
      success: true,
      mediaId,
      message: '已刪除'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '永久刪除失敗';
    return c.json({ error: message }, 400);
  }
});

// -------------------------------------------------------------
// Collection Management Endpoints
// -------------------------------------------------------------

// List collections with filtering (libraryId, directory, tags, keyword, pagination)
app.get('/api/collections', async (c) => {
  try {
    const query: ListCollectionsQuery = {
      libraryId: c.req.query('libraryId') ? Number(c.req.query('libraryId')) : undefined,
      directory: c.req.query('dir'),
      tags: c.req.query('tags'),
      q: c.req.query('q'),
      page: c.req.query('page') ? Number(c.req.query('page')) : undefined,
      limit: c.req.query('limit') ? Number(c.req.query('limit')) : undefined,
    };
    const result = await CollectionService.listCollections(query);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : '讀取失敗';
    return c.json({ error: message }, 500);
  }
});

// Get single collection with ordered member items
app.get('/api/collections/:id', async (c) => {
  const idOrUuid = c.req.param('id');
  try {
    const collection = await CollectionService.getCollection(idOrUuid);
    if (!collection) {
      return c.json({ error: '無此合集' }, 404);
    }
    return c.json({ data: collection });
  } catch (err) {
    const message = err instanceof Error ? err.message : '讀取失敗';
    return c.json({ error: message }, 500);
  }
});

// Create collection
app.post('/api/collections', async (c) => {
  try {
    const body = await c.req.json<CreateCollectionPayload>();
    const created = await CollectionService.createCollection(body);
    return c.json({
      success: true,
      data: created,
      message: '已建立'
    }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '建立失敗';
    return c.json({ error: message }, 400);
  }
});

// Update collection metadata or reorder items
app.patch('/api/collections/:id', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    const body = await c.req.json<UpdateCollectionPayload>();
    const updated = await CollectionService.updateCollection(id, body);
    return c.json({
      success: true,
      data: updated,
      message: '已儲存'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '儲存失敗';
    return c.json({ error: message }, 400);
  }
});

// Delete collection (soft-delete to trash)
app.delete('/api/collections/:id', async (c) => {
  const id = Number(c.req.param('id'));

  try {
    await CollectionService.deleteCollection(id);
    return c.json({
      success: true,
      id,
      message: '已移至垃圾桶'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '刪除失敗';
    return c.json({ error: message }, 400);
  }
});

// Move collection to trash
app.post('/api/collections/:id/trash', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await CollectionService.moveToTrash(id);
    return c.json({
      success: true,
      id,
      message: '已移至垃圾桶'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '移至垃圾桶失敗';
    return c.json({ error: message }, 400);
  }
});

// Restore collection from trash
app.post('/api/collections/:id/restore', async (c) => {
  const id = Number(c.req.param('id'));
  try {
    await CollectionService.restoreCollection(id);
    return c.json({
      success: true,
      id,
      message: '已還原'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '還原失敗';
    return c.json({ error: message }, 400);
  }
});

// Permanently delete collection
app.delete('/api/collections/:id/permanent', async (c) => {
  const id = Number(c.req.param('id'));
  const keepFilesParam = c.req.query('keepFiles');
  const keepFiles = keepFilesParam === undefined ? true : keepFilesParam === 'true' || keepFilesParam === '1';

  try {
    await CollectionService.deletePermanently(id, keepFiles);
    return c.json({
      success: true,
      id,
      message: '已刪除'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '刪除失敗';
    return c.json({ error: message }, 400);
  }
});

// -------------------------------------------------------------
// Trash Query & Empty Endpoints
// -------------------------------------------------------------

// List all trashed items (media & collections) with volume stats
app.get('/api/trash', async (c) => {
  try {
    const libraryId = c.req.query('libraryId') ? Number(c.req.query('libraryId')) : undefined;
    const page = Math.max(1, Number(c.req.query('page')) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query('limit')) || 24));
    const offset = (page - 1) * limit;

    let mediaSql = 'SELECT m.* FROM media m WHERE m.is_trashed = 1';
    const mediaParams: (string | number)[] = [];
    if (libraryId !== undefined) {
      mediaSql += ' AND m.library_id = ?';
      mediaParams.push(libraryId);
    }
    mediaSql += ' ORDER BY m.trashed_at DESC, m.id DESC LIMIT ? OFFSET ?';
    const trashedMedia = DbClient.queryAll<MediaEntity>(mediaSql, [...mediaParams, limit, offset]);

    const trashedCollections = await CollectionService.listCollections({
      libraryId,
      isTrashed: true,
      limit: 50
    });

    let countSql = 'SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_bytes FROM media WHERE is_trashed = 1';
    const countParams: number[] = [];
    if (libraryId !== undefined) {
      countSql += ' AND library_id = ?';
      countParams.push(libraryId);
    }
    const statRow = DbClient.queryOne<{ count: number; total_bytes: number }>(countSql, countParams);

    const hydratedMedia: MediaWithTags[] = trashedMedia.map((item) => {
      const tagRows = DbClient.queryAll<{ name: string }>(
        `SELECT t.name FROM tags t
         INNER JOIN media_tags mt ON t.id = mt.tag_id
         WHERE mt.media_id = ?`,
        [item.id]
      );
      return {
        ...item,
        tags: tagRows.map((r) => r.name)
      };
    });

    return c.json({
      data: {
        media: hydratedMedia,
        collections: trashedCollections.data,
        stats: {
          mediaCount: statRow ? Number(statRow.count) : 0,
          collectionCount: trashedCollections.count,
          totalBytes: statRow ? Number(statRow.total_bytes) : 0
        }
      },
      page,
      limit
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '讀取垃圾桶失敗';
    return c.json({ error: message }, 500);
  }
});

// Empty trash (permanently delete all trashed media & collections)
app.post('/api/trash/empty', async (c) => {
  try {
    const libraryId = c.req.query('libraryId') ? Number(c.req.query('libraryId')) : undefined;
    const mediaResult = await MediaManageService.emptyTrash(libraryId);

    let colSql = 'SELECT id FROM collections WHERE is_trashed = 1';
    const colParams: number[] = [];
    if (libraryId !== undefined) {
      colSql += ' AND library_id = ?';
      colParams.push(libraryId);
    }
    const trashedCols = DbClient.queryAll<{ id: number }>(colSql, colParams);
    for (const col of trashedCols) {
      await CollectionService.deletePermanently(col.id, true);
    }

    return c.json({
      success: true,
      count: mediaResult.count + trashedCols.length,
      bytesFreed: mediaResult.bytesFreed,
      message: '已清空'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '清空垃圾桶失敗';
    return c.json({ error: message }, 500);
  }
});

// -------------------------------------------------------------
// Batch Multi-Item Operations Endpoints
// -------------------------------------------------------------

interface BatchTrashPayload {
  mediaIds?: number[];
  collectionIds?: number[];
}

// Batch move items to trash
app.post('/api/batch/trash', async (c) => {
  try {
    const body = await c.req.json<BatchTrashPayload>().catch(() => ({} as BatchTrashPayload));
    const mediaIds = body.mediaIds || [];
    const collectionIds = body.collectionIds || [];

    let trashedMediaCount = 0;
    if (mediaIds.length > 0) {
      trashedMediaCount = await MediaManageService.batchMoveToTrash(mediaIds);
    }

    let trashedCollectionCount = 0;
    for (const cid of collectionIds) {
      try {
        await CollectionService.moveToTrash(cid);
        trashedCollectionCount++;
      } catch (err) {
        console.warn(`[Batch] Failed moving collection #${cid} to trash:`, err);
      }
    }

    return c.json({
      success: true,
      trashedMediaCount,
      trashedCollectionCount,
      totalTrashed: trashedMediaCount + trashedCollectionCount,
      message: '已移至垃圾桶'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量移至垃圾桶失敗';
    return c.json({ error: message }, 400);
  }
});

// Batch update tags
app.post('/api/batch/tags', async (c) => {
  try {
    const body = await c.req.json<{
      mediaIds: number[];
      addTags?: string[];
      removeTags?: string[];
    }>();

    if (!Array.isArray(body.mediaIds) || body.mediaIds.length === 0) {
      return c.json({ error: '請指定媒體項目' }, 400);
    }

    const affected = await MediaManageService.batchUpdateTags(
      body.mediaIds,
      body.addTags || [],
      body.removeTags || []
    );

    return c.json({
      success: true,
      affectedCount: affected,
      message: '已更新標籤'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量更新標籤失敗';
    return c.json({ error: message }, 400);
  }
});

// Batch move directory / library
app.post('/api/batch/move', async (c) => {
  try {
    const body = await c.req.json<{
      mediaIds: number[];
      targetLibraryId?: number;
      targetDirectory: string;
    }>();

    if (!Array.isArray(body.mediaIds) || body.mediaIds.length === 0) {
      return c.json({ error: '請指定媒體項目' }, 400);
    }

    const moved = await MediaManageService.batchMoveDirectory(
      body.mediaIds,
      body.targetLibraryId,
      body.targetDirectory ?? ''
    );

    return c.json({
      success: true,
      movedCount: moved,
      message: '已移動'
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量移動失敗';
    return c.json({ error: message }, 400);
  }
});

// -------------------------------------------------------------
// Tag Management Endpoints
// -------------------------------------------------------------

// Get all tags with usage count (active items only)
app.get('/api/tags', (c) => {
  const tags = DbClient.queryAll<TagEntity>(
    `SELECT t.id, t.name, t.color, t.created_at, COUNT(m.id) as count
     FROM tags t
     LEFT JOIN media_tags mt ON t.id = mt.tag_id
     LEFT JOIN media m ON mt.media_id = m.id AND m.is_trashed = 0
     GROUP BY t.id
     ORDER BY count DESC, t.name ASC`
  );
  return c.json({ data: tags });
});

// Rename tag globally across SQLite and sidecar JSONs
app.put('/api/tags/:name', async (c) => {
  const oldName = decodeURIComponent(c.req.param('name'));
  const body = await c.req.json<{ newName?: string }>().catch(() => ({ newName: '' }));
  const newName = body.newName || '';

  if (!newName.trim()) {
    return c.json({ error: '新標籤名稱不可為空' }, 400);
  }

  const updatedCount = await MediaManageService.renameTag(oldName, newName);
  return c.json({
    success: true,
    oldName,
    newName,
    affectedMedia: updatedCount
  });
});

// Delete tag globally across SQLite and sidecar JSONs
app.delete('/api/tags/:name', async (c) => {
  const tagName = decodeURIComponent(c.req.param('name'));
  const affectedCount = await MediaManageService.deleteTag(tagName);
  return c.json({
    success: true,
    tagName,
    affectedMedia: affectedCount
  });
});

// -------------------------------------------------------------
// Maintenance & Background Queue Endpoints
// -------------------------------------------------------------

// Manual full re-index endpoint
app.post('/api/sync', async (c) => {
  const summary = await runFullIndexScan();
  return c.json({ success: true, ...summary });
});

// Batch trigger thumbnail generation for all existing media
app.post('/api/thumbnails/generate', async (c) => {
  const allMedia = DbClient.queryAll<MediaEntity>(
    "SELECT * FROM media WHERE mime_type LIKE 'image/%' OR mime_type LIKE 'video/%'"
  );

  let queued = 0;
  for (const item of allMedia) {
    ThumbnailService.generateThumbnails(item).catch((err) => {
      console.error(`[Thumbnail] Batch generation error for ${item.filename}:`, err);
    });
    queued++;
  }

  return c.json({
    success: true,
    queued,
    message: `已排入 ${queued} 個項目的縮圖處理佇列`
  });
});

// Clear derivation cache directory (/storage/cache)
app.post('/api/cache/clear', async (c) => {
  try {
    let deletedCount = 0;
    let freedBytes = 0;

    const clearDir = async (dirPath: string) => {
      if (!existsSync(dirPath)) return;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          await clearDir(fullPath);
          await fs.rmdir(fullPath).catch(() => {});
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath).catch(() => null);
          if (stat) freedBytes += stat.size;
          await fs.unlink(fullPath).catch(() => {});
          deletedCount++;
        }
      }
    };

    await clearDir(CONFIG.CACHE_DIR);
    return c.json({
      success: true,
      deletedCount,
      freedBytes,
      message: '已清空'
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '清空快取失敗';
    return c.json({ error: msg }, 500);
  }
});

// Prune orphan tags that have no media or collections attached
app.post('/api/tags/prune', (c) => {
  try {
    const changes = DbClient.execute(
      `DELETE FROM tags 
       WHERE id NOT IN (SELECT DISTINCT tag_id FROM media_tags)
         AND id NOT IN (SELECT DISTINCT tag_id FROM collection_tags)`
    );
    return c.json({
      success: true,
      prunedCount: changes,
      message: '已清理'
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '清理標籤失敗';
    return c.json({ error: msg }, 500);
  }
});

// -------------------------------------------------------------
// Server Bootstrap
// -------------------------------------------------------------

async function bootstrap() {
  console.log('[Zenbox] Bootstrapping backend service...');
  
  // 1. Initialize SQLite schema & run initial scan
  DbClient.getDb();
  await runFullIndexScan();

  // 2. Start Chokidar watcher manager for all active libraries
  await watcherManager.start();

  // 3. Start Hono HTTP server
  serve({
    fetch: app.fetch,
    port: CONFIG.PORT
  });

  console.log(`[Zenbox] Service online at http://localhost:${CONFIG.PORT}`);
  console.log(`[Zenbox] Auth mode: ${AuthService.isAuthRequired() ? 'PASSWORD PROTECTED' : 'OPEN LOCAL'}`);

  // Graceful shutdown
  const shutdown = async () => {
    console.log('[Zenbox] Shutting down service...');
    await watcherManager.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap().catch((err) => {
  console.error('[Zenbox] Fatal bootstrap error:', err);
  process.exit(1);
});

