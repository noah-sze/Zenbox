import React, { useState } from 'react';
import { Library } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { X, HardDrive, RefreshCw, Trash2, Plus } from 'lucide-react';


interface LibraryManageDialogProps {
  open: boolean;
  onClose: () => void;
  libraries: Library[];
  onLibrariesChanged: () => void;
}

export const LibraryManageDialog: React.FC<LibraryManageDialogProps> = ({
  open,
  onClose,
  libraries,
  onLibrariesChanged,
}) => {
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [isReadonly, setIsReadonly] = useState(false);
  const [scanningId, setScanningId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!open) return null;

  const formatSize = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !rootPath.trim()) return;

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await fetch('/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          rootPath: rootPath.trim(),
          isReadonly,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: '掛載失敗' }));
        throw new Error(json.error || '掛載失敗');
      }

      setName('');
      setRootPath('');
      setIsReadonly(false);
      onLibrariesChanged();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '掛載失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleScan = async (id: number) => {
    setScanningId(id);
    try {
      await fetch(`/api/libraries/${id}/scan`, { method: 'POST' });
      onLibrariesChanged();
    } catch {
      // Ignore network errors in silent instrument mode
    } finally {
      setScanningId(null);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/libraries/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onLibrariesChanged();
      }
    } catch {
      // Ignore
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Frosted Glass Backdrop */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-[2px] transition-none"
        onClick={onClose}
      />

      {/* Instant Pop Modal Container */}
      <div className="relative z-50 flex flex-col w-full max-w-2xl max-h-[85vh] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-black">
          <div className="flex items-center space-x-2">
            <HardDrive className="h-4 w-4 text-white" />
            <h2 className="text-sm font-bold text-white tracking-wide">儲存來源管理</h2>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
              {libraries.length} 個來源
            </Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-neutral-400 hover:text-white p-1 rounded-sm transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content list & Form */}
        <div className="p-5 space-y-5 overflow-y-auto bg-black text-xs">
          {/* Library List */}
          <div className="space-y-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">已掛載庫</span>
            <div className="space-y-2">
              {libraries.map((lib) => (
                <div
                  key={lib.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-sm border border-border bg-card space-y-2 sm:space-y-0"
                >
                  <div className="space-y-1 min-w-0 pr-2">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-white text-xs">{lib.name}</span>
                      {lib.is_default === 1 && (
                        <Badge variant="secondary" className="text-[10px] py-0 px-1 border-neutral-700">
                          預設
                        </Badge>
                      )}
                      {lib.is_readonly === 1 && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1 text-neutral-400">
                          唯讀
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate font-mono" title={lib.root_path}>
                      {lib.root_path}
                    </p>
                    <div className="flex items-center space-x-3 text-[10px] text-neutral-500 pt-0.5">
                      <span>{lib.media_count || 0} 個項目</span>
                      <span>·</span>
                      <span>{formatSize(lib.total_bytes)}</span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => handleScan(lib.id)}
                      disabled={scanningId === lib.id}
                      className="flex items-center space-x-1 px-2 py-1 rounded-sm border border-border text-[11px] text-muted-foreground hover:text-white hover:border-neutral-500 disabled:opacity-50"
                      title="重掃描"
                    >
                      <RefreshCw className={`h-3 w-3 ${scanningId === lib.id ? 'animate-spin text-white' : ''}`} />
                      <span>掃描</span>
                    </button>
                    {lib.is_default !== 1 && (
                      <button
                        type="button"
                        onClick={() => handleDelete(lib.id)}
                        className="p-1 rounded-sm border border-border text-neutral-500 hover:text-red-400 hover:border-red-500/50"
                        title="卸載"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mount New Library Form */}
          <div className="pt-3 border-t border-border space-y-3">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">掛載新來源</span>
            {errorMessage && (
              <p className="text-red-400 text-xs bg-red-950/20 border border-red-900/50 p-2 rounded-sm">
                {errorMessage}
              </p>
            )}
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-400 uppercase">來源名稱</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="例如: 外接照片庫"
                    className="w-full bg-card border border-border px-2.5 py-1.5 rounded-sm text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-400"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-neutral-400 uppercase">實體本機路徑</label>
                  <input
                    type="text"
                    value={rootPath}
                    onChange={(e) => setRootPath(e.target.value)}
                    placeholder="例如: D:/Photos 或 /Volumes/Media"
                    className="w-full bg-card border border-border px-2.5 py-1.5 rounded-sm text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:border-neutral-400 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none text-[11px] text-neutral-400">
                  <input
                    type="checkbox"
                    checked={isReadonly}
                    onChange={(e) => setIsReadonly(e.target.checked)}
                    className="rounded-none bg-card border-border text-white focus:ring-0"
                  />
                  <span>唯讀模式（禁止由前端上傳或修改原檔）</span>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting || !name.trim() || !rootPath.trim()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-sm bg-white text-black font-semibold text-xs hover:bg-neutral-200 transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Plus className="h-3 w-3" />
                  )}
                  <span>掛載</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
