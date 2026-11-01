import React, { useState } from 'react';
import { DirectoryDetail, Library } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Folder,
  HardDrive,
  FolderPlus,
  ArrowRight,
  Info,
  RefreshCw,
} from 'lucide-react';

interface FolderOverviewDialogProps {
  open: boolean;
  onClose: () => void;
  directories: DirectoryDetail[];
  libraries: Library[];
  activeLibraryId: number | null;
  onSelectDirectory: (dir: DirectoryDetail) => void;
  onOpenCreate: (libraryId?: number, parentDir?: string) => void;
  onOpenDetail: (dir: DirectoryDetail) => void;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const FolderOverviewDialog: React.FC<FolderOverviewDialogProps> = ({
  open,
  onClose,
  directories,
  libraries,
  activeLibraryId,
  onSelectDirectory,
  onOpenCreate,
  onOpenDetail,
  onRefresh,
  isRefreshing = false,
}) => {
  const [filterLibId, setFilterLibId] = useState<number | null>(activeLibraryId);
  const [searchQuery, setSearchQuery] = useState('');

  if (!open) return null;

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Filter directories by library and search query
  const filteredDirs = directories.filter((dir) => {
    if (filterLibId !== null && dir.libraryId !== filterLibId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = dir.name.toLowerCase().includes(q);
      const matchPath = dir.directory.toLowerCase().includes(q);
      const matchLib = dir.libraryName.toLowerCase().includes(q);
      return matchName || matchPath || matchLib;
    }
    return true;
  });

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
      <div className="relative z-50 flex flex-col w-full max-w-4xl max-h-[85vh] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center space-x-2">
            <Folder className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-bold text-foreground tracking-wide">各庫文件夾詳細總覽</h2>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 border-border">
              {filteredDirs.length} 個目錄
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none"
              title="重新載入"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Toolbar: Library Filter & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 px-5 py-2.5 border-b border-border bg-muted/40 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0 text-[11px] uppercase">篩選來源:</span>
            <select
              value={filterLibId ?? ''}
              onChange={(e) => setFilterLibId(e.target.value === '' ? null : Number(e.target.value))}
              className="bg-card border border-border text-neutral-200 text-xs rounded-sm px-2 py-1 focus:outline-none focus:border-neutral-500 cursor-pointer"
            >
              <option value="">全部儲存庫 ({libraries.length})</option>
              {libraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder="搜尋文件夾名稱或路徑..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-card border border-border text-neutral-200 text-xs rounded-sm px-2.5 py-1 w-full sm:w-60 focus:outline-none focus:border-neutral-500"
            />
            <button
              type="button"
              onClick={() => onOpenCreate(filterLibId || undefined)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-sm bg-white text-black font-bold hover:bg-neutral-200 transition-none shrink-0"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              <span>新建</span>
            </button>
          </div>
        </div>

        {/* Table / List Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-card text-xs">
          {filteredDirs.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              無文件夾
            </div>
          ) : (
            <div className="border border-border rounded-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-card text-[10px] text-muted-foreground uppercase tracking-wider">
                    <th className="py-2 px-3">文件夾名稱 / 相對路徑</th>
                    <th className="py-2 px-3">所屬庫</th>
                    <th className="py-2 px-3 text-right">媒體數 (直屬/總計)</th>
                    <th className="py-2 px-3 text-right">磁碟容量</th>
                    <th className="py-2 px-3 text-right">圖片/影片</th>
                    <th className="py-2 px-3 text-right">子目錄</th>
                    <th className="py-2 px-3 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredDirs.map((dir) => {
                    const isRoot = dir.directory === '';
                    return (
                      <tr
                        key={`${dir.libraryId}-${dir.directory}`}
                        className="hover:bg-accent/40 transition-none group"
                      >
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <span className="font-bold text-foreground text-xs block truncate">
                                {isRoot ? `${dir.name} (根目錄)` : dir.name}
                              </span>
                              {!isRoot && (
                                <span className="text-[10px] text-muted-foreground block truncate">
                                  /{dir.directory}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-3">
                          <span className="text-muted-foreground flex items-center gap-1">
                            <HardDrive className="h-3 w-3 text-muted-foreground" />
                            {dir.libraryName}
                          </span>
                        </td>

                        <td className="py-2.5 px-3 text-right text-foreground font-semibold font-mono">
                          <span>{dir.mediaCount}</span>
                          <span className="text-muted-foreground text-[10px] ml-1">/ {dir.totalRecursiveCount}</span>
                        </td>

                        <td className="py-2.5 px-3 text-right text-muted-foreground font-mono">
                          {formatBytes(dir.totalBytes)}
                        </td>

                        <td className="py-2.5 px-3 text-right text-muted-foreground font-mono text-[11px]">
                          {dir.imageCount} 圖 / {dir.videoCount} 片
                        </td>

                        <td className="py-2.5 px-3 text-right text-muted-foreground font-mono">
                          {dir.subDirectoryCount}
                        </td>

                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => onOpenDetail(dir)}
                              className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-none"
                              title="查看詳細"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onSelectDirectory(dir);
                                onClose();
                              }}
                              className="flex items-center gap-1 px-2 py-1 rounded-sm bg-secondary hover:bg-accent text-secondary-foreground hover:text-foreground border border-border text-[11px] font-bold transition-none"
                              title="在畫布中瀏覽"
                            >
                              <span>瀏覽</span>
                              <ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
