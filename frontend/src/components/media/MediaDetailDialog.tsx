import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MediaItem, Library, DirectoryDetail, Tag, Collection } from '@/types/media';
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
  Minimize2,
  Folder,
  Film,
  Edit3,
  Trash2,
  Check,
  Plus,
  Layers,
  Download,
  FileText,
  FileCode,
  FileSpreadsheet,
  Archive,
  File,
  Music,
  Globe,
  ChevronLeft,
  ChevronRight,
  Info,
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
  // 垂直維度：資產切換 (↕ 上下)
  onPrev?: () => void;
  onNext?: () => void;
  currentIndex?: number;
  totalCount?: number;
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
  onPrev,
  onNext,
}) => {
  const { toast } = useToast();

  // 二級詳情視窗開關（預設為 false，最大化保留純淨沉浸視野）
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  // 圖片縮放模式：'fit' 適配視窗 | 'actual' 100% 原始像素
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual'>('fit');

  // 水平維度：同群組文件列表與索引 (↔ 左右)
  const [groupItems, setGroupItems] = useState<MediaItem[]>([]);
  const [groupIndex, setGroupIndex] = useState<number>(0);

  // 編輯與刪除狀態
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // 編輯表單狀態
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [filename, setFilename] = useState('');
  const [directory, setDirectory] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // 滾輪切換防抖計時器
  const wheelDebounceRef = useRef<number | null>(null);

  // 1. 當主資產 (item) 改變時，載入同群組 (Collection) 關聯檔案
  useEffect(() => {
    if (!item) {
      setGroupItems([]);
      setGroupIndex(0);
      return;
    }

    // 若屬於某合集，請求該合集內所有檔案以支援左右切換
    if (item.collection_id) {
      fetch(`/api/collections/${item.collection_id}`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json: { data?: Collection } | null) => {
          if (json?.data?.items && json.data.items.length > 0) {
            setGroupItems(json.data.items);
            const foundIdx = json.data.items.findIndex((it) => it.id === item.id);
            setGroupIndex(foundIdx >= 0 ? foundIdx : 0);
          } else {
            setGroupItems([item]);
            setGroupIndex(0);
          }
        })
        .catch(() => {
          setGroupItems([item]);
          setGroupIndex(0);
        });
    } else {
      setGroupItems([item]);
      setGroupIndex(0);
    }

    setZoomMode('fit');
    setIsEditing(false);
    setConfirmDelete(false);
  }, [item]);

  // 當前正在檢視的群組內檔案
  const activeFile: MediaItem | null = useMemo(() => {
    if (groupItems.length > 0 && groupIndex >= 0 && groupIndex < groupItems.length) {
      return groupItems[groupIndex];
    }
    return item;
  }, [groupItems, groupIndex, item]);

  // 同步表單狀態至當前 activeFile
  useEffect(() => {
    if (activeFile) {
      setTitle(activeFile.title || '');
      setNotes(activeFile.notes || '');
      setSourceUrl(activeFile.source_url || '');
      setFilename(activeFile.filename || '');
      setDirectory(activeFile.directory || '');
      setTags(activeFile.tags ? [...activeFile.tags] : []);
      setIsEditing(false);
      setConfirmDelete(false);
      setTagInput('');
      setZoomMode('fit');
    }
  }, [activeFile]);

  // 水平維度導航：同群組內切換 (↔)
  const handleNavigateGroup = useCallback((delta: number) => {
    setGroupIndex((prev) => {
      const next = prev + delta;
      if (next >= 0 && next < groupItems.length) {
        return next;
      }
      return prev;
    });
    setZoomMode('fit');
    setIsEditing(false);
  }, [groupItems.length]);

  // 垂直維度導航：切換主要資產 (↕)
  const handlePrevAsset = useCallback(() => {
    if (onPrev) {
      onPrev();
      setZoomMode('fit');
      setIsEditing(false);
    }
  }, [onPrev]);

  const handleNextAsset = useCallback(() => {
    if (onNext) {
      onNext();
      setZoomMode('fit');
      setIsEditing(false);
    }
  }, [onNext]);

  // 滑鼠滾輪雙軸導航（垂直切換資產，水平切換群組）
  const handleStageWheel = useCallback((e: React.WheelEvent) => {
    if (zoomMode === 'actual') return; // 1:1 縮放狀態下保留原生滾動檢視

    e.preventDefault();
    if (wheelDebounceRef.current) return;

    const deltaY = e.deltaY;
    const deltaX = e.deltaX;

    // 垂直滾動：切換資產 (↕)
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 25) {
      if (deltaY > 0 && onNext) {
        handleNextAsset();
      } else if (deltaY < 0 && onPrev) {
        handlePrevAsset();
      }
    }
    // 水平滾動：切換同群組文件 (↔)
    else if (Math.abs(deltaX) > 25 && groupItems.length > 1) {
      if (deltaX > 0) {
        handleNavigateGroup(1);
      } else {
        handleNavigateGroup(-1);
      }
    }

    wheelDebounceRef.current = window.setTimeout(() => {
      wheelDebounceRef.current = null;
    }, 280);
  }, [zoomMode, onNext, onPrev, handleNextAsset, handlePrevAsset, groupItems.length, handleNavigateGroup]);

  // 建議標籤
  const suggestedTags = useMemo(() => {
    const currentTagSet = new Set(tags.map((t) => t.toLowerCase()));
    return availableTags
      .filter((t) => !currentTagSet.has(t.name.toLowerCase()))
      .slice(0, 6);
  }, [availableTags, tags]);

  // 新增標籤
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

  const handleAddSpecificTag = (tagName: string) => {
    const norm = tagName.trim().toLowerCase();
    if (norm && !tags.includes(norm)) {
      setTags((prev) => [...prev, norm]);
    }
  };

  // 取消編輯
  const handleCancelEdit = useCallback(() => {
    if (activeFile) {
      setTitle(activeFile.title || '');
      setNotes(activeFile.notes || '');
      setSourceUrl(activeFile.source_url || '');
      setFilename(activeFile.filename || '');
      setDirectory(activeFile.directory || '');
      setTags(activeFile.tags ? [...activeFile.tags] : []);
    }
    setIsEditing(false);
    setConfirmDelete(false);
    setTagInput('');
  }, [activeFile]);

  // 儲存編輯
  const handleSave = useCallback(async () => {
    if (!activeFile) return;
    setIsSaving(true);
    try {
      const res = await fetch(`/api/media/${activeFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          notes: notes.trim(),
          sourceUrl: sourceUrl.trim(),
          tags,
          filename: filename.trim() !== activeFile.filename ? filename.trim() : undefined,
          directory: directory !== activeFile.directory ? directory : undefined,
        }),
      });

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || '儲存失敗');
      }

      const json = (await res.json()) as { success: boolean; data: MediaItem };
      if (json.data) {
        // 更新群組列表中的該項
        setGroupItems((prev) =>
          prev.map((it) => (it.id === json.data.id ? json.data : it))
        );
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
  }, [activeFile, title, notes, sourceUrl, tags, filename, directory, onItemUpdated, toast]);

  // 移至垃圾桶
  const handleDelete = async () => {
    if (!activeFile) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/media/${activeFile.id}/trash`, {
        method: 'POST',
      });

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || '移至垃圾桶失敗');
      }

      toast('已移至垃圾桶', 'success');
      onItemDeleted?.(activeFile.id);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '操作失敗';
      toast(message, 'error');
    } finally {
      setIsDeleting(false);
      setConfirmDelete(false);
    }
  };

  // 雙軸全域鍵盤快捷鍵 (↑/↓: 資產, ←/→: 同群組, I: 詳情, Z: 縮放, Esc: 退出)
  useEffect(() => {
    if (!item) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      // Cmd+S / Ctrl+S 儲存編輯
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        if (isEditing) {
          e.preventDefault();
          handleSave();
        }
        return;
      }

      // 輸入框中不攔截一般單鍵
      if (isInput) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelEdit();
        }
        return;
      }

      // 垂直維度：切換資產 (↑ / ↓)
      if (e.key === 'ArrowUp' && onPrev) {
        e.preventDefault();
        handlePrevAsset();
        return;
      }
      if (e.key === 'ArrowDown' && onNext) {
        e.preventDefault();
        handleNextAsset();
        return;
      }

      // 水平維度：同群組切換 (← / →)
      if (e.key === 'ArrowLeft' && groupItems.length > 1) {
        e.preventDefault();
        handleNavigateGroup(-1);
        return;
      }
      if (e.key === 'ArrowRight' && groupItems.length > 1) {
        e.preventDefault();
        handleNavigateGroup(1);
        return;
      }

      // I: 切換二級詳情視窗
      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setIsDrawerOpen((prev) => !prev);
        return;
      }

      // Z: 切換縮放模式
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        setZoomMode((prev) => (prev === 'fit' ? 'actual' : 'fit'));
        return;
      }

      // E: 進入編輯模式
      if (!isEditing && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        setIsDrawerOpen(true);
        setIsEditing(true);
        return;
      }

      // Escape 鍵層級退出
      if (e.key === 'Escape') {
        e.preventDefault();
        if (isEditing) {
          handleCancelEdit();
        } else if (isDrawerOpen) {
          setIsDrawerOpen(false);
        } else {
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    item,
    isEditing,
    isDrawerOpen,
    handleSave,
    handleCancelEdit,
    onPrev,
    onNext,
    handlePrevAsset,
    handleNextAsset,
    groupItems.length,
    handleNavigateGroup,
    onClose,
  ]);

  if (!item || !activeFile) return null;

  const libraryName = activeFile.library_id
    ? libraries.find((l) => l.id === activeFile.library_id)?.name
    : undefined;

  const isBookmarkItem =
    activeFile.mime_type === 'application/x-url' ||
    activeFile.filename.endsWith('.url') ||
    activeFile.filename.endsWith('.webloc');
  const hasSnapshot = isBookmarkItem && activeFile.width > 0 && activeFile.height > 0;
  const isImage = activeFile.mime_type.startsWith('image/') || hasSnapshot;
  const isVideo = activeFile.mime_type.startsWith('video/');
  const ext = ('.' + (activeFile.filename.split('.').pop() || '')).toLowerCase();
  const extLabel = isBookmarkItem ? 'URL' : ext.replace('.', '').toUpperCase() || 'FILE';

  const previewUrl = `/api/media/${activeFile.id}/thumbnail?size=lg`;
  const rawUrl = `/api/media/${activeFile.id}/raw`;

  const getDocumentIcon = (extension: string, mime: string) => {
    if (['.pdf', '.doc', '.docx', '.txt', '.md', '.markdown', '.rtf', '.epub'].includes(extension)) {
      return <FileText className="h-10 w-10 stroke-[1.5]" />;
    }
    if (['.xls', '.xlsx', '.csv'].includes(extension)) {
      return <FileSpreadsheet className="h-10 w-10 stroke-[1.5]" />;
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(extension)) {
      return <Archive className="h-10 w-10 stroke-[1.5]" />;
    }
    if (
      ['.js', '.ts', '.jsx', '.tsx', '.py', '.go', '.rs', '.c', '.cpp', '.h', '.hpp', '.json', '.html', '.css', '.sh', '.bash'].includes(
        extension
      )
    ) {
      return <FileCode className="h-10 w-10 stroke-[1.5]" />;
    }
    if (mime.startsWith('audio/') || ['.mp3', '.wav', '.flac', '.ogg', '.m4a'].includes(extension)) {
      return <Music className="h-10 w-10 stroke-[1.5]" />;
    }
    return <File className="h-10 w-10 stroke-[1.5]" />;
  };

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

  const hasGroup = groupItems.length > 1;

  // 依據媒體長寬比動態自適應容器寬度，徹底消除兩側留白並最大化螢幕利用率
  let containerMaxWidthClass = 'max-w-[650px]';
  if (isBookmarkItem || (!isImage && !isVideo)) {
    containerMaxWidthClass = 'max-w-[560px]';
  } else if (isVideo) {
    containerMaxWidthClass = 'max-w-[880px] lg:max-w-[960px]';
  } else if (activeFile.width > 0 && activeFile.height > 0) {
    const ratio = activeFile.width / activeFile.height;
    if (ratio >= 1.2) {
      // 橫向大圖：充分利用螢幕寬度
      containerMaxWidthClass = 'max-w-[880px] lg:max-w-[960px]';
    } else if (ratio <= 0.85) {
      // 直向圖片：緊密收斂寬度，讓直向圖片橫向貼滿邊界，消除兩側留白
      containerMaxWidthClass = 'max-w-[460px] sm:max-w-[500px]';
    } else {
      // 方形或微橫/微直圖片（0.85 ~ 1.2）
      containerMaxWidthClass = 'max-w-[580px] sm:max-w-[620px]';
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 md:p-8 bg-overlay backdrop-blur-[2px] select-none"
      onClick={onClose}
    >
      {/* ============================================================ */}
      {/* FLOATING DIALOG CONTAINER (Adaptive Dynamic Width, Flat, 1px Border) */}
      {/* ============================================================ */}
      <div
        className={`relative z-50 flex flex-col w-full ${containerMaxWidthClass} h-[88vh] max-h-[920px] bg-background border border-border rounded-sm overflow-hidden shadow-none font-mono text-foreground select-none transition-[max-width] duration-150`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ========================================================== */}
        {/* MAIN IMMERSIVE STAGE                                       */}
        {/* ========================================================== */}
        <div
          className="relative flex-1 flex flex-col bg-background overflow-hidden h-full"
          onWheel={handleStageWheel}
        >
          {/* 1. FLOATING TOPBAR IN DIALOG */}
          <header className="absolute top-0 left-0 right-0 z-30 h-12 px-3 md:px-4 flex items-center justify-between pointer-events-none">
            {/* Left: Group Navigator (if in collection) */}
            <div className="pointer-events-auto flex items-center space-x-2 text-xs">
              {hasGroup && (
                <div
                  className="flex items-center space-x-1 px-2 py-0.5 rounded-sm bg-card border border-border text-foreground text-[11px]"
                  title="左右滑動切換同群組文件 (← / →)"
                >
                  <button
                    type="button"
                    onClick={() => handleNavigateGroup(-1)}
                    disabled={groupIndex === 0}
                    className="p-0.5 rounded-sm hover:text-foreground text-muted-foreground disabled:opacity-30 disabled:pointer-events-none transition-none"
                    title="同群組上一件 (←)"
                  >
                    <ChevronLeft className="h-3 w-3" />
                  </button>
                  <span className="font-mono text-muted-foreground text-[10px]">群組</span>
                  <span className="font-bold text-foreground font-mono text-[11px]">
                    {groupIndex + 1} / {groupItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleNavigateGroup(1)}
                    disabled={groupIndex === groupItems.length - 1}
                    className="p-0.5 rounded-sm hover:text-foreground text-muted-foreground disabled:opacity-30 disabled:pointer-events-none transition-none"
                    title="同群組下一件 (→)"
                  >
                    <ChevronRight className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>

            {/* Right: Actions (Zoom, Drawer, Edit, Close) */}
            <div className="pointer-events-auto flex items-center space-x-1.5 text-xs ml-auto">
              {/* Zoom toggle (images only) */}
              {isImage && (
                <button
                  type="button"
                  onClick={() => setZoomMode((prev) => (prev === 'fit' ? 'actual' : 'fit'))}
                  className={`flex items-center space-x-1 h-7 px-2.5 rounded-sm border text-[11px] transition-none ${
                    zoomMode === 'actual'
                      ? 'border-foreground bg-foreground text-background font-semibold'
                      : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground'
                  }`}
                  title="切換適配/原始解析度 (Z)"
                >
                  {zoomMode === 'actual' ? (
                    <Minimize2 className="h-3 w-3" />
                  ) : (
                    <Maximize2 className="h-3 w-3" />
                  )}
                  <span>{zoomMode === 'actual' ? '1:1' : '適配'}</span>
                  <span className="text-[10px] opacity-60 ml-0.5">Z</span>
                </button>
              )}

              {/* Secondary Inspector Drawer Toggle */}
              <button
                type="button"
                onClick={() => setIsDrawerOpen((prev) => !prev)}
                className={`flex items-center space-x-1 h-7 px-2.5 rounded-sm border text-[11px] transition-none ${
                  isDrawerOpen
                    ? 'border-foreground bg-foreground text-background font-semibold'
                    : 'border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground'
                }`}
                title="切換二級詳情視窗 (I)"
              >
                <Info className="h-3 w-3" />
                <span>詳情</span>
                <span className="text-[10px] opacity-60 ml-0.5">I</span>
              </button>

              {/* Edit button */}
              <button
                type="button"
                onClick={() => {
                  setIsDrawerOpen(true);
                  setIsEditing(true);
                }}
                className="flex items-center space-x-1 h-7 px-2.5 rounded-sm border border-border bg-card text-[11px] text-muted-foreground hover:text-foreground hover:border-foreground transition-none"
                title="編輯 (E)"
              >
                <Edit3 className="h-3 w-3" />
                <span>編輯</span>
                <span className="text-[10px] opacity-60 ml-0.5">E</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={onClose}
                className="h-7 w-7 rounded-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground flex items-center justify-center transition-none ml-1"
                title="關閉 (Esc)"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </header>

          {/* 2. SCROLLABLE FEED / POST CONTAINER */}
          <div className="flex-1 overflow-y-auto flex flex-col pt-12">
            {/* Top Media Presentation Stage */}
            <div className="relative w-full flex items-center justify-center p-0 select-none min-h-[280px] bg-secondary overflow-hidden">
              {isImage ? (
                <img
                  src={zoomMode === 'actual' ? rawUrl : previewUrl}
                  alt={activeFile.title || activeFile.filename}
                  className={`${
                    zoomMode === 'actual'
                      ? 'max-w-none max-h-none w-auto h-auto cursor-zoom-out'
                      : 'w-full h-auto max-h-[72vh] object-contain cursor-zoom-in block'
                  } transition-none`}
                  onClick={() => setZoomMode((prev) => (prev === 'fit' ? 'actual' : 'fit'))}
                  onError={(e) => {
                    const target = e.currentTarget;
                    if (target.src !== rawUrl) {
                      target.src = rawUrl;
                    }
                  }}
                />
              ) : isVideo ? (
                <div
                  className="w-full max-h-[72vh] flex items-center justify-center overflow-hidden"
                  onClick={(e) => e.stopPropagation()}
                >
                  <VideoPlayer key={activeFile.id} item={activeFile} autoPlay />
                </div>
              ) : isBookmarkItem ? (
                <div
                  className="flex flex-col items-center justify-center p-8 max-w-md w-full bg-card border border-border rounded-sm text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-16 w-16 rounded-sm border border-border bg-muted flex items-center justify-center text-foreground mb-4">
                    <Globe className="h-8 w-8 stroke-[1.5]" />
                  </div>
                  <span className="px-2.5 py-0.5 rounded-sm bg-secondary text-[11px] font-mono font-bold tracking-widest uppercase border border-border text-foreground mb-2">
                    URL 書籤
                  </span>
                  <h3 className="text-sm font-bold text-foreground break-all mb-1">
                    {activeFile.title || activeFile.filename}
                  </h3>
                  {activeFile.bookmark?.domain && (
                    <span className="text-xs text-muted-foreground font-mono mb-6">
                      {activeFile.bookmark.domain}
                    </span>
                  )}

                  <div className="flex items-center gap-2 w-full justify-center">
                    {activeFile.source_url && (
                      <a
                        href={activeFile.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1.5 h-8 px-4 rounded-sm border border-foreground bg-foreground text-background text-xs font-semibold hover:opacity-90 transition-opacity shadow-none select-none"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>開啟網址</span>
                      </a>
                    )}
                    <a
                      href={`${rawUrl}?download=1`}
                      download={activeFile.filename}
                      className="flex items-center space-x-1.5 h-8 px-3 rounded-sm border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors shadow-none select-none"
                      title="下載快捷檔"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center p-8 max-w-md w-full bg-card border border-border rounded-sm text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="h-16 w-16 rounded-sm border border-border bg-muted flex items-center justify-center text-foreground mb-4">
                    {getDocumentIcon(ext, activeFile.mime_type)}
                  </div>
                  <span className="px-2.5 py-0.5 rounded-sm bg-secondary text-[11px] font-mono font-bold tracking-widest uppercase border border-border text-foreground mb-2">
                    {extLabel}
                  </span>
                  <h3 className="text-sm font-bold text-foreground break-all mb-1">
                    {activeFile.filename}
                  </h3>
                  <span className="text-xs text-muted-foreground font-mono mb-6">
                    {formatSize(activeFile.file_size)} · {activeFile.mime_type}
                  </span>

                  <a
                    href={`${rawUrl}?download=1`}
                    download={activeFile.filename}
                    className="flex items-center space-x-2 h-8 px-5 rounded-sm border border-border bg-card text-xs font-semibold text-foreground hover:bg-accent hover:border-foreground transition-colors shadow-none select-none"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>下載原檔</span>
                  </a>
                </div>
              )}

              {/* Horizontal: Group Left (◀) */}
              {hasGroup && (
                <button
                  type="button"
                  onClick={() => handleNavigateGroup(-1)}
                  disabled={groupIndex === 0}
                  className="absolute left-3 top-1/2 -translate-y-1/2 z-20 h-10 w-8 rounded-sm bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                  title="同群組上一件 (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              )}

              {/* Horizontal: Group Right (▶) */}
              {hasGroup && (
                <button
                  type="button"
                  onClick={() => handleNavigateGroup(1)}
                  disabled={groupIndex === groupItems.length - 1}
                  className="absolute right-3 top-1/2 -translate-y-1/2 z-20 h-10 w-8 rounded-sm bg-card border border-border text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
                  title="同群組下一件 (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}

              {/* Bottom Floating Group Dots (Only if group > 1) */}
              {hasGroup && (
                <div className="absolute bottom-2 left-0 right-0 z-20 flex justify-center pointer-events-none">
                  <div className="pointer-events-auto flex items-center space-x-1.5 px-2 py-0.5 rounded-sm bg-card border border-border">
                    {groupItems.map((gItem, idx) => (
                      <button
                        key={gItem.id}
                        type="button"
                        onClick={() => setGroupIndex(idx)}
                        className={`h-1.5 rounded-full transition-all ${
                          idx === groupIndex ? 'w-5 bg-foreground' : 'w-1.5 bg-muted-foreground opacity-40 hover:opacity-100'
                        }`}
                        title={gItem.title || gItem.filename}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Post Information & Tags Underneath Media */}
            <div className="px-5 py-4 border-t border-border bg-card space-y-3">
              {/* Title & Filename */}
              <div>
                <h2 className="text-sm font-bold text-foreground break-words leading-tight">
                  {activeFile.title || activeFile.filename}
                </h2>
                {activeFile.title && activeFile.title !== activeFile.filename && (
                  <span className="text-[11px] text-muted-foreground font-mono break-all block mt-0.5">
                    {activeFile.filename}
                  </span>
                )}
              </div>

              {/* Notes (Serif Typography) */}
              {activeFile.notes && (
                <p className="text-xs text-foreground font-serif leading-relaxed whitespace-pre-wrap break-words">
                  {activeFile.notes}
                </p>
              )}

              {/* Tag Badges List */}
              {activeFile.tags && activeFile.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {activeFile.tags.map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="cursor-pointer text-[11px] py-0.5 px-2 hover:bg-foreground hover:text-background hover:border-foreground transition-none border-border"
                      onClick={() => {
                        onTagClick?.(tag);
                        onClose();
                      }}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* Metadata Specs Row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-border text-[11px] text-muted-foreground font-mono">
                <span className="font-bold text-foreground uppercase tracking-wider">{extLabel}</span>
                {activeFile.width > 0 && activeFile.height > 0 && (
                  <span>{activeFile.width} × {activeFile.height}</span>
                )}
                {activeFile.duration > 0 && (
                  <span>{formatDuration(activeFile.duration)}</span>
                )}
                <span>{formatSize(activeFile.file_size)}</span>
                <span>{activeFile.added_at.slice(0, 10)}</span>
                {activeFile.directory && (
                  <span className="truncate max-w-[150px] inline-flex items-center">
                    <Folder className="h-3 w-3 mr-1 shrink-0" />
                    {activeFile.directory}
                  </span>
                )}
                {activeFile.collection_id && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCollection?.(activeFile.collection_id!);
                    }}
                    className="hover:underline text-foreground flex items-center gap-1"
                  >
                    <span>合集</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================== */}
        {/* SECONDARY INSPECTOR DRAWER (Collapsible 380px Panel)       */}
        {/* ========================================================== */}
        {isDrawerOpen && (
          <aside className="absolute inset-y-0 right-0 w-full sm:w-[380px] max-w-full h-full flex flex-col justify-between bg-card border-l border-border z-40 font-mono shadow-none animate-none">
            {/* Drawer Header Controls */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-border bg-card z-10 shrink-0">
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                  {isEditing ? '編輯' : '詳情'}
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
                  onClick={() => setIsDrawerOpen(false)}
                  className="text-muted-foreground hover:text-foreground p-1 rounded-sm transition-none ml-1"
                  title="收合 (I)"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Drawer Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {isEditing ? (
                /* --- EDIT FORM MODE --- */
                <div className="space-y-3.5 text-xs">
                  <div className="space-y-1">
                    <Label htmlFor="media-edit-title">標題</Label>
                    <Input
                      id="media-edit-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={activeFile.filename}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="media-edit-filename">檔名</Label>
                    <Input
                      id="media-edit-filename"
                      value={filename}
                      onChange={(e) => setFilename(e.target.value)}
                    />
                  </div>

                  {directories.length > 0 && (
                    <div className="space-y-1">
                      <Label htmlFor="media-edit-directory">文件夾</Label>
                      <select
                        id="media-edit-directory"
                        value={directory}
                        onChange={(e) => setDirectory(e.target.value)}
                        className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-foreground shadow-none"
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

                  <div className="space-y-1.5 pt-1 border-t border-border">
                    <Label>標籤</Label>
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
                        <span className="text-xs text-muted-foreground">無標籤</span>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 pt-1">
                      <Input
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleTagKeyDown}
                        placeholder="新增標籤"
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

                    {suggestedTags.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1 pt-1">
                        <span className="text-[10px] text-muted-foreground">建議:</span>
                        {suggestedTags.map((st) => (
                          <button
                            key={st.name}
                            type="button"
                            onClick={() => handleAddSpecificTag(st.name)}
                            className="px-1.5 py-0.5 text-[10px] font-mono rounded-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground transition-none"
                          >
                            +{st.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 pt-1 border-t border-border">
                    <Label htmlFor="media-edit-notes">備註</Label>
                    <Textarea
                      id="media-edit-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={3}
                      placeholder="無備註"
                    />
                  </div>

                  <div className="space-y-1 pt-1 border-t border-border">
                    <Label htmlFor="media-edit-source">來源網址</Label>
                    <Input
                      id="media-edit-source"
                      value={sourceUrl}
                      onChange={(e) => setSourceUrl(e.target.value)}
                      placeholder="https://..."
                    />
                  </div>
                </div>
              ) : (
                /* --- VIEW MODE --- */
                <div className="space-y-4">
                  <div>
                    <h2 className="text-sm font-bold text-foreground break-words">
                      {activeFile.title || activeFile.filename}
                    </h2>
                    <span className="text-[11px] text-muted-foreground break-all">{activeFile.filename}</span>
                  </div>

                  {/* Group Info Box */}
                  {hasGroup && (
                    <div className="p-2.5 rounded-sm bg-secondary border border-border text-xs">
                      <div className="text-[10px] text-muted-foreground uppercase font-bold">合集</div>
                      <div className="text-foreground font-semibold mt-0.5">
                        合集成員（共 {groupItems.length} 件）
                      </div>
                      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                        第 {groupIndex + 1} 件 · 支援 ◀ / ▶ 切換
                      </div>
                    </div>
                  )}

                  {/* Spec metrics list */}
                  <div className="space-y-2 pt-2 text-xs text-muted-foreground border-t border-border">
                    {activeFile.width > 0 && activeFile.height > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">解析度</span>
                        <span className="text-foreground">
                          {activeFile.width} × {activeFile.height}
                        </span>
                      </div>
                    )}
                    {activeFile.duration > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Film className="h-3 w-3" /> 長度
                        </span>
                        <span className="text-foreground font-mono">
                          {formatDuration(activeFile.duration)}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <HardDrive className="h-3 w-3" /> 大小
                      </span>
                      <span className="text-foreground">{formatSize(activeFile.file_size)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> 時間
                      </span>
                      <span className="text-foreground">{activeFile.added_at.slice(0, 10)}</span>
                    </div>
                    {activeFile.directory && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Folder className="h-3 w-3" /> 文件夾
                        </span>
                        <span className="text-foreground truncate max-w-[150px] font-mono">
                          {activeFile.directory}
                        </span>
                      </div>
                    )}
                    {libraryName && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <HardDrive className="h-3 w-3" /> 庫
                        </span>
                        <span className="text-foreground truncate max-w-[150px] font-mono">
                          {libraryName}
                        </span>
                      </div>
                    )}
                    {activeFile.collection_id && (
                      <div className="flex items-center justify-between pt-1 border-t border-border">
                        <span className="text-muted-foreground flex items-center gap-1">
                          <Layers className="h-3 w-3 text-foreground" /> 合集
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenCollection?.(activeFile.collection_id!);
                          }}
                          className="text-foreground hover:underline text-xs flex items-center gap-1 font-mono"
                        >
                          <span>開啟</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Tags section */}
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    <span className="text-xs uppercase text-muted-foreground">標籤</span>
                    <div className="flex flex-wrap gap-1">
                      {activeFile.tags && activeFile.tags.length > 0 ? (
                        activeFile.tags.map((tag) => (
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
                        <span className="text-xs text-muted-foreground">無標籤</span>
                      )}
                    </div>
                  </div>

                  {/* Notes section */}
                  {activeFile.notes && (
                    <div className="space-y-1 pt-2 border-t border-border">
                      <span className="text-xs uppercase text-muted-foreground">備註</span>
                      <p className="text-xs text-foreground font-serif leading-relaxed break-words whitespace-pre-wrap">
                        {activeFile.notes}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Drawer Footer Actions */}
            <div className="px-4 sm:px-5 py-3 border-t border-border bg-card shrink-0">
              {isEditing ? (
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
                      <span>刪除</span>
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
                        {isDeleting ? '刪除中' : '確認'}
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
                <div className="space-y-1.5">
                  {activeFile.source_url && (
                    <a
                      href={activeFile.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center space-x-1 w-full py-1.5 rounded-sm border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground bg-card transition-colors"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span>來源網址</span>
                    </a>
                  )}
                  <a
                    href={rawUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center space-x-1 w-full py-1.5 rounded-sm bg-secondary border border-border text-xs text-muted-foreground hover:text-foreground hover:border-foreground transition-colors"
                  >
                    <Maximize2 className="h-3 w-3" />
                    <span>檢視原檔</span>
                  </a>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
