import React from 'react';
import { MediaItem, Library } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink, Calendar, HardDrive, Maximize2, Folder } from 'lucide-react';

interface MediaDetailDialogProps {
  item: MediaItem | null;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
  libraries?: Library[];
}

export const MediaDetailDialog: React.FC<MediaDetailDialogProps> = ({
  item,
  onClose,
  onTagClick,
  libraries = [],
}) => {
  if (!item) return null;

  const libraryName = item.library_id
    ? libraries.find((l) => l.id === item.library_id)?.name
    : undefined;

  const isImage = item.mime_type.startsWith('image/');
  const previewUrl = `/api/media/${item.id}/thumbnail?size=md`;
  const rawUrl = `/api/media/${item.id}/raw`;


  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Frosted Glass Backdrop with Alpha variable */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-[2px] transition-none"
        onClick={onClose}
      />

      {/* Instant Pop Modal Container (Strictly zero slow animations, zero shadows) */}
      <div className="relative z-50 flex flex-col md:flex-row w-full max-w-4xl max-h-[90vh] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Media Preview Column */}
        <div className="flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[300px] md:min-h-[460px] relative border-b md:border-b-0 md:border-r border-border">
          {isImage ? (
            <img
              src={previewUrl}
              alt={item.title}
              className="max-h-[85vh] w-auto max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <span className="text-sm uppercase text-muted-foreground">{item.mime_type}</span>
              <span className="mt-2 text-base font-semibold">{item.filename}</span>
            </div>
          )}

          {/* Quick open raw link */}
          <a
            href={rawUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-3 right-3 px-2 py-1 rounded-sm bg-black/80 border border-border text-[11px] text-neutral-300 hover:text-white flex items-center space-x-1"
          >
            <Maximize2 className="h-3 w-3" />
            <span>原檔</span>
          </a>
        </div>

        {/* Sidecar Metadata Panel */}
        <div className="w-full md:w-80 flex flex-col justify-between bg-black p-4 sm:p-5 space-y-4 overflow-y-auto">
          {/* Header */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <span className="text-xs uppercase tracking-wider text-muted-foreground">資產詳情</span>
              <button
                type="button"
                onClick={onClose}
                className="text-neutral-400 hover:text-white p-1 rounded-sm transition-none"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div>
              <h2 className="text-sm font-bold text-white break-words">{item.title || item.filename}</h2>
              <span className="text-[11px] text-neutral-500 break-all">{item.filename}</span>
            </div>

            {/* Spec metrics list */}
            <div className="space-y-2 pt-2 text-xs text-neutral-400 border-t border-border">
              {item.width > 0 && item.height > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">解析度</span>
                  <span className="text-foreground">{item.width} × {item.height}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <HardDrive className="h-3 w-3" /> 檔案大小
                </span>
                <span className="text-foreground">{formatSize(item.file_size)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" /> 加入時間
                </span>
                <span className="text-foreground">{item.added_at.slice(0, 10)}</span>
              </div>
              {item.directory && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <Folder className="h-3 w-3" /> 資料夾
                  </span>
                  <span className="text-foreground truncate max-w-[150px] font-mono">
                    {item.directory}
                  </span>
                </div>
              )}
              {libraryName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <HardDrive className="h-3 w-3" /> 來源庫
                  </span>
                  <span className="text-foreground truncate max-w-[150px] font-mono">
                    {libraryName}
                  </span>
                </div>
              )}
            </div>

            {/* Tags section */}
            <div className="space-y-1.5 pt-2 border-t border-border">
              <span className="text-xs uppercase text-muted-foreground">標籤</span>
              <div className="flex flex-wrap gap-1">
                {item.tags && item.tags.length > 0 ? (
                  item.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer text-[11px] hover:bg-white hover:text-black hover:border-white transition-none"
                      onClick={() => {
                        onTagClick?.(tag);
                        onClose();
                      }}
                    >
                      #{tag}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-neutral-600">無標籤</span>
                )}
              </div>
            </div>

            {/* Notes section */}
            {item.notes && (
              <div className="space-y-1 pt-2 border-t border-border">
                <span className="text-xs uppercase text-muted-foreground">客觀備註</span>
                <p className="text-xs text-neutral-300 font-serif leading-relaxed">
                  {item.notes}
                </p>
              </div>
            )}
          </div>

          {/* External URL if present */}
          {item.source_url && (
            <a
              href={item.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center space-x-1 w-full py-1.5 rounded-sm border border-border text-xs text-neutral-300 hover:text-white hover:border-neutral-500 transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              <span>來源連結</span>
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
