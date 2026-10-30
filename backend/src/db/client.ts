import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const BASE_TABLES_SQL = `
-- 0. Storage Libraries Table (Multi-Root Support)
CREATE TABLE IF NOT EXISTS libraries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  root_path TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  is_readonly INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 1. Media Items Table
CREATE TABLE IF NOT EXISTS media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  library_id INTEGER NOT NULL DEFAULT 1 REFERENCES libraries(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  relative_path TEXT NOT NULL DEFAULT '',
  directory TEXT NOT NULL DEFAULT '',
  filepath TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  width INTEGER NOT NULL DEFAULT 0,
  height INTEGER NOT NULL DEFAULT 0,
  duration REAL NOT NULL DEFAULT 0,
  hash TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_url TEXT NOT NULL DEFAULT '',
  added_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 2. Tags Table
CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#ffffff',
  created_at TEXT NOT NULL
);

-- 3. Many-to-Many Media-Tag Association Table
CREATE TABLE IF NOT EXISTS media_tags (
  media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (media_id, tag_id)
);
`;

export const INDICES_SQL = `
CREATE INDEX IF NOT EXISTS idx_media_library_id ON media(library_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_lib_relpath ON media(library_id, relative_path);
CREATE INDEX IF NOT EXISTS idx_media_directory ON media(directory);
CREATE INDEX IF NOT EXISTS idx_media_tags_tag_id ON media_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_media_tags_media_id ON media_tags(media_id);
CREATE INDEX IF NOT EXISTS idx_media_added_at ON media(added_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_filename ON media(filename);
`;

export interface LibraryEntity {
  id: number;
  name: string;
  root_path: string;
  is_default: number;
  is_active: number;
  is_readonly: number;
  created_at: string;
  updated_at: string;
  media_count?: number;
  total_bytes?: number;
}

export interface MediaEntity {
  id: number;
  library_id: number;
  filename: string;
  relative_path: string;
  directory: string;
  filepath: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  duration: number;
  hash: string;
  title: string;
  notes: string;
  source_url: string;
  added_at: string;
  updated_at: string;
  library_name?: string;
}

export interface TagEntity {
  id: number;
  name: string;
  color: string;
  created_at: string;
  count?: number;
}

export interface MediaWithTags extends MediaEntity {
  tags: string[];
}

export class DbClient {
  private static instance: DatabaseSync | null = null;

  public static getDb(): DatabaseSync {
    if (!this.instance) {
      this.instance = new DatabaseSync(CONFIG.DB_PATH);
      this.instance.exec('PRAGMA foreign_keys = ON;');
      this.instance.exec('PRAGMA journal_mode = WAL;');
      this.instance.exec('PRAGMA busy_timeout = 5000;');
      this.initSchema();
    }
    return this.instance;
  }

