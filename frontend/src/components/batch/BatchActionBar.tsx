import React, { useState } from 'react';
import {
  CheckSquare,
  Square,
  Tag as TagIcon,
  Layers,
  FolderInput,
  Trash2,
  X,
  Plus,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Library, DirectoryDetail } from '@/types/media';

interface BatchActionBarProps {
  selectedCount: number;
  totalAvailableCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  // Batch Operations
  onBatchTrash: () => Promise<void>;
  onBatchUpdateTags: (addTags: string[], removeTags: string[]) => Promise<void>;
  onBatchCreateCollection: (title: string) => Promise<void>;
  onBatchMoveDirectory: (libraryId: number | undefined, directory: string) => Promise<void>;
  // Environment data for dropdowns
  libraries: Library[];
  directories: DirectoryDetail[];
  availableTags: string[];
}

export const BatchActionBar: React.FC<BatchActionBarProps> = ({
  selectedCount,
  totalAvailableCount,
  onSelectAll,
  onClearSelection,
  onBatchTrash,
  onBatchUpdateTags,
  onBatchCreateCollection,
  onBatchMoveDirectory,
  libraries,
  directories,
  availableTags,
}) => {
  // Modal states
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tagAction, setTagAction] = useState<'add' | 'remove'>('add');

  const [collectionModalOpen, setCollectionModalOpen] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');

  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [targetLibraryId, setTargetLibraryId] = useState<number | undefined>(
    libraries[0]?.id
  );
  const [targetDirectory, setTargetDirectory] = useState('');

  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  if (selectedCount === 0) return null;

  // Handle tag submit
  const handleTagSubmit = async () => {
    const tags = tagInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (tags.length === 0) return;

    setIsProcessing(true);
    try {
      if (tagAction === 'add') {
        await onBatchUpdateTags(tags, []);
      } else {
        await onBatchUpdateTags([], tags);
      }
      setTagModalOpen(false);
      setTagInput('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle create collection submit
  const handleCollectionSubmit = async () => {
    if (!collectionTitle.trim()) return;
    setIsProcessing(true);
    try {
      await onBatchCreateCollection(collectionTitle.trim());
      setCollectionModalOpen(false);
      setCollectionTitle('');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle move submit
  const handleMoveSubmit = async () => {
    setIsProcessing(true);
    try {
      await onBatchMoveDirectory(targetLibraryId, targetDirectory);
      setMoveModalOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle trash submit
  const handleTrashSubmit = async () => {
    setIsProcessing(true);
    try {
      await onBatchTrash();
      setTrashConfirmOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  // Filter directories for the chosen library
  const availableDirsForLib = directories.filter(
    (d) => !targetLibraryId || d.libraryId === targetLibraryId
  );

  return (
    <>
      {/* Floating Toolbar */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 p-1.5 sm:p-2 bg-card/95 border border-border rounded-sm shadow-none font-mono text-xs max-w-[96vw] overflow-x-auto select-none">
        {/* Count badge */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-muted rounded-sm text-foreground shrink-0">
          <CheckSquare className="h-3.5 w-3.5 text-foreground" />
          <span className="font-bold">{selectedCount}</span>
          <span className="text-muted-foreground text-[11px]">/ {totalAvailableCount} 項</span>
        </div>

        {/* Select all toggle */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground shrink-0 shadow-none"
          onClick={selectedCount === totalAvailableCount ? onClearSelection : onSelectAll}
        >
          {selectedCount === totalAvailableCount ? (
            <>
              <Square className="h-3 w-3" />
              <span>取消</span>
            </>
          ) : (
            <>
              <CheckSquare className="h-3 w-3" />
              <span>全選</span>
            </>
          )}
        </Button>

        <div className="h-4 w-px bg-border shrink-0" />

        {/* Action: Tags */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1 shrink-0 border-border shadow-none"
          onClick={() => setTagModalOpen(true)}
        >
          <TagIcon className="h-3 w-3" />
          <span>標籤</span>
        </Button>

        {/* Action: Create Collection */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1 shrink-0 border-border shadow-none"
          onClick={() => setCollectionModalOpen(true)}
        >
          <Layers className="h-3 w-3" />
          <span>建立合集</span>
        </Button>

        {/* Action: Move Directory */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1 shrink-0 border-border shadow-none"
          onClick={() => setMoveModalOpen(true)}
        >
          <FolderInput className="h-3 w-3" />
          <span>移動</span>
        </Button>

        {/* Action: Move to Trash */}
        <Button
          type="button"
          variant="destructive"
          size="sm"
          className="h-7 px-2.5 text-[11px] gap-1 shrink-0 shadow-none"
          onClick={() => setTrashConfirmOpen(true)}
        >
          <Trash2 className="h-3 w-3" />
          <span>移至垃圾桶</span>
        </Button>

        {/* Dismiss / Clear Selection */}
        <button
          type="button"
          onClick={onClearSelection}
          className="p-1 rounded-sm text-muted-foreground hover:text-foreground hover:bg-muted ml-0.5 shrink-0 transition-colors"
          title="取消選取 (Esc)"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 1. Batch Tag Dialog */}
      <Dialog open={tagModalOpen} onOpenChange={setTagModalOpen}>
        <DialogContent className="max-w-md p-5 border border-border bg-card shadow-none font-mono">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-sm font-semibold text-foreground">
              批量編輯標籤 ({selectedCount} 項)
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div className="flex space-x-2">
              <Button
                type="button"
                variant={tagAction === 'add' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-7 text-xs gap-1 shadow-none"
                onClick={() => setTagAction('add')}
              >
                <Plus className="h-3 w-3" />
                <span>附加標籤</span>
              </Button>
              <Button
                type="button"
                variant={tagAction === 'remove' ? 'default' : 'outline'}
                size="sm"
                className="flex-1 h-7 text-xs gap-1 shadow-none"
                onClick={() => setTagAction('remove')}
              >
                <Minus className="h-3 w-3" />
                <span>移除標籤</span>
              </Button>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">
                標籤名稱（多個請用逗號分隔）
              </label>
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleTagSubmit()}
                placeholder="例如: minimal, architecture, poster"
                className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-foreground"
              />
            </div>

            {/* Quick tag chips */}
            {availableTags.length > 0 && (
              <div>
                <span className="text-[10px] text-muted-foreground block mb-1">現有標籤點選：</span>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                  {availableTags.slice(0, 15).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        const parts = tagInput.split(',').map((p) => p.trim()).filter(Boolean);
                        if (!parts.includes(t)) {
                          parts.push(t);
                          setTagInput(parts.join(', '));
                        }
                      }}
                      className="px-1.5 py-0.5 rounded-sm border border-border bg-muted text-[10px] text-foreground/80 hover:text-foreground hover:border-foreground/50 transition-none"
                    >
                      #{t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shadow-none"
              onClick={() => setTagModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isProcessing || !tagInput.trim()}
              className="h-8 text-xs shadow-none"
              onClick={handleTagSubmit}
            >
              {isProcessing ? '套用中' : '確認套用'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2. Batch Create Collection Dialog */}
      <Dialog open={collectionModalOpen} onOpenChange={setCollectionModalOpen}>
        <DialogContent className="max-w-md p-5 border border-border bg-card shadow-none font-mono">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-sm font-semibold text-foreground">
              以此 {selectedCount} 個項目建立合集
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">合集標題</label>
              <input
                type="text"
                value={collectionTitle}
                onChange={(e) => setCollectionTitle(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCollectionSubmit()}
                placeholder="例如: 2026 年秋季建築寫真特輯"
                className="w-full h-8 px-2.5 text-xs bg-background border border-border rounded-sm text-foreground focus:outline-none focus:border-foreground"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              將保留選取之媒體並組裝為一組多對象混合合集，實體檔案不受破壞。
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shadow-none"
              onClick={() => setCollectionModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isProcessing || !collectionTitle.trim()}
              className="h-8 text-xs shadow-none"
              onClick={handleCollectionSubmit}
            >
              {isProcessing ? '建立中' : '確認建立'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 3. Batch Move Directory Dialog */}
      <Dialog open={moveModalOpen} onOpenChange={setMoveModalOpen}>
        <DialogContent className="max-w-md p-5 border border-border bg-card shadow-none font-mono">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-sm font-semibold text-foreground">
              批量移動檔案 ({selectedCount} 項)
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">目標儲存庫</label>
              <select
                value={targetLibraryId || ''}
                onChange={(e) => setTargetLibraryId(Number(e.target.value))}
                className="w-full h-8 px-2 text-xs bg-background border border-border rounded-sm text-foreground"
              >
                {libraries.map((lib) => (
                  <option key={lib.id} value={lib.id}>
                    {lib.name} {lib.is_readonly ? '(唯讀)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">目標文件夾</label>
              <select
                value={targetDirectory}
                onChange={(e) => setTargetDirectory(e.target.value)}
                className="w-full h-8 px-2 text-xs bg-background border border-border rounded-sm text-foreground"
              >
                <option value="">(儲存庫根目錄)</option>
                {availableDirsForLib
                  .filter((d) => d.directory)
                  .map((d) => (
                    <option key={d.directory} value={d.directory}>
                      {d.directory}
                    </option>
                  ))}
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              原生媒體與 Sidecar 元數據將實體搬移至目標文件夾。
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shadow-none"
              onClick={() => setMoveModalOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isProcessing}
              className="h-8 text-xs shadow-none"
              onClick={handleMoveSubmit}
            >
              {isProcessing ? '移動中' : '確認移動'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 4. Batch Trash Confirmation Dialog */}
      <Dialog open={trashConfirmOpen} onOpenChange={setTrashConfirmOpen}>
        <DialogContent className="max-w-sm p-5 border border-border bg-card shadow-none font-mono">
          <DialogHeader className="pb-2 border-b border-border">
            <DialogTitle className="text-sm font-semibold text-foreground">
              批量移至垃圾桶確認
            </DialogTitle>
          </DialogHeader>

          <div className="py-3 text-xs text-foreground/90 space-y-2">
            <p>
              確定將所選取的 <span className="font-bold">{selectedCount}</span> 個項目移至垃圾桶嗎？
            </p>
            <p className="text-muted-foreground text-[11px]">
              檔案將移至庫根目錄下的 <span className="text-foreground">.zenbox/trash/</span> 隱藏安全隔離區，可隨時在垃圾桶中一鍵還原。
            </p>
          </div>

          <DialogFooter className="flex items-center justify-end space-x-2 pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs shadow-none"
              onClick={() => setTrashConfirmOpen(false)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isProcessing}
              className="h-8 text-xs shadow-none"
              onClick={handleTrashSubmit}
            >
              {isProcessing ? '移動中' : '確認移入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
