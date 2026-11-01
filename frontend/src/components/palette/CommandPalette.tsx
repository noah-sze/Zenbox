import * as React from 'react';
import {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Tag, RefreshCw, Link as LinkIcon, Upload as UploadIcon, Settings } from 'lucide-react';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  availableTags: string[];
  activeTags: string[];
  onToggleTag: (tag: string) => void;
  onTriggerSync: () => void;
  onOpenCreateAsset?: (tab?: 'collect' | 'upload') => void;
  onOpenSettings?: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onOpenChange,
  availableTags,
  activeTags,
  onToggleTag,
  onTriggerSync,
  onOpenCreateAsset,
  onOpenSettings,
}) => {
  // Global shortcut: Cmd+K or Ctrl+K
  React.useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', down);
    return () => document.removeEventListener('keydown', down);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command>
        <CommandInput placeholder="搜尋標籤、指令或媒體..." />
        <CommandList>
          <CommandEmpty>無相符項目</CommandEmpty>
          
          <CommandGroup heading="標籤過濾">
            {availableTags.map((tag) => {
              const isActive = activeTags.includes(tag);
              return (
                <CommandItem
                  key={tag}
                  onSelect={() => {
                    onToggleTag(tag);
                    onOpenChange(false);
                  }}
                >
                  <Tag className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span>{tag}</span>
                  {isActive && (
                    <span className="ml-2 text-[10px] text-foreground font-semibold">
                      [ 已選 ]
                    </span>
                  )}
                  <CommandShortcut>FILTER</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="資產操作">
            {onOpenCreateAsset && (
              <>
                <CommandItem
                  onSelect={() => {
                    onOpenCreateAsset('collect');
                    onOpenChange(false);
                  }}
                >
                  <LinkIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span>收集外部網址 (URL)</span>
                  <CommandShortcut>NEW</CommandShortcut>
                </CommandItem>
                <CommandItem
                  onSelect={() => {
                    onOpenCreateAsset('upload');
                    onOpenChange(false);
                  }}
                >
                  <UploadIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  <span>上傳本機檔案</span>
                  <CommandShortcut>UPLOAD</CommandShortcut>
                </CommandItem>
              </>
            )}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="系統操作">
            {onOpenSettings && (
              <CommandItem
                onSelect={() => {
                  onOpenSettings();
                  onOpenChange(false);
                }}
              >
                <Settings className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                <span>開啟系統設置</span>
                <CommandShortcut>⌘,</CommandShortcut>
              </CommandItem>
            )}
            <CommandItem
              onSelect={() => {
                onTriggerSync();
                onOpenChange(false);
              }}
            >
              <RefreshCw className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
              <span>全量比對檔案系統與 SQLite 索引</span>
              <CommandShortcut>SYNC</CommandShortcut>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
};
