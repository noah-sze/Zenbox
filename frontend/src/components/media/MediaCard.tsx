import React, { useState, useRef, useEffect } from 'react';
import { MediaItem } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Film } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  item: MediaItem;
  onTagClick?: (tag: string) => void;
  onSelect?: (item: MediaItem) => void;
}

export const MediaCard: React.FC<MediaCardProps> = ({ item, onTagClick, onSelect }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHoverPreviewing, setIsHoverPreviewing] = useState(false);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const isImage = item.mime_type.startsWith('image/');
  const isVideo = item.mime_type.startsWith('video/');
  const isVisual = isImage || isVideo;
  const thumbnailUrl = `/api/media/${item.id}/thumbnail?size=sm`;
  const rawVideoUrl = `/api/media/${item.id}/raw`;

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

  // Format video duration
  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  // Hover video micro-preview handling
  const handleMouseEnter = () => {
    if (!isVideo) return;
    hoverTimerRef.current = setTimeout(() => {
      setIsHoverPreviewing(true);
    }, 350);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    if (isHoverPreviewing) {
      setIsHoverPreviewing(false);
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.currentTime = 0;
      }
    }
  };

  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) {
        clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  // Prevent layout shifts with exact aspect-ratio placeholder
  const aspectRatioStyle: React.CSSProperties =
    item.width > 0 && item.height > 0
      ? { aspectRatio: `${item.width} / ${item.height}` }
      : { aspectRatio: '4 / 3' };

  const handleClick = () => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
    }
    if (isHoverPreviewing) {
      setIsHoverPreviewing(false);
      if (previewVideoRef.current) {
        previewVideoRef.current.pause();
        previewVideoRef.current.removeAttribute('src');
        previewVideoRef.current.load();
      }
    }
    onSelect?.(item);
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="group relative flex flex-col overflow-hidden rounded-sm border border-border bg-card transition-colors hover:border-neutral-500 shadow-none cursor-pointer select-none font-mono w-full min-w-0"
    >
      {/* Media Aspect Ratio Container / Exact Placeholder */}
      <div
        style={aspectRatioStyle}
        className="relative w-full overflow-hidden bg-secondary flex items-center justify-center min-h-[90px] sm:min-h-[120px]"
      >
        {isVisual && !hasError ? (
          <>
            {/* Loading skeleton pulse prior to decode */}
            {!isLoaded && (
              <div className="absolute inset-0 bg-neutral-900 animate-pulse flex items-center justify-center">
                <span className="text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
                  {item.filename.split('.').pop()}
                </span>
              </div>
            )}

            {/* Poster Thumbnail */}
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

            {/* Hover Video Scrubbing Preview */}
            {isVideo && isHoverPreviewing && (
              <video
                ref={previewVideoRef}
                src={rawVideoUrl}
                autoPlay
                muted
                loop
                playsInline
                className="absolute inset-0 h-full w-full object-cover z-10"
              />
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center p-3 text-center">
            <div className="w-8 h-8 rounded-sm border border-border flex items-center justify-center text-muted-foreground mb-1.5">
              <span className="text-[9px] uppercase font-mono">{item.filename.split('.').pop()}</span>
            </div>
            <span className="text-xs font-semibold text-foreground truncate max-w-[160px]">
              {item.title}
            </span>
          </div>
        )}

        {/* Video Icon Badge (top-left) */}
        {isVideo && (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white flex items-center gap-1 z-20">
            <Film className="h-3 w-3" />
            <span>影片</span>
          </div>
        )}

        {/* Duration / Resolution indicator tag (bottom-right of preview) */}
        {isVideo && item.duration > 0 ? (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white z-20">
            {formatDuration(item.duration)}
          </div>
        ) : item.width > 0 && item.height > 0 ? (
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-[2px] border border-white/10 text-[9px] font-mono text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {item.width}×{item.height}
          </div>
        ) : null}
      </div>

      {/* Metadata & Tag Footer */}
      <div className="flex flex-col p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 border-t border-border bg-black">
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground gap-1">
          <span className="truncate max-w-[80px] sm:max-w-[120px] font-mono">{formatSize(item.file_size)}</span>
          <span className="font-mono shrink-0">{formatDate(item.added_at)}</span>
        </div>

        {/* Tags badge list */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="cursor-pointer text-[9px] sm:text-[10px] py-0 px-1 sm:px-1.5 hover:bg-white hover:text-black hover:border-white transition-none shrink-0"
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
