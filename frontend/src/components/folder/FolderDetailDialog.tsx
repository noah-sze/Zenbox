import React from 'react';
import { DirectoryDetail } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import {
  X,
  Folder,
  HardDrive,
  FileImage,
  FileVideo,
  Clock,
  ArrowRight,
  FolderPlus,
} from 'lucide-react';

interface FolderDetailDialogProps {
  directory: DirectoryDetail | null;
  onClose: () => void;
  onSelectDirectory: (dir: DirectoryDetail) => void;
  onCreateSubfolder?: (dir: DirectoryDetail) => void;
}

export const FolderDetailDialog: React.FC<FolderDetailDialogProps> = ({
  directory,
  onClose,
  onSelectDirectory,
  onCreateSubfolder,
}) => {
  if (!directory) return null;

  const formatBytes = (bytes?: number): string => {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return '-';
    try {
      const d = new Date(isoString);
      return d.toLocaleString('zh-TW', { hour12: false });
    } catch {
      return isoString;
    }
  };

  const isRoot = directory.directory === '';

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
      <div className="relative z-50 flex flex-col w-full max-w-lg bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center space-x-2">
            <Folder className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-bold text-foreground tracking-wide">詳情</h2>
            <Badge variant="secondary" className="text-[10px] py-0 px-1.5 border-border">
              {isRoot ? '根目錄' : directory.name}
            </Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 bg-card text-xs overflow-y-auto max-h-[75vh]">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="p-2.5 rounded-sm border border-border bg-card">
              <div className="text-[10px] text-muted-foreground uppercase">媒體數</div>
              <div className="text-base font-bold text-foreground mt-1">
                {directory.totalRecursiveCount}
              </div>
              <div className="text-[9px] text-muted-foreground">
                直屬 {directory.mediaCount}
              </div>
            </div>

            <div className="p-2.5 rounded-sm border border-border bg-card">
              <div className="text-[10px] text-muted-foreground uppercase">大小</div>
              <div className="text-base font-bold text-foreground mt-1">
                {formatBytes(directory.totalBytes)}
              </div>
              <div className="text-[9px] text-muted-foreground">
                含子目錄
              </div>
            </div>

            <div className="p-2.5 rounded-sm border border-border bg-card">
              <div className="text-[10px] text-muted-foreground uppercase">圖片</div>
              <div className="text-base font-bold text-foreground mt-1 flex items-center gap-1">
                <FileImage className="h-3 w-3 text-muted-foreground" />
                {directory.imageCount}
              </div>
              <div className="text-[9px] text-muted-foreground">
                WebP / JPG
              </div>
            </div>

            <div className="p-2.5 rounded-sm border border-border bg-card">
              <div className="text-[10px] text-muted-foreground uppercase">影片</div>
              <div className="text-base font-bold text-foreground mt-1 flex items-center gap-1">
                <FileVideo className="h-3 w-3 text-muted-foreground" />
                {directory.videoCount}
              </div>
              <div className="text-[9px] text-muted-foreground">
                MP4 / MOV
              </div>
            </div>
          </div>

          {/* Directory Details Table */}
          <div className="space-y-2.5 border border-border rounded-sm p-3 bg-card">
            <div className="flex items-start justify-between py-1 border-b border-border">
              <span className="text-muted-foreground shrink-0 w-24">儲存庫</span>
              <div className="flex items-center gap-1.5 text-right text-foreground break-all">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{directory.libraryName}</span>
              </div>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border">
              <span className="text-muted-foreground shrink-0 w-24">相對路徑</span>
              <span className="text-foreground text-right break-all">
                {directory.directory || '/'}
              </span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border">
              <span className="text-muted-foreground shrink-0 w-24">子文件夾</span>
              <span className="text-foreground text-right">
                {directory.subDirectoryCount}
              </span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border">
              <span className="text-muted-foreground shrink-0 w-24">路徑</span>
              <span className="text-muted-foreground text-right break-all select-all text-[11px]">
                {directory.fullPath}
              </span>
            </div>

            <div className="flex items-start justify-between py-1 border-b border-border">
              <span className="text-muted-foreground shrink-0 w-24 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>建立時間</span>
              </span>
              <span className="text-foreground text-right">
                {formatDate(directory.createdAt)}
              </span>
            </div>

            <div className="flex items-start justify-between py-1">
              <span className="text-muted-foreground shrink-0 w-24 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>變更時間</span>
              </span>
              <span className="text-foreground text-right">
                {formatDate(directory.updatedAt)}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            {onCreateSubfolder ? (
              <button
                type="button"
                onClick={() => {
                  onCreateSubfolder(directory);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-none text-xs"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span>新增子文件夾</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-none"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={() => {
                  onSelectDirectory(directory);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity"
              >
                <span>瀏覽</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
