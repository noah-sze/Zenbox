import React, { useState, useRef, useEffect } from 'react';
import { MediaItem } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import {
  Film,
  Check,
  FileText,
  FileCode,
  FileSpreadsheet,
  Archive,
  File,
  Music,
  Globe,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface MediaCardProps {
  item: MediaItem;
  onTagClick?: (tag: string) => void;
  onSelect?: (item: MediaItem) => void;
  isSelected?: boolean;
  onToggleSelect?: (e: React.MouseEvent, item: MediaItem) => void;
  isSelectionMode?: boolean;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  item,
  onTagClick,
  onSelect,
  isSelected = false,
  onToggleSelect,
  isSelectionMode = false,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isHoverPreviewing, setIsHoverPreviewing] = useState(false);

  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const isBookmarkItem = item.mime_type === 'application/x-url' || item.filename.endsWith('.url') || item.filename.endsWith('.webloc');
  const hasSnapshot = isBookmarkItem && item.width > 0 && item.height > 0;
  const isImage = item.mime_type.startsWith('image/');
  const isVideo = item.mime_type.startsWith('video/');
  const isVisual = isImage || isVideo || hasSnapshot;
  const ext = ('.' + (item.filename.split('.').pop() || '')).toLowerCase();
  const thumbnailUrl = `/api/media/${item.id}/thumbnail?size=sm`;
  const rawVideoUrl = `/api/media/${item.id}/raw`;

  const getDocumentIcon = (extension: string, mime: string) => {
    if (['.pdf', '.doc', '.docx', '.txt', '.md', '.markdown', '.rtf', '.epub'].includes(extension)) {
      return <FileText className="h-6 w-6 stroke-[1.5]" />;
    }
    if (['.xls', '.xlsx', '.csv'].includes(extension)) {
      return <FileSpreadsheet className="h-6 w-6 stroke-[1.5]" />;
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(extension)) {
      return <Archive className="h-6 w-6 stroke-[1.5]" />;
    }
    if (
      ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.json', '.html', '.css', '.sh', '.bash'].includes(
        extension
      )
    ) {
      return <FileCode className="h-6 w-6 stroke-[1.5]" />;
    }
    if (mime.startsWith('audio/') || ['.mp3', '.wav', '.flac', '.ogg', '.m4a'].includes(extension)) {
      return <Music className="h-6 w-6 stroke-[1.5]" />;
    }
    return <File className="h-6 w-6 stroke-[1.5]" />;
  };

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

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey || isSelectionMode) {
      e.stopPropagation();
      onToggleSelect?.(e, item);
      return;
    }

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
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-sm border bg-card transition-colors shadow-none cursor-pointer select-none font-mono w-full min-w-0',
        isSelected
          ? 'border-foreground ring-1 ring-foreground'
          : 'border-border hover:border-neutral-500'
      )}
    >
      {/* Multi-Select Checkbox overlay */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleSelect?.(e, item);
        }}
        className={cn(
          'absolute top-2 right-2 h-5 w-5 rounded-sm border flex items-center justify-center transition-all z-30',
          isSelected
            ? 'bg-foreground border-foreground text-background opacity-100'
            : isSelectionMode
            ? 'bg-black/60 border-white/60 text-transparent opacity-90 hover:opacity-100 hover:border-white'
            : 'bg-black/60 border-white/40 text-transparent opacity-0 group-hover:opacity-100 hover:border-white'
        )}
        title={isSelected ? '取消選取' : '選取'}
      >
        <Check className={cn('h-3.5 w-3.5 stroke-[3]', isSelected ? 'opacity-100' : 'opacity-0')} />
      </button>

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
          <div className="flex flex-col items-center justify-center p-4 text-center w-full h-full select-none">
            <div className="flex flex-col items-center justify-center space-y-2">
              <div className="h-11 w-11 rounded-sm border border-border bg-card flex items-center justify-center text-foreground group-hover:border-foreground/40 transition-colors">
                {isBookmarkItem ? <Globe className="h-6 w-6 stroke-[1.5]" /> : getDocumentIcon(ext, item.mime_type)}
              </div>
              <span className="px-2 py-0.5 rounded-sm bg-secondary text-[10px] font-mono font-bold tracking-widest uppercase border border-border text-foreground">
                {isBookmarkItem ? 'URL' : (ext.replace('.', '') || 'FILE')}
              </span>
            </div>
            <span className="text-xs font-medium text-foreground truncate max-w-[85%] mt-2.5">
              {item.title || item.filename}
            </span>
            {isBookmarkItem && item.bookmark?.domain && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[80%] mt-0.5">
                {item.bookmark.domain}
              </span>
            )}
          </div>
        )}

        {/* Media Type Badge (top-left) */}
        {isVideo ? (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white flex items-center gap-1 z-20">
            <Film className="h-3 w-3" />
            <span>影片</span>
          </div>
        ) : isBookmarkItem ? (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white flex items-center gap-1 z-20">
            <Globe className="h-3 w-3" />
            <span className="truncate max-w-[120px]">{item.bookmark?.domain || '書籤'}</span>
          </div>
        ) : !isVisual ? (
          <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white flex items-center gap-1 z-20">
            <FileText className="h-3 w-3" />
            <span>文件</span>
          </div>
        ) : null}

        {/* Duration / Resolution indicator tag (bottom-right of preview) */}
        {isVideo && item.duration > 0 ? (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[10px] font-mono text-white z-20">
            {formatDuration(item.duration)}
          </div>
        ) : item.width > 0 && item.height > 0 ? (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded-sm bg-black/70 backdrop-blur-[2px] border border-white/10 text-[9px] font-mono text-neutral-400 opacity-0 group-hover:opacity-100 transition-opacity z-20">
            {item.width}×{item.height}
          </div>
        ) : null}
      </div>

      {/* Metadata & Tag Footer */}
      <div className="flex flex-col p-2.5 sm:p-3 space-y-1.5 sm:space-y-2 border-t border-border bg-card">
        <div className="flex items-center justify-between text-[10px] sm:text-[11px] text-muted-foreground gap-1">
          <span className="truncate max-w-[80px] sm:max-w-[120px] font-mono">
            {isBookmarkItem ? (item.bookmark?.domain || '書籤') : formatSize(item.file_size)}
          </span>
          <span className="font-mono shrink-0">{formatDate(item.added_at)}</span>
        </div>

        {/* Tags badge list */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {item.tags.map((tag) => (
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
