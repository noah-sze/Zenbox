import React, { useState, useEffect, useCallback } from 'react';
import { Header } from '@/components/layout/Header';
import { MasonryGrid } from '@/components/media/MasonryGrid';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { LibraryManageDialog } from '@/components/library/LibraryManageDialog';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { Badge } from '@/components/ui/badge';
import { MediaItem, Tag, Library } from '@/types/media';

export const App: React.FC = () => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  // Fetch Libraries list
  const fetchLibraries = useCallback(async () => {
    try {
      const res = await fetch('/api/libraries');
      if (res.ok) {
        const json = (await res.json()) as { data: Library[] };
        setLibraries(json.data || []);
      }
    } catch {
      // Offline fallback handling
    }
  }, []);

  // Fetch Tags list
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags');
      if (res.ok) {
        const json = (await res.json()) as { data: Tag[] };
        setAvailableTags(json.data || []);
      }
    } catch {
      // Offline fallback handling
    }
  }, []);

  // Fetch Media list
  const fetchMedia = useCallback(
    async (targetPage: number, tags: string[], libraryId: number | null, append = false) => {
      setIsLoading(true);
      try {
        const tagParam = tags.length > 0 ? `&tags=${encodeURIComponent(tags.join(','))}` : '';
        const libParam = libraryId !== null ? `&libraryId=${libraryId}` : '';
        const res = await fetch(`/api/media?page=${targetPage}&limit=24${tagParam}${libParam}`);
        if (res.ok) {
          const json = (await res.json()) as { data: MediaItem[]; count: number };
          const newItems = json.data || [];
          setItems((prev) => (append ? [...prev, ...newItems] : newItems));
          setHasMore(newItems.length >= 24);
        } else {
          setHasMore(false);
        }
      } catch {
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Initial load
  useEffect(() => {
    fetchLibraries();
    fetchTags();
  }, [fetchLibraries, fetchTags]);

  // Query media whenever activeTags or activeLibraryId changes
  useEffect(() => {
    setPage(1);
    fetchMedia(1, activeTags, activeLibraryId, false);
  }, [fetchMedia, activeTags, activeLibraryId]);

  // Load next page for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMedia(nextPage, activeTags, activeLibraryId, true);
    }
  }, [page, isLoading, hasMore, activeTags, activeLibraryId, fetchMedia]);

  // Tag filter toggle
  const handleToggleTag = (tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  // Full manual sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchLibraries();
      await fetchTags();
      await fetchMedia(1, activeTags, activeLibraryId, false);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-black text-white">
      {/* Header with Safe Area support */}
      <Header
        mediaCount={items.length}
        onOpenCommand={() => setIsCommandOpen(true)}
        onTriggerSync={handleTriggerSync}
        isSyncing={isSyncing}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        onSelectLibrary={setActiveLibraryId}
        onOpenLibraries={() => setIsLibraryOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-4">
        {/* Active Tag Filter Bar */}
        {availableTags.length > 0 && (
          <div className="flex items-center space-x-2 overflow-x-auto pb-2 scrollbar-none font-mono">
            <span className="text-xs text-muted-foreground uppercase shrink-0">標籤:</span>
            <div className="flex items-center space-x-1.5 flex-wrap gap-y-1.5">
              {availableTags.map((tag) => {
                const isActive = activeTags.includes(tag.name);
                return (
                  <Badge
                    key={tag.id}
                    variant={isActive ? 'active' : 'outline'}
                    className="cursor-pointer transition-none text-xs"
                    onClick={() => handleToggleTag(tag.name)}
                  >
                    #{tag.name} {tag.count !== undefined && `(${tag.count})`}
                  </Badge>
                );
              })}
              {activeTags.length > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTags([])}
                  className="text-xs text-muted-foreground hover:text-white underline ml-2"
                >
                  清除過濾
                </button>
              )}
            </div>
          </div>
        )}

        {/* Masonry Grid with Infinite Scroll */}
        <MasonryGrid
          items={items}
          isLoading={isLoading}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onTagClick={handleToggleTag}
          onSelect={setSelectedItem}
        />
      </main>

      {/* Desktop Command Palette (Cmd+K) */}
      <CommandPalette
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        availableTags={availableTags.map((t) => t.name)}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        onTriggerSync={handleTriggerSync}
      />

      {/* Storage Libraries Management Dialog */}
      <LibraryManageDialog
        open={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        libraries={libraries}
        onLibrariesChanged={async () => {
          await fetchLibraries();
          await fetchMedia(1, activeTags, activeLibraryId, false);
        }}
      />

      {/* Media Detail Instant Pop Dialog */}
      <MediaDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onTagClick={handleToggleTag}
        libraries={libraries}
      />
    </div>
  );
};

export default App;

