import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DbClient, MediaEntity } from '../db/client.js';
import { LibraryService } from '../services/libraryService.js';

import { runFullIndexScan } from '../db/indexer.js';
import { ThumbnailService } from '../services/thumbnailService.js';

async function testMultiLibraries() {
  console.log('=== 開始多儲存來源端到端測試 ===\n');

  // 0. 清理殘留測試項目
  DbClient.execute("DELETE FROM media WHERE filename = 'cyberpunk_city.png'");
  DbClient.execute("DELETE FROM libraries WHERE name = '測試外接來源'");

  // 1. 檢查目前儲存來源
  const initialLibs = await LibraryService.listLibraries();
  console.log(`[Step 1] 當前儲存來源數: ${initialLibs.length}`);
  const defaultLib = initialLibs.find((l) => l.is_default === 1);
  if (!defaultLib) throw new Error('未找到預設儲存來源');
  console.log(`[Step 1] 預設來源: #${defaultLib.id} [${defaultLib.name}] -> ${defaultLib.root_path}`);

  // 2. 建立第二個測試儲存來源
  const testLibDir = path.resolve('./storage/test_external_library');
  await fs.mkdir(testLibDir, { recursive: true });

  const secondLib = await LibraryService.createLibrary({
    name: '測試外接來源',
    rootPath: testLibDir,
    isReadonly: false
  });
  console.log(`\n[Step 2] 成功掛載新來源: #${secondLib.id} [${secondLib.name}] -> ${secondLib.root_path}`);

  // 3. 在新來源資料夾放入一個測試資產
  const testImgPath = path.join(testLibDir, 'cyberpunk_city.png');
  await sharp({
    create: {
      width: 600,
      height: 400,
      channels: 4,
      background: { r: 10, g: 30, b: 60, alpha: 1 }
    }
  })
    .png()
    .toFile(testImgPath);

  // 伴隨 Sidecar JSON
  const sidecarPath = path.join(testLibDir, 'cyberpunk_city.json');
  await fs.writeFile(
    sidecarPath,
    JSON.stringify({
      title: '電馭叛客未來都市',
      tags: ['cyberpunk', 'concept', 'futuristic'],
      notes: '多儲存來源端到端測試資產'
    }, null, 2)
  );
  console.log(`[Step 3] 於新來源建立測試資產: ${testImgPath}`);

  // 4. 單獨觸發新來源重掃描
  console.log('\n[Step 4] 執行新來源單獨掃描...');
  const scanResult = await runFullIndexScan(secondLib.id);
  console.log(`[Step 4] 掃描完成: 處理了 ${scanResult.totalScanned} 個檔案，耗時 ${scanResult.durationMs}ms`);

  // 5. 驗證資料庫記錄與 library_id 關聯
  const indexedMedia = DbClient.queryOne<MediaEntity>(
    'SELECT * FROM media WHERE library_id = ? AND filename = ?',
    [secondLib.id, 'cyberpunk_city.png']
  );
  if (!indexedMedia) {
    throw new Error('新來源資產未成功索引至資料庫！');
  }
  console.log(`\n[Step 5] 驗證成功: Media #${indexedMedia.id} 正確關聯 library_id=${indexedMedia.library_id}`);
  console.log(`[Step 5] 標題: ${indexedMedia.title}, 檔案路徑: ${indexedMedia.filepath}`);

  // 縮圖路徑隔離驗證
  const smThumbPath = ThumbnailService.getThumbnailPath(indexedMedia, 'sm');
  console.log(`[Step 5] 快取隔離路徑檢查: ${path.basename(smThumbPath)}`);
  if (!path.basename(smThumbPath).startsWith(`lib_${secondLib.id}__`)) {
    throw new Error('縮圖快取命名缺乏庫前綴隔離！');
  }

  // 6. 跨庫隔離查詢驗證
  const defaultMedia = DbClient.queryAll<MediaEntity>('SELECT * FROM media WHERE library_id = ?', [defaultLib.id]);
  const secondMedia = DbClient.queryAll<MediaEntity>('SELECT * FROM media WHERE library_id = ?', [secondLib.id]);
  console.log(`\n[Step 6] 庫隔離計數: 預設庫有 ${defaultMedia.length} 個項目，測試庫有 ${secondMedia.length} 個項目`);

  // 7. 卸載第二個庫測試（驗證原檔保留但索引清除）
  console.log('\n[Step 7] 卸載測試庫...');
  await LibraryService.deleteLibrary(secondLib.id);

  const afterDeleteCount = DbClient.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM media WHERE library_id = ?',
    [secondLib.id]
  );
  console.log(`[Step 7] 卸載後資料庫殘留記錄數: ${afterDeleteCount?.count || 0}`);
  if ((afterDeleteCount?.count || 0) > 0) throw new Error('卸載庫後資料庫索引未清空！');

  const fileStillExists = existsSync(testImgPath);
  console.log(`[Step 7] 原生硬碟實體原檔是否完整保留 (Single Source of Truth): ${fileStillExists}`);
  if (!fileStillExists) throw new Error('原生檔案被誤刪！違背原檔不可變原則！');

  // 清理測試檔案
  await fs.unlink(testImgPath).catch(() => {});
  await fs.unlink(sidecarPath).catch(() => {});
  await fs.rmdir(testLibDir).catch(() => {});
  console.log('[Step 7] 測試磁碟暫存已清理完成。');

  console.log('\n=== 多儲存來源端到端測試全部通過！ ===');
}

testMultiLibraries().catch((err) => {
  console.error('測試失敗:', err);
  process.exit(1);
});
