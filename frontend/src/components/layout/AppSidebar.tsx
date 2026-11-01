import React, { useState } from 'react';
import {
  LayoutGrid,
  Image as ImageIcon,
  Film,
  Tag as TagIcon,
  HardDrive,
  RefreshCw,
  Plus,
  X,
  FolderTree,
  Layers,
  Settings,
  Trash2,
} from 'lucide-react';
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
  SidebarFooter,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import { Tag, Library, DirectoryDetail } from '@/types/media';
import { FolderTreeView } from '@/components/folder/FolderTreeView';

export type MediaTypeFilter = 'all' | 'image' | 'video' | 'collection' | 'trash';

interface AppSidebarProps {
  mediaCount: number;
  trashCount?: number;
  availableTags: Tag[];
  activeTags: string[];
  onToggleTag: (tagName: string) => void;
  onClearTags: () => void;
  libraries: Library[];
  activeLibraryId: number | null;
  onSelectLibrary: (id: number | null) => void;
  onOpenLibraries: () => void;
  // Folders & Integrated Libraries
  directories: DirectoryDetail[];
  activeDirectory: string | null;
  onSelectDirectory: (dir: string | null, libraryId?: number) => void;
  onOpenCreateFolder: (libraryId?: number, parentDir?: string) => void;
  onOpenFolderOverview: () => void;
  onOpenFolderDetail: (dir: DirectoryDetail) => void;
  // Filters & State
  mediaTypeFilter: MediaTypeFilter;
  onSelectMediaType: (type: MediaTypeFilter) => void;
  isSyncing: boolean;
  onTriggerSync: () => void;
  onOpenSettings?: () => void;
}

