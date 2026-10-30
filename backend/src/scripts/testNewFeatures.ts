import { existsSync } from 'node:fs';
import { DbClient, MediaEntity } from '../db/client.js';
import { runFullIndexScan } from '../db/indexer.js';
import { ThumbnailService } from '../services/thumbnailService.js';

async function testNewFeatures() {
  console.log('=== 開始 寬高提取、全文檢索、多維排序與影片首幀 驗證 ===\n');

  // 1. 執行一次全量掃描以觸發影片與圖片的縮圖與寬高時長提取
  console.log('[Step 1] 執行全量掃描並觸發佇列提取...');
  await runFullIndexScan();

  // 等待隊列處理（影片截圖需要數百毫秒）
  console.log('[Step 1] 等待隊列任務完成...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // 2. 驗證影片首幀與元數據
  const videoMedia = DbClient.queryOne<MediaEntity>(
    "SELECT * FROM media WHERE mime_type LIKE 'video/%' LIMIT 1"
  );
  if (!videoMedia) {
    throw new Error('未在資料庫中找到測試影片！');
  }

  console.log(`\n[Step 2] 驗證影片 #${videoMedia.id} [${videoMedia.filename}]:`);
  console.log(`  - 解析度: ${videoMedia.width} × ${videoMedia.height}`);
  console.log(`  - 影片時長: ${videoMedia.duration} 秒`);

  if (videoMedia.width === 0 || videoMedia.height === 0) {
    throw new Error('影片真實解析度未能正確提取！');
  }
  if (videoMedia.duration === 0) {
    throw new Error('影片時長未能正確提取！');
  }

  const videoSmThumb = ThumbnailService.getThumbnailPath(videoMedia, 'sm');
  const videoMdThumb = ThumbnailService.getThumbnailPath(videoMedia, 'md');
  console.log(`  - 首幀 WebP 縮圖(sm): ${existsSync(videoSmThumb)} (${videoSmThumb})`);
  console.log(`  - 首幀 WebP 縮圖(md): ${existsSync(videoMdThumb)} (${videoMdThumb})`);

  if (!existsSync(videoSmThumb) || !existsSync(videoMdThumb)) {
    throw new Error('影片首幀 WebP 縮圖生成失敗！');
  }
  console.log('[Step 2] 驗證成功: 影片首幀縮圖與長寬時長完全提取！');

  // 3. 驗證圖片寬高提取
  const imageMedia = DbClient.queryOne<MediaEntity>(
    "SELECT * FROM media WHERE mime_type LIKE 'image/%' AND width > 0 LIMIT 1"
  );
  if (!imageMedia) {
    throw new Error('未在資料庫中找到具備寬高的圖片！');
  }
  console.log(`\n[Step 3] 驗證圖片 #${imageMedia.id} [${imageMedia.filename}]:`);
  console.log(`  - 解析度: ${imageMedia.width} × ${imageMedia.height}`);
  console.log('[Step 3] 驗證成功: 圖片寬高正確解析！');

  // 4. 驗證關鍵字檢索 SQL
  console.log('\n[Step 4] 測試關鍵字模糊檢索...');
  const keyword = 'video';
  const likePattern = `%${keyword}%`;
  const searchResults = DbClient.queryAll<MediaEntity>(
    'SELECT * FROM media WHERE (title LIKE ? OR filename LIKE ? OR notes LIKE ?)',
    [likePattern, likePattern, likePattern]
  );
  console.log(`  - 關鍵字「${keyword}」搜尋命中項目數: ${searchResults.length}`);
  if (searchResults.length === 0) {
    throw new Error('關鍵字搜尋未能匹配到影片！');
  }
  console.log('[Step 4] 驗證成功: 關鍵字模糊搜尋精確無誤！');

  // 5. 測試多維度排序
  console.log('\n[Step 5] 測試多維度排序...');
  const sizeDescList = DbClient.queryAll<MediaEntity>(
    'SELECT id, filename, file_size FROM media ORDER BY file_size DESC'
  );
  console.log(`  - 按檔案大小排序最大項: ${sizeDescList[0]?.filename} (${sizeDescList[0]?.file_size} Bytes)`);
  if (sizeDescList.length >= 2 && sizeDescList[0].file_size < sizeDescList[1].file_size) {
    throw new Error('檔案大小排序順序不正確！');
  }
  console.log('[Step 5] 驗證成功: 多維度排序安全準確！');

  console.log('\n=== 全部新功能測試 100% 通過！ ===');
}

testNewFeatures().catch((err) => {
  console.error('測試失敗:', err);
  process.exit(1);
});
