import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar, MediaTypeFilter } from '@/components/layout/AppSidebar';
import { Header } from '@/components/layout/Header';
import { MasonryGrid } from '@/components/media/MasonryGrid';
import { MediaDetailDialog } from '@/components/media/MediaDetailDialog';
import { CollectionDetailDialog } from '@/components/media/CollectionDetailDialog';
import { AssetCreateDialog, CreateAssetTab } from '@/components/media/AssetCreateDialog';
import { LibraryManageDialog } from '@/components/library/LibraryManageDialog';
import { CreateFolderDialog } from '@/components/folder/CreateFolderDialog';
import { FolderDetailDialog } from '@/components/folder/FolderDetailDialog';
import { FolderOverviewDialog } from '@/components/folder/FolderOverviewDialog';
import { CommandPalette } from '@/components/palette/CommandPalette';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { TrashView } from '@/components/trash/TrashView';
import { BatchActionBar } from '@/components/batch/BatchActionBar';
import { useToast } from '@/components/ui/toast';
import { MediaItem, Tag, Library, DirectoryDetail, Collection } from '@/types/media';
import { getStoredThemeSettings, applyThemeSettings } from '@/lib/theme';

export const App: React.FC = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<MediaItem[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [availableTags, setAvailableTags] = useState<Tag[]>([]);
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [libraries, setLibraries] = useState<Library[]>([]);
  const [activeLibraryId, setActiveLibraryId] = useState<number | null>(null);
  const [directories, setDirectories] = useState<DirectoryDetail[]>([]);
  const [activeDirectory, setActiveDirectory] = useState<string | null>(null);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>('all');
  const [trashCount, setTrashCount] = useState<number>(0);
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<number>>(new Set());
  const [lastSelectedMediaId, setLastSelectedMediaId] = useState<number | null>(null);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isCommandOpen, setIsCommandOpen] = useState<boolean>(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isCreateAssetOpen, setIsCreateAssetOpen] = useState<boolean>(false);
  const [createAssetTab, setCreateAssetTab] = useState<CreateAssetTab>('collect');
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);

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

  // Fetch Trash count
  const fetchTrashCount = useCallback(async () => {
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const json = await res.json();
        if (json.data?.trash?.total !== undefined) {
          setTrashCount(json.data.trash.total);
        }
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

  // Fetch Collections list
  const fetchCollections = useCallback(
    async (tags: string[], libraryId: number | null, dir: string | null) => {
      try {
        const tagParam = tags.length > 0 ? `&tags=${encodeURIComponent(tags.join(','))}` : '';
        const libParam = libraryId !== null ? `&libraryId=${libraryId}` : '';
        const dirParam = dir !== null ? `&dir=${encodeURIComponent(dir)}` : '';
        const res = await fetch(`/api/collections?${tagParam}${libParam}${dirParam}`);
        if (res.ok) {
          const json = (await res.json()) as { data: Collection[] };
          setCollections(json.data || []);
        }
      } catch {
        // Offline fallback handling
      }
    },
    []
  );

  // Fetch single collection by ID and open modal
  const handleOpenCollectionById = useCallback(async (colId: number) => {
    try {
      const res = await fetch(`/api/collections/${colId}`);
      if (res.ok) {
        const json = (await res.json()) as { data: Collection };
        if (json.data) {
          setSelectedCollection(json.data);
        }
      }
    } catch {
      // Offline fallback handling
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLibraries();
    fetchDirectories();
    fetchTags();
    fetchTrashCount();
  }, [fetchLibraries, fetchDirectories, fetchTags, fetchTrashCount]);

  // Query media and collections whenever activeTags, activeLibraryId, or activeDirectory changes
  useEffect(() => {
    setPage(1);
    fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
    fetchCollections(activeTags, activeLibraryId, activeDirectory);
  }, [fetchMedia, fetchCollections, activeTags, activeLibraryId, activeDirectory]);

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
      await fetchCollections(activeTags, activeLibraryId, activeDirectory);
    } finally {
      setIsSyncing(false);
    }
  };

  // Global shortcut for Settings (Cmd+, or Ctrl+,)
  useEffect(() => {
    // Apply stored theme on mount
    const settings = getStoredThemeSettings();
    applyThemeSettings(settings);

    // Watch system changes if mode is 'system'
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = () => {
      const current = getStoredThemeSettings();
      if (current.mode === 'system') {
        applyThemeSettings(current);
      }
    };
    media.addEventListener('change', handleSystemChange);

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      media.removeEventListener('change', handleSystemChange);
      window.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, []);

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

  // Multi-select handlers
  const handleToggleSelectMedia = useCallback(
    (e: React.MouseEvent, item: MediaItem) => {
      setSelectedMediaIds((prev) => {
        const next = new Set(prev);

        if (e.shiftKey && lastSelectedMediaId !== null) {
          const lastIdx = displayedItems.findIndex((it) => it.id === lastSelectedMediaId);
          const currentIdx = displayedItems.findIndex((it) => it.id === item.id);

          if (lastIdx !== -1 && currentIdx !== -1) {
            const start = Math.min(lastIdx, currentIdx);
            const end = Math.max(lastIdx, currentIdx);
            for (let i = start; i <= end; i++) {
              next.add(displayedItems[i].id);
            }
            return next;
          }
        }

        if (next.has(item.id)) {
          next.delete(item.id);
        } else {
          next.add(item.id);
        }
        return next;
      });

      setLastSelectedMediaId(item.id);
    },
    [displayedItems, lastSelectedMediaId]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedMediaIds(new Set(displayedItems.map((it) => it.id)));
  }, [displayedItems]);

  const handleClearSelection = useCallback(() => {
    setSelectedMediaIds(new Set());
    setLastSelectedMediaId(null);
  }, []);

  // Keyboard shortcut listener for multi-selection (Cmd+A: select all, Esc: clear selection)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (isInput) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        if (displayedItems.length > 0 && mediaTypeFilter !== 'trash') {
          e.preventDefault();
          handleSelectAll();
        }
      } else if (e.key === 'Escape') {
        if (selectedMediaIds.size > 0) {
          e.preventDefault();
          handleClearSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [displayedItems, mediaTypeFilter, selectedMediaIds.size, handleSelectAll, handleClearSelection]);

  // Batch action handlers
  const handleBatchTrash = async () => {
    const ids = Array.from(selectedMediaIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/batch/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds: ids }),
      });
      if (!res.ok) throw new Error('批量移至垃圾桶失敗');
      toast('已移至垃圾桶', 'success');
      handleClearSelection();
      await fetchTrashCount();
      await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
      await fetchDirectories();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失敗';
      toast(msg, 'error');
    }
  };

  const handleBatchUpdateTags = async (addTags: string[], removeTags: string[]) => {
    const ids = Array.from(selectedMediaIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/batch/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaIds: ids, addTags, removeTags }),
      });
      if (!res.ok) throw new Error('批量修改標籤失敗');
      toast('已更新標籤', 'success');
      handleClearSelection();
      await fetchTags();
      await fetchMedia(page, activeTags, activeLibraryId, activeDirectory, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失敗';
      toast(msg, 'error');
    }
  };

  const handleBatchCreateCollection = async (title: string) => {
    const ids = Array.from(selectedMediaIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/collections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          mediaIds: ids,
          libraryId: activeLibraryId || undefined,
          directory: activeDirectory || undefined,
        }),
      });
      if (!res.ok) throw new Error('建立合集失敗');
      toast('已建立合集', 'success');
      handleClearSelection();
      await fetchCollections(activeTags, activeLibraryId, activeDirectory);
      await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失敗';
      toast(msg, 'error');
    }
  };

  const handleBatchMoveDirectory = async (
    targetLibraryId: number | undefined,
    targetDirectory: string
  ) => {
    const ids = Array.from(selectedMediaIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/batch/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaIds: ids,
          targetLibraryId,
          targetDirectory,
        }),
      });
      if (!res.ok) throw new Error('批量移動失敗');
      toast('已移動', 'success');
      handleClearSelection();
      await fetchDirectories();
      await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失敗';
      toast(msg, 'error');
    }
  };

  return (
    <SidebarProvider defaultOpen={true}>
      {/* Collapsible Left Sidebar with Integrated Library & Folder Tree View */}
      <AppSidebar
        mediaCount={items.length}
        trashCount={trashCount}
        availableTags={availableTags}
        activeTags={activeTags}
        onToggleTag={(t) => {
          handleClearSelection();
          handleToggleTag(t);
        }}
        onClearTags={() => {
          handleClearSelection();
          setActiveTags([]);
        }}
        libraries={libraries}
        activeLibraryId={activeLibraryId}
        onSelectLibrary={(id) => {
          handleClearSelection();
          setActiveLibraryId(id);
          setActiveDirectory(null);
        }}
        onOpenLibraries={() => setIsLibraryOpen(true)}
        directories={directories}
        activeDirectory={activeDirectory}
        onSelectDirectory={(dir, libId) => {
          handleClearSelection();
          handleSelectDirectory(dir, libId);
        }}
        onOpenCreateFolder={handleOpenCreateFolder}
        onOpenFolderOverview={() => setIsFolderOverviewOpen(true)}
        onOpenFolderDetail={setSelectedDirForDetail}
        mediaTypeFilter={mediaTypeFilter}
        onSelectMediaType={(type) => {
          handleClearSelection();
          setMediaTypeFilter(type);
        }}
        isSyncing={isSyncing}
        onTriggerSync={handleTriggerSync}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* Main Content Area */}
      <SidebarInset>
        {/* Streamlined Header with Hierarchical Breadcrumb */}
        <Header
          onOpenCommand={() => setIsCommandOpen(true)}
          onOpenCreateAsset={() => {
            setCreateAssetTab('collect');
            setIsCreateAssetOpen(true);
          }}
          onTriggerSync={handleTriggerSync}
          isSyncing={isSyncing}
          libraries={libraries}
          activeLibraryId={activeLibraryId}
          activeDirectory={activeDirectory}
          mediaTypeFilter={mediaTypeFilter}
          onNavigateRoot={() => {
            handleClearSelection();
            setActiveLibraryId(null);
            setActiveDirectory(null);
          }}
          onNavigateLibrary={(libId) => {
            handleClearSelection();
            setActiveLibraryId(libId);
            setActiveDirectory('');
          }}
          onNavigateDirectory={(dir, libId) => {
            handleClearSelection();
            setActiveLibraryId(libId);
            setActiveDirectory(dir);
          }}
        />

        {/* Main Scrollable Canvas with direct Masonry Grid or Trash View */}
        <div className="flex-1 w-full px-2.5 sm:px-6 py-4 space-y-4 max-w-[2000px] mx-auto font-mono">
          {mediaTypeFilter === 'trash' ? (
            <TrashView
              onItemRestored={async () => {
                await fetchTrashCount();
                await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
                await fetchCollections(activeTags, activeLibraryId, activeDirectory);
                await fetchTags();
                await fetchDirectories();
              }}
              onItemDeleted={async () => {
                await fetchTrashCount();
                await fetchDirectories();
              }}
              onTrashEmptied={async () => {
                await fetchTrashCount();
                await fetchDirectories();
              }}
            />
          ) : (
            <MasonryGrid
              items={displayedItems}
              collections={collections}
              isCollectionOnly={mediaTypeFilter === 'collection'}
              isLoading={isLoading}
              hasMore={hasMore}
              onLoadMore={handleLoadMore}
              onTagClick={handleToggleTag}
              onSelect={setSelectedItem}
              onSelectCollection={setSelectedCollection}
              selectedIds={selectedMediaIds}
              onToggleSelectMedia={handleToggleSelectMedia}
              isSelectionMode={selectedMediaIds.size > 0}
            />
          )}
        </div>

        {/* Floating Batch Multi-Select Action Bar */}
        <BatchActionBar
          selectedCount={selectedMediaIds.size}
          totalAvailableCount={displayedItems.length}
          onSelectAll={handleSelectAll}
          onClearSelection={handleClearSelection}
          onBatchTrash={handleBatchTrash}
          onBatchUpdateTags={handleBatchUpdateTags}
          onBatchCreateCollection={handleBatchCreateCollection}
          onBatchMoveDirectory={handleBatchMoveDirectory}
          libraries={libraries}
          directories={directories}
          availableTags={availableTags.map((t) => t.name)}
        />
      </SidebarInset>

      {/* Desktop Command Palette (Cmd+K) */}
      <CommandPalette
        open={isCommandOpen}
        onOpenChange={setIsCommandOpen}
        availableTags={availableTags.map((t) => t.name)}
        activeTags={activeTags}
        onToggleTag={handleToggleTag}
        onTriggerSync={handleTriggerSync}
        onOpenCreateAsset={(tab = 'collect') => {
          setCreateAssetTab(tab);
          setIsCreateAssetOpen(true);
        }}
        onOpenSettings={() => setIsSettingsOpen(true)}
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
          await fetchCollections(activeTags, activeLibraryId, activeDirectory);
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
        onOpenCollection={(colId) => handleOpenCollectionById(colId)}
        libraries={libraries}
        directories={directories}
        availableTags={availableTags}
        onItemUpdated={(updated) => {
          setSelectedItem(updated);
          setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
          fetchTags();
          fetchDirectories();
        }}
        onItemDeleted={(deletedId) => {
          setSelectedItem(null);
          setItems((prev) => prev.filter((it) => it.id !== deletedId));
          fetchTags();
          fetchDirectories();
          fetchTrashCount();
        }}
      />

      {/* Multi-modal Collection Detail Dialog */}
      <CollectionDetailDialog
        collection={selectedCollection}
        onClose={() => setSelectedCollection(null)}
        onTagClick={handleToggleTag}
        availableTags={availableTags}
        onCollectionUpdated={(updated) => {
          setSelectedCollection(updated);
          setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          fetchTags();
        }}
        onCollectionDeleted={(deletedId, disbanded) => {
          setSelectedCollection(null);
          setCollections((prev) => prev.filter((c) => c.id !== deletedId));
          if (!disbanded) {
            fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
          }
          fetchTags();
          fetchTrashCount();
        }}
      />

      {/* Collect & Upload Asset Dialog */}
      <AssetCreateDialog
        open={isCreateAssetOpen}
        onClose={() => setIsCreateAssetOpen(false)}
        libraries={libraries}
        directories={directories}
        availableTags={availableTags}
        defaultLibraryId={activeLibraryId}
        defaultDirectory={activeDirectory}
        initialTab={createAssetTab}
        onAssetCreated={(newAsset) => {
          setItems((prev) => [newAsset, ...prev]);
          fetchTags();
          fetchDirectories();
        }}
        onCollectionCreated={(newCol) => {
          setCollections((prev) => [newCol, ...prev]);
          fetchCollections(activeTags, activeLibraryId, activeDirectory);
        }}
      />

      {/* System Settings Dialog (Cmd+,) */}
      <SettingsDialog
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        libraries={libraries}
        onOpenLibraries={() => setIsLibraryOpen(true)}
        onTriggerSync={handleTriggerSync}
        isSyncing={isSyncing}
        onRefreshData={async () => {
          await fetchLibraries();
          await fetchDirectories();
          await fetchTags();
          await fetchMedia(1, activeTags, activeLibraryId, activeDirectory, false);
          await fetchCollections(activeTags, activeLibraryId, activeDirectory);
        }}
      />
    </SidebarProvider>
  );
};

export default App;
