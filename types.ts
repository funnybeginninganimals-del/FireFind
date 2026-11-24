
export interface SearchResult {
  title: string;
  snippet: string;
  url: string;
  platform: 'MediaFire' | 'Google Drive' | 'Mega' | 'Dropbox' | '4Shared' | 'OneDrive' | 'Proton Drive' | 'Yandex Disk' | 'GoFile' | 'FileGarden' | 'TeraBox' | 'Box' | 'Pixeldrain' | 'WorkUpload';
  fileType?: string;
  fileSize?: string;
  uploadDate?: string;
  source?: string;
}

export interface User {
  id: string;
  username: string;
  email: string;
}

export interface Bookmark {
  id: string;
  result: SearchResult;
  timestamp: number;
}

export interface SavedSearch {
  id: string;
  query: string;
  filters: AdvancedFilters;
  timestamp: number;
}

export interface HistoryItem {
  id: string;
  query: string;
  filters: AdvancedFilters;
  timestamp: number;
}

export interface AdvancedFilters {
  fileType: string;
  sizeRange: string;
  uploadDate: string;
  sortBy: string;
}

export enum FileCategory {
  ALL = 'All',
  FOLDERS = 'Folders',
  SOFTWARE = 'Software',
  DOCUMENTS = 'Documents',
  MEDIA = 'Media',
  GAMES = 'Games',
  IMAGES = 'Images',
  VIDEOS = 'Videos',
  ARCHIVES = 'Archives',
  SCRIPTS = 'Scripts',
  TEMPLATES = 'Templates'
}

export type ViewState = 'search' | 'bookmarks' | 'saved-searches' | 'generator';
