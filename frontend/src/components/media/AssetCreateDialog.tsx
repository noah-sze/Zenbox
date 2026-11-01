import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { MediaItem, Collection, Library, DirectoryDetail, Tag } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import {
  X,
  Link as LinkIcon,
  Upload as UploadIcon,
  Plus,
  Check,
  FileImage,
  FileVideo,
  File as FileIcon,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type CreateAssetTab = 'collect' | 'upload';

interface AssetCreateDialogProps {
  open: boolean;
  onClose: () => void;
  libraries: Library[];
  directories: DirectoryDetail[];
  availableTags: Tag[];
  defaultLibraryId?: number | null;
  defaultDirectory?: string | null;
  initialTab?: CreateAssetTab;
  onAssetCreated: (item: MediaItem) => void;
  onCollectionCreated?: (collection: Collection) => void;
}

export const AssetCreateDialog: React.FC<AssetCreateDialogProps> = ({
  open,
  onClose,
  libraries = [],
  directories = [],
  availableTags = [],
  defaultLibraryId,
  defaultDirectory,
  initialTab = 'collect',
  onAssetCreated,
  onCollectionCreated,
}) => {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<CreateAssetTab>(initialTab);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Collection Packaging State
  const [createAsCollection, setCreateAsCollection] = useState(false);
  const [collectionTitle, setCollectionTitle] = useState('');

  // Storage Location
  const [libraryId, setLibraryId] = useState<number | undefined>(
    defaultLibraryId || (libraries[0]?.id ?? undefined)
  );
  const [directory, setDirectory] = useState<string>(defaultDirectory || '');

  // Tag Management
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  // Objective Notes
  const [notes, setNotes] = useState('');

  // Collect Tab specific state
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  // Upload Tab specific state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  // Synchronize defaults on open
  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setLibraryId(defaultLibraryId || (libraries[0]?.id ?? undefined));
      setDirectory(defaultDirectory || '');
      setTags([]);
      setTagInput('');
      setNotes('');
      setUrl('');
      setTitle('');
      setSelectedFiles([]);
      setCreateAsCollection(false);
      setCollectionTitle('');
      setIsSubmitting(false);
      setIsDragging(false);
    }
  }, [open, defaultLibraryId, defaultDirectory, libraries, initialTab]);

  // Detected domain from URL
  const detectedDomain = useMemo(() => {
    if (!url.trim()) return '';
    try {
      const u = new URL(url.trim());
      return u.hostname;
    } catch {
      return '';
    }
  }, [url]);

  // Is previewable direct image url
  const isDirectImageUrl = useMemo(() => {
    const lower = url.trim().toLowerCase();
    return (
      lower.startsWith('http') &&
      (lower.includes('.jpg') ||
        lower.includes('.jpeg') ||
        lower.includes('.png') ||
        lower.includes('.webp') ||
        lower.includes('.gif') ||
        lower.includes('.avif') ||
        lower.includes('images.unsplash.com'))
    );
  }, [url]);

  // Suggested unadded tags
  const suggestedTags = useMemo(() => {
    const currentTagSet = new Set(tags.map((t) => t.toLowerCase()));
    return availableTags
      .filter((t) => !currentTagSet.has(t.name.toLowerCase()))
      .slice(0, 5);
  }, [availableTags, tags]);

  // Add tag handler
  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim().toLowerCase().replace(/^#/, '');
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

  const handleAddSuggestedTag = (tagName: string) => {
    const norm = tagName.trim().toLowerCase();
    if (norm && !tags.includes(norm)) {
      setTags((prev) => [...prev, norm]);
    }
  };

  // Drag and Drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      setSelectedFiles((prev) => {
        const next = [...prev, ...droppedFiles];
        if (next.length > 1 && !collectionTitle) {
          setCollectionTitle(next[0].name.replace(/\.[^/.]+$/, ''));
          setCreateAsCollection(true);
        }
        return next;
      });
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const chosen = Array.from(e.target.files);
      setSelectedFiles((prev) => {
        const next = [...prev, ...chosen];
        if (next.length > 1 && !collectionTitle) {
          setCollectionTitle(next[0].name.replace(/\.[^/.]+$/, ''));
          setCreateAsCollection(true);
        }
        return next;
      });
    }
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Total upload size
  const totalUploadSize = useMemo(() => {
    return selectedFiles.reduce((acc, f) => acc + f.size, 0);
  }, [selectedFiles]);

  // Submit Collect URL
  const handleCollectSubmit = async () => {
    if (!url.trim()) {
      toast('請輸入有效網址', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/collect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
          notes: notes.trim() || undefined,
          tags,
          directory: directory || undefined,
          libraryId,
        }),
      });

      if (!res.ok) {
        const errorJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errorJson.error || '收錄失敗');
      }

      const json = (await res.json()) as { success: boolean; data: MediaItem };
      if (json.data) {
        onAssetCreated(json.data);
      }

      toast('已收錄', 'success');
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : '收錄失敗';
      toast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Upload Files
  const handleUploadSubmit = async () => {
    if (selectedFiles.length === 0) {
      toast('請先選取檔案', 'error');
      return;
    }

    setIsSubmitting(true);
    const createdMediaItems: MediaItem[] = [];
    try {
      for (const file of selectedFiles) {
        const formData = new FormData();
        formData.append('file', file);
        if (title.trim() && selectedFiles.length === 1) {
          formData.append('title', title.trim());
        }
        if (notes.trim()) {
          formData.append('notes', notes.trim());
        }
        if (tags.length > 0) {
          formData.append('tags', JSON.stringify(tags));
        }
        if (directory) {
          formData.append('directory', directory);
        }
        if (libraryId !== undefined) {
          formData.append('libraryId', String(libraryId));
        }

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (res.ok) {
          const json = (await res.json()) as { success: boolean; data: MediaItem };
          if (json.data) {
            onAssetCreated(json.data);
            createdMediaItems.push(json.data);
          }
        }
      }

      if (createdMediaItems.length > 0) {
        // If user opted to pack as collection
        if (createAsCollection && createdMediaItems.length > 0) {
          const finalColTitle =
            collectionTitle.trim() ||
            (selectedFiles[0] ? selectedFiles[0].name.replace(/\.[^/.]+$/, '') : '未命名合集');

          const colRes = await fetch('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: finalColTitle,
              notes: notes.trim() || undefined,
              tags,
              directory: directory || undefined,
              libraryId,
              mediaIds: createdMediaItems.map((m) => m.id),
            }),
          });

          if (colRes.ok) {
            const colJson = (await colRes.json()) as { success: boolean; data: Collection };
            if (colJson.data) {
              onCollectionCreated?.(colJson.data);
            }
          }
        }

        toast(
          createAsCollection
            ? `已上傳並建立合集 (${createdMediaItems.length} 項目)`
            : createdMediaItems.length === 1
            ? '已上傳'
            : `已上傳 ${createdMediaItems.length} 個檔案`,
          'success'
        );
        onClose();
      } else {
        throw new Error('上傳失敗');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '上傳失敗';
      toast(message, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

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

      {/* Instant Pop Modal Container (Strict Anti-Jitter: Constant 660px Height) */}
      <div className="relative z-50 flex flex-col w-full max-w-4xl h-[660px] max-h-[94vh] bg-card border border-border rounded-sm overflow-hidden font-mono shadow-none">
        {/* ========================================================== */}
        {/* HEADER: Title, Tab Switcher, Close Button */}
        {/* ========================================================== */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-border bg-card shrink-0">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <h2 className="text-xs uppercase font-bold tracking-wider text-foreground">新增資產</h2>
            </div>

            {/* Segmented Tab Switcher */}
            <div className="flex items-center p-0.5 rounded-sm bg-secondary border border-border text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('collect')}
                className={cn(
                  'flex items-center space-x-1.5 px-3 py-1 rounded-sm text-xs font-medium transition-none',
                  activeTab === 'collect'
                    ? 'bg-background text-foreground shadow-none font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <LinkIcon className="h-3.5 w-3.5" />
                <span>收集 (URL)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={cn(
                  'flex items-center space-x-1.5 px-3 py-1 rounded-sm text-xs font-medium transition-none',
                  activeTab === 'upload'
                    ? 'bg-background text-foreground shadow-none font-semibold border border-border'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <UploadIcon className="h-3.5 w-3.5" />
                <span>上傳 (檔案)</span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-sm text-muted-foreground hover:text-foreground transition-none border border-transparent hover:border-border"
            title="關閉"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ========================================================== */}
        {/* BODY: Dual Pane Split Layout (Input Column & Inspector) */}
        {/* ========================================================== */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden bg-card">
          {activeTab === 'collect' ? (
            /* -------------------------------------------------------- */
            /* TAB 1: 收集 (URL COLLECTOR)                              */
            /* -------------------------------------------------------- */
            <div className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">
              {/* Form Inputs (Left Column - 60%) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 border-b md:border-b-0 md:border-r border-border">
                {/* URL Input */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="collect-url" className="text-foreground font-bold flex items-center gap-1.5">
                      <span>來源網址</span>
                      <span className="text-[10px] text-muted-foreground font-normal">HTTP / HTTPS</span>
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        const sample = 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=800';
                        setUrl(sample);
                        setTitle('Minimalist Architecture');
                      }}
                      className="text-[10px] text-muted-foreground hover:text-foreground border border-border px-1.5 py-0.5 rounded-sm bg-secondary"
                    >
                      填入範例
                    </button>
                  </div>
                  <Input
                    id="collect-url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com/artwork.jpg"
                    className="h-9"
                  />
                </div>

                {/* Custom Title */}
                <div className="space-y-1.5">
                  <Label htmlFor="collect-title">
                    <span>資產標題</span>
                    <span className="text-[10px] text-neutral-500 font-normal ml-1">（選填，預設提取）</span>
                  </Label>
                  <Input
                    id="collect-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="自定義顯示標題"
                  />
                </div>

                {/* Storage Locations (Library & Directory) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/60">
                  <div className="space-y-1">
                    <Label htmlFor="collect-library">存放儲存庫</Label>
                    <select
                      id="collect-library"
                      value={libraryId}
                      onChange={(e) => setLibraryId(Number(e.target.value))}
                      className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-neutral-500 shadow-none"
                    >
                      {libraries.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name} {lib.is_default ? '(預設)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="collect-directory">存放文件夾</Label>
                    <select
                      id="collect-directory"
                      value={directory}
                      onChange={(e) => setDirectory(e.target.value)}
                      className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-neutral-500 shadow-none"
                    >
                      <option value="">(根目錄 /)</option>
                      {directories
                        .filter((d) => d.directory !== '')
                        .map((d) => (
                          <option key={d.directory} value={d.directory}>
                            {d.directory}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Tag Editor Section */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <Label>標籤</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[26px]">
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
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/60">無標籤</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
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
                      className="h-7 px-2.5 shrink-0"
                      onClick={handleAddTag}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />
                      新增
                    </Button>
                  </div>

                  {suggestedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 pt-0.5">
                      <span className="text-[10px] text-muted-foreground">建議:</span>
                      {suggestedTags.map((st) => (
                        <button
                          key={st.name}
                          type="button"
                          onClick={() => handleAddSuggestedTag(st.name)}
                          className="px-1.5 py-0.5 text-[10px] font-mono rounded-sm border border-border bg-card text-muted-foreground hover:text-foreground hover:border-foreground/30"
                        >
                          +{st.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Objective Notes */}
                <div className="space-y-1.5 pt-2 border-t border-border/60">
                  <Label htmlFor="collect-notes">客觀備註</Label>
                  <Textarea
                    id="collect-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="無備註"
                  />
                </div>
              </div>

              {/* Collector Live Inspector (Right Column - 40%) */}
              <div className="w-full md:w-80 bg-card border-l border-border flex flex-col justify-between p-5 space-y-4 overflow-y-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      即時解析預覽
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm bg-accent border border-border text-[10px] text-foreground">
                      {url.trim() ? '就緒' : '待輸入'}
                    </span>
                  </div>

                  {/* Aspect-Ratio Preview Container */}
                  <div className="relative w-full aspect-[4/3] rounded-sm border border-border bg-card overflow-hidden flex items-center justify-center">
                    {isDirectImageUrl ? (
                      <img
                        src={url}
                        alt="預覽"
                        className="w-full h-full object-cover select-none"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center p-4 text-center">
                        <LinkIcon className="h-6 w-6 text-muted-foreground/60 mb-1" />
                        <span className="text-[10px] text-muted-foreground uppercase">
                          {detectedDomain || '等待輸入 URL'}
                        </span>
                      </div>
                    )}
                    {detectedDomain && (
                      <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded-sm bg-black/80 backdrop-blur-[2px] border border-white/10 text-[9px] text-white">
                        {detectedDomain}
                      </div>
                    )}
                  </div>

                  {/* Technical Spec Grid */}
                  <div className="space-y-2 pt-1 text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">來源網域</span>
                      <span className="text-foreground truncate max-w-[160px]">
                        {detectedDomain || '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">傳輸協定</span>
                      <span className="text-foreground">
                        {url.startsWith('https://') ? 'HTTPS / TLS 1.3' : url.startsWith('http://') ? 'HTTP' : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">真理源寫入</span>
                      <span className="text-foreground">Sidecar JSON + 原檔</span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-sm border border-border bg-muted/40 text-[10px] text-muted-foreground leading-normal">
                  收錄後將非同步下載原檔儲存至 <code className="text-foreground font-mono">/storage/originals</code>，並生成 Sidecar 元數據伴隨文件。
                </div>
              </div>
            </div>
          ) : (
            /* -------------------------------------------------------- */
            /* TAB 2: 上傳 (LOCAL FILE UPLOADER)                        */
            /* -------------------------------------------------------- */
            <div className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden">
              {/* Form Inputs & Drop Zone (Left Column - 60%) */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 border-b md:border-b-0 md:border-r border-border">
                {/* Drag and Drop Zone */}
                <div className="space-y-1.5">
                  <Label>選擇本機檔案</Label>
                  <div
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      'relative border border-dashed rounded-sm p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors bg-muted/20 group',
                      isDragging
                        ? 'border-foreground bg-accent'
                        : 'border-border hover:border-foreground/50'
                    )}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                    <div className="w-10 h-10 rounded-sm border border-border bg-secondary flex items-center justify-center text-muted-foreground group-hover:text-foreground group-hover:border-foreground/30 mb-2">
                      <UploadIcon className="h-5 w-5" />
                    </div>
                    <div className="text-xs text-foreground font-medium">拖曳檔案至此，或點擊瀏覽選取</div>
                    <div className="text-[10px] text-muted-foreground mt-1">
                      支援 JPG, PNG, WebP, GIF, AVIF, MP4, MOV, WebM (最高 500MB)
                    </div>
                  </div>
                </div>

                {/* Selected Files Queue Strip */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>待上傳清單 ({selectedFiles.length})</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles([])}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        清空全部
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-[130px] overflow-y-auto">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={`${file.name}-${idx}`}
                          className="p-2 rounded-sm border border-border bg-card flex items-center justify-between"
                        >
                          <div className="flex items-center space-x-2.5 truncate">
                            <div className="w-7 h-7 rounded-sm bg-secondary border border-border flex items-center justify-center text-muted-foreground shrink-0">
                              {file.type.startsWith('image/') ? (
                                <FileImage className="h-3.5 w-3.5" />
                              ) : file.type.startsWith('video/') ? (
                                <FileVideo className="h-3.5 w-3.5" />
                              ) : (
                                <FileIcon className="h-3.5 w-3.5" />
                              )}
                            </div>
                            <div className="truncate">
                              <div className="text-xs text-foreground font-medium truncate">
                                {file.name}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                {formatFileSize(file.size)}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveFile(idx)}
                            className="text-muted-foreground hover:text-foreground p-1"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Pack as Collection Toggle & Title Input (shown when selectedFiles.length > 1) */}
                {selectedFiles.length > 1 && (
                  <div className="p-3 rounded-sm border border-border bg-card space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="flex items-center space-x-2 text-xs text-foreground cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={createAsCollection}
                          onChange={(e) => setCreateAsCollection(e.target.checked)}
                          className="rounded-none border-border accent-primary h-3.5 w-3.5"
                        />
                        <span className="font-semibold flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-muted-foreground" />
                          打包為多模態合集
                        </span>
                      </label>
                      <Badge variant="outline" className="text-[10px] py-0 px-1 border-border text-muted-foreground">
                        {selectedFiles.length} 項目
                      </Badge>
                    </div>

                    {createAsCollection && (
                      <div className="space-y-1 pt-1 border-t border-border">
                        <Label htmlFor="upload-collection-title" className="text-[11px] text-muted-foreground">
                          合集標題
                        </Label>
                        <Input
                          id="upload-collection-title"
                          value={collectionTitle}
                          onChange={(e) => setCollectionTitle(e.target.value)}
                          placeholder={selectedFiles[0] ? selectedFiles[0].name.replace(/\.[^/.]+$/, '') : '輸入合集標題...'}
                          className="h-8 text-xs font-mono bg-card border-border"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Storage Locations (Library & Directory) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-border/60">
                  <div className="space-y-1">
                    <Label htmlFor="upload-library">存放儲存庫</Label>
                    <select
                      id="upload-library"
                      value={libraryId}
                      onChange={(e) => setLibraryId(Number(e.target.value))}
                      className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-neutral-500 shadow-none"
                    >
                      {libraries.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name} {lib.is_default ? '(預設)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <Label htmlFor="upload-directory">存放文件夾</Label>
                    <select
                      id="upload-directory"
                      value={directory}
                      onChange={(e) => setDirectory(e.target.value)}
                      className="flex h-8 w-full rounded-sm border border-border bg-card px-2 text-xs font-mono text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-neutral-500 shadow-none"
                    >
                      <option value="">(根目錄 /)</option>
                      {directories
                        .filter((d) => d.directory !== '')
                        .map((d) => (
                          <option key={d.directory} value={d.directory}>
                            {d.directory}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                {/* Tag Editor Section */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <Label>批次套用標籤</Label>
                  <div className="flex flex-wrap gap-1.5 min-h-[26px]">
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
                            className="text-muted-foreground hover:text-foreground"
                          >
                            ×
                          </button>
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground/60">無標籤</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
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
                      className="h-7 px-2.5 shrink-0"
                      onClick={handleAddTag}
                    >
                      <Plus className="h-3 w-3 mr-0.5" />
                      新增
                    </Button>
                  </div>
                </div>

                {/* Objective Notes */}
                <div className="space-y-1.5 pt-2 border-t border-border/60">
                  <Label htmlFor="upload-notes">客觀備註</Label>
                  <Textarea
                    id="upload-notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="無備註"
                  />
                </div>
              </div>

              {/* Upload Inspector (Right Column - 40%) */}
              <div className="w-full md:w-80 bg-card border-l border-border flex flex-col justify-between p-5 space-y-4 overflow-y-auto">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
                      待處理資產規範
                    </span>
                    <span className="px-1.5 py-0.5 rounded-sm bg-accent border border-border text-[10px] text-foreground">
                      原真性保護
                    </span>
                  </div>

                  <div className="space-y-2 pt-1 text-[11px] text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>待上傳數量</span>
                      <span className="text-foreground font-mono">{selectedFiles.length} 個檔案</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>總檔案大小</span>
                      <span className="text-foreground font-mono">{formatFileSize(totalUploadSize)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>處理佇列管線</span>
                      <span className="text-foreground">Sharp WebP (sm/md)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>指紋雜湊</span>
                      <span className="text-foreground">SHA-256 QuickHash</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>目標目錄</span>
                      <span className="text-foreground font-mono truncate max-w-[150px]">
                        {directory || '(根目錄)'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-2.5 rounded-sm border border-border bg-muted/50 text-[10px] text-muted-foreground leading-normal">
                  原始檔案二進制唯讀不可變，將完整保留於原生檔案系統，元數據寫入同級 <code className="text-foreground font-mono">.zenbox/</code> Sidecar。
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================== */}
        {/* FOOTER: Status Notice, Cancel, Action Button */}
        {/* ========================================================== */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-card shrink-0">
          <div className="flex items-center space-x-2 text-xs text-muted-foreground">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                (activeTab === 'collect' && url.trim()) || (activeTab === 'upload' && selectedFiles.length > 0)
                  ? 'bg-emerald-500'
                  : 'bg-muted-foreground/40'
              )}
            />
            <span>
              {activeTab === 'collect'
                ? url.trim()
                  ? '來源網址已就緒'
                  : '等待輸入來源網址'
                : selectedFiles.length > 0
                ? `${selectedFiles.length} 個檔案待上傳 (${formatFileSize(totalUploadSize)})`
                : '請選取欲上傳之檔案'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </Button>

            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={activeTab === 'collect' ? handleCollectSubmit : handleUploadSubmit}
              disabled={
                isSubmitting ||
                (activeTab === 'collect' && !url.trim()) ||
                (activeTab === 'upload' && selectedFiles.length === 0)
              }
              className="gap-1.5"
            >
              <Check className="h-3.5 w-3.5" />
              <span>
                {isSubmitting
                  ? activeTab === 'collect'
                    ? '收錄中...'
                    : '上傳中...'
                  : activeTab === 'collect'
                  ? '收錄'
                  : '上傳'}
              </span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
