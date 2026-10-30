import React, { useState } from 'react';
import { MediaItem } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  item: MediaItem;
  onTagClick?: (tag: string) => void;
  onSelect?: (item: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, onTagClick, onSelect }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Format file size in KB or MB
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date concisely
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // Prevent layout shifts with exact aspect-ratio placeholder
  const aspectRatioStyle: React.CSSProperties =
    item.width > 0 && item.height > 0
      ? { aspectRatio: `${item.width} / ${item.height}` }
      : { aspectRatio: '4 / 3' };

  const isImage = item.mime_type.startsWith('image/');
  const thumbnailUrl = `/api/media/${item.id}/thumbnail?size=sm`;

  return (
    <div
      onClick={() => onSelect?.(item)}
      className="group relative flex flex-col overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-neutral-500 shadow-none cursor-pointer select-none"
    >
      {/* Media Aspect Ratio Container / Exact Placeholder */}
      <div
        style={aspectRatioStyle}
        className="relative w-full overflow-hidden bg-secondary flex items-center justify-center min-h-[140px]"
      >
        {isImage && !hasError ? (
          <>
            {/* Loading skeleton pulse prior to decode */}
            {!isLoaded && (
              <div className="absolute inset-0 bg-neutral-900 animate-pulse flex items-center justify-center">
                <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
                  {item.filename.split('.').pop()}
                </span>
              </div>
            )}
            {/* Sharp WebP Thumbnail */}
            <img
              src={thumbnailUrl}
              alt={item.title}
              loading="lazy"
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
              className={cn(
                'h-full w-full object-cover transition-opacity duration-150',
                isLoaded ? 'opacity-100' : 'opacity-0'
              )}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-4 text-center">
            <div className="w-10 h-10 rounded-sm border border-border flex items-center justify-center text-muted-foreground mb-2">
              <span className="text-[10px] uppercase font-mono">{item.filename.split('.').pop()}</span>
            </div>
            <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">{item.title}</span>
          </div>
        )}

        {/* Resolution tag indicator if available */}
        {item.width > 0 && item.height > 0 && (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-[2px] border border-white/10 text-[9px] font-mono text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity">
            {item.width}×{item.height}
          </div>
        )}
      </div>

      {/* Metadata & Tag Footer */}
      <div className="flex flex-col p-3 space-y-2 border-t border-border bg-black">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="truncate max-w-[120px] font-mono">{formatSize(item.file_size)}</span>
          <span className="font-mono">{formatDate(item.added_at)}</span>
        </div>

        {/* Tags badge list */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="cursor-pointer text-[10px] py-0 px-1.5 hover:bg-white hover:text-black hover:border-white transition-none"
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
              >
                #{tag}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
