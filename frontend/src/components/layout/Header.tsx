import React from 'react';
import { Search, RefreshCw, Plus } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Library } from '@/types/media';
import { MediaTypeFilter } from '@/components/layout/AppSidebar';

interface HeaderProps {
  onOpenCommand: () => void;
  onOpenCreateAsset?: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
  // Breadcrumb props
  libraries: Library[];
  activeLibraryId: number | null;
  activeDirectory: string | null;
  mediaTypeFilter: MediaTypeFilter;
  onNavigateRoot: () => void;
  onNavigateLibrary: (libraryId: number) => void;
  onNavigateDirectory: (directory: string, libraryId: number) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenCommand,
  onOpenCreateAsset,
  onTriggerSync,
  isSyncing,
  libraries,
  activeLibraryId,
  activeDirectory,
  mediaTypeFilter,
  onNavigateRoot,
  onNavigateLibrary,
  onNavigateDirectory,
}) => {
  const currentLibrary = libraries.find((lib) => lib.id === activeLibraryId);

  // 解析子目錄路徑片段，例如 "2026/architecture" -> ["2026", "architecture"]
  const directorySegments = activeDirectory
    ? activeDirectory.split('/').filter(Boolean)
    : [];

  const getRootLabel = () => {
    if (mediaTypeFilter === 'image') return '圖片';
    if (mediaTypeFilter === 'video') return '影片';
    if (mediaTypeFilter === 'document') return '文件';
    if (mediaTypeFilter === 'bookmark') return '書籤';
    if (mediaTypeFilter === 'collection') return '合集';
    if (mediaTypeFilter === 'trash') return '垃圾桶';
    return '全部媒體';
  };

  const isAtRoot = activeLibraryId === null && !activeDirectory;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background backdrop-blur-md font-mono">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 w-full">
        {/* Left: Sidebar Trigger & Breadcrumb Navigation */}
        <div className="flex items-center space-x-3 min-w-0 pr-4">
          <SidebarTrigger />

          <div className="h-4 w-px bg-border/60 shrink-0" />

          {/* Breadcrumb Hierarchy */}
          <Breadcrumb className="min-w-0">
            <BreadcrumbList className="flex-nowrap overflow-hidden">
              {/* Root Level: All Media / Media Type */}
              <BreadcrumbItem className="shrink-0">
                {isAtRoot ? (
                  <BreadcrumbPage>{getRootLabel()}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink onClick={onNavigateRoot}>
                    {getRootLabel()}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {/* Library Level */}
              {currentLibrary && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem className="shrink-0">
                    {directorySegments.length === 0 ? (
                      <BreadcrumbPage>{currentLibrary.name}</BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink onClick={() => onNavigateLibrary(currentLibrary.id)}>
                        {currentLibrary.name}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>
                </>
              )}

              {/* Directory Sub-path Levels */}
              {currentLibrary &&
                directorySegments.map((segment, index) => {
                  const isLast = index === directorySegments.length - 1;
                  const accumulatedPath = directorySegments.slice(0, index + 1).join('/');

                  return (
                    <React.Fragment key={accumulatedPath}>
                      <BreadcrumbSeparator />
                      <BreadcrumbItem className="truncate">
                        {isLast ? (
                          <BreadcrumbPage className="truncate">{segment}</BreadcrumbPage>
                        ) : (
                          <BreadcrumbLink
                            onClick={() =>
                              onNavigateDirectory(accumulatedPath, currentLibrary.id)
                            }
                            className="truncate"
                          >
                            {segment}
                          </BreadcrumbLink>
                        )}
                      </BreadcrumbItem>
                    </React.Fragment>
                  );
                })}
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Right: Search, Create & Sync Controls */}
        <div className="flex items-center space-x-2 shrink-0">
          {/* Create / Collect Asset Trigger */}
          {onOpenCreateAsset && (
            <button
              id="header-create-asset-btn"
              type="button"
              onClick={onOpenCreateAsset}
              className="flex items-center space-x-1.5 h-8 px-2.5 rounded-sm bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors shadow-none select-none"
              title="收集網址或上傳檔案"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">新增</span>
            </button>
          )}

          {/* Cmd+K trigger button */}
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex items-center space-x-2 h-8 px-2.5 rounded-sm border border-border bg-card text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shadow-none select-none"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">搜尋或指令...</span>
            <kbd className="hidden sm:inline-block pointer-events-none text-[10px] text-muted-foreground bg-secondary px-1 rounded-sm border border-border font-mono">
              ⌘K
            </kbd>
          </button>

          {/* Sync Trigger */}
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="flex items-center justify-center h-8 w-8 rounded-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors disabled:opacity-50 shadow-none"
            title="比對檔案系統與索引"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-foreground' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};
