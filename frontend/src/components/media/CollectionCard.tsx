import React, { useState, useRef } from 'react';
import { Collection, MediaItem } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Layers, Film, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CollectionCardProps {
  collection: Collection;
  onTagClick?: (tag: string) => void;
  onSelect?: (collection: Collection) => void;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({
  collection,
  onTagClick,
  onSelect,
}) => {
  const [hoverIndex, setHoverIndex] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const items = collection.items || [];
  const previewItems = items.length > 0 ? items : collection.cover ? [collection.cover] : [];
  const coverItem =
    (collection.cover_media_id && items.find((m) => m.id === collection.cover_media_id)) ||
    collection.cover ||
    previewItems[0];
  const activeItem: MediaItem | undefined = isScrubbing
    ? previewItems[hoverIndex] || coverItem
    : coverItem;

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // Mixed media count breakdown
  const countLabel = (() => {
    const parts: string[] = [];
    if (collection.image_count > 0) parts.push(`${collection.image_count} 圖`);
    if (collection.video_count > 0) parts.push(`${collection.video_count} 片`);
    if (parts.length === 0) return `${collection.item_count} 項目`;
    return `${collection.item_count} 項目 (${parts.join(' · ')})`;
  })();

  // Aspect ratio calculation from active preview item
  const aspectRatioStyle: React.CSSProperties =
    activeItem && activeItem.width > 0 && activeItem.height > 0
      ? { aspectRatio: `${activeItem.width} / ${activeItem.height}` }
      : { aspectRatio: '4 / 3' };

  // Mouse move scrub preview across items
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (previewItems.length <= 1 || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const ratio = x / rect.width;
    const targetIdx = Math.min(
      previewItems.length - 1,
      Math.floor(ratio * previewItems.length)
    );
    setHoverIndex(targetIdx);
  };

  const handleMouseEnter = () => {
    setIsScrubbing(true);
  };

  const handleMouseLeave = () => {
    setIsScrubbing(false);
    setHoverIndex(0);
  };

  const thumbnailUrl = activeItem
    ? `/api/media/${activeItem.id}/thumbnail?size=sm`
    : '';

  return (
    <div
      onClick={() => onSelect?.(collection)}
      className="group relative flex flex-col overflow-hidden rounded-sm border border-neutral-700 bg-card transition-colors hover:border-white shadow-none cursor-pointer select-none font-mono w-full min-w-0"
    >
      {/* Stacked Album Perception: Top and Right 1px offset layered border accents */}
      <div className="absolute top-0 right-0 w-3 h-3 border-b border-l border-white/20 bg-neutral-900 pointer-events-none z-20" />

      {/* Main Preview Container with Scrubbing */}
      <div
        ref={containerRef}
        style={aspectRatioStyle}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onMouseMove={handleMouseMove}
        className="relative w-full overflow-hidden bg-secondary flex items-center justify-center min-h-[100px] sm:min-h-[130px]"
      >
        {activeItem ? (
          <img
            src={thumbnailUrl}
            alt={collection.title}
            loading="lazy"
            className="h-full w-full object-cover transition-opacity duration-150"
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-3 text-center text-muted-foreground">
            <Layers className="h-6 w-6 mb-1 text-neutral-500" />
            <span className="text-xs">合集</span>
          </div>
        )}

        {/* Top-left: Collection Stack Badge */}
        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/85 backdrop-blur-[2px] border border-white/20 text-[10px] font-mono text-white flex items-center gap-1.5 z-20">
          <Layers className="h-3 w-3 text-white" />
          <span className="font-semibold">{collection.item_count}</span>
        </div>

        {/* Top-right: Active item type badge when scrubbing */}
        {activeItem && isScrubbing && (
          <div className="absolute top-2 right-5 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[9px] font-mono text-neutral-300 flex items-center gap-1 z-20">
            {activeItem.mime_type.startsWith('video/') ? (
              <>
                <Film className="h-2.5 w-2.5" />
                <span>片 {hoverIndex + 1}/{previewItems.length}</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-2.5 w-2.5" />
                <span>圖 {hoverIndex + 1}/{previewItems.length}</span>
              </>
            )}
          </div>
        )}

        {/* Bottom scrub timeline dots if more than 1 item and hovered */}
        {previewItems.length > 1 && isScrubbing && (
          <div className="absolute bottom-2 inset-x-2 flex items-center justify-center gap-1 z-20 bg-black/60 py-0.5 rounded-sm backdrop-blur-[2px]">
            {previewItems.map((_, idx) => (
              <span
                key={idx}
                className={cn(
                  'h-1 rounded-none transition-none',
                  idx === hoverIndex ? 'w-4 bg-white' : 'w-1.5 bg-neutral-600'
                )}
              />
            ))}
          </div>
        )}
      </div>

      {/* Metadata & Tag Footer */}
      <div className="flex flex-col p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 border-t border-border bg-card">
        {/* Title */}
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-xs sm:text-sm font-semibold text-foreground tracking-tight truncate flex-1">
            {collection.title}
          </h4>
        </div>

        {/* Size & Item Breakdown */}
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground gap-1">
          <span className="truncate max-w-[150px] font-mono text-neutral-400">
            {countLabel} · {formatSize(collection.total_bytes)}
          </span>
          <span className="font-mono shrink-0">{formatDate(collection.created_at)}</span>
        </div>

        {/* Notes preview if present */}
        {collection.notes && (
          <p className="text-[11px] text-neutral-400 font-serif line-clamp-1 border-l border-neutral-700 pl-1.5 my-0.5">
            {collection.notes}
          </p>
        )}

        {/* Collection tags badge list */}
        {collection.tags && collection.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {collection.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="cursor-pointer text-[9px] sm:text-[10px] py-0 px-1 sm:px-1.5 hover:bg-foreground hover:text-background hover:border-foreground transition-none shrink-0"
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
