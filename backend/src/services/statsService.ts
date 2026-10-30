import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { CONFIG } from '../config.js';
import { DbClient } from '../db/client.js';

export interface SystemStats {
  media: {
    total: number;
    images: number;
    videos: number;
    other: number;
  };
  tags: {
    total: number;
    topTags: Array<{ name: string; count: number }>;
  };
  storage: {
    originalsBytes: number;
    cacheBytes: number;
    totalBytes: number;
  };
  uptimeSeconds: number;
}

export class StatsService {
  private static startTime = Date.now();

  private static async getDirectorySize(dirPath: string): Promise<number> {
    if (!existsSync(dirPath)) return 0;
    let total = 0;

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await this.getDirectorySize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.stat(fullPath);
          total += stat.size;
        }
      }
    } catch {
      // Ignore read errors for transient files
    }

    return total;
  }

  public static async getStats(): Promise<SystemStats> {
    // 1. Media counts
    const totalRow = DbClient.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM media');
    const imagesRow = DbClient.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM media WHERE mime_type LIKE 'image/%'"
    );
    const videosRow = DbClient.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM media WHERE mime_type LIKE 'video/%'"
    );

    const totalMedia = totalRow ? Number(totalRow.count) : 0;
    const totalImages = imagesRow ? Number(imagesRow.count) : 0;
    const totalVideos = videosRow ? Number(videosRow.count) : 0;
    const totalOther = Math.max(0, totalMedia - totalImages - totalVideos);

    // 2. Tag metrics
    const tagsCountRow = DbClient.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM tags');
    const totalTags = tagsCountRow ? Number(tagsCountRow.count) : 0;

    const topTags = DbClient.queryAll<{ name: string; count: number }>(
      `SELECT t.name, COUNT(mt.media_id) as count
       FROM tags t
       INNER JOIN media_tags mt ON t.id = mt.tag_id
       GROUP BY t.id
       ORDER BY count DESC
       LIMIT 10`
    );

    // 3. Storage bytes
    const originalsBytes = await this.getDirectorySize(CONFIG.ORIGINALS_DIR);
    const cacheBytes = await this.getDirectorySize(CONFIG.CACHE_DIR);

    return {
      media: {
        total: totalMedia,
        images: totalImages,
        videos: totalVideos,
        other: totalOther
      },
      tags: {
        total: totalTags,
        topTags
      },
      storage: {
        originalsBytes,
        cacheBytes,
        totalBytes: originalsBytes + cacheBytes
      },
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000)
    };
  }
}
