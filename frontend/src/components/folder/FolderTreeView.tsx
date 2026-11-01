import React, { useState, useEffect, useMemo } from 'react';
import { DirectoryDetail } from '@/types/media';
import {
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Info,
  Plus,
  HardDrive,
} from 'lucide-react';
import {
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuBadge,
} from '@/components/ui/sidebar';

export interface FolderTreeNode {
  key: string;
  directory: string;
  name: string;
  parentDirectory: string;
  libraryId: number;
  libraryName: string;
  mediaCount: number;
  totalRecursiveCount: number;
  isReadonly?: boolean;
  isDefault?: boolean;
  depth: number;
  detail: DirectoryDetail;
  children: FolderTreeNode[];
}

interface FolderTreeViewProps {
  directories: DirectoryDetail[];
  activeLibraryId: number | null;
  activeDirectory: string | null;
  searchQuery: string;
  onSelectDirectory: (directory: string | null, libraryId?: number) => void;
  onOpenFolderDetail: (dir: DirectoryDetail) => void;
  onOpenCreateFolder: (libraryId?: number, parentDir?: string) => void;
}

/**
 * 將扁平的 DirectoryDetail[] 轉換為多叉樹階層結構
 * 庫本身即為各分支的根目錄（Root Folder）
 */
export function buildDirectoryTree(
  directories: DirectoryDetail[],
  searchQuery: string
): FolderTreeNode[] {
  // 1. 按庫分組（保留所有庫作為頂層根節點）
  const libMap = new Map<number, DirectoryDetail[]>();
  for (const dir of directories) {
    if (!libMap.has(dir.libraryId)) {
      libMap.set(dir.libraryId, []);
    }
    libMap.get(dir.libraryId)!.push(dir);
  }

  const roots: FolderTreeNode[] = [];

  for (const [libId, libDirs] of libMap.entries()) {
    // 依路徑長度排序，確保父目錄優先處理
    const sorted = [...libDirs].sort((a, b) => a.directory.length - b.directory.length);

    const nodeMap = new Map<string, FolderTreeNode>();

    for (const dir of sorted) {
      const node: FolderTreeNode = {
        key: `${libId}:${dir.directory}`,
        directory: dir.directory,
        name: dir.name,
        parentDirectory: dir.parentDirectory,
        libraryId: libId,
        libraryName: dir.libraryName,
        mediaCount: dir.mediaCount,
        totalRecursiveCount: dir.totalRecursiveCount,
        isReadonly: dir.isReadonly,
        isDefault: dir.isDefault,
        depth: 0,
        detail: dir,
        children: [],
      };
      nodeMap.set(dir.directory, node);
    }

    // 關聯階層
    for (const dir of sorted) {
      const node = nodeMap.get(dir.directory)!;
      if (dir.directory === '') {
        // 庫本身即為根目錄
        node.depth = 0;
        roots.push(node);
      } else {
        const parentNode = nodeMap.get(dir.parentDirectory);
        if (parentNode) {
          node.depth = parentNode.depth + 1;
          parentNode.children.push(node);
        } else {
          // 若直接父目錄不存在，回退掛至庫根節點
          const rootNode = nodeMap.get('');
          if (rootNode) {
            node.depth = 1;
            rootNode.children.push(node);
          } else {
            node.depth = 0;
            roots.push(node);
          }
        }
      }
    }
  }

  // 2. 搜尋過濾
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    const filterSubtree = (node: FolderTreeNode): FolderTreeNode | null => {
      const matchesSelf =
        node.name.toLowerCase().includes(q) ||
        node.directory.toLowerCase().includes(q) ||
        node.libraryName.toLowerCase().includes(q);

      const filteredChildren: FolderTreeNode[] = [];
      for (const child of node.children) {
        const filteredChild = filterSubtree(child);
        if (filteredChild) {
          filteredChildren.push(filteredChild);
        }
      }

      if (matchesSelf || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren,
        };
      }
      return null;
    };

    return roots.map(filterSubtree).filter((n): n is FolderTreeNode => n !== null);
  }

  return roots;
}

