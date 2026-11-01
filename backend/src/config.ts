import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root repository path
const ROOT_DIR = path.resolve(__dirname, '../../');

const IGNORED_EXTENSIONS = new Set([
  '.tmp',
  '.crdownload',
  '.part',
  '.sqlite',
  '.sqlite-wal',
  '.sqlite-shm',
  '.sqlite-journal',
  '.db',
  '.db-wal',
  '.db-shm',
  '.db-journal',
  '.ds_store',
  '.thumbs',
]);

const IGNORED_FILENAMES = new Set([
  'thumbs.db',
  '.ds_store',
  'desktop.ini',
]);

const MIME_MAP: Record<string, string> = {
  // Images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.tiff': 'image/tiff',
  '.tif': 'image/tiff',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  // Videos
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.wmv': 'video/x-ms-wmv',
  '.flv': 'video/x-flv',
  '.m4v': 'video/x-m4v',
  // Documents & Text
  '.pdf': 'application/pdf',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.txt': 'text/plain',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.yaml': 'text/yaml',
  '.yml': 'text/yaml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'application/typescript',
  '.tsx': 'text/plain',
  '.jsx': 'text/plain',
  '.py': 'text/x-python',
  '.go': 'text/x-go',
  '.rs': 'text/x-rust',
  '.c': 'text/x-c',
  '.h': 'text/x-c',
  '.cpp': 'text/x-c++',
  '.hpp': 'text/x-c++',
  '.java': 'text/x-java',
  '.sh': 'text/x-sh',
  '.bash': 'text/x-sh',
  '.epub': 'application/epub+zip',
  // Archives
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  // Audio
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  // Design & vector
  '.psd': 'image/vnd.adobe.photoshop',
  '.ai': 'application/postscript',
  // Bookmarks & Shortcuts
  '.url': 'application/x-url',
  '.webloc': 'application/x-url',
};

export const CONFIG = {
  PORT: Number(process.env.PORT) || 4000,
  ROOT_DIR,
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'),
  ORIGINALS_DIR: path.join(process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'), 'originals'),
  CACHE_DIR: path.join(process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'), 'cache'),
  DB_PATH: process.env.DB_PATH || path.join(ROOT_DIR, 'zenbox.sqlite'),
  // File watcher debounce in ms (waits for I/O completion)
  WATCHER_DEBOUNCE_MS: 1000,
  IGNORED_EXTENSIONS,
  IGNORED_FILENAMES,
  // Helper to determine if a file is supported based on system blacklist
  isFileSupported(filePath: string): boolean {
    const filename = path.basename(filePath).toLowerCase();
    const ext = path.extname(filePath).toLowerCase();
    const normalized = filePath.replace(/\\/g, '/');

    // Skip internal, cache, or dot directories
    if (
      normalized.includes('/.zenbox/') ||
      normalized.includes('/.git/') ||
      normalized.includes('/node_modules/') ||
      normalized.includes('/storage/cache/') ||
      filename.startsWith('.')
    ) {
      return false;
    }

    if (IGNORED_FILENAMES.has(filename)) {
      return false;
    }

    if (IGNORED_EXTENSIONS.has(ext)) {
      return false;
    }

    return true;
  },
  // Detect standard MIME type or fallback to application/octet-stream
  detectMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_MAP[ext] || 'application/octet-stream';
  },
  // Backward compatibility legacy set
  SUPPORTED_EXTENSIONS: {
    has(ext: string): boolean {
      return !IGNORED_EXTENSIONS.has(ext.toLowerCase());
    }
  }
};
