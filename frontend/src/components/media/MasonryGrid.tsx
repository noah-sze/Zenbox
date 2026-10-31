import React, { useMemo, useState, useEffect } from 'react';
import { MediaItem } from '@/types/media';
import { MediaCard } from './MediaCard';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface MasonryGridProps {
  items: MediaItem[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onTagClick?: (tag: string) => void;
  onSelect?: (item: MediaItem) => void;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({
  items,
  isLoading,
  hasMore,
  onLoadMore,
  onTagClick,
  onSelect,
}) => {
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading,
    onLoadMore,
  });

  // Helper to determine column count based on viewport width (Option A)
  const getColumnCount = (width: number): number => {
    if (width < 640) return 2; // 手機版最少 2 列
    if (width < 900) return 3; // 平板 / 大手機橫向
    if (width < 1200) return 4; // 小型桌面 / 開啟側邊欄時
    if (width < 1600) return 5; // 標準 1080p 桌面
    if (width < 2000) return 6; // 寬螢幕 / 2K
    if (width < 2400) return 7; // 超寬螢幕
    return 8;
  };

  // Calculate dynamic column count based on viewport width
  const [columnCount, setColumnCount] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return getColumnCount(window.innerWidth);
    }
    return 2;
  });

  useEffect(() => {
    const updateColumns = () => {
      setColumnCount(getColumnCount(window.innerWidth));
    };

    updateColumns();
    window.addEventListener('resize', updateColumns);
    return () => window.removeEventListener('resize', updateColumns);
  }, []);

  // Distribute items into columns to maintain balanced height without layout shifts
  const columns = useMemo(() => {
    const cols: MediaItem[][] = Array.from({ length: columnCount }, () => []);
    items.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [items, columnCount]);

  if (!isLoading && items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed border-border rounded-sm p-8">
        <span className="text-sm font-mono text-muted-foreground">無媒體</span>
        <span className="text-xs font-mono text-neutral-600 mt-1">
          請將檔案放置於 /storage/originals
        </span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Masonry Columns - strict equal width and uniform shrinkage */}
      <div
        className="grid gap-2.5 sm:gap-4 items-start w-full"
        style={{
          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
        }}
      >
        {columns.map((columnItems, colIdx) => (
          <div key={`col-${colIdx}`} className="min-w-0 flex flex-col gap-2.5 sm:gap-4 w-full">
            {columnItems.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onTagClick={onTagClick}
                onSelect={onSelect}
              />
            ))}
          </div>
        ))}
      </div>

      {/* Loading Skeleton Indicator */}
      {isLoading && (
        <div
          className="grid gap-2.5 sm:gap-4 pt-4"
          style={{
            gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: Math.min(columnCount * 2, 8) }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="h-48 rounded-sm border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="h-6 w-full" />
    </div>
  );
};
