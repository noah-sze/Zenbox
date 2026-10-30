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

export interface ApiResponse<T> {
  data: T;
  page?: number;
  limit?: number;
  count?: number;
}

