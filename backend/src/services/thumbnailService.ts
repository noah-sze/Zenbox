import sharp from 'sharp';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { CONFIG } from '../config.js';
import { DbClient, MediaEntity } from '../db/client.js';
import { globalMediaQueue } from '../queue/mediaQueue.js';

const execFileAsync = promisify(execFile);

export type ThumbnailSize = 'sm' | 'md';

export interface ThumbnailConfig {
  width: number;
  quality: number;
}

export const THUMBNAIL_CONFIGS: Record<ThumbnailSize, ThumbnailConfig> = {
  sm: { width: 400, quality: 80 },
  md: { width: 1200, quality: 85 }
};

export class ThumbnailService {
  private static thumbnailsDir = path.join(CONFIG.CACHE_DIR, 'thumbnails');

  /**
   * Ensures the thumbnail cache directory exists
   */
  public static async init(): Promise<void> {
    if (!existsSync(this.thumbnailsDir)) {
      await fs.mkdir(this.thumbnailsDir, { recursive: true });
    }
  }

  /**
   * Gets the physical cache path for a thumbnail, safely isolating across libraries and subdirectories
   */
  public static getThumbnailPath(mediaOrPath: MediaEntity | string, size: ThumbnailSize): string {
    if (typeof mediaOrPath === 'string') {
      const safeKey = mediaOrPath.replace(/[\\/]/g, '__');
      return path.join(this.thumbnailsDir, `${safeKey}.${size}.webp`);
    }

    const libPrefix = mediaOrPath.library_id ? `lib_${mediaOrPath.library_id}__` : '';
    const rawKey = mediaOrPath.relative_path || mediaOrPath.filename;
    const safeKey = `${libPrefix}${rawKey.replace(/[\\/]/g, '__')}`;
    return path.join(this.thumbnailsDir, `${safeKey}.${size}.webp`);
  }

