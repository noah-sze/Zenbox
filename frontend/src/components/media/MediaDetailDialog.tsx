import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { MediaItem, Library, DirectoryDetail, Tag } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import {
  X,
  ExternalLink,
  Calendar,
  HardDrive,
  Maximize2,
  Folder,
  Film,
  Edit3,
  Trash2,
  Check,
  Plus,
  Layers,
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';

interface MediaDetailDialogProps {
  item: MediaItem | null;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
  onOpenCollection?: (collectionId: number) => void;
  libraries?: Library[];
  directories?: DirectoryDetail[];
  availableTags?: Tag[];
  onItemUpdated?: (updatedItem: MediaItem) => void;
  onItemDeleted?: (deletedId: number) => void;
}

export const MediaDetailDialog: React.FC<MediaDetailDialogProps> = ({
  item,
  onClose,
  onTagClick,
  onOpenCollection,
  libraries = [],
  directories = [],
  availableTags = [],
  onItemUpdated,
  onItemDeleted,
}) => {
  const { toast } = useToast();

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form state
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [directory, setDirectory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Sync state whenever selected item changes or enters edit mode
  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setNotes(item.notes || '');
      setSourceUrl(item.source_url || '');
      setFilename(item.filename || '');
      setDirectory(item.directory || '');
      setTags(item.tags ? [...item.tags] : []);
      setIsEditing(false);
      setConfirmDelete(false);
      setTagInput('');
    }
  }, [item]);

  // Suggested unadded tags
  const suggestedTags = useMemo(() => {
    const currentTagSet = new Set(tags.map((t) => t.toLowerCase()));
    return availableTags
      .filter((t) => !currentTagSet.has(t.name.toLowerCase()))
      .slice(0, 6);
  }, [availableTags, tags]);

  // Handle adding tag from input
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  // Handle keydown on tag input (Enter or comma)
  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Handle removing tag
  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  // Handle adding recommended tag chip
  const handleAddSpecificTag = (tagName: string) => {
    const norm = tagName.trim().toLowerCase();
    if (norm && !tags.includes(norm)) {
      setTags((prev) => [...prev, norm]);
    }
  };

  // Reset form to item state
  const handleCancelEdit = () => {
    if (item) {
      setTitle(item.title || '');
      setNotes(item.notes || '');
      setSourceUrl(item.source_url || '');
      setFilename(item.filename || '');
      setDirectory(item.directory || '');
      setTags(item.tags ? [...item.tags] : []);
    }
    setIsEditing(false);
    setConfirmDelete(false);
    setTagInput('');
  };

  // Submit save
  const handleSave = async () => {
    if (!item) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/media/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim(),
          sourceUrl: sourceUrl.trim(),
          tags,
          filename: filename.trim() !== item.filename ? filename.trim() : undefined,
          directory: directory !== item.directory ? directory : undefined,
        }),
      });

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || '儲存失敗');
      }

      const json = (await res.json()) as { success: boolean; data: MediaItem };
      if (json.data) {
        onItemUpdated?.(json.data);
      }

      toast('已儲存', 'success');
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : '儲存失敗';
      toast(message, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Delete media item (move to trash)
  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/media/${item.id}/trash`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || '移至垃圾桶失敗');
      }

      toast('已移至垃圾桶', 'success');
      onItemDeleted?.(item.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失敗';
      toast(message, 'error');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  // Keyboard shortcut listener (E: edit, Cmd+S: save, Esc: cancel)
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if target is input or textarea (unless Cmd+S)
      const isInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      // Cmd+S / Ctrl+S to save in edit mode
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (isEditing) {
          e.preventDefault();
          handleSave();
        }
        return;
      }

      // E to enter edit mode when not typing
      if (!isEditing && !isInput && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setIsEditing(true);
        return;
      }

      // Escape key
      if (e.key === 'Escape') {
        if (isEditing) {
          e.preventDefault();
          handleCancelEdit();
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, isEditing, handleSave, handleCancelEdit, onClose]);

  if (!item) return null;

  const libraryName = item.library_id
    ? libraries.find((l) => l.id === item.library_id)?.name
    : undefined;

  const isImage = item.mime_type.startsWith('image/');
  const isVideo = item.mime_type.startsWith('video/');
  const previewUrl = `/api/media/${item.id}/thumbnail?size=md`;
  const rawUrl = `/api/media/${item.id}/raw`;

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    const totalSecs = Math.floor(seconds);
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    const secs = totalSecs % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    if (hrs > 0) return `${hrs}:${pad(mins)}:${pad(secs)}`;
    return `${pad(mins)}:${pad(secs)}`;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Frosted Glass Backdrop with Alpha variable */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-[2px] transition-none"
        onClick={onClose}
      />

      {/* Instant Pop Modal Container (Strictly zero slow animations, zero shadows, flat design) */}
      <div className="relative z-50 flex flex-col md:flex-row w-full max-w-4xl max-h-[92vh] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Media Preview Column */}
        <div className="flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[260px] md:min-h-[480px] relative border-b md:border-b-0 md:border-r border-border">
          {isImage ? (
            <img
              src={previewUrl}
              alt={item.title}
              className="max-h-[85vh] w-auto max-w-full object-contain select-none"
            />
          ) : isVideo ? (
            <VideoPlayer key={item.id} item={item} autoPlay />
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center">
              <span className="text-sm uppercase text-muted-foreground">{item.mime_type}</span>
              <span className="mt-2 text-base font-semibold">{item.filename}</span>
            </div>
          )}

          {/* Quick open raw link (shown on images) */}
          {isImage && (
            <a
              href={rawUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 px-2 py-1 rounded-sm bg-black/80 border border-border text-[11px] text-neutral-300 hover:text-white flex items-center space-x-1"
            >
              <Maximize2 className="h-3 w-3" />
              <span>原檔</span>
            </a>
          )}
        </div>

        {/* Sidecar Metadata Panel */}
        <div className="w-full md:w-88 sm:md:w-96 flex flex-col justify-between bg-card overflow-hidden max-h-[50vh] md:max-h-[92vh]">
          {/* Sticky Header Controls */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card z-10 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {isEditing ? '編輯資產' : '資產詳情'}
              </span>
              {!isEditing && (
                <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">
                  E
                </Badge>
              )}
            </div>

            <div className="flex items-center space-x-1.5">
              {!isEditing ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 px-2.5 text-xs gap-1"
                  onClick={() => setIsEditing(true)}
                >
                  <Edit3 className="h-3 w-3" />
                  <span>編輯</span>
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    取消
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    className="h-7 px-2.5 text-xs gap-1"
                    onClick={handleSave}
                    disabled={isSaving}
                  >
                    <Check className="h-3 w-3" />
                    <span>{isSaving ? '儲存中' : '儲存'}</span>
                  </Button>
                </>
              )}

              <button
                type="button"
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none ml-1"
                title="關閉"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Form / Content Body */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3.5">
            {/* Content Switch: Edit Mode vs View Mode */}
            {isEditing ? (
              /* --- EDIT FORM (Instant, Flat, shadcn Primitives) --- */
              <div className="space-y-3 text-xs">
                {/* Title */}
                <div className="space-y-1">
                  <Label htmlFor="media-edit-title">標題</Label>
                  <Input
                    id="media-edit-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={item.filename}
                  />
                </div>

                {/* Filename (Safe Rename) */}
                <div className="space-y-1">
                  <Label htmlFor="media-edit-filename">檔名</Label>
                  <Input
                    id="media-edit-filename"
                    value={filename}
                    onChange={(e) => setFilename(e.target.value)}
                  />
                </div>

                {/* Folder Directory Move */}
                {directories.length > 0 && (
                  <div className="space-y-1">
                    <Label htmlFor="media-edit-directory">所屬文件夾</Label>
                    <select
                      id="media-edit-directory"
                      value={directory}
                      onChange={(e) => setDirectory(e.target.value)}
                      className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-neutral-500 shadow-none"
                    >
                      <option value="">(根目錄)</option>
                      {directories
                        .filter((d) => d.directory !== '')
                        .map((d) => (
                          <option key={d.directory} value={d.directory}>
                            {d.directory}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Tags Editor */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <Label>標籤</Label>

                  {/* Current Tags List */}
                  <div className="flex flex-wrap gap-1 min-h-[26px]">
                    {tags.length > 0 ? (
                      tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="secondary"
                          className="text-[11px] py-0.5 px-2 flex items-center gap-1 border-border bg-secondary"
                        >
                          <span>#{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="text-muted-foreground hover:text-foreground transition-none"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/60">無標籤</span>
                    )}
                  </div>

                  {/* Add Tag Input */}
                  <div className="flex items-center space-x-1.5 pt-1">
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      placeholder="標籤名稱 (按 Enter 新增)"
                      className="h-7 text-[11px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 px-2 shrink-0"
                      onClick={handleAddTag}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />
                      新增
                    </Button>
                  </div>

                  {/* Suggested Quick Tags */}
                  {suggestedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-1">
                      <span className="text-[10px] text-muted-foreground">建議:</span>
                      {suggestedTags.map((st) => (
                        <button
                          key={st.name}
                          type="button"
                          onClick={() => handleAddSpecificTag(st.name)}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-none"
                        >
                          +{st.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Objective Notes */}
                <div className="space-y-1 pt-1 border-t border-border">
                  <Label htmlFor="media-edit-notes">客觀備註</Label>
                  <Textarea
                    id="media-edit-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="無備註"
                  />
                </div>

                {/* Source URL */}
                <div className="space-y-1 pt-1 border-t border-border">
                  <Label htmlFor="media-edit-source">來源連結</Label>
                  <Input
                    id="media-edit-source"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            ) : (
              /* --- VIEW DETAILS (Cold, Minimalist, High-Signal) --- */
              <div className="space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-foreground break-words">
                    {item.title || item.filename}
                  </h2>
                  <span className="text-[11px] text-muted-foreground break-all">{item.filename}</span>
                </div>

                {/* Spec metrics list */}
                <div className="space-y-2 pt-2 text-xs text-neutral-400 border-t border-border">
                  {item.width > 0 && item.height > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">解析度</span>
                      <span className="text-foreground">
                        {item.width} × {item.height}
                      </span>
                    </div>
                  )}
                  {item.duration > 0 && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Film className="h-3 w-3" /> 影片長度
                      </span>
                      <span className="text-foreground font-mono">
                        {formatDuration(item.duration)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-3 w-3" /> 檔案大小
                    </span>
                    <span className="text-foreground">{formatSize(item.file_size)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> 加入時間
                    </span>
                    <span className="text-foreground">{item.added_at.slice(0, 10)}</span>
                  </div>
                  {item.directory && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Folder className="h-3 w-3" /> 資料夾
                      </span>
                      <span className="text-foreground truncate max-w-[150px] font-mono">
                        {item.directory}
                      </span>
                    </div>
                  )}
                  {libraryName && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> 來源庫
                      </span>
                      <span className="text-foreground truncate max-w-[150px] font-mono">
                        {libraryName}
                      </span>
                    </div>
                  )}
                  {item.collection_id && (
                    <div className="flex items-center justify-between pt-1 border-t border-border/40">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3 text-foreground" /> 所屬合集
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCollection?.(item.collection_id!);
                        }}
                        className="text-foreground hover:underline text-xs flex items-center gap-1 font-mono"
                      >
                        <span>開啟合集</span>
                        <ExternalLink className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tags section */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <span className="text-xs uppercase text-muted-foreground">標籤</span>
                  <div className="flex flex-wrap gap-1">
                    {item.tags && item.tags.length > 0 ? (
                      item.tags.map((tag) => (
                        <Badge
                          key={tag}
                          variant="outline"
                          className="cursor-pointer text-[11px] hover:bg-foreground hover:text-background hover:border-foreground transition-none"
                          onClick={() => {
                            onTagClick?.(tag);
                            onClose();
                          }}
                        >
                          #{tag}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/60">無標籤</span>
                    )}
                  </div>
                </div>

                {/* Notes section */}
                {item.notes && (
                  <div className="space-y-1 pt-2 border-t border-border">
                    <span className="text-xs uppercase text-muted-foreground">客觀備註</span>
                    <p className="text-xs text-foreground font-serif leading-relaxed break-words whitespace-pre-wrap">
                      {item.notes}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Actions (Pinned at Bottom) */}
          <div className="px-4 sm:px-5 py-3 border-t border-border bg-card shrink-0">
            {isEditing ? (
              /* Edit Mode Actions (Delete / Confirm Delete) */
              <div>
                {!confirmDelete ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="w-full h-8 gap-1.5"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>移至垃圾桶</span>
                  </Button>
                ) : (
                  <div className="flex space-x-2">
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="flex-1 h-8"
                      disabled={isDeleting}
                      onClick={handleDelete}
                    >
                      {isDeleting ? '移動中' : '確認移入'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex-1 h-8"
                      onClick={() => setConfirmDelete(false)}
                    >
                      取消
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              /* View Mode External Links */
              <div className="space-y-1.5">
                {item.source_url && (
                  <a
                    href={item.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-1 w-full py-1.5 rounded-sm border border-border text-xs text-foreground/80 hover:text-foreground hover:border-foreground/40 bg-card transition-colors"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>來源連結</span>
                  </a>
                )}
                <a
                  href={rawUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center space-x-1 w-full py-1.5 rounded-sm bg-muted border border-border text-xs text-foreground/80 hover:text-foreground hover:border-foreground/40 transition-colors"
                >
                  <Maximize2 className="h-3 w-3" />
                  <span>開新分頁檢視原檔</span>
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
