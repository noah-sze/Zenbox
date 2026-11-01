import React, { useState, useEffect, useCallback } from 'react';
import { Library, SystemStats } from '@/types/media';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import {
  X,
  Sliders,
  Palette,
  HardDrive,
  Wrench,
  Info,
  RefreshCw,
  Trash2,
  Sparkles,
  Keyboard,
  Clock,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  THEME_MODES,
  ACCENT_COLORS,
  getStoredThemeSettings,
  applyThemeSettings,
  ThemeSettings,
} from '@/lib/theme';

export type SettingsTab = 'general' | 'appearance' | 'storage' | 'maintenance' | 'system';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  libraries: Library[];
  onOpenLibraries: () => void;
  onTriggerSync: () => Promise<void>;
  isSyncing: boolean;
  onRefreshData?: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({
  open,
  onClose,
  libraries = [],
  onOpenLibraries,
  onTriggerSync,
  isSyncing,
  onRefreshData,
}) => {
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  // Maintenance action loading states
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [isGeneratingThumbs, setIsGeneratingThumbs] = useState(false);
  const [isPruningTags, setIsPruningTags] = useState(false);

  // Theme Settings
  const [themeSettings, setThemeSettings] = useState<ThemeSettings>(getStoredThemeSettings);

  const handleUpdateTheme = (updates: Partial<ThemeSettings>) => {
    const next = { ...themeSettings, ...updates };
    setThemeSettings(next);
    applyThemeSettings(next);
    toast('已套用主題', 'success');
  };

  // General Preferences (Persisted in localStorage)
  const [hoverScrubbing, setHoverScrubbing] = useState<boolean>(() => {
    return localStorage.getItem('zenbox_pref_hover_scrub') !== 'false';
  });
  const [videoPreview, setVideoPreview] = useState<boolean>(() => {
    return localStorage.getItem('zenbox_pref_video_preview') !== 'false';
  });

  // Fetch system statistics
  const fetchStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const json = (await res.json()) as { data: SystemStats };
        setStats(json.data);
      }
    } catch {
      // offline fallback
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchStats();
    }
  }, [open, fetchStats]);

  // Update preferences
  const handleToggleHoverScrub = (enabled: boolean) => {
    setHoverScrubbing(enabled);
    localStorage.setItem('zenbox_pref_hover_scrub', String(enabled));
    toast(enabled ? '已啟用輪播預覽' : '已關閉輪播預覽', 'success');
  };

  const handleToggleVideoPreview = (enabled: boolean) => {
    setVideoPreview(enabled);
    localStorage.setItem('zenbox_pref_video_preview', String(enabled));
    toast(enabled ? '已啟用影片預覽' : '已關閉影片預覽', 'success');
  };

  // Clear cache handler
  const handleClearCache = async () => {
    setIsClearingCache(true);
    try {
      const res = await fetch('/api/cache/clear', { method: 'POST' });
      if (!res.ok) throw new Error('清空失敗');
      await fetchStats();
      toast('已清空', 'success');
    } catch {
      toast('清空失敗', 'error');
    } finally {
      setIsClearingCache(false);
    }
  };

  // Generate thumbnails batch handler
  const handleGenerateThumbnails = async () => {
    setIsGeneratingThumbs(true);
    try {
      const res = await fetch('/api/thumbnails/generate', { method: 'POST' });
      if (!res.ok) throw new Error('排程失敗');
      toast('已排入佇列', 'success');
    } catch {
      toast('排程失敗', 'error');
    } finally {
      setIsGeneratingThumbs(false);
    }
  };

  // Prune orphan tags handler
  const handlePruneTags = async () => {
    setIsPruningTags(true);
    try {
      const res = await fetch('/api/tags/prune', { method: 'POST' });
      if (!res.ok) throw new Error('清理失敗');
      const json = await res.json();
      toast(json.prunedCount > 0 ? `已清理 ${json.prunedCount} 個標籤` : '無孤兒標籤', 'success');
      onRefreshData?.();
      fetchStats();
    } catch {
      toast('清理失敗', 'error');
    } finally {
      setIsPruningTags(false);
    }
  };

  // Format bytes
  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  // Format uptime
  const formatUptime = (seconds: number): string => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (d > 0) return `${d} 天 ${h} 小時 ${m} 分`;
    if (h > 0) return `${h} 小時 ${m} 分 ${s} 秒`;
    return `${m} 分 ${s} 秒`;
  };

  // Keyboard shortcut listener (ESC to close)
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

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

      {/* Modal Container: Instant Pop, Flat, Zero Shadow, Fixed Geometry Anti-Jitter */}
      <div className="relative z-50 flex flex-col md:flex-row w-full max-w-4xl h-[88vh] max-h-[720px] bg-card border border-border rounded-sm overflow-hidden shadow-none font-mono">
        {/* Left Navigation Sidebar */}
        <div className="w-full md:w-56 bg-sidebar border-b md:border-b-0 md:border-r border-border flex flex-col justify-between shrink-0 select-none">
          <div className="p-4 space-y-4">
            {/* Title */}
            <div className="flex items-center space-x-2">
              <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                系統設定
              </span>
            </div>

            {/* Navigation Tabs */}
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-sm text-xs transition-none text-left shrink-0',
                  activeTab === 'general'
                    ? 'bg-accent text-foreground font-medium border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Sliders className="h-3.5 w-3.5 shrink-0" />
                <span>偏好</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('appearance')}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-sm text-xs transition-none text-left shrink-0',
                  activeTab === 'appearance'
                    ? 'bg-accent text-foreground font-medium border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Palette className="h-3.5 w-3.5 shrink-0" />
                <span>主題</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('storage')}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-sm text-xs transition-none text-left shrink-0',
                  activeTab === 'storage'
                    ? 'bg-accent text-foreground font-medium border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0" />
                <span>儲存庫</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('maintenance')}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-sm text-xs transition-none text-left shrink-0',
                  activeTab === 'maintenance'
                    ? 'bg-accent text-foreground font-medium border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Wrench className="h-3.5 w-3.5 shrink-0" />
                <span>維護</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('system')}
                className={cn(
                  'flex items-center space-x-2 px-3 py-2 rounded-sm text-xs transition-none text-left shrink-0',
                  activeTab === 'system'
                    ? 'bg-accent text-foreground font-medium border border-border'
                    : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                )}
              >
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span>指標</span>
              </button>
            </nav>
          </div>

          {/* Footer Branding in Sidebar */}
          <div className="p-4 border-t border-border text-[10px] text-muted-foreground hidden md:block">
            <div>Zenbox v0.1.0</div>
            <div className="text-[9px] text-muted-foreground">The Zen Suite</div>
          </div>
        </div>

        {/* Right Content Panel */}
        <div className="flex-1 flex flex-col bg-background overflow-hidden">
          {/* Header Bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-background shrink-0">
            <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
              {activeTab === 'general' && '偏好'}
              {activeTab === 'appearance' && '外觀主題'}
              {activeTab === 'storage' && '儲存庫'}
              {activeTab === 'maintenance' && '維護'}
              {activeTab === 'system' && '系統指標'}
            </h3>

            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              title="關閉 (ESC)"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Tab Content Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ------------------------------------------------------------- */}
            {/* TAB 1: 常規偏好                                               */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'general' && (
              <div className="space-y-6">
                {/* Visual Experience */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    視覺與互動設定
                  </h4>

                  <div className="p-4 rounded-sm border border-border bg-card space-y-4">
                    {/* Hover Scrubbing Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-foreground font-medium">合集懸停微輪播 (Hover Scrubbing)</div>
                        <div className="text-[11px] text-muted-foreground">
                          滑鼠在合集卡片左右滑動時，即時輪播預覽內部子項目
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={hoverScrubbing}
                        onChange={(e) => handleToggleHoverScrub(e.target.checked)}
                        className="rounded-none border-border accent-primary h-4 w-4 cursor-pointer"
                      />
                    </div>

                    <div className="border-t border-border" />

                    {/* Video Micro Preview Toggle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs text-foreground font-medium">影片懸停靜音微預覽</div>
                        <div className="text-[11px] text-muted-foreground">
                          滑鼠懸停於影片卡片 350ms 後自動靜音微播放首段
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={videoPreview}
                        onChange={(e) => handleToggleVideoPreview(e.target.checked)}
                        className="rounded-none border-border accent-primary h-4 w-4 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Typography Standards */}
                <div className="space-y-3">
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    字體排印與美學標準
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-sm border border-border bg-card">
                      <div className="text-[11px] text-muted-foreground">介面與元數據字體</div>
                      <div className="text-sm font-bold text-foreground mt-1 font-mono">JetBrains Mono</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">高信噪比等寬工程師代碼美學</div>
                    </div>

                    <div className="p-3.5 rounded-sm border border-border bg-card">
                      <div className="text-[11px] text-muted-foreground">備註與長文閱讀字體</div>
                      <div className="text-sm font-bold text-foreground mt-1 font-serif">Noto Serif TC</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">優雅冷靜之襯線體閱讀體驗</div>
                    </div>
                  </div>
                </div>

                {/* Keyboard Shortcuts Cheatsheet */}
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Keyboard className="h-3.5 w-3.5 text-muted-foreground" />
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      全域鍵盤快捷鍵
                    </h4>
                  </div>

                  <div className="p-3 rounded-sm border border-border bg-card divide-y divide-border/40 text-xs">
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">開啟命令面板</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        ⌘ K / Ctrl+K
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">收攏或展開側邊欄</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        ⌘ B / Ctrl+B
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">開啟系統設置</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        ⌘ , / Ctrl+,
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">原地編輯資產或合集</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        E
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">合集子成員左右導航</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        ← / →
                      </kbd>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-muted-foreground">關閉彈窗</span>
                      <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded-[2px] text-[10px] text-foreground font-mono">
                        ESC
                      </kbd>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 2: 外觀主題 (Color Themes, Accent & Density)              */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'appearance' && (
              <div className="space-y-6">
                {/* 1. 色彩主題 */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      色彩主題
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      即時生效 · 無陰影極簡
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {THEME_MODES.map((mode) => {
                      const isSelected = themeSettings.mode === mode.id;
                      return (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => handleUpdateTheme({ mode: mode.id })}
                          className={cn(
                            'flex flex-col text-left p-3 rounded-sm border transition-none cursor-pointer group',
                            isSelected
                              ? 'border-primary bg-accent ring-1 ring-primary'
                              : 'border-border bg-card hover:border-foreground'
                          )}
                        >
                          {/* Mini High-Fidelity Preview Box */}
                          <div
                            className="w-full h-16 rounded-sm border border-border overflow-hidden mb-3 relative flex select-none"
                            style={{
                              backgroundColor:
                                mode.id === 'system' ? '#18181b' : mode.bgHex,
                            }}
                          >
                            {/* Mini Sidebar */}
                            <div
                              className="w-10 border-r border-border p-1 flex flex-col justify-between shrink-0"
                              style={{
                                backgroundColor:
                                  mode.id === 'light'
                                    ? '#f7f7f8'
                                    : mode.id === 'slate'
                                    ? '#080d14'
                                    : mode.id === 'zinc'
                                    ? '#101014'
                                    : '#050505',
                              }}
                            >
                              <div className="space-y-1">
                                <div className="h-1.5 w-4 rounded-[1px] bg-muted-foreground opacity-50" />
                                <div className="h-1 w-6 rounded-[1px] bg-muted-foreground opacity-30" />
                                <div className="h-1 w-5 rounded-[1px] bg-muted-foreground opacity-30" />
                              </div>
                              <div className="h-1 w-3 rounded-[1px] bg-muted-foreground opacity-40" />
                            </div>

                            {/* Mini Main Canvas */}
                            <div className="flex-1 p-1.5 flex flex-col justify-between">
                              {/* Top Bar */}
                              <div className="h-2 border-b border-border flex items-center justify-between pb-1">
                                <div className="h-1 w-8 rounded-[1px] bg-muted-foreground opacity-50" />
                                <div className="h-1 w-2 rounded-[1px] bg-muted-foreground opacity-50" />
                              </div>
                              {/* Masonry mini cards */}
                              <div className="grid grid-cols-3 gap-1">
                                <div
                                  className="h-6 rounded-[1px] border border-border"
                                  style={{
                                    backgroundColor:
                                      mode.id === 'light' ? '#f4f4f5' : mode.cardHex,
                                  }}
                                />
                                <div
                                  className="h-6 rounded-[1px] border border-border"
                                  style={{
                                    backgroundColor:
                                      mode.id === 'light' ? '#f4f4f5' : mode.cardHex,
                                  }}
                                />
                                <div
                                  className="h-6 rounded-[1px] border border-border"
                                  style={{
                                    backgroundColor:
                                      mode.id === 'light' ? '#f4f4f5' : mode.cardHex,
                                  }}
                                />
                              </div>
                            </div>

                            {/* Selected Badge in preview corner */}
                            {isSelected && (
                              <div className="absolute top-1.5 right-1.5 h-4 w-4 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                              </div>
                            )}
                          </div>

                          {/* Title & Description */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold text-foreground font-mono">
                              {mode.label}
                            </span>
                            {isSelected && (
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-4 border-primary text-primary"
                              >
                                使用中
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                            {mode.desc}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. 焦點強調微色 */}
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      焦點強調色
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      微調焦點邊框環與選取高亮
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2.5">
                    {ACCENT_COLORS.map((accent) => {
                      const isSelected = themeSettings.accent === accent.id;
                      return (
                        <button
                          key={accent.id}
                          type="button"
                          onClick={() => handleUpdateTheme({ accent: accent.id })}
                          className={cn(
                            'flex items-center space-x-2 px-3 py-1.5 rounded-sm border transition-none cursor-pointer',
                            isSelected
                              ? 'border-primary bg-accent ring-1 ring-primary'
                              : 'border-border bg-card hover:border-foreground'
                          )}
                        >
                          <div
                            className="h-3 w-3 rounded-full shrink-0 border border-border"
                            style={{ backgroundColor: accent.colorHex }}
                          />
                          <span className="text-xs font-mono text-foreground">
                            {accent.label}
                          </span>
                          {isSelected && <Check className="h-3 w-3 text-primary ml-1" />}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 3. 介面排版密度 */}
                <div className="space-y-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      介面排版密度
                    </h4>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      調整文字尺度與緊湊程度
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 max-w-sm">
                    <button
                      type="button"
                      onClick={() => handleUpdateTheme({ density: 'comfortable' })}
                      className={cn(
                        'flex flex-col text-left p-3 rounded-sm border transition-none cursor-pointer',
                        themeSettings.density === 'comfortable'
                          ? 'border-primary bg-accent ring-1 ring-primary'
                          : 'border-border bg-card hover:border-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground font-mono">
                          舒適
                        </span>
                        {themeSettings.density === 'comfortable' && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        預設呼吸感字距
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUpdateTheme({ density: 'compact' })}
                      className={cn(
                        'flex flex-col text-left p-3 rounded-sm border transition-none cursor-pointer',
                        themeSettings.density === 'compact'
                          ? 'border-primary bg-accent ring-1 ring-primary'
                          : 'border-border bg-card hover:border-foreground'
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-foreground font-mono">
                          緊湊
                        </span>
                        {themeSettings.density === 'compact' && (
                          <Check className="h-3 w-3 text-primary" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                        更高資訊密集度
                      </p>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 3: 儲存庫配置                                             */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'storage' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      儲存庫 ({libraries.length})
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      原檔本機保存，唯讀不可變
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => {
                      onClose();
                      onOpenLibraries();
                    }}
                  >
                    <HardDrive className="h-3 w-3" />
                    <span>管理</span>
                  </Button>
                </div>

                <div className="space-y-2.5">
                  {libraries.map((lib) => (
                    <div
                      key={lib.id}
                      className="p-3.5 rounded-sm border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-foreground font-mono">{lib.name}</span>
                          {lib.is_default ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-foreground text-foreground">
                              預設
                            </Badge>
                          ) : null}
                          {lib.is_readonly ? (
                            <Badge variant="outline" className="text-[9px] py-0 px-1 border-border text-muted-foreground">
                              唯讀
                            </Badge>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono break-all">{lib.root_path}</div>
                      </div>

                      <div className="text-[11px] text-muted-foreground font-mono text-left sm:text-right shrink-0">
                        <div>{lib.media_count ?? 0} 個項目</div>
                        <div className="text-[10px] text-muted-foreground">
                          {formatBytes(lib.total_bytes ?? 0)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Storage Architecture Contract */}
                <div className="p-4 rounded-sm border border-border bg-secondary space-y-2">
                  <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>真理源架構契約 (Decoupled Monolith)</span>
                  </div>
                  <p className="text-xs text-muted-foreground font-serif leading-relaxed">
                    Zenbox 不將資產鎖定於黑盒資料庫中。所有檔案存放於本機檔案系統，每個項目伴隨同名
                    <code className="text-foreground font-mono mx-1">.json</code> Sidecar 元數據文件。
                    合集清單存放於 <code className="text-foreground font-mono mx-1">.zenbox/collections/</code>。
                    脫離 Zenbox，資料夾依然具備完全的人類可讀性。
                  </p>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 4: 維護與索引                                             */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'maintenance' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    維護
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    資料庫與快取為可拋棄型索引，可隨時重建
                  </p>
                </div>

                <div className="space-y-3">
                  {/* Action 1: Re-index File System */}
                  <div className="p-4 rounded-sm border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>同步索引</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        掃描儲存庫，依據檔案與 Sidecar JSON 補齊索引
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isSyncing}
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={() => onTriggerSync()}
                    >
                      <RefreshCw className={cn('h-3 w-3', isSyncing && 'animate-spin')} />
                      <span>{isSyncing ? '同步中' : '同步'}</span>
                    </Button>
                  </div>

                  {/* Action 2: Batch Generate Thumbnails */}
                  <div className="p-4 rounded-sm border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>重新生成縮圖</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        透過 Sharp 與 FFmpeg 佇列重新生成縮圖
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isGeneratingThumbs}
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={handleGenerateThumbnails}
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{isGeneratingThumbs ? '處理中' : '生成'}</span>
                    </Button>
                  </div>

                  {/* Action 3: Clear Cache */}
                  <div className="p-4 rounded-sm border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>清空快取</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        清空縮圖與串流快取，原檔不受影響
                        {stats ? ` (佔用: ${formatBytes(stats.storage.cacheBytes)})` : ''}
                      </div>
                    </div>

                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={isClearingCache}
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={handleClearCache}
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>{isClearingCache ? '清空中' : '清空'}</span>
                    </Button>
                  </div>

                  {/* Action 4: Prune Orphan Tags */}
                  <div className="p-4 rounded-sm border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>清理標籤</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        移除未被任何檔案或合集引用的標籤
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPruningTags}
                      className="h-7 text-xs gap-1.5 shrink-0"
                      onClick={handlePruneTags}
                    >
                      <Wrench className="h-3 w-3" />
                      <span>{isPruningTags ? '清理中' : '清理'}</span>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* ------------------------------------------------------------- */}
            {/* TAB 5: 系統指標                                               */}
            {/* ------------------------------------------------------------- */}
            {activeTab === 'system' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                    系統指標
                  </h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    即時運行數據
                  </p>
                </div>

                {isLoadingStats ? (
                  <div className="p-8 text-center text-xs text-muted-foreground">載入中...</div>
                ) : stats ? (
                  <div className="space-y-4">
                    {/* Media Stats Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-3 bg-card border border-border rounded-sm">
                        <span className="text-muted-foreground block text-[10px]">媒體</span>
                        <span className="text-lg font-bold text-foreground font-mono mt-0.5 block">
                          {stats.media.total}
                        </span>
                      </div>
                      <div className="p-3 bg-card border border-border rounded-sm">
                        <span className="text-muted-foreground block text-[10px]">圖片</span>
                        <span className="text-lg font-bold text-foreground font-mono mt-0.5 block">
                          {stats.media.images}
                        </span>
                      </div>
                      <div className="p-3 bg-card border border-border rounded-sm">
                        <span className="text-muted-foreground block text-[10px]">影片</span>
                        <span className="text-lg font-bold text-foreground font-mono mt-0.5 block">
                          {stats.media.videos}
                        </span>
                      </div>
                      <div className="p-3 bg-card border border-border rounded-sm">
                        <span className="text-muted-foreground block text-[10px]">標籤</span>
                        <span className="text-lg font-bold text-foreground font-mono mt-0.5 block">
                          {stats.tags.total}
                        </span>
                      </div>
                    </div>

                    {/* Storage Stats Breakdown */}
                    <div className="p-4 rounded-sm border border-border bg-card space-y-3">
                      <div className="text-xs font-medium text-foreground">磁碟佔用</div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div>
                          <span className="text-[10px] text-muted-foreground block">原始媒體</span>
                          <span className="text-sm font-semibold text-foreground font-mono mt-0.5 block">
                            {formatBytes(stats.storage.originalsBytes)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">快取</span>
                          <span className="text-sm font-semibold text-foreground font-mono mt-0.5 block">
                            {formatBytes(stats.storage.cacheBytes)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-muted-foreground block">總計</span>
                          <span className="text-sm font-semibold text-foreground font-mono mt-0.5 block">
                            {formatBytes(stats.storage.totalBytes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Runtime Environment Info */}
                    <div className="p-4 rounded-sm border border-border bg-card divide-y divide-border text-xs">
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">架構模式</span>
                        <span className="text-foreground font-mono">Local-First Decoupled Monolith</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">伺服器運行時間</span>
                        <span className="text-foreground font-mono flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {formatUptime(stats.uptimeSeconds)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">資料庫引擎</span>
                        <span className="text-foreground font-mono">SQLite (better-sqlite3)</span>
                      </div>
                      <div className="flex items-center justify-between py-2">
                        <span className="text-muted-foreground">轉碼與縮圖引擎</span>
                        <span className="text-foreground font-mono">Sharp + FFmpeg</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-xs text-muted-foreground">無統計數據</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
