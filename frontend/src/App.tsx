import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar, MediaTypeFilter } from '@/components/layout/AppSidebar';
import { Header } from '@/components/layout/Header';
import { MasonryGrid } from '@/components/media/MasonryGrid';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { LibraryManageDialog } from '@/components/library/LibraryManageDialog';
import { CreateFolderDialog } from '@/components/folder/CreateFolderDialog';
import { FolderDetailDialog } from '@/components/folder/FolderDetailDialog';
import { FolderOverviewDialog } from '@/components/folder/FolderOverviewDialog';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { MediaItem, Tag, Library, DirectoryDetail } from '@/types/media';

export const App: React.FC = () => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [directories, setDirectories] = useState<DirectoryDetail[]>([]);
  const [activeDirectory, setActiveDirectory] = useState<string | null>(null);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);

  // Folder Dialog states
  const [selectedDirForDetail, setSelectedDirForDetail] = useState<DirectoryDetail | null>(null);
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState<boolean>(false);
  const [isFolderOverviewOpen, setIsFolderOverviewOpen] = useState<boolean>(false);
  const [createFolderDefaults, setCreateFolderDefaults] = useState<{
    libraryId?: number;
    parentDir?: string;
  }>({});

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

  // Fetch Directories list with stats
  const fetchDirectories = useCallback(async () => {
    try {
      const res = await fetch('/api/directories');
      if (res.ok) {
        const json = (await res.json()) as { data: DirectoryDetail[] };
        setDirectories(json.data || []);
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

  // Fetch Media list with library, tags, and directory filter
  const fetchMedia = useCallback(
    async (
      targetPage: number,
      tags: string[],
      libraryId: number | null,
      dir: string | null,
      append = false
    ) => {
      setIsLoading(true);
      try {
        const tagParam = tags.length > 0 ? `&tags=${encodeURIComponent(tags.join(','))}` : '';
        const libParam = libraryId !== null ? `&libraryId=${libraryId}` : '';
        const dirParam = dir !== null ? `&dir=${encodeURIComponent(dir)}` : '';
        const res = await fetch(
          `/api/media?page=${targetPage}&limit=24${tagParam}${libParam}${dirParam}`
        );
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
    fetchDirectories();
    fetchTags();
  }, [fetchLibraries, fetchDirectories, fetchTags]);

  // Query media whenever activeTags, activeLibraryId, or activeDirectory changes
  useEffect(() => {
    setPage(1);
    fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
  }, [fetchMedia, activeTags, activeLibraryId, activeDirectory]);

  // Load next page for infinite scroll
  const handleLoadMore = useCallback(() => {
    if (!isLoading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchMedia(nextPage, activeTags, activeLibraryId, activeDirectory, true);
    }
  }, [page, isLoading, hasMore, activeTags, activeLibraryId, activeDirectory, fetchMedia]);

  // Tag filter toggle
  const handleToggleTag = (tag: string) => {
    setActiveTags((prev) => {
      if (prev.includes(tag)) {
        return prev.filter((t) => t !== tag);
      }
      return [...prev, tag];
    });
  };

  // Directory filter selection (Library root or subdirectory)
  const handleSelectDirectory = (dir: string | null, libraryId?: number) => {
    if (dir === null) {
      setActiveDirectory(null);
      if (libraryId === undefined) {
        setActiveLibraryId(null);
      }
    } else {
      setActiveDirectory(dir);
      if (libraryId !== undefined) {
        setActiveLibraryId(libraryId);
      }
    }
  };

  // Full manual sync
  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      await fetch('/api/sync', { method: 'POST' });
      await fetchLibraries();
      await fetchDirectories();
      await fetchTags();
      await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
    } finally {
      setIsSyncing(false);
    }
  };

  // Open Create Folder Dialog helper
  const handleOpenCreateFolder = (libraryId?: number, parentDir?: string) => {
    setCreateFolderDefaults({
      libraryId: libraryId || (activeLibraryId !== null ? activeLibraryId : undefined),
      parentDir: parentDir || '',
    });
    setIsCreateFolderOpen(true);
  };

  // Callback when folder is created
  const handleFolderCreated = async (createdDir: DirectoryDetail) => {
    await fetchDirectories();
    setActiveLibraryId(createdDir.libraryId);
    setActiveDirectory(createdDir.directory);
  };

  // Filter items by mediaType (all, image, video)
  const displayedItems = useMemo(() => {
    if (mediaTypeFilter === 'image') {
      return items.filter((item) => item.mime_type.startsWith('image/'));
    }
    if (mediaTypeFilter === 'video') {
      return items.filter((item) => item.mime_type.startsWith('video/'));
    }
    return items;
  }, [items, mediaTypeFilter]);

  return (
    <SidebarProvider defaultOpen={true}>
      {/* Collapsible Left Sidebar with Integrated Library & Folder Tree View */}
      <AppSidebar
        mediaCount={items.length}
        availableTags={availableTags}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        onClearTags={() => setActiveTags([])}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        onSelectLibrary={(id) => {
          setActiveLibraryId(id);
          setActiveDirectory(null);
        }}
        onOpenLibraries={() => setIsLibraryOpen(true)}
        directories={directories}
        activeDirectory={activeDirectory}
        onSelectDirectory={handleSelectDirectory}
        onOpenCreateFolder={handleOpenCreateFolder}
        onOpenFolderOverview={() => setIsFolderOverviewOpen(true)}
        onOpenFolderDetail={setSelectedDirForDetail}
        mediaTypeFilter={mediaTypeFilter}
        onSelectMediaType={setMediaTypeFilter}
        isSyncing={isSyncing}
        onTriggerSync={handleTriggerSync}
      />

      {/* Main Content Area */}
      <SidebarInset>
        {/* Streamlined Header with Hierarchical Breadcrumb */}
        <Header
          onOpenCommand={() => setIsCommandOpen(true)}
          onTriggerSync={handleTriggerSync}
          isSyncing={isSyncing}
          libraries={libraries}
          activeLibraryId={activeLibraryId}
          activeDirectory={activeDirectory}
          mediaTypeFilter={mediaTypeFilter}
          onNavigateRoot={() => {
            setActiveLibraryId(null);
            setActiveDirectory(null);
          }}
          onNavigateLibrary={(libId) => {
            setActiveLibraryId(libId);
            setActiveDirectory('');
          }}
          onNavigateDirectory={(dir, libId) => {
            setActiveLibraryId(libId);
            setActiveDirectory(dir);
          }}
        />

        {/* Main Scrollable Canvas with direct Masonry Grid */}
        <div className="flex-1 w-full px-2.5 sm:px-6 py-4 space-y-4 max-w-[2000px] mx-auto font-mono">
          {/* Masonry Grid with Infinite Scroll */}
          <MasonryGrid
            items={displayedItems}
            isLoading={isLoading}
            hasMore={hasMore}
            onLoadMore={handleLoadMore}
            onTagClick={handleToggleTag}
            onSelect={setSelectedItem}
          />
        </div>
      </SidebarInset>

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
          await fetchDirectories();
          await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
        }}
      />

      {/* Create Folder Dialog */}
      <CreateFolderDialog
        open={isCreateFolderOpen}
        onClose={() => setIsCreateFolderOpen(false)}
        libraries={libraries}
        defaultLibraryId={createFolderDefaults.libraryId}
        defaultParentDir={createFolderDefaults.parentDir}
        onFolderCreated={handleFolderCreated}
      />

      {/* Single Folder Detail Dialog */}
      <FolderDetailDialog
        directory={selectedDirForDetail}
        onClose={() => setSelectedDirForDetail(null)}
        onSelectDirectory={(dir) => handleSelectDirectory(dir.directory, dir.libraryId)}
        onCreateSubfolder={(dir) => handleOpenCreateFolder(dir.libraryId, dir.directory)}
      />

      {/* All Libraries Folders Overview Dialog */}
      <FolderOverviewDialog
        open={isFolderOverviewOpen}
        onClose={() => setIsFolderOverviewOpen(false)}
        directories={directories}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        onSelectDirectory={(dir) => handleSelectDirectory(dir.directory, dir.libraryId)}
        onOpenCreate={(libId, parentDir) => handleOpenCreateFolder(libId, parentDir)}
        onOpenDetail={setSelectedDirForDetail}
        onRefresh={fetchDirectories}
      />

      {/* Media Detail Instant Pop Dialog */}
      <MediaDetailDialog
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onTagClick={handleToggleTag}
        libraries={libraries}
      />
    </SidebarProvider>
  );
};

export default App;