  private static initSchema(): void {
    if (!this.instance) return;

    // 1. Create base tables
    this.instance.exec(BASE_TABLES_SQL);

    const nowIso = new Date().toISOString();

    // 2. Safe auto-migration for libraries & library_id
    try {
      // Seed default library if none exists
      const defaultLib = this.instance.prepare('SELECT id FROM libraries WHERE is_default = 1').get() as { id: number } | undefined;
      if (!defaultLib) {
        this.instance.prepare(
          `INSERT OR IGNORE INTO libraries (name, root_path, is_default, is_active, is_readonly, created_at, updated_at) 
           VALUES (?, ?, 1, 1, 0, ?, ?)`
        ).run('預設儲存庫', CONFIG.ORIGINALS_DIR, nowIso, nowIso);
      }

      // Check media columns
      const mediaColumns = this.instance.prepare('PRAGMA table_info(media)').all() as Array<{ name: string }>;
      const mediaColNames = new Set(mediaColumns.map((c) => c.name));

      if (!mediaColNames.has('library_id')) {
        this.instance.exec('ALTER TABLE media ADD COLUMN library_id INTEGER NOT NULL DEFAULT 1');
      }
      if (!mediaColNames.has('relative_path')) {
        this.instance.exec("ALTER TABLE media ADD COLUMN relative_path TEXT NOT NULL DEFAULT ''");
        this.instance.exec("UPDATE media SET relative_path = filename WHERE relative_path = ''");
      }
      if (!mediaColNames.has('directory')) {
        this.instance.exec("ALTER TABLE media ADD COLUMN directory TEXT NOT NULL DEFAULT ''");
      }

      // Drop legacy single-column relative_path unique index if exists
      this.instance.exec('DROP INDEX IF EXISTS idx_media_relative_path');

      // Check if media table was created with legacy 'filename TEXT NOT NULL UNIQUE'
      const mediaTableInfo = this.instance.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'media'"
      ).get() as { sql: string } | undefined;

      if (mediaTableInfo && mediaTableInfo.sql.includes('filename TEXT NOT NULL UNIQUE')) {
        console.log('[DbClient] Migrating legacy media table to remove filename UNIQUE constraint...');
        this.instance.exec(`
          ALTER TABLE media RENAME TO _media_legacy_unique;
          ${BASE_TABLES_SQL}
          INSERT OR IGNORE INTO media (
            id, library_id, filename, relative_path, directory, filepath, mime_type, file_size,
            width, height, duration, hash, title, notes, source_url, added_at, updated_at
          ) SELECT 
            id, COALESCE(library_id, 1), filename, COALESCE(relative_path, filename), COALESCE(directory, ''),
            filepath, mime_type, file_size, COALESCE(width, 0), COALESCE(height, 0), COALESCE(duration, 0),
            COALESCE(hash, ''), COALESCE(title, filename), COALESCE(notes, ''), COALESCE(source_url, ''),
            added_at, updated_at
          FROM _media_legacy_unique;
          DROP TABLE _media_legacy_unique;
        `);
        console.log('[DbClient] Successfully migrated media table to multi-root schema.');
      }
      // Fix media_tags foreign key reference if pointing to orphaned table
      const mediaTagsInfo = this.instance.prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'media_tags'"
      ).get() as { sql: string } | undefined;

      if (mediaTagsInfo && mediaTagsInfo.sql.includes('_media_legacy_unique')) {
        console.log('[DbClient] Rebuilding media_tags table to restore clean foreign keys...');
        this.instance.exec(`
          PRAGMA foreign_keys = OFF;
          CREATE TABLE _media_tags_clean (
            media_id INTEGER NOT NULL REFERENCES media(id) ON DELETE CASCADE,
            tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
            PRIMARY KEY (media_id, tag_id)
          );
          INSERT OR IGNORE INTO _media_tags_clean SELECT * FROM media_tags;
          DROP TABLE media_tags;
          ALTER TABLE _media_tags_clean RENAME TO media_tags;
          PRAGMA foreign_keys = ON;
        `);
      }
    } catch (err) {
      console.warn('[DbClient] Migration check warning:', err);
    }

    // 3. Create indices
    try {
      this.instance.exec(INDICES_SQL);
    } catch (err) {
      console.warn('[DbClient] Indices creation warning:', err);
    }

    // If external schema.sql exists, execute it as well
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      try {
        const sql = fs.readFileSync(schemaPath, 'utf-8');
        this.instance.exec(sql);
      } catch {
        // Ignored
      }
    }
  }

  public static queryAll<T>(sql: string, params: Array<string | number | bigint | null> = []): T[] {
    const db = this.getDb();
    const statement = db.prepare(sql);
    const rows = statement.all(...params);
    return rows as T[];
  }

  public static queryOne<T>(sql: string, params: Array<string | number | bigint | null> = []): T | null {
    const db = this.getDb();
    const statement = db.prepare(sql);
    const row = statement.get(...params);
    return (row as T) || null;
  }

  public static execute(sql: string, params: Array<string | number | bigint | null> = []): { changes: number; lastInsertRowid: number | bigint } {
    const db = this.getDb();
    const statement = db.prepare(sql);
    const result = statement.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid
    };
  }
}
