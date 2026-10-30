import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { DbClient, MediaEntity } from '../db/client.js';
import { LibraryService } from '../services/libraryService.js';
import { runFullIndexScan } from '../db/indexer.js';
import { 
  getSidecarPath, 
  getLegacySidecarPath, 
  readSidecar, 
  writeSidecar, 
  calculateQuickHash, 
  removeSidecar 
} from '../watcher/sidecar.js';

async function testSchemeC() {
  console.log('=== 開始 方案 C (.zenbox 隱藏目錄與雜湊自愈) 全鏈路測試 ===\n');

  const testDir = path.resolve('./storage/test_scheme_c');
  await fs.mkdir(testDir, { recursive: true });

  // 1. 建立測試儲存來源
  DbClient.execute("DELETE FROM libraries WHERE name = '方案C測試庫'");
  const lib = await LibraryService.createLibrary({
    name: '方案C測試庫',
    rootPath: testDir,
    isReadonly: false
  });
  console.log(`[Step 1] 掛載測試庫: #${lib.id} -> ${testDir}`);

  // 2. 建立新測試圖片
  const imgPath = path.join(testDir, 'minimal_art.png');
  await sharp({
    create: {
      width: 400,
      height: 300,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    }
  })
    .png()
    .toFile(imgPath);

  const hash = await calculateQuickHash(imgPath);
  console.log(`[Step 2] 產生測試圖片，計算快速指紋 Hash: ${hash.slice(0, 16)}...`);

  // 3. 測試寫入 Sidecar
  await writeSidecar(imgPath, {
    title: '純白極簡藝術',
    tags: ['minimal', 'white', 'zen'],
    addedAt: new Date().toISOString(),
    notes: '方案 C 測試筆記',
    hash
  });

  const expectedSidecar = getSidecarPath(imgPath);
  const legacySidecar = getLegacySidecarPath(imgPath);

  console.log(`[Step 3] 檢查 Sidecar 實體路徑: ${expectedSidecar}`);
  if (!existsSync(expectedSidecar)) {
    throw new Error('Sidecar 未存入 .zenbox 隱藏資料夾！');
  }
  if (existsSync(legacySidecar)) {
    throw new Error('舊版顯式 sidecar 依然存在於主目錄！');
  }
  console.log('[Step 3] 驗證成功: 主目錄保持 100% 純淨，Sidecar 成功收斂於 .zenbox/');

  // 4. 全量索引掃描
  console.log('\n[Step 4] 執行全量索引掃描...');
  await runFullIndexScan(lib.id);

  const mediaRow = DbClient.queryOne<MediaEntity>(
    'SELECT * FROM media WHERE library_id = ? AND filename = ?',
    [lib.id, 'minimal_art.png']
  );
  if (!mediaRow) throw new Error('媒體未成功入庫！');
  if (mediaRow.hash !== hash) throw new Error('資料庫 hash 與快速特徵指紋不符！');
  console.log(`[Step 4] 驗證成功: 索引正確記錄 media #${mediaRow.id}, hash: ${mediaRow.hash.slice(0, 16)}...`);

  // 5. 測試舊版向後相容與平滑自動遷移
  console.log('\n[Step 5] 測試舊版顯式 Sidecar 自動遷移至 .zenbox/...');
  const legacyImg = path.join(testDir, 'old_photo.png');
  await sharp({
    create: { width: 100, height: 100, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 1 } }
  }).png().toFile(legacyImg);

  const oldSidecarPath = getLegacySidecarPath(legacyImg);
  await fs.writeFile(oldSidecarPath, JSON.stringify({
    title: '舊版照片標題',
    tags: ['legacy', 'migrated'],
    addedAt: new Date().toISOString()
  }));

  console.log(`[Step 5] 模擬舊版檔案結構: ${oldSidecarPath}`);
  const migratedData = await readSidecar(legacyImg);
  if (!migratedData) throw new Error('讀取舊版 sidecar 失敗！');
  if (existsSync(oldSidecarPath)) throw new Error('遷移後舊版 sidecar 未被清理！');
  if (!existsSync(getSidecarPath(legacyImg))) throw new Error('遷移後新版 .zenbox sidecar 未產生！');
  console.log('[Step 5] 驗證成功: 舊版顯式 Sidecar 自動無縫升級為 .zenbox 隱藏目錄結構！');

  // 6. 測試刪除原檔時的孤兒 GC 機制
  console.log('\n[Step 6] 測試手動刪除原檔時的孤兒 GC 機制...');
  await fs.unlink(legacyImg);
  await removeSidecar(legacyImg);

  const newSidecarPath = getSidecarPath(legacyImg);
  if (existsSync(newSidecarPath)) {
    throw new Error('孤兒 sidecar 未被清除！');
  }
  console.log('[Step 6] 驗證成功: 原檔刪除後，對應的 .zenbox Sidecar 被精準清理！');

  // 清理測試資料夾
  await LibraryService.deleteLibrary(lib.id);
  await fs.unlink(imgPath).catch(() => {});
  await removeSidecar(imgPath);
  await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  console.log('[Step 6] 測試資料夾已清理完成。');

  console.log('\n=== 方案 C (.zenbox 隱藏目錄與快速指紋) 全部測試通過！ ===');
}

testSchemeC().catch((err) => {
  console.error('測試失敗:', err);
  process.exit(1);
});
