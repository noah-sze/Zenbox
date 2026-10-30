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

  // Calculate dynamic column count based on viewport width
  const [columnCount, setColumnCount] = useState<number>(3);

  useEffect(() => {
    const updateColumns = () => {
      const width = window.innerWidth;
      if (width < 640) {
        setColumnCount(1); // Mobile
      } else if (width < 1024) {
        setColumnCount(2); // Tablet
      } else if (width < 1440) {
        setColumnCount(3); // Standard Desktop
      } else {
        setColumnCount(4); // Ultrawide Desktop
      }
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
      {/* Masonry Columns */}
      <div className="flex gap-4 items-start w-full">
        {columns.map((columnItems, colIdx) => (
          <div key={`col-${colIdx}`} className="flex-1 flex flex-col gap-4">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={`skeleton-${i}`}
              className="h-56 rounded-sm border border-border bg-card animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Infinite Scroll Sentinel */}
      <div ref={sentinelRef} className="h-6 w-full" />
    </div>
  );
};
