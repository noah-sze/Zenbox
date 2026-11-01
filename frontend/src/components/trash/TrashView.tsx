import React, { useState, useEffect, useCallback } from 'react';
import {
  Trash2,
  Undo2,
  RefreshCw,
  Layers,
  Image as ImageIcon,
  Film,
  AlertTriangle,
} from 'lucide-react';
import { MediaItem, Collection, TrashStats } from '@/types/media';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';

interface TrashViewProps {
  onItemRestored?: () => void;
  onItemDeleted?: () => void;
  onTrashEmptied?: () => void;
}

export const TrashView: React.FC<TrashViewProps> = ({
  onItemRestored,
  onItemDeleted,
  onTrashEmptied,
}) => {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<TrashStats>({ mediaCount: 0, collectionCount: 0, totalBytes: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessingId, setIsProcessingId] = useState<string | null>(null);

  // Confirmation dialogs
  const [emptyConfirmOpen, setEmptyConfirmOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{ id: number; type: 'media' | 'collection'; title: string } | null>(null);

  // Fetch trash content from backend API
  const fetchTrash = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/trash');
      if (!res.ok) throw new Error('讀取垃圾桶失敗');
      const json = await res.json();
      setMediaItems(json.data.media || []);
      setCollections(json.data.collections || []);
      setStats(json.data.stats || { mediaCount: 0, collectionCount: 0, totalBytes: 0 });
    } catch (err) {
      console.error('[TrashView] Error fetching trash:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrash();
  }, [fetchTrash]);

  // Format file size
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format trashed date
  const formatDate = (isoString?: string | null): string => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  // Restore media
  const handleRestoreMedia = async (id: number) => {
    setIsProcessingId(`m_${id}`);
    try {
      const res = await fetch(`/api/media/${id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('還原失敗');
      setMediaItems((prev) => prev.filter((m) => m.id !== id));
      setStats((prev) => ({
        ...prev,
        mediaCount: Math.max(0, prev.mediaCount - 1),
      }));
      onItemRestored?.();
    } catch (err) {
      console.error('[TrashView] Restore error:', err);
    } finally {
      setIsProcessingId(null);
    }
  };

  // Restore collection
  const handleRestoreCollection = async (id: number) => {
    setIsProcessingId(`c_${id}`);
    try {
      const res = await fetch(`/api/collections/${id}/restore`, { method: 'POST' });
      if (!res.ok) throw new Error('還原失敗');
      setCollections((prev) => prev.filter((c) => c.id !== id));
      setStats((prev) => ({
        ...prev,
        collectionCount: Math.max(0, prev.collectionCount - 1),
      }));
      onItemRestored?.();
    } catch (err) {
      console.error('[TrashView] Restore collection error:', err);
    } finally {
      setIsProcessingId(null);
    }
  };

  // Permanently delete single item
  const handleConfirmPermanentDelete = async () => {
    if (!itemToDelete) return;
    const { id, type } = itemToDelete;
    setIsProcessingId(`${type === 'media' ? 'm' : 'c'}_${id}`);

    try {
      const endpoint = type === 'media' ? `/api/media/${id}/permanent` : `/api/collections/${id}/permanent`;
      const res = await fetch(endpoint, { method: 'DELETE' });
      if (!res.ok) throw new Error('永久刪除失敗');

      if (type === 'media') {
        setMediaItems((prev) => prev.filter((m) => m.id !== id));
        setStats((prev) => ({
          ...prev,
          mediaCount: Math.max(0, prev.mediaCount - 1),
        }));
      } else {
        setCollections((prev) => prev.filter((c) => c.id !== id));
        setStats((prev) => ({
          ...prev,
          collectionCount: Math.max(0, prev.collectionCount - 1),
        }));
      }

      onItemDeleted?.();
    } catch (err) {
      console.error('[TrashView] Delete error:', err);
    } finally {
      setIsProcessingId(null);
      setItemToDelete(null);
    }
  };

  // Empty all trash
  const handleEmptyTrash = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/trash/empty', { method: 'POST' });
      if (!res.ok) throw new Error('清空失敗');
      setMediaItems([]);
      setCollections([]);
      setStats({ mediaCount: 0, collectionCount: 0, totalBytes: 0 });
      setEmptyConfirmOpen(false);
      onTrashEmptied?.();
    } catch (err) {
      console.error('[TrashView] Empty trash error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const totalItems = stats.mediaCount + stats.collectionCount;

  return (
    <div className="flex flex-col h-full bg-background text-foreground">
      {/* 1. Header Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 border-b border-border bg-card shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-muted border border-border text-foreground">
            <Trash2 className="h-4 w-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-sm font-semibold tracking-tight">垃圾桶</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground font-mono">
                {totalItems} 項
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono">
              已佔用 {formatBytes(stats.totalBytes)} · 在此刪除為永久刪除
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchTrash}
            disabled={isLoading}
            className="h-8 text-xs font-mono gap-1 border-border shadow-none"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>重新整理</span>
          </Button>

          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={totalItems === 0 || isLoading}
            onClick={() => setEmptyConfirmOpen(true)}
            className="h-8 text-xs gap-1 shadow-none"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>清空</span>
          </Button>
        </div>
      </div>

      {/* 2. Main Content Gallery */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {totalItems === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-sm border border-border bg-card mb-3">
              <Trash2 className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground font-mono">無垃圾</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Collections Section (if any) */}
            {collections.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
                  <Layers className="h-3.5 w-3.5" />
                  <span>合集 ({collections.length})</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {collections.map((col) => (
                    <div
                      key={col.id}
                      className="group flex flex-col border border-border bg-card rounded-sm overflow-hidden shadow-none hover:border-foreground/30 transition-colors"
                    >
                      <div className="aspect-[16/10] bg-muted relative flex items-center justify-center overflow-hidden">
                        {col.cover_media_id ? (
                          <img
                            src={`/api/media/${col.cover_media_id}/thumbnail?size=sm`}
                            alt={col.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <Layers className="h-8 w-8 text-muted-foreground" />
                        )}
                        <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-sm bg-card border border-border text-[10px] text-foreground font-mono flex items-center gap-1">
                          <Layers className="h-3 w-3" />
                          <span>{col.item_count}</span>
                        </div>
                      </div>

                      <div className="p-3 flex flex-col flex-1 justify-between gap-2">
                        <div>
                          <h3 className="text-xs font-medium text-foreground truncate" title={col.title}>
                            {col.title}
                          </h3>
                          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                            移入：{formatDate(col.trashed_at)}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 pt-2 border-t border-border">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="flex-1 h-7 text-[11px] gap-1 shadow-none"
                            disabled={isProcessingId === `c_${col.id}`}
                            onClick={() => handleRestoreCollection(col.id)}
                          >
                            <Undo2 className="h-3 w-3" />
                            <span>還原</span>
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="h-7 px-2 text-[11px] shadow-none"
                            disabled={isProcessingId === `c_${col.id}`}
                            onClick={() => setItemToDelete({ id: col.id, type: 'collection', title: col.title })}
                            title="永久刪除"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Media Items Section */}
            {mediaItems.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center space-x-2 text-xs font-mono text-muted-foreground">
                  <ImageIcon className="h-3.5 w-3.5" />
                  <span>檔案 ({mediaItems.length})</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                  {mediaItems.map((item) => {
                    const isVideo = item.mime_type.startsWith('video/');
                    const origPath = item.original_relative_path || item.relative_path || item.filename;

                    return (
                      <div
                        key={item.id}
                        className="group flex flex-col border border-border bg-card rounded-sm overflow-hidden shadow-none hover:border-foreground/30 transition-colors"
                      >
                        <div className="aspect-square bg-muted relative flex items-center justify-center overflow-hidden">
                          <img
                            src={`/api/media/${item.id}/thumbnail?size=sm`}
                            alt={item.title || item.filename}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                          {isVideo && (
                            <div className="absolute top-1.5 right-1.5 p-1 rounded-sm bg-black/75 text-white">
                              <Film className="h-3 w-3" />
                            </div>
                          )}
                          <div className="absolute bottom-1.5 left-1.5 px-1 py-0.5 rounded-sm bg-black/70 text-[9px] text-white/90 font-mono">
                            {formatBytes(item.file_size)}
                          </div>
                        </div>

                        <div className="p-2.5 flex flex-col flex-1 justify-between gap-1.5">
                          <div>
                            <h3 className="text-xs font-medium text-foreground truncate" title={item.title || item.filename}>
                              {item.title || item.filename}
                            </h3>
                            <p className="text-[10px] text-muted-foreground font-mono truncate" title={origPath}>
                              原路徑：{origPath}
                            </p>
                            <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                              {formatDate(item.trashed_at)}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 pt-1.5 border-t border-border">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="flex-1 h-6 text-[10px] gap-1 shadow-none"
                              disabled={isProcessingId === `m_${item.id}`}
                              onClick={() => handleRestoreMedia(item.id)}
                            >
                              <Undo2 className="h-2.5 w-2.5" />
                              <span>還原</span>
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] shadow-none"
                              disabled={isProcessingId === `m_${item.id}`}
                              onClick={() => setItemToDelete({ id: item.id, type: 'media', title: item.title || item.filename })}
                              title="永久刪除"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Empty Trash Confirmation Modal */}
      <Dialog open={emptyConfirmOpen} onOpenChange={setEmptyConfirmOpen}>
        <DialogContent className="max-w-md p-5 border border-border bg-card shadow-none">
          <DialogHeader className="flex flex-row items-center space-x-3 pb-2 border-b border-border">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">清空垃圾桶確認</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">此操作將永久銷毀檔案，無法復原</p>
            </div>
          </DialogHeader>

          <div className="py-3 text-xs text-foreground space-y-2">
            <p>
              即將永久刪除垃圾桶內的 <span className="font-mono font-bold text-foreground">{totalItems}</span> 個項目（共釋放 <span className="font-mono font-bold text-foreground">{formatBytes(stats.totalBytes)}</span> 磁碟空間）。
            </p>
            <p className="text-muted-foreground">
              實體原生檔案與 Sidecar 元數據將徹底從磁碟中移除。
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-mono shadow-none"
              onClick={() => setEmptyConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isLoading}
              className="h-8 text-xs font-mono shadow-none"
              onClick={handleEmptyTrash}
            >
              {isLoading ? '清空中...' : '清空'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Single Item Delete Confirmation Modal */}
      <Dialog open={!!itemToDelete} onOpenChange={(open) => !open && setItemToDelete(null)}>
        <DialogContent className="max-w-sm p-5 border border-border bg-card shadow-none">
          <DialogHeader className="flex flex-row items-center space-x-3 pb-2 border-b border-border">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-destructive/10 text-destructive">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold text-foreground">永久刪除確認</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">無法復原</p>
            </div>
          </DialogHeader>

          <div className="py-3 text-xs text-foreground">
            確定要永久刪除「<span className="font-mono font-bold">{itemToDelete?.title}</span>」嗎？實體檔案與元數據將被徹底銷毀。
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs font-mono shadow-none"
              onClick={() => setItemToDelete(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!!isProcessingId}
              className="h-8 text-xs font-mono shadow-none"
              onClick={handleConfirmPermanentDelete}
            >
              確認刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