export const FolderTreeView: React.FC<FolderTreeViewProps> = ({
  directories,
  activeLibraryId,
  activeDirectory,
  searchQuery,
  onSelectDirectory,
  onOpenFolderDetail,
  onOpenCreateFolder,
}) => {
  const treeRoots = useMemo(
    () => buildDirectoryTree(directories, searchQuery),
    [directories, searchQuery]
  );

  // 追蹤展開的節點 key
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set<string>());

  // 初始與目錄變更時預設展開所有節點以呈現完整樹狀圖
  useEffect(() => {
    const allKeys = new Set<string>();
    const collectKeys = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        if (node.children.length > 0) {
          allKeys.add(node.key);
          collectKeys(node.children);
        }
      }
    };
    collectKeys(treeRoots);
    setExpandedKeys(allKeys);
  }, [treeRoots]);

  const toggleExpand = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const handleNodeClick = (node: FolderTreeNode) => {
    // 點擊節點選中目錄（或庫根目錄）
    onSelectDirectory(node.directory, node.libraryId);
    // 若節點未展開且有子節點，順手展開
    if (node.children.length > 0 && !expandedKeys.has(node.key)) {
      setExpandedKeys((prev) => new Set(prev).add(node.key));
    }
  };

  if (treeRoots.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground px-2 py-1 group-data-[collapsible=icon]:hidden">
        無文件夾
      </div>
    );
  }

  const renderTreeNode = (node: FolderTreeNode) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expandedKeys.has(node.key);
    const isRoot = node.directory === '';

    // 選中狀態判定：庫根節點或具體子文件夾
    const isSelected = isRoot
      ? activeLibraryId === node.libraryId && (activeDirectory === '' || activeDirectory === null)
      : activeLibraryId === node.libraryId && activeDirectory === node.directory;

    const indentPx = node.depth * 12;
    const countBadge = isRoot ? node.totalRecursiveCount : node.mediaCount;

    return (
      <React.Fragment key={node.key}>
        <SidebarMenuItem>
          <div className="flex items-center w-full group/item">
            {/* Indent spacer */}
            <div
              style={{ width: `${indentPx}px` }}
              className="shrink-0 group-data-[collapsible=icon]:hidden"
            />

            {/* Tree Toggle Arrow or Bullet */}
            <div className="w-4 h-4 flex items-center justify-center shrink-0 group-data-[collapsible=icon]:hidden">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => toggleExpand(e, node.key)}
                  className="p-0.5 text-sidebar-foreground/60 hover:text-sidebar-foreground rounded-sm transition-none"
                  title={isExpanded ? '收起' : '展開'}
                >
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                </button>
              ) : (
                <span className="w-1 h-1 rounded-full bg-sidebar-border block" />
              )}
            </div>

            {/* Folder / Library Root Button */}
            <SidebarMenuButton
              isActive={isSelected}
              onClick={() => handleNodeClick(node)}
              tooltip={`${node.libraryName}${node.directory ? `: /${node.directory}` : ''} (${countBadge})`}
              size="sm"
              className="flex-1 min-w-0"
            >
              {isRoot ? (
                <HardDrive
                  className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-sidebar-primary' : 'text-sidebar-foreground/70'}`}
                />
              ) : isSelected || isExpanded ? (
                <FolderOpen className="h-3.5 w-3.5 shrink-0 text-sidebar-primary" />
              ) : (
                <Folder className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/60" />
              )}

              <span className="truncate group-data-[collapsible=icon]:hidden text-xs">
                {node.name}
              </span>

              {isRoot && node.isReadonly && (
                <span className="group-data-[collapsible=icon]:hidden text-[9px] text-sidebar-foreground/60 border border-sidebar-border px-1 rounded-sm shrink-0">
                  唯讀
                </span>
              )}

              <SidebarMenuBadge>{countBadge}</SidebarMenuBadge>
            </SidebarMenuButton>

            {/* Hover Actions */}
            <div className="hidden group-hover/item:flex items-center gap-0.5 pr-1 shrink-0 group-data-[collapsible=icon]:hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenFolderDetail(node.detail);
                }}
                className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-none"
                title="文件夾詳細"
              >
                <Info className="h-3 w-3" />
              </button>
              {!node.isReadonly && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenCreateFolder(node.libraryId, node.directory);
                  }}
                  className="p-1 rounded-sm text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-none"
                  title="在此新建子文件夾"
                >
                  <Plus className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
        </SidebarMenuItem>

        {/* Recursive Children rendering */}
        {hasChildren && isExpanded && (
          <div className="w-full">
            {node.children.map((child) => renderTreeNode(child))}
          </div>
        )}
      </React.Fragment>
    );
  };

  return (
    <SidebarMenu className="space-y-0.5 font-mono">
      {treeRoots.map((rootNode) => renderTreeNode(rootNode))}
    </SidebarMenu>
  );
};
