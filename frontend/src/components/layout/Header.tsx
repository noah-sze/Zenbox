import React from 'react';
import { Search, RefreshCw, HardDrive } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Library } from '@/types/media';

interface HeaderProps {
  mediaCount: number;
  onOpenCommand: () => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
  libraries: Library[];
  activeLibraryId: number | null;
  onSelectLibrary: (id: number | null) => void;
  onOpenLibraries: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  mediaCount,
  onOpenCommand,
  onTriggerSync,
  isSyncing,
  libraries,
  activeLibraryId,
  onSelectLibrary,
  onOpenLibraries,
}) => {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-black/80 backdrop-blur-md font-mono">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 max-w-7xl mx-auto">
        {/* Brand & Library Switcher */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="font-bold tracking-tight text-white text-base">Zenbox</span>
            <span className="text-xs text-muted-foreground hidden md:inline">· 視覺化第二大腦</span>
          </div>

          {/* Storage Source Switcher Dropdown */}
          {libraries.length > 0 && (
            <div className="flex items-center space-x-1 border-l border-border pl-3">
              <select
                aria-label="選擇儲存來源"
                value={activeLibraryId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  onSelectLibrary(val === '' ? null : Number(val));
                }}
                className="bg-card text-xs text-neutral-300 border border-border rounded-sm px-2 py-1 focus:outline-none focus:border-neutral-500 cursor-pointer"
              >
                <option value="">全部來源 ({libraries.length})</option>
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>
                    {lib.name} {lib.is_readonly ? '(唯讀)' : ''}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={onOpenLibraries}
                className="p-1 rounded-sm border border-border text-muted-foreground hover:text-white hover:border-neutral-500 transition-colors"
                title="管理儲存來源"
              >
                <HardDrive className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-mono hidden sm:inline-flex">
            {mediaCount} 項目
          </Badge>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Cmd+K trigger button */}
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex items-center space-x-2 h-8 px-2.5 rounded-sm border border-border bg-card text-xs text-muted-foreground hover:text-white hover:border-neutral-500 transition-colors shadow-none select-none"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">搜尋或指令...</span>
            <kbd className="hidden sm:inline-block pointer-events-none text-[10px] text-neutral-500 bg-secondary px-1 rounded-sm border border-border">
              ⌘K
            </kbd>
          </button>

          {/* Sync Trigger */}
          <button
            type="button"
            onClick={onTriggerSync}
            disabled={isSyncing}
            className="flex items-center justify-center h-8 w-8 rounded-sm border border-border bg-card text-muted-foreground hover:text-white hover:border-neutral-500 transition-colors disabled:opacity-50 shadow-none"
            title="比對檔案系統與索引"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-white' : ''}`} />
          </button>
        </div>
      </div>
    </header>
  );
};