  /**
   * Extracts metadata (width, height) from original image using Sharp
   */
  public static async extractImageMetadata(filePath: string): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(filePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0
      };
    } catch (err) {
      console.warn(`[Thumbnail] Could not extract image metadata for ${filePath}:`, err);
      return { width: 0, height: 0 };
    }
  }

  /**
   * Extracts video first-frame image, duration, and dimensions using ffmpeg and ffprobe
   */
  public static async extractVideoMetadataAndFrame(videoPath: string): Promise<{
    width: number;
    height: number;
    duration: number;
    framePath: string | null;
  }> {
    const tempFramePath = path.join(
      CONFIG.CACHE_DIR,
      `tmp_frame_${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
    );

    let duration = 0;
    let width = 0;
    let height = 0;
    let hasFrame = false;

    // 1. Probe duration
    try {
      const { stdout } = await execFileAsync('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        videoPath
      ]);
      const parsedSecs = parseFloat(stdout.trim());
      if (!isNaN(parsedSecs)) {
        duration = Math.round(parsedSecs * 100) / 100;
      }
    } catch {
      // ffprobe non-fatal fallback
    }

    // 2. Extract first frame at 0.5s (or 0.0s for short clips)
    try {
      await execFileAsync('ffmpeg', [
        '-y',
        '-ss', '00:00:00.500',
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '2',
        tempFramePath
      ]);
      hasFrame = existsSync(tempFramePath);
    } catch {
      try {
        await execFileAsync('ffmpeg', [
          '-y',
          '-ss', '00:00:00.000',
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '2',
          tempFramePath
        ]);
        hasFrame = existsSync(tempFramePath);
      } catch (err) {
        console.warn(`[Thumbnail] ffmpeg failed extracting frame from ${videoPath}:`, err);
      }
    }

    // 3. Read frame dimensions using Sharp
    if (hasFrame) {
      try {
        const meta = await sharp(tempFramePath).metadata();
        width = meta.width || 0;
        height = meta.height || 0;
      } catch {
        // Ignored
      }
    }

    return {
      width,
      height,
      duration,
      framePath: hasFrame ? tempFramePath : null
    };
  }

  /**
   * Generates a single thumbnail WebP file using Sharp
   */
  private static async generateSingle(
    sourceImagePath: string,
    targetPath: string,
    size: ThumbnailSize
  ): Promise<void> {
    const config = THUMBNAIL_CONFIGS[size];
    const tempPath = `${targetPath}.tmp.${Date.now()}`;

    await sharp(sourceImagePath)
      .rotate() // Automatically correct EXIF orientation
      .resize({
        width: config.width,
        withoutEnlargement: true,
        fit: 'inside'
      })
      .webp({ quality: config.quality })
      .toFile(tempPath);

    await fs.rename(tempPath, targetPath);
  }

  /**
   * Generates all configured thumbnail sizes for an image or video item via the task queue
   */
  public static async generateThumbnails(media: MediaEntity): Promise<void> {
    await this.init();

    const isImage = media.mime_type.startsWith('image/');
    const isVideo = media.mime_type.startsWith('video/');

    if (!isImage && !isVideo) {
      return;
    }

    const taskId = `thumb_${media.id}_all`;

    return globalMediaQueue.enqueue(
      taskId,
      async () => {
        try {
          if (isImage) {
            // 1. Extract image dimensions if missing
            if (media.width === 0 || media.height === 0) {
              const dims = await this.extractImageMetadata(media.filepath);
              if (dims.width > 0 && dims.height > 0) {
                DbClient.execute('UPDATE media SET width = ?, height = ? WHERE id = ?', [
                  dims.width,
                  dims.height,
                  media.id
                ]);
                media.width = dims.width;
                media.height = dims.height;
              }
            }

            // 2. Generate sm and md thumbnails directly from original image
            for (const size of ['sm', 'md'] as ThumbnailSize[]) {
              const thumbPath = this.getThumbnailPath(media, size);
              if (!existsSync(thumbPath)) {
                await this.generateSingle(media.filepath, thumbPath, size);
              }
            }
          } else if (isVideo) {
            // Extract video frame and dimensions
            const videoData = await this.extractVideoMetadataAndFrame(media.filepath);

            if (videoData.width > 0 || videoData.duration > 0) {
              DbClient.execute('UPDATE media SET width = ?, height = ?, duration = ? WHERE id = ?', [
                videoData.width,
                videoData.height,
                videoData.duration,
                media.id
              ]);
              media.width = videoData.width;
              media.height = videoData.height;
              media.duration = videoData.duration;
            }

            if (videoData.framePath && existsSync(videoData.framePath)) {
              try {
                // Generate sm and md thumbnails from extracted frame
                for (const size of ['sm', 'md'] as ThumbnailSize[]) {
                  const thumbPath = this.getThumbnailPath(media, size);
                  if (!existsSync(thumbPath)) {
                    await this.generateSingle(videoData.framePath, thumbPath, size);
                  }
                }
              } finally {
                // Clean up temporary frame
                await fs.unlink(videoData.framePath).catch(() => {});
              }
            }
          }
        } catch (err) {
          console.warn(`[Thumbnail] Skipped unprocessable media ${media.filename}:`, err);
        }
      },
      1 // 1 retry
    );
  }

  /**
   * Gets existing thumbnail or generates on-demand if cache was cleared
   */
  public static async getOrGenerateThumbnail(
    media: MediaEntity,
    size: ThumbnailSize
  ): Promise<string | null> {
    await this.init();

    const isProcessable = media.mime_type.startsWith('image/') || media.mime_type.startsWith('video/');
    if (!isProcessable) {
      return null;
    }

    const thumbPath = this.getThumbnailPath(media, size);
    if (existsSync(thumbPath)) {
      return thumbPath;
    }

    // Cache missing (cleared or new item): generate on-demand via queue
    try {
      await this.generateThumbnails(media);
      if (existsSync(thumbPath)) {
        return thumbPath;
      }
    } catch (err) {
      console.error(`[Thumbnail] Failed on-demand generation for ${media.filename}:`, err);
    }

    return null;
  }
}

