import Dexie, { type Table } from 'dexie';
import { MediaItem, Tag } from '../types/media';

export interface OfflineAction {
  id?: number;
  type: 'UPDATE_TAGS' | 'UPLOAD_MEDIA';
  mediaId?: number;
  payload: string; // JSON string
  createdAt: string;
}

export class ZenboxLocalDatabase extends Dexie {
  media!: Table<MediaItem, number>;
  tags!: Table<Tag, number>;
  offlineQueue!: Table<OfflineAction, number>;

  constructor() {
    super('ZenboxLocalDB');
    this.version(1).stores({
      media: 'id, filename, added_at, *tags',
      tags: 'id, name, count',
      offlineQueue: '++id, type, createdAt'
    });
  }
}

export const localDb = new ZenboxLocalDatabase();
