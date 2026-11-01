import React, { useMemo, useState, useEffect } from 'react';
import { MediaItem, Collection } from '@/types/media';
import { MediaCard } from './MediaCard';
import { CollectionCard } from './CollectionCard';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

export type DisplayGridItem =
  | { type: 'collection'; data: Collection }
  | { type: 'media'; data: MediaItem };

interface MasonryGridProps {
  items: MediaItem[];
  collections?: Collection[];
  isCollectionOnly?: boolean;
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onTagClick?: (tag: string) => void;
  onSelect?: (item: MediaItem) => void;
  onSelectCollection?: (collection: Collection) => void;
  selectedIds?: Set<number>;
  onToggleSelectMedia?: (e: React.MouseEvent, item: MediaItem) => void;
  isSelectionMode?: boolean;
}

export const MasonryGrid: React.FC<MasonryGridProps> = ({
  items,
  collections = [],
  isCollectionOnly = false,
  isLoading,
  hasMore,
  onLoadMore,
  onTagClick,
  onSelect,
  onSelectCollection,
  selectedIds,
  onToggleSelectMedia,
  isSelectionMode = false,
}) => {
  const { sentinelRef } = useInfiniteScroll({
    hasMore,
    isLoading,
    onLoadMore,
  });

  // Helper to determine column count based on viewport width
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

  // Prepare unified list of items to display
  const combinedItems: DisplayGridItem[] = useMemo(() => {
    if (isCollectionOnly) {
      return collections.map((col) => ({ type: 'collection', data: col }));
    }

    // In mixed view:
    // If a media item already belongs to a collection, we can represent the collection as a single card
    // and exclude individual member items so that posts don't appear fragmented.
    const collectionCards: DisplayGridItem[] = collections.map((col) => ({
      type: 'collection',
      data: col,
    }));

    // Find all media items that are not part of any collection
    const standaloneMedia: DisplayGridItem[] = items
      .filter((it) => !it.collection_id)
      .map((it) => ({ type: 'media', data: it }));

    // Merge and sort by added_at / created_at descending
    return [...collectionCards, ...standaloneMedia].sort((a, b) => {
      const timeA = a.type === 'collection' ? a.data.created_at : a.data.added_at;
      const timeB = b.type === 'collection' ? b.data.created_at : b.data.added_at;
      return new Date(timeB).getTime() - new Date(timeA).getTime();
    });
  }, [items, collections, isCollectionOnly]);

  // Distribute items into columns to maintain balanced height without layout shifts
  const columns = useMemo(() => {
    const cols: DisplayGridItem[][] = Array.from({ length: columnCount }, () => []);
    combinedItems.forEach((item, index) => {
      cols[index % columnCount].push(item);
    });
    return cols;
  }, [combinedItems, columnCount]);

  if (!isLoading && combinedItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center border border-dashed border-border rounded-sm p-8">
        <span className="text-sm font-mono text-muted-foreground">
          {isCollectionOnly ? '無合集' : '無媒體'}
        </span>
        <span className="text-xs font-mono text-neutral-600 mt-1">
          {isCollectionOnly ? '可在上傳時選取多個檔案建立合集' : '請將檔案放置於 /storage/originals'}
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
            {columnItems.map((entry) => {
              if (entry.type === 'collection') {
                return (
                  <CollectionCard
                    key={`col-${entry.data.id}`}
                    collection={entry.data}
                    onTagClick={onTagClick}
                    onSelect={onSelectCollection}
                  />
                );
              }
              return (
                <MediaCard
                  key={`med-${entry.data.id}`}
                  item={entry.data}
                  onTagClick={onTagClick}
                  onSelect={onSelect}
                  isSelected={selectedIds?.has(entry.data.id)}
                  onToggleSelect={onToggleSelectMedia}
                  isSelectionMode={isSelectionMode}
                />
              );
            })}
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
