import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Collection, CollectionItem, Tag } from '@/types/media';
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
  Maximize2,
  Film,
  Edit3,
  Trash2,
  Check,
  Layers,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Star,
  Unlink,
} from 'lucide-react';
import { VideoPlayer } from './VideoPlayer';

interface CollectionDetailDialogProps {
  collection: Collection | null;
  onClose: () => void;
  onTagClick?: (tag: string) => void;
  availableTags?: Tag[];
  onCollectionUpdated?: (updated: Collection) => void;
  onCollectionDeleted?: (deletedId: number, disbanded: boolean) => void;
}

export const CollectionDetailDialog: React.FC<CollectionDetailDialogProps> = ({
  collection,
  onClose,
  onTagClick,
  availableTags = [],
  onCollectionUpdated,
  onCollectionDeleted,
}) => {
  const { toast } = useToast();

  const [activeIndex, setActiveIndex] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<'disband' | 'delete' | null>(null);

  // Form states for collection metadata
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Reorderable members list
  const [memberItems, setMemberItems] = useState<CollectionItem[]>([]);
  const [coverMediaId, setCoverMediaId] = useState<number | undefined>(undefined);

  // Sync state whenever collection changes
  useEffect(() => {
    if (collection) {
      setTitle(collection.title || '');
      setNotes(collection.notes || '');
      setSourceUrl(collection.source_url || '');
      setTags(collection.tags ? [...collection.tags] : []);
      setMemberItems(collection.items ? [...collection.items] : []);
      setCoverMediaId(collection.cover_media_id);
      setActiveIndex(0);
      setIsEditing(false);
      setConfirmDelete(null);
      setTagInput('');
    }
  }, [collection]);

  const items = memberItems;
  const currentItem = items[activeIndex] || items[0] || null;

  // Format file size
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date
  const formatDate = (isoString: string): string => {
    try {
      const d = new Date(isoString);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    } catch {
      return '';
    }
  };

  // Format video duration
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

  // Navigation handlers
  const handlePrev = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
  }, [items.length]);

  const handleNext = useCallback(() => {
    if (items.length <= 1) return;
    setActiveIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
  }, [items.length]);

  // Suggested tags
  const suggestedTags = useMemo(() => {
    const currentTagSet = new Set(tags.map((t) => t.toLowerCase()));
    return availableTags
      .filter((t) => !currentTagSet.has(t.name.toLowerCase()))
      .slice(0, 6);
  }, [availableTags, tags]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase();
    if (!trimmed) return;
    if (!tags.includes(trimmed)) {
      setTags((prev) => [...prev, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags((prev) => prev.filter((t) => t !== tagToRemove));
  };

  // Member reordering
  const handleMoveMember = (idx: number, direction: 'up' | 'down') => {
    const newItems = [...memberItems];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newItems.length) return;

    const temp = newItems[idx];
    newItems[idx] = newItems[targetIdx];
    newItems[targetIdx] = temp;
    setMemberItems(newItems);

    if (activeIndex === idx) {
      setActiveIndex(targetIdx);
    } else if (activeIndex === targetIdx) {
      setActiveIndex(idx);
    }
  };

  // Set cover media
  const handleSetCover = (id: number) => {
    setCoverMediaId(id);
    toast('已設為封面', 'success');
  };

  // Save changes
  const handleSave = async () => {
    if (!collection) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim(),
          sourceUrl: sourceUrl.trim(),
          tags,
          mediaIds: memberItems.map((m) => m.id),
          coverMediaId,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || '儲存失敗');
      }

      const json = await res.json();
      setIsEditing(false);
      onCollectionUpdated?.(json.data);
      toast('已儲存', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '儲存失敗';
      toast(msg, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Disband or Move collection to trash
  const handleDeleteAction = async (keepFiles: boolean) => {
    if (!collection) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/collections/${collection.id}/trash`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || '操作失敗');
      }

      onCollectionDeleted?.(collection.id, keepFiles);
      toast(keepFiles ? '已解散' : '已移至垃圾桶', 'success');
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '操作失敗';
      toast(msg, 'error');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(null);
    }
  };

  // Keyboard navigation & shortcuts
  useEffect(() => {
    if (!collection) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (isEditing) {
          e.preventDefault();
          handleSave();
        }
        return;
      }

      if (!isEditing && !isInput) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          handlePrev();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          handleNext();
        } else if (e.key === 'e' || e.key === 'E') {
          e.preventDefault();
          setIsEditing(true);
        }
      }

      if (e.key === 'Escape') {
        if (confirmDelete) {
          setConfirmDelete(null);
        } else if (isEditing) {
          setIsEditing(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [collection, isEditing, confirmDelete, handlePrev, handleNext, onClose]);

  if (!collection) return null;

  const isCurrentItemVideo = currentItem?.mime_type.startsWith('video/');
  const currentPreviewUrl = currentItem ? `/api/media/${currentItem.id}/thumbnail?size=md` : '';
  const currentRawUrl = currentItem ? `/api/media/${currentItem.id}/raw` : '';

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
    >
      {/* Frosted Glass Backdrop */}
      <div
        className="fixed inset-0 bg-overlay backdrop-blur-[2px] transition-none"
        onClick={onClose}
      />

      {/* Modal Container: Instant pop, zero shadows, flat design, strict anti-jitter */}
      <div className="relative z-50 flex flex-col md:flex-row w-full max-w-5xl max-h-[92vh] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Left Column: Media Preview + Filmstrip */}
        <div className="flex-1 bg-black flex flex-col justify-between overflow-hidden min-h-[300px] md:min-h-[520px] relative border-b md:border-b-0 md:border-r border-border">
          {/* Top Bar on Preview: Status & Index Indicator */}
          <div className="absolute top-3 inset-x-3 flex items-center justify-between z-20 pointer-events-none">
            <div className="px-2 py-1 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-xs text-white flex items-center gap-1.5 pointer-events-auto">
              <Layers className="h-3 w-3 text-white" />
              <span>{activeIndex + 1} / {items.length}</span>
              {currentItem?.id === coverMediaId && (
                <span className="text-[10px] text-amber-400 font-semibold border-l border-white/20 pl-1.5 ml-0.5">
                  封面
                </span>
              )}
            </div>

            {currentItem && (
              <div className="px-2 py-1 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[11px] text-neutral-300 pointer-events-auto">
                {isCurrentItemVideo ? (
                  <span className="flex items-center gap-1">
                    <Film className="h-3 w-3" />
                    {currentItem.duration ? formatDuration(currentItem.duration) : '影片'}
                  </span>
                ) : (
                  <span>{currentItem.width}×{currentItem.height}</span>
                )}
              </div>
            )}
          </div>

          {/* Navigation Arrows (shown if > 1 item) */}
          {items.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-sm bg-black/70 hover:bg-black/90 border border-white/10 text-white z-20 transition-none"
                title="上一個 (←)"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-sm bg-black/70 hover:bg-black/90 border border-white/10 text-white z-20 transition-none"
                title="下一個 (→)"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </>
          )}

          {/* Main Visual Display Area */}
          <div className="flex-1 flex items-center justify-center p-2 relative overflow-hidden">
            {currentItem ? (
              isCurrentItemVideo ? (
                <VideoPlayer key={currentItem.id} item={currentItem} autoPlay />
              ) : (
                <img
                  key={currentItem.id}
                  src={currentPreviewUrl}
                  alt={currentItem.title}
                  className="max-h-[65vh] w-auto max-w-full object-contain select-none"
                />
              )
            ) : (
              <div className="text-muted-foreground text-xs">無成員項目</div>
            )}

            {/* Quick Open Raw button for images */}
            {currentItem && !isCurrentItemVideo && (
              <a
                href={currentRawUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="absolute bottom-3 right-3 px-2 py-1 rounded-sm bg-black/80 border border-border text-[11px] text-neutral-300 hover:text-white flex items-center space-x-1 z-10"
              >
                <Maximize2 className="h-3 w-3" />
                <span>原檔</span>
              </a>
            )}
          </div>

          {/* Bottom Filmstrip Dock (Horizontal Scrolling) */}
          {items.length > 0 && (
            <div className="h-20 bg-neutral-950 border-t border-border flex items-center px-3 gap-2 overflow-x-auto shrink-0 select-none z-10">
              {items.map((it, idx) => {
                const isSelected = idx === activeIndex;
                const isVideo = it.mime_type.startsWith('video/');
                const isCover = it.id === coverMediaId;
                return (
                  <div
                    key={it.id}
                    onClick={() => setActiveIndex(idx)}
                    className={`relative h-14 w-14 shrink-0 rounded-sm overflow-hidden cursor-pointer border transition-none flex items-center justify-center bg-black ${
                      isSelected
                        ? 'border-white ring-1 ring-white'
                        : 'border-neutral-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={`/api/media/${it.id}/thumbnail?size=sm`}
                      alt={it.title}
                      className="h-full w-full object-cover"
                    />
                    {isVideo && (
                      <div className="absolute top-1 left-1 p-0.5 bg-black/80 rounded-[2px] text-white">
                        <Film className="h-2.5 w-2.5" />
                      </div>
                    )}
                    {isCover && (
                      <div className="absolute bottom-1 right-1 p-0.5 bg-black/80 rounded-[2px] text-amber-400">
                        <Star className="h-2.5 w-2.5 fill-amber-400" />
                      </div>
                    )}
                    <span className="absolute bottom-1 left-1 text-[9px] font-mono text-white/90 bg-black/70 px-0.5 leading-none">
                      {idx + 1}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Metadata & Management Panel */}
        <div className="w-full md:w-96 flex flex-col justify-between bg-card overflow-hidden max-h-[50vh] md:max-h-[92vh]">
          {/* Header Controls */}
          <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card z-10 shrink-0">
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                {isEditing ? '編輯合集' : '合集詳情'}
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">
                {collection.item_count} 項目
              </Badge>
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
                <Button
                  variant="default"
                  size="sm"
                  disabled={isSaving}
                  className="h-7 px-2.5 text-xs gap-1 bg-white text-black hover:bg-neutral-200"
                  onClick={handleSave}
                >
                  <Check className="h-3 w-3" />
                  <span>{isSaving ? '儲存中' : '完成'}</span>
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Scrollable Information Body */}
          <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-4">
            {isEditing ? (
              /* Edit Mode Form */
              <div className="space-y-4 text-xs">
                {/* Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="col-title" className="text-xs text-muted-foreground">
                    標題
                  </Label>
                  <Input
                    id="col-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="h-8 text-xs font-mono bg-card border-border text-foreground"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="col-notes" className="text-xs text-muted-foreground">
                    客觀備註
                  </Label>
                  <Textarea
                    id="col-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="text-xs font-serif bg-card border-border text-foreground resize-none"
                  />
                </div>

                {/* Source URL */}
                <div className="space-y-1.5">
                  <Label htmlFor="col-source" className="text-xs text-muted-foreground">
                    來源 URL
                  </Label>
                  <Input
                    id="col-source"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="h-8 text-xs font-mono bg-card border-border text-foreground"
                  />
                </div>

                {/* Tags Management */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">標籤</Label>
                  <div className="flex flex-wrap gap-1 p-2 bg-card border border-border rounded-sm min-h-[42px]">
                    {tags.map((t) => (
                      <Badge
                        key={t}
                        variant="secondary"
                        className="text-[10px] py-0 px-1.5 gap-1 bg-secondary text-secondary-foreground"
                      >
                        #{t}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(t)}
                          className="hover:text-foreground"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      onBlur={handleAddTag}
                      placeholder={tags.length === 0 ? '輸入標籤...' : ''}
                      className="flex-1 min-w-[80px] bg-transparent text-xs text-foreground outline-none"
                    />
                  </div>

                  {suggestedTags.length > 0 && (
                    <div className="flex items-center gap-1 pt-1 overflow-x-auto text-[10px] text-muted-foreground">
                      <span>推薦：</span>
                      {suggestedTags.map((st) => (
                        <button
                          key={st.name}
                          type="button"
                          onClick={() => setTags((prev) => [...prev, st.name.toLowerCase()])}
                          className="hover:text-foreground underline underline-offset-2"
                        >
                          +{st.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Reorder Members */}
                <div className="space-y-1.5 pt-2 border-t border-border">
                  <Label className="text-xs text-muted-foreground">成員排序與封面</Label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {memberItems.map((m, idx) => (
                      <div
                        key={m.id}
                        className={`flex items-center justify-between p-1.5 rounded-sm border ${
                          idx === activeIndex
                            ? 'bg-muted border-foreground/30'
                            : 'bg-card border-border'
                        }`}
                      >
                        <div className="flex items-center space-x-2 truncate flex-1">
                          <span className="text-[10px] text-muted-foreground font-mono w-4">
                            {idx + 1}.
                          </span>
                          <span className="text-xs truncate font-mono text-foreground">
                            {m.filename}
                          </span>
                          {m.id === coverMediaId && (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-amber-500/40 text-amber-500 dark:text-amber-400">
                              封面
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            disabled={idx === 0}
                            onClick={() => handleMoveMember(idx, 'up')}
                            title="上移"
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-foreground"
                            disabled={idx === memberItems.length - 1}
                            onClick={() => handleMoveMember(idx, 'down')}
                            title="下移"
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 ${
                              m.id === coverMediaId
                                ? 'text-amber-500 dark:text-amber-400'
                                : 'text-muted-foreground hover:text-amber-500 dark:hover:text-amber-400'
                            }`}
                            onClick={() => handleSetCover(m.id)}
                            title="設為封面"
                          >
                            <Star className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* View Mode */
              <div className="space-y-4">
                {/* Collection Title */}
                <div>
                  <h3 className="text-base sm:text-lg font-semibold text-foreground tracking-tight break-words">
                    {collection.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                    <span className="font-mono">
                      {collection.image_count} 圖 · {collection.video_count} 片
                    </span>
                    <span>·</span>
                    <span className="font-mono">{formatSize(collection.total_bytes)}</span>
                  </div>
                </div>

                {/* Objective Notes */}
                {collection.notes ? (
                  <div className="p-3 bg-card border border-border rounded-sm">
                    <p className="text-xs text-foreground font-serif leading-relaxed whitespace-pre-wrap">
                      {collection.notes}
                    </p>
                  </div>
                ) : null}

                {/* Collection Tags */}
                {collection.tags && collection.tags.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      標籤
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {collection.tags.map((t) => (
                        <Badge
                          key={t}
                          variant="outline"
                          className="cursor-pointer text-[10px] py-0.5 px-2 hover:bg-foreground hover:text-background transition-none"
                          onClick={() => onTagClick?.(t)}
                        >
                          #{t}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Source Link */}
                {collection.source_url && (
                  <div className="space-y-1">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      來源
                    </span>
                    <a
                      href={collection.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1.5 text-xs text-muted-foreground hover:text-foreground underline underline-offset-4 truncate"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      <span className="truncate">{collection.source_url}</span>
                    </a>
                  </div>
                )}

                {/* Current Active Member Specs */}
                {currentItem && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      當前項目規格 ({activeIndex + 1}/{items.length})
                    </span>
                    <div className="grid grid-cols-2 gap-2 p-2.5 bg-card border border-border rounded-sm text-[11px]">
                      <div>
                        <span className="text-muted-foreground block">檔名</span>
                        <span className="text-foreground truncate block font-mono">
                          {currentItem.filename}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">格式</span>
                        <span className="text-foreground block uppercase font-mono">
                          {currentItem.mime_type.split('/')[1]}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">大小</span>
                        <span className="text-foreground block font-mono">
                          {formatSize(currentItem.file_size)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">尺寸</span>
                        <span className="text-foreground block font-mono">
                          {isCurrentItemVideo && currentItem.duration
                            ? `${formatDuration(currentItem.duration)} · ${currentItem.width}×${currentItem.height}`
                            : `${currentItem.width}×${currentItem.height}`}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Created Date */}
                <div className="flex items-center space-x-2 text-[11px] text-muted-foreground pt-1">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>建立於 {formatDate(collection.created_at)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Footer Action Bar */}
          <div className="p-3 sm:p-4 border-t border-border bg-card shrink-0">
            {confirmDelete ? (
              <div className="flex flex-col space-y-2">
                <span className="text-xs text-foreground">
                  {confirmDelete === 'disband'
                    ? '解散合集將保留全部原生媒體檔案，確定解散？'
                    : '將合集移至垃圾桶，可隨時在垃圾桶中還原。'}
                </span>
                <div className="flex items-center space-x-2">
                  <Button
                    variant={confirmDelete === 'delete' ? 'destructive' : 'default'}
                    size="sm"
                    disabled={isDeleting}
                    className="flex-1 h-7 text-xs"
                    onClick={() => handleDeleteAction(confirmDelete === 'disband')}
                  >
                    {isDeleting ? '處理中' : confirmDelete === 'disband' ? '確認解散' : '確認移入'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setConfirmDelete(null)}
                  >
                    取消
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
                  onClick={() => setConfirmDelete('disband')}
                >
                  <Unlink className="h-3 w-3" />
                  <span>解散合集</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-500/10 gap-1"
                  onClick={() => setConfirmDelete('delete')}
                >
                  <Trash2 className="h-3 w-3" />
                  <span>移至垃圾桶</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
