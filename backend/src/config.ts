import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Root repository path
const ROOT_DIR = path.resolve(__dirname, '../../');

export const CONFIG = {
  PORT: Number(process.env.PORT) || 4000,
  ROOT_DIR,
  STORAGE_DIR: process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'),
  ORIGINALS_DIR: path.join(process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'), 'originals'),
  CACHE_DIR: path.join(process.env.STORAGE_DIR || path.join(ROOT_DIR, 'storage'), 'cache'),
  DB_PATH: process.env.DB_PATH || path.join(ROOT_DIR, 'zenbox.sqlite'),
  // File watcher debounce in ms (waits for I/O completion)
  WATCHER_DEBOUNCE_MS: 1000,
  SUPPORTED_EXTENSIONS: new Set([
    '.jpg',
    '.jpeg',
    '.png',
    '.webp',
    '.gif',
    '.avif',
    '.svg',
    '.mp4',
    '.mov',
    '.webm',
    '.mkv'
  ])
} as const;
