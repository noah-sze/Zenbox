export interface MediaItem {
  id: number;
  library_id?: number;
  filename: string;
  relative_path: string;
  directory: string;
  filepath: string;
  mime_type: string;
  file_size: number;
  width: number;
  height: number;
  duration: number;
  hash: string;
  title: string;
  notes: string;
  source_url: string;
  added_at: string;
  updated_at: string;
  tags: string[];
  collection_id?: number | null;
  collection_order?: number | null;
  is_trashed?: number;
  trashed_at?: string | null;
  original_relative_path?: string;
  original_directory?: string;
}

export interface CollectionItem extends MediaItem {
  sort_order?: number;
}

export interface Collection {
  id: number;
  library_id: number;
  uuid: string;
  title: string;
  notes?: string;
  source_url?: string;
  directory: string;
  cover_media_id?: number;
  item_count: number;
  image_count: number;
  video_count: number;
  total_bytes: number;
  is_trashed?: number;
  trashed_at?: string | null;
  created_at: string;
  updated_at: string;
  tags: string[];
  cover?: MediaItem | null;
  items?: CollectionItem[];
}

export interface Tag {
  id: number;
  name: string;
  color: string;
  count?: number;
}

export interface Library {
  id: number;
  name: string;
  root_path: string;
  is_default: number;
  is_active: number;
  is_readonly: number;
  created_at: string;
  updated_at: string;
  media_count?: number;
  total_bytes?: number;
}

export interface DirectoryDetail {
  directory: string;
  name: string;
  parentDirectory: string;
  libraryId: number;
  libraryName: string;
  libraryRoot: string;
  fullPath: string;
  mediaCount: number;
  totalRecursiveCount: number;
  totalBytes: number;
  imageCount: number;
  videoCount: number;
  subDirectoryCount: number;
  createdAt: string;
  updatedAt: string;
  isReadonly?: boolean;
  isDefault?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  page?: number;
  limit?: number;
  count?: number;
}

export interface SystemStats {
  media: {
    total: number;
    images: number;
    videos: number;
    other: number;
  };
  tags: {
    total: number;
    topTags: Array<{ name: string; count: number }>;
  };
  storage: {
    originalsBytes: number;
    cacheBytes: number;
    totalBytes: number;
  };
  trash?: {
    total: number;
    bytes: number;
  };
  uptimeSeconds: number;
}

export interface TrashStats {
  mediaCount: number;
  collectionCount: number;
  totalBytes: number;
}

export interface TrashData {
  media: MediaItem[];
  collections: Collection[];
  stats: TrashStats;
}