export const AppSidebar: React.FC<AppSidebarProps> = ({
  mediaCount,
  trashCount = 0,
  availableTags,
  activeTags,
  onToggleTag,
  onClearTags,
  activeLibraryId,
  onOpenLibraries,
  directories,
  activeDirectory,
  onSelectDirectory,
  onOpenCreateFolder,
  onOpenFolderOverview,
  onOpenFolderDetail,
  mediaTypeFilter,
  onSelectMediaType,
  isSyncing,
  onTriggerSync,
  onOpenSettings,
}) => {
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [folderSearchQuery, setFolderSearchQuery] = useState('');

  const filteredTags = availableTags.filter((t) =>
    t.name.toLowerCase().includes(tagSearchQuery.toLowerCase())
  );

  return (
    <Sidebar collapsible="icon">
      {/* 1. Header: Brand */}
      <SidebarHeader>
        <div className="flex items-center justify-between px-1 py-1">
          <div className="flex items-center space-x-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-sidebar-primary text-sidebar-primary-foreground font-bold text-xs select-none">
              Z
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="font-bold tracking-tight text-sidebar-foreground text-sm">Zenbox</span>
              <span className="text-[10px] text-muted-foreground">視覺化第二大腦</span>
            </div>
          </div>
        </div>
      </SidebarHeader>

      {/* 2. Content Sections */}
      <SidebarContent>
        {/* Navigation / Types */}
        <SidebarGroup>
          <SidebarGroupLabel>視圖</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mediaTypeFilter === 'all' && activeLibraryId === null && activeDirectory === null}
                  onClick={() => {
                    onSelectMediaType('all');
                    onSelectDirectory(null);
                  }}
                  tooltip="全部媒體"
                >
                  <LayoutGrid className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">全部媒體</span>
                  <SidebarMenuBadge>{mediaCount}</SidebarMenuBadge>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mediaTypeFilter === 'image'}
                  onClick={() => onSelectMediaType('image')}
                  tooltip="圖片"
                >
                  <ImageIcon className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">圖片</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mediaTypeFilter === 'video'}
                  onClick={() => onSelectMediaType('video')}
                  tooltip="影片"
                >
                  <Film className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">影片</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mediaTypeFilter === 'collection'}
                  onClick={() => onSelectMediaType('collection')}
                  tooltip="合集"
                >
                  <Layers className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">合集</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={mediaTypeFilter === 'trash'}
                  onClick={() => onSelectMediaType('trash')}
                  tooltip="垃圾桶"
                >
                  <Trash2 className="h-4 w-4 shrink-0" />
                  <span className="group-data-[collapsible=icon]:hidden">垃圾桶</span>
                  {trashCount > 0 && (
                    <SidebarMenuBadge className="font-mono">{trashCount}</SidebarMenuBadge>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Integrated Storage Library & Folder Tree View */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>文件夾</SidebarGroupLabel>
            <div className="flex items-center gap-1 group-data-[collapsible=icon]:hidden">
              <button
                type="button"
                onClick={onOpenLibraries}
                className="p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-sm transition-none"
                title="管理存儲庫"
              >
                <HardDrive className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onOpenFolderOverview}
                className="p-1 text-sidebar-foreground/70 hover:text-sidebar-foreground rounded-sm transition-none"
                title="查看各庫文件夾詳細"
              >
                <FolderTree className="h-3.5 w-3.5" />
              </button>
              <SidebarGroupAction
                onClick={() => onOpenCreateFolder(activeLibraryId || undefined)}
                title="新建文件夾"
              >
                <Plus className="h-3.5 w-3.5" />
              </SidebarGroupAction>
            </div>
          </div>

          {/* Quick Folder Search */}
          {directories.length > 5 && (
            <div className="px-1 mb-1.5 group-data-[collapsible=icon]:hidden">
              <input
                type="text"
                placeholder="過濾文件夾..."
                value={folderSearchQuery}
                onChange={(e) => setFolderSearchQuery(e.target.value)}
                className="w-full bg-sidebar-accent/50 border border-sidebar-border text-[11px] text-sidebar-foreground placeholder:text-muted-foreground px-2 py-1 rounded-sm focus:outline-none focus:border-sidebar-ring"
              />
            </div>
          )}

          <SidebarGroupContent>
            {/* Unified Tree View with Libraries as Root Directories */}
            <FolderTreeView
              directories={directories}
              activeLibraryId={activeLibraryId}
              activeDirectory={activeDirectory}
              searchQuery={folderSearchQuery}
              onSelectDirectory={onSelectDirectory}
              onOpenFolderDetail={onOpenFolderDetail}
              onOpenCreateFolder={onOpenCreateFolder}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Tags Group */}
        <SidebarGroup>
          <div className="flex items-center justify-between">
            <SidebarGroupLabel>標籤檢索</SidebarGroupLabel>
            {activeTags.length > 0 && (
              <button
                type="button"
                onClick={onClearTags}
                className="group-data-[collapsible=icon]:hidden text-[10px] text-sidebar-foreground/60 hover:text-sidebar-foreground flex items-center gap-1"
                title="清除標籤過濾"
              >
                <X className="h-3 w-3" />
                <span>清除</span>
              </button>
            )}
          </div>

          {/* Quick Tag Search within Sidebar */}
          {availableTags.length > 5 && (
            <div className="px-1 mb-1.5 group-data-[collapsible=icon]:hidden">
              <input
                type="text"
                placeholder="過濾標籤..."
                value={tagSearchQuery}
                onChange={(e) => setTagSearchQuery(e.target.value)}
                className="w-full bg-sidebar-accent/50 border border-sidebar-border text-[11px] text-sidebar-foreground placeholder:text-muted-foreground px-2 py-1 rounded-sm focus:outline-none focus:border-sidebar-ring"
              />
            </div>
          )}

          <SidebarGroupContent>
            {availableTags.length === 0 ? (
              <div className="text-[11px] text-muted-foreground px-2 py-1 group-data-[collapsible=icon]:hidden">
                無標籤
              </div>
            ) : (
              <SidebarMenu>
                {filteredTags.map((tag) => {
                  const isActive = activeTags.includes(tag.name);
                  return (
                    <SidebarMenuItem key={tag.id}>
                      <SidebarMenuButton
                        isActive={isActive}
                        onClick={() => onToggleTag(tag.name)}
                        tooltip={`#${tag.name} (${tag.count ?? 0})`}
                        size="sm"
                      >
                        <TagIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate group-data-[collapsible=icon]:hidden">
                          #{tag.name}
                        </span>
                        {tag.count !== undefined && (
                          <SidebarMenuBadge>{tag.count}</SidebarMenuBadge>
                        )}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* 3. Footer: Sync & Status */}
      <SidebarFooter>
        <div className="flex items-center justify-between group-data-[collapsible=icon]:justify-center">
          <div className="flex flex-col group-data-[collapsible=icon]:hidden">
            <span className="text-[11px] text-sidebar-foreground font-medium">
              {isSyncing ? '比對中...' : '已就緒'}
            </span>
            <span className="text-[9px] text-muted-foreground">
              快捷鍵 ⌘B 展開/收攏
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenSettings}
              className="flex items-center justify-center h-8 w-8 rounded-sm border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/75 hover:text-sidebar-foreground hover:border-sidebar-ring transition-colors"
              title="系統設置 (⌘,)"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={onTriggerSync}
              disabled={isSyncing}
              className="flex items-center justify-center h-8 w-8 rounded-sm border border-sidebar-border bg-sidebar-accent/50 text-sidebar-foreground/75 hover:text-sidebar-foreground hover:border-sidebar-ring transition-colors disabled:opacity-50"
              title="比對檔案系統與索引"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-sidebar-foreground' : ''}`}
              />
            </button>
          </div>
        </div>
      </SidebarFooter>

      {/* Rail for quick collapse/expand dragging */}
      <SidebarRail />
    </Sidebar>
  );
};
