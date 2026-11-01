import React, { useState, useEffect } from 'react';
import { Library, DirectoryDetail } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { X, FolderPlus } from 'lucide-react';

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  libraries: Library[];
  defaultLibraryId?: number | null;
  defaultParentDir?: string;
  onFolderCreated: (createdDir: DirectoryDetail) => void;
}

export const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  open,
  onClose,
  libraries,
  defaultLibraryId,
  defaultParentDir = '',
  onFolderCreated,
}) => {
  const activeLibraries = libraries.filter((lib) => lib.is_active === 1 && lib.is_readonly === 0);

  const [selectedLibId, setSelectedLibId] = useState<number>(() => {
    if (defaultLibraryId && activeLibraries.some((l) => l.id === defaultLibraryId)) {
      return defaultLibraryId;
    }
    return activeLibraries[0]?.id || 1;
  });

  const [folderName, setFolderName] = useState('');
  const [parentPath, setParentPath] = useState(defaultParentDir);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (open) {
      if (defaultLibraryId && activeLibraries.some((l) => l.id === defaultLibraryId)) {
        setSelectedLibId(defaultLibraryId);
      } else if (activeLibraries[0]) {
        setSelectedLibId(activeLibraries[0].id);
      }
      setParentPath(defaultParentDir);
      setFolderName('');
      setErrorMessage('');
      setIsSubmitting(false);
    }
  }, [open, defaultLibraryId, defaultParentDir]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = folderName.trim();
    if (!trimmed) {
      setErrorMessage('請輸入名稱');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    const fullRelPath = parentPath.trim()
      ? `${parentPath.trim().replace(/^\/+|\/+$/g, '')}/${trimmed}`
      : trimmed;

    try {
      const res = await fetch('/api/directories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          libraryId: selectedLibId,
          directory: fullRelPath,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({ error: '建立失敗' }));
        throw new Error(json.error || '建立失敗');
      }

      const json = (await res.json()) as { success: boolean; data: DirectoryDetail };
      onFolderCreated(json.data);
      onClose();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : '建立失敗');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Frosted Glass Backdrop */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-[2px] transition-none"
        onClick={onClose}
      />

      {/* Instant Pop Modal Container */}
      <div className="relative z-50 flex flex-col w-full max-w-md bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card">
          <div className="flex items-center space-x-2">
            <FolderPlus className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-bold text-foreground tracking-wide">新增</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 bg-card text-xs">
          {/* Target Library */}
          <div className="space-y-1.5">
            <label htmlFor="folder-lib-select" className="text-muted-foreground block text-[11px] uppercase tracking-wider">
              儲存庫
            </label>
            <select
              id="folder-lib-select"
              value={selectedLibId}
              onChange={(e) => setSelectedLibId(Number(e.target.value))}
              disabled={isSubmitting || activeLibraries.length <= 1}
              className="w-full bg-card border border-border rounded-sm px-2.5 py-1.5 text-foreground focus:outline-none focus:border-foreground cursor-pointer disabled:opacity-60"
            >
              {activeLibraries.map((lib) => (
                <option key={lib.id} value={lib.id}>
                  {lib.name}
                </option>
              ))}
            </select>
          </div>

          {/* Parent Directory */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="folder-parent-path" className="text-muted-foreground block text-[11px] uppercase tracking-wider">
                父路徑
              </label>
              {parentPath && (
                <button
                  type="button"
                  onClick={() => setParentPath('')}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  根目錄
                </button>
              )}
            </div>
            <input
              id="folder-parent-path"
              type="text"
              placeholder="根目錄"
              value={parentPath}
              onChange={(e) => setParentPath(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-card border border-border rounded-sm px-2.5 py-1.5 text-foreground focus:outline-none focus:border-foreground"
            />
          </div>

          {/* Folder Name */}
          <div className="space-y-1.5">
            <label htmlFor="folder-name-input" className="text-muted-foreground block text-[11px] uppercase tracking-wider">
              名稱
            </label>
            <input
              id="folder-name-input"
              type="text"
              placeholder="文件夾名稱"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              disabled={isSubmitting}
              className="w-full bg-card border border-border rounded-sm px-2.5 py-1.5 text-foreground focus:outline-none focus:border-foreground"
            />
          </div>

          {/* Preview */}
          <div className="p-2.5 rounded-sm bg-card border border-border text-[11px] text-muted-foreground space-y-1">
            <div className="flex items-center justify-between">
              <span>路徑:</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-foreground">
                {parentPath.trim()
                  ? `${parentPath.trim().replace(/^\/+|\/+$/g, '')}/${folderName.trim() || '...'}`
                  : folderName.trim() || '/'}
              </Badge>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-2 rounded-sm border border-destructive text-destructive text-xs">
              {errorMessage}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 rounded-sm border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-none disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !folderName.trim()}
              className="px-3.5 py-1.5 rounded-sm bg-primary text-primary-foreground font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {isSubmitting ? '建立中' : '建立'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
