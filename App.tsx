
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, FileText, Download, FolderOpen, AlertCircle, Loader2, 
  ExternalLink, Filter, User as UserIcon, LogOut, Bookmark as BookmarkIcon, 
  Star, Trash2, ChevronDown, Calendar, Database, Clock, Bell, X, Save,
  HardDrive, FileJson, Cloud, ShieldCheck, Disc, UploadCloud, History, Sprout,
  FileDown, Link as LinkIcon, Zap, Copy, CheckCircle, Package, Code, Layers, Info,
  CheckCircle2, RefreshCw, Lightbulb, MousePointerClick
} from 'lucide-react';
import { SearchResult, FileCategory, User, Bookmark, SavedSearch, AdvancedFilters, ViewState, HistoryItem } from './types';
import { searchPublicStorage, resolveDirectLink } from './geminiService';

const SUPPORTED_PLATFORMS = [
  'mediafire.com', 'drive.google.com', 'mega.nz', 'dropbox.com', '4shared.com', 
  'onedrive.live.com', '1drv.ms', 'drive.proton.me', 'disk.yandex.com', 'yadi.sk', 
  'gofile.io', 'filegarden.com', 'terabox.com', 'terabox.app', 'box.com', 'pixeldrain.com', 'workupload.com'
];

const SEARCH_STATUS_MESSAGES = [
  "Initializing Omni-Scanner...",
  "Querying MediaFire & Drive clusters...",
  "Scanning Mega.nz & Dropbox shards...",
  "Analyzing Pixeldrain & TeraBox metadata...",
  "Verifying public permissions...",
  "Finalizing global index results..."
];

const App: React.FC = () => {
  // Auth & View States
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<ViewState>('search');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(false);

  // Search States
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<FileCategory>(FileCategory.ALL);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchStatusIndex, setSearchStatusIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // Direct Link Generator States
  const [generatorUrl, setGeneratorUrl] = useState('');
  const [resolvedLink, setResolvedLink] = useState<{ directUrl: string; title: string; explanation: string } | null>(null);
  const [resolving, setResolving] = useState(false);
  const [copying, setCopying] = useState(false);

  // Result Copy Feedback State
  const [copiedResultUrl, setCopiedResultUrl] = useState<string | null>(null);

  // Advanced Filters
  const [filters, setFilters] = useState<AdvancedFilters>({
    fileType: 'Any',
    sizeRange: 'Any',
    uploadDate: 'Any',
    sortBy: 'Relevance'
  });

  // Loading Status Logic
  useEffect(() => {
    let interval: number | undefined;
    if (loading) {
      setSearchStatusIndex(0);
      interval = window.setInterval(() => {
        setSearchStatusIndex((prev) => (prev + 1) % SEARCH_STATUS_MESSAGES.length);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);

  // Persistence States
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>([]);
  const [searchHistory, setSearchHistory] = useState<HistoryItem[]>([]);

  // URL Validation
  const urlStatus = useMemo(() => {
    try {
      const trimmedQuery = query.trim();
      if (!trimmedQuery.startsWith('http')) return { isUrl: false, isSupported: false };
      
      const url = new URL(trimmedQuery);
      const host = url.hostname.toLowerCase();
      const isSupported = SUPPORTED_PLATFORMS.some(p => host.includes(p));
      
      return { isUrl: true, isSupported };
    } catch {
      return { isUrl: false, isSupported: false };
    }
  }, [query]);

  // Load persistence data
  useEffect(() => {
    const storedUser = localStorage.getItem('ff_user');
    const storedBookmarks = localStorage.getItem('ff_bookmarks');
    const storedSaved = localStorage.getItem('ff_saved_searches');
    const storedHistory = localStorage.getItem('ff_history');

    if (storedUser) setCurrentUser(JSON.parse(storedUser));
    if (storedBookmarks) setBookmarks(JSON.parse(storedBookmarks));
    if (storedSaved) setSavedSearches(JSON.parse(storedSaved));
    if (storedHistory) setSearchHistory(JSON.parse(storedHistory));
  }, []);

  // Save persistence data
  useEffect(() => {
    localStorage.setItem('ff_bookmarks', JSON.stringify(bookmarks));
  }, [bookmarks]);

  useEffect(() => {
    localStorage.setItem('ff_saved_searches', JSON.stringify(savedSearches));
  }, [savedSearches]);

  useEffect(() => {
    localStorage.setItem('ff_history', JSON.stringify(searchHistory));
  }, [searchHistory]);

  const handleSearch = async (e?: React.FormEvent, overrideQuery?: string, overrideFilters?: AdvancedFilters) => {
    if (e) e.preventDefault();
    
    const searchStr = overrideQuery !== undefined ? overrideQuery : query;
    const searchFilters = overrideFilters !== undefined ? overrideFilters : filters;

    if (!searchStr.trim()) return;

    // Direct URL check for history logging
    let isUrlSearch = false;
    try {
      const url = new URL(searchStr.trim());
      isUrlSearch = SUPPORTED_PLATFORMS.some(p => url.hostname.includes(p));
    } catch {}

    setLoading(true);
    setError(null);
    setHasSearched(true);
    setActiveView('search');
    if (overrideQuery !== undefined) setQuery(overrideQuery);
    if (overrideFilters !== undefined) setFilters(overrideFilters);

    // Add to history
    const historyEntry: HistoryItem = {
      id: Date.now().toString(),
      query: searchStr,
      filters: { ...searchFilters },
      timestamp: Date.now()
    };

    setSearchHistory(prev => {
      if (prev.length > 0 && prev[0].query === searchStr && JSON.stringify(prev[0].filters) === JSON.stringify(searchFilters)) {
        return prev;
      }
      return [historyEntry, ...prev].slice(0, 20);
    });

    try {
      const data = await searchPublicStorage(searchStr, activeCategory, searchFilters, isUrlSearch);
      setResults(data);
      if (data.length === 0) {
        // We keep results empty to show the refinement console
      }
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!generatorUrl.trim()) return;
    
    setResolving(true);
    setError(null);
    try {
      const res = await resolveDirectLink(generatorUrl);
      setResolvedLink(res);
    } catch (err: any) {
      setError(err.message || "Failed to resolve link.");
    } finally {
      setResolving(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopying(true);
    setTimeout(() => setCopying(false), 2000);
  };

  const handleCopyResultLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedResultUrl(url);
    setTimeout(() => setCopiedResultUrl(null), 1500);
  };

  const resetFilters = () => {
    setFilters({
      fileType: 'Any',
      sizeRange: 'Any',
      uploadDate: 'Any',
      sortBy: 'Relevance'
    });
    setActiveCategory(FileCategory.ALL);
  };

  const toggleBookmark = (result: SearchResult) => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    const exists = bookmarks.find(b => b.result.url === result.url);
    if (exists) {
      setBookmarks(bookmarks.filter(b => b.result.url !== result.url));
    } else {
      setBookmarks([...bookmarks, { id: Date.now().toString(), result, timestamp: Date.now() }]);
    }
  };

  const saveCurrentSearch = () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    if (!query) return;
    const newSaved: SavedSearch = {
      id: Date.now().toString(),
      query,
      filters: { ...filters },
      timestamp: Date.now()
    };
    setSavedSearches([newSaved, ...savedSearches]);
    alert("Search saved to your account!");
  };

  const downloadResults = () => {
    if (results.length === 0) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(results, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `firefind_results_${query.replace(/\s+/g, '_')}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const downloadSavedSearches = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(savedSearches, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "firefind_saved_searches.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleAuth = () => {
    const demoUser: User = { id: '1', username: 'GuestExplorer', email: 'guest@firefind.io' };
    setCurrentUser(demoUser);
    localStorage.setItem('ff_user', JSON.stringify(demoUser));
    setIsAuthModalOpen(false);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('ff_user');
    setActiveView('search');
  };

  const getFileIcon = (type?: string) => {
    const t = type?.toLowerCase() || '';
    if (t.includes('folder')) return <FolderOpen className="w-5 h-5 text-blue-500" />;
    if (t.includes('zip') || t.includes('rar') || t.includes('7z') || t.includes('archive')) return <Package className="w-5 h-5 text-amber-500" />;
    if (t.includes('image') || t.includes('png') || t.includes('jpg')) return <FileText className="w-5 h-5 text-emerald-500" />;
    if (t.includes('script') || t.includes('code') || t.includes('js') || t.includes('py')) return <Code className="w-5 h-5 text-indigo-500" />;
    return <FileText className="w-5 h-5 text-slate-500" />;
  };

  const getPlatformIcon = (platform: string) => {
    const p = platform.toLowerCase();
    if (p.includes('google drive')) {
      return (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.43 3L22.18 14.5L18.81 20.5L12.06 9L15.43 3Z" fill="#FFC107"/>
          <path d="M5.19 14.5L2 20.5L15.44 20.5L18.81 14.5L5.19 14.5Z" fill="#1976D2"/>
          <path d="M8.56 3L1.81 14.5L5.18 20.5L12.06 9L8.56 3Z" fill="#4CAF50"/>
        </svg>
      );
    }
    if (p.includes('mega')) {
      return (
        <div className="w-4 h-4 bg-red-600 rounded-sm flex items-center justify-center text-[10px] text-white font-bold leading-none shadow-sm">M</div>
      );
    }
    if (p.includes('dropbox')) {
      return (
        <svg className="w-4 h-4 text-[#0061FF]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 2l6 3.75-6 3.75-6-3.75L6 2zm12 0l6 3.75-6 3.75-6-3.75L18 2zM0 13.25l6-3.75 6 3.75-6 3.75-6-3.75zm18-3.75l6 3.75-6 3.75-6-3.75 6-3.75zM6 17l6-3.75 6 3.75-6 3.75L6 17z"/>
        </svg>
      );
    }
    if (p.includes('terabox')) {
      return <div className="w-4 h-4 bg-blue-400 rounded-sm flex items-center justify-center text-[8px] text-white font-black shadow-sm">TB</div>;
    }
    if (p.includes('box')) {
      return <div className="w-4 h-4 bg-[#006BD4] rounded-sm flex items-center justify-center text-[10px] text-white font-bold shadow-sm">B</div>;
    }
    if (p.includes('pixeldrain')) {
      return <div className="w-4 h-4 bg-slate-900 rounded-sm flex items-center justify-center text-[10px] text-white font-bold shadow-sm">PX</div>;
    }
    if (p.includes('workupload')) {
      return <div className="w-4 h-4 bg-orange-500 rounded-sm flex items-center justify-center text-[10px] text-white font-bold shadow-sm">W</div>;
    }
    if (p.includes('onedrive')) {
      return <Cloud className="w-4 h-4 text-[#0078d4]" />;
    }
    if (p.includes('proton')) {
      return <ShieldCheck className="w-4 h-4 text-[#6d4aff]" />;
    }
    if (p.includes('gofile')) {
      return <UploadCloud className="w-4 h-4 text-emerald-500" />;
    }
    return <div className="w-4 h-4 bg-blue-500 rounded-sm flex items-center justify-center text-[10px] text-white font-bold shadow-sm">FF</div>;
  };

  const renderResult = (result: SearchResult, idx: number) => {
    const isBookmarked = bookmarks.some(b => b.result.url === result.url);
    const isFolder = result.fileType?.toLowerCase().includes('folder');
    const isCopied = copiedResultUrl === result.url;
    
    // Check for "Confirmed Found" platforms
    const isConfirmed = result.platform === 'MediaFire' || result.platform === 'Google Drive';

    return (
      <div
        key={idx}
        className={`group relative bg-white border rounded-xl p-5 hover:shadow-lg transition-all ${isFolder ? 'border-blue-200 bg-blue-50/10 hover:border-blue-400' : 'border-slate-200 hover:border-blue-400'}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1">
            <div className={`mt-1 p-2 rounded-lg transition-colors ${isFolder ? 'bg-blue-100 group-hover:bg-blue-200' : 'bg-slate-100 group-hover:bg-blue-50'}`}>
              {getFileIcon(result.fileType)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500">
                  {getPlatformIcon(result.platform)}
                  {result.platform}
                </div>
                {isConfirmed && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-100 rounded text-[10px] font-bold text-emerald-600 animate-pulse-slow">
                    <CheckCircle2 className="w-3 h-3" />
                    CONFIRMED FOUND
                  </div>
                )}
                {result.fileSize && (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                    {result.fileSize}
                  </span>
                )}
                {isFolder && (
                  <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase border border-blue-100">
                    DIRECTORY
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a href={result.url} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-slate-900 hover:text-blue-600 transition-colors line-clamp-1">
                  {result.title}
                </a>
              </div>
              <p className="text-slate-500 text-sm mt-1 line-clamp-2 leading-relaxed">
                {result.snippet}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-3">
                <span className="text-[11px] font-mono text-slate-400 truncate max-w-[250px] bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                  {result.url}
                </span>
                {result.uploadDate && (
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" /> {result.uploadDate}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 min-w-[130px]">
            <a
              href={result.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center justify-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-bold transition-all shadow-md ${isFolder ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'}`}
            >
              {isFolder ? <FolderOpen className="w-4 h-4" /> : <Download className="w-4 h-4" />}
              {isFolder ? 'Open Folder' : 'Download'}
            </a>
            <div className="flex gap-2">
              <button
                onClick={() => toggleBookmark(result)}
                className={`flex-1 p-2 rounded-lg border transition-colors flex items-center justify-center ${isBookmarked ? 'bg-amber-100 border-amber-200 text-amber-600' : 'bg-white border-slate-200 text-slate-400 hover:bg-amber-50 hover:text-amber-500 hover:border-amber-200'}`}
                title={isBookmarked ? "Remove Bookmark" : "Add Bookmark"}
              >
                <Star className={`w-4 h-4 ${isBookmarked ? 'fill-amber-600' : ''}`} />
              </button>
              <button
                onClick={() => handleCopyResultLink(result.url)}
                className={`flex-1 p-2 rounded-lg border transition-all flex items-center justify-center ${isCopied ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200'}`}
                title="Copy Link"
              >
                {isCopied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 p-2 bg-white border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-blue-600 hover:border-blue-200 rounded-lg transition-colors flex items-center justify-center"
                title="Open Link"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
        @keyframes slide-right {
          from { transform: translateX(-100%); }
          to { transform: translateX(400%); }
        }
        .animate-progress-shimmer {
          animation: slide-right 2s infinite linear;
        }
      `}</style>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2 cursor-pointer shrink-0" onClick={() => setActiveView('search')}>
              <div className="bg-blue-600 p-1.5 rounded-lg shadow-blue-200 shadow-lg">
                <Search className="text-white w-5 h-5" />
              </div>
              <h1 className="text-xl font-bold text-slate-900 hidden sm:block">FireFind</h1>
            </div>

            <form onSubmit={(e) => handleSearch(e)} className="flex-1 max-w-2xl relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search Drive, Mega, TeraBox, Pixeldrain, MediaFire..."
                className={`w-full pl-10 pr-32 py-2.5 bg-slate-50 border rounded-full focus:outline-none focus:ring-2 transition-all text-sm ${urlStatus.isUrl ? 'border-emerald-200 focus:ring-emerald-500' : 'border-slate-200 focus:ring-blue-500 shadow-inner'}`}
              />
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                {urlStatus.isUrl ? <LinkIcon className={`w-4 h-4 ${urlStatus.isSupported ? 'text-emerald-500' : 'text-amber-500'}`} /> : <Search className="w-4 h-4" />}
              </div>
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {urlStatus.isUrl && !urlStatus.isSupported && (
                  <div className="mr-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
                    Unsupported
                  </div>
                )}
                <button
                  type="button"
                  onClick={saveCurrentSearch}
                  className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md transition-colors"
                  title="Save Search"
                >
                  <Save className="w-4 h-4" />
                </button>
                <button
                  type="submit"
                  disabled={loading || (urlStatus.isUrl && !urlStatus.isSupported)}
                  className={`px-4 py-1.5 text-white text-xs font-semibold rounded-full disabled:opacity-50 transition-all ${urlStatus.isSupported ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200'}`}
                >
                  {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : urlStatus.isSupported ? 'Lookup Link' : 'Search'}
                </button>
              </div>
            </form>

            <div className="flex items-center gap-3 shrink-0">
              <button 
                onClick={() => setIsFilterPanelOpen(!isFilterPanelOpen)}
                className={`p-2 rounded-full transition-all ${isFilterPanelOpen ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
              >
                <Filter className="w-5 h-5" />
              </button>
              {currentUser ? (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 border border-blue-200">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                    <LogOut className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <button 
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 rounded-full transition-colors border border-blue-200"
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {isFilterPanelOpen && (
          <div className="bg-white border-t border-slate-100 py-4 shadow-inner">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">File Type</label>
                  <select 
                    value={filters.fileType} 
                    onChange={e => setFilters({...filters, fileType: e.target.value})}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:border-blue-300"
                  >
                    <option>Any</option>
                    <option>Documents</option>
                    <option>Archives</option>
                    <option>Media</option>
                    <option>Software</option>
                    <option>Scripts</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Size Range</label>
                  <select 
                    value={filters.sizeRange}
                    onChange={e => setFilters({...filters, sizeRange: e.target.value})}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:border-blue-300"
                  >
                    <option>Any</option>
                    <option>Small (&lt; 10MB)</option>
                    <option>Medium (10-500MB)</option>
                    <option>Large (&gt; 500MB)</option>
                    <option>Massive (&gt; 2GB)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Upload Date</label>
                  <select 
                    value={filters.uploadDate}
                    onChange={e => setFilters({...filters, uploadDate: e.target.value})}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:border-blue-300"
                  >
                    <option>Any</option>
                    <option>Last 24h</option>
                    <option>Last Week</option>
                    <option>Last Month</option>
                    <option>Last Year</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">Sort By</label>
                  <select 
                    value={filters.sortBy}
                    onChange={e => setFilters({...filters, sortBy: e.target.value})}
                    className="w-full text-sm border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:border-blue-300"
                  >
                    <option>Relevance</option>
                    <option>Newest</option>
                    <option>Oldest</option>
                    <option>Popularity</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6 gap-8">
        
        {/* Navigation Sidebar */}
        <aside className="w-full md:w-64 shrink-0 space-y-1">
          <button 
            onClick={() => setActiveView('search')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'search' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <Search className="w-5 h-5" /> Global Search
          </button>
          <button 
            onClick={() => setActiveView('generator')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'generator' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <Zap className="w-5 h-5" /> Direct Link Resolver
          </button>
          <button 
            onClick={() => setActiveView('bookmarks')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'bookmarks' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <div className="flex items-center gap-3"><Star className="w-5 h-5" /> Bookmarks</div>
            {bookmarks.length > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeView === 'bookmarks' ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{bookmarks.length}</span>}
          </button>
          <button 
            onClick={() => setActiveView('saved-searches')}
            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeView === 'saved-searches' ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <div className="flex items-center gap-3"><Clock className="w-5 h-5" /> Saved Searches</div>
            {savedSearches.length > 0 && <span className={`px-2 py-0.5 rounded-full text-[10px] ${activeView === 'saved-searches' ? 'bg-blue-400 text-white' : 'bg-slate-200 text-slate-500'}`}>{savedSearches.length}</span>}
          </button>
          
          <div className="pt-6">
            <h4 className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Categories</h4>
            <div className="flex flex-wrap gap-2 px-2">
              {Object.values(FileCategory).map(cat => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    handleSearch(undefined, query, filters);
                  }}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all ${activeCategory === cat ? 'bg-slate-800 border-slate-800 text-white shadow-md' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-6">
            <div className="flex items-center justify-between px-4 mb-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">History</h4>
              {searchHistory.length > 0 && (
                <button onClick={() => setSearchHistory([])} className="text-[10px] text-slate-300 hover:text-red-400 transition-colors uppercase font-bold tracking-tighter">Clear</button>
              )}
            </div>
            <div className="space-y-1 px-2 max-h-[250px] overflow-y-auto custom-scrollbar text-ellipsis">
              {searchHistory.length === 0 ? (
                <p className="px-3 text-[11px] text-slate-300 italic">No history</p>
              ) : (
                searchHistory.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleSearch(undefined, item.query, item.filters)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-100 transition-colors text-left group/hist"
                  >
                    {item.query.startsWith('http') ? <LinkIcon className="w-3 h-3 text-emerald-400 shrink-0" /> : <History className="w-3 h-3 text-slate-300 shrink-0 group-hover/hist:text-blue-400" />}
                    <span className="truncate">{item.query}</span>
                  </button>
                ))
              )}
            </div>
          </div>
          
          <div className="pt-6 px-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Global Sources</h4>
              <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded">14+ Indexed</span>
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {[
                { name: 'Google Drive', icon: 'drive' },
                { name: 'MediaFire', icon: 'M', color: 'bg-blue-500' },
                { name: 'Mega.nz', icon: 'M', color: 'bg-red-600' },
                { name: 'TeraBox', icon: 'TB', color: 'bg-blue-400' },
                { name: 'Pixeldrain', icon: 'PX', color: 'bg-slate-900' },
                { name: 'Dropbox', icon: 'dropbox' },
                { name: 'OneDrive', icon: 'onedrive' },
                { name: 'Proton Drive', icon: 'proton' },
                { name: 'GoFile.io', icon: 'gofile' },
                { name: 'WorkUpload', icon: 'W', color: 'bg-orange-500' },
                { name: 'Box.com', icon: 'B', color: 'bg-[#006BD4]' },
                { name: '4Shared.com', icon: '4', color: 'bg-slate-800' },
                { name: 'FileGarden', icon: 'filegarden' },
                { name: 'Yandex Disk', icon: 'yandex' }
              ].map((src) => (
                <div key={src.name} className="flex items-center gap-2 text-xs text-slate-500 font-medium hover:text-slate-900 transition-colors">
                  {src.color ? (
                    <div className={`w-4 h-4 ${src.color} rounded-sm flex items-center justify-center text-[8px] text-white font-black`}>{src.icon}</div>
                  ) : getPlatformIcon(src.name)}
                  {src.name}
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 min-w-0">
          {activeView === 'search' && (
            <div className="space-y-6">
              {!hasSearched ? (
                <div className="text-center py-20 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <div className="inline-block p-6 bg-blue-50 rounded-full mb-6">
                    <Layers className="w-12 h-12 text-blue-500 opacity-60" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-2">Omni-Source Search</h2>
                  <p className="text-slate-500 max-w-md mx-auto px-4">
                    Instantly query public indices of 14+ global cloud storage providers. Find shared datasets, software, and media.
                  </p>
                  <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-xl mx-auto px-6">
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                      <Zap className="w-5 h-5 text-amber-500 mb-2" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Real-time</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                      <ShieldCheck className="w-5 h-5 text-emerald-500 mb-2" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filtered</span>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center">
                      <ExternalLink className="w-5 h-5 text-blue-500 mb-2" />
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Public Only</span>
                    </div>
                  </div>
                </div>
              ) : loading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-8 bg-white rounded-3xl border border-slate-100 shadow-sm">
                  <div className="relative">
                    <div className="w-20 h-20 border-4 border-slate-100 border-t-blue-600 rounded-full animate-spin"></div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      {getPlatformIcon(SUPPORTED_PLATFORMS[searchStatusIndex % SUPPORTED_PLATFORMS.length])}
                    </div>
                  </div>
                  
                  <div className="text-center space-y-4 max-w-sm px-6">
                    <h3 className="text-xl font-bold text-slate-900 animate-pulse">
                      {SEARCH_STATUS_MESSAGES[searchStatusIndex]}
                    </h3>
                    <p className="text-slate-400 text-sm font-medium">
                      Estimated time: <span className="text-blue-500 font-bold">~{Math.max(3, 8 - searchStatusIndex)}s</span>
                    </p>
                    
                    {/* Progress Track */}
                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
                       <div 
                         className="h-full bg-blue-600 rounded-full transition-all duration-1000 ease-in-out" 
                         style={{ width: `${((searchStatusIndex + 1) / SEARCH_STATUS_MESSAGES.length) * 100}%` }}
                       />
                       <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-1/4 animate-progress-shimmer"></div>
                    </div>
                  </div>
                </div>
              ) : (error || results.length === 0) ? (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-3xl p-10 text-center max-w-2xl mx-auto shadow-sm">
                    <div className="inline-block p-4 bg-red-50 text-red-500 rounded-full mb-6">
                      <AlertCircle className="w-10 h-10" />
                    </div>
                    <h3 className="text-2xl font-bold text-slate-900">No Matches Found</h3>
                    <p className="text-slate-500 mt-2">
                      We couldn't find any public links for <span className="font-bold text-slate-700">"{query}"</span> using your current settings.
                    </p>
                    
                    <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex items-center gap-2 mb-3">
                          <Lightbulb className="w-4 h-4 text-amber-500" />
                          <h4 className="font-bold text-slate-900 text-sm">Refinement Tips</h4>
                        </div>
                        <ul className="space-y-3 text-xs text-slate-600">
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 font-bold">1</span>
                            Check for typos or use more general keywords.
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 font-bold">2</span>
                            Your "Size Range" or "Date" filters might be too restrictive.
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="w-4 h-4 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center shrink-0 font-bold">3</span>
                            Try changing the category to "All" instead of a specific one.
                          </li>
                        </ul>
                      </div>
                      
                      <div className="p-5 bg-blue-50/50 rounded-2xl border border-blue-100">
                        <div className="flex items-center gap-2 mb-3">
                          <MousePointerClick className="w-4 h-4 text-blue-500" />
                          <h4 className="font-bold text-slate-900 text-sm">Quick Actions</h4>
                        </div>
                        <div className="space-y-3">
                          <button 
                            onClick={resetFilters}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-white border border-blue-200 text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" /> Reset All Filters
                          </button>
                          <button 
                            onClick={() => handleSearch(undefined, query.split(' ')[0])}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-100"
                          >
                            <Search className="w-3 h-3" /> Try Broader Query
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider inline-block">
                        {query.startsWith('http') ? 'Source Analysis' : `Matches for "${query}"`}
                      </h2>
                      <span className="text-xs text-slate-400 ml-3 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">{results.length} files found</span>
                    </div>
                    {results.length > 0 && (
                      <button 
                        onClick={downloadResults}
                        className="flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        <FileDown className="w-3.5 h-3.5" /> Export results
                      </button>
                    )}
                  </div>
                  {results.map(renderResult)}
                </div>
              )}
            </div>
          )}

          {activeView === 'generator' && (
            <div className="max-w-3xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="text-center space-y-4">
                <div className="inline-block p-4 bg-blue-100 rounded-3xl text-blue-600 mb-2 shadow-lg shadow-blue-50">
                  <Zap className="w-10 h-10 fill-blue-600" />
                </div>
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Direct Link Resolver</h2>
                <p className="text-slate-500 leading-relaxed max-w-lg mx-auto">Bypass landing pages, ad-walls, and forced registrations. Supports Google Drive, Pixeldrain, Dropbox, TeraBox, and more.</p>
              </div>

              <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-xl shadow-slate-200/50">
                <form onSubmit={handleGenerateLink} className="space-y-4">
                  <div className="relative">
                    <input 
                      type="text" 
                      value={generatorUrl}
                      onChange={(e) => setGeneratorUrl(e.target.value)}
                      placeholder="Paste a shared link (e.g. mega.nz, drive.google.com...)"
                      className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all font-medium shadow-inner"
                    />
                    <LinkIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  </div>
                  <button 
                    type="submit"
                    disabled={resolving || !generatorUrl.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 group"
                  >
                    {resolving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                    {resolving ? 'Generating download path...' : 'Bypass & Resolve'}
                  </button>
                </form>

                {error && (
                  <div className="mt-6 p-4 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    {error}
                  </div>
                )}

                {resolvedLink && (
                  <div className="mt-8 space-y-6 animate-in zoom-in-95 duration-300">
                    <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Detected File</h4>
                          <p className="text-lg font-bold text-slate-900">{resolvedLink.title}</p>
                        </div>
                        <div className="bg-emerald-100 text-emerald-600 p-2 rounded-full">
                          <CheckCircle className="w-5 h-5" />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Raw Direct Link</h4>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono text-blue-600 truncate flex items-center">
                            {resolvedLink.directUrl}
                          </div>
                          <button 
                            onClick={() => copyToClipboard(resolvedLink.directUrl)}
                            className={`px-4 rounded-xl border transition-all flex items-center justify-center gap-2 font-bold text-sm shrink-0 ${copying ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                          >
                            {copying ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            {copying ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                        <a 
                          href={resolvedLink.directUrl} 
                          target="_blank" 
                          className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-100"
                        >
                          <Download className="w-4 h-4" />
                          Start Download
                        </a>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 bg-amber-50 rounded-xl text-xs text-amber-800 leading-relaxed border border-amber-100">
                      <Info className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                      <div>
                        <span className="font-bold">Heads up:</span> {resolvedLink.explanation}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeView === 'bookmarks' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h2 className="text-2xl font-bold text-slate-900">Saved Files</h2>
                <button 
                  onClick={() => setBookmarks([])}
                  className="text-xs text-red-500 hover:underline flex items-center gap-1 font-bold uppercase tracking-tighter"
                >
                  <Trash2 className="w-3 h-3" /> Purge All
                </button>
              </div>
              {bookmarks.length === 0 ? (
                <div className="py-20 text-center bg-slate-100/50 rounded-2xl border border-dashed border-slate-300">
                  <BookmarkIcon className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">No saved files found.</p>
                  <button onClick={() => setActiveView('search')} className="text-blue-600 font-bold text-sm mt-3 hover:underline">Discovery mode</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {bookmarks.map((b, i) => renderResult(b.result, i))}
                </div>
              )}
            </div>
          )}

          {activeView === 'saved-searches' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h2 className="text-2xl font-bold text-slate-900">Watchlist</h2>
                <div className="flex items-center gap-2">
                  {savedSearches.length > 0 && (
                    <button 
                      onClick={downloadSavedSearches}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold hover:bg-slate-200 transition-colors"
                    >
                      <FileJson className="w-3.5 h-3.5" /> JSON Export
                    </button>
                  )}
                </div>
              </div>
              {savedSearches.length === 0 ? (
                <div className="py-20 text-center bg-slate-100/50 rounded-2xl border border-dashed border-slate-300">
                  <Clock className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                  <p className="text-slate-400 font-medium">Your watchlist is currently empty.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedSearches.map((s) => (
                    <div 
                      key={s.id}
                      className="group bg-white border border-slate-200 rounded-xl p-4 flex items-center justify-between hover:border-blue-300 transition-all cursor-pointer shadow-sm"
                      onClick={() => {
                        handleSearch(undefined, s.query, s.filters);
                      }}
                    >
                      <div className="flex items-center gap-4">
                        <div className="bg-slate-50 p-2 rounded-lg group-hover:bg-blue-50 transition-colors">
                          <Search className="w-4 h-4 text-slate-400 group-hover:text-blue-500" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{s.query}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{s.filters.fileType}</span>
                            <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider">{s.filters.uploadDate}</span>
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setSavedSearches(savedSearches.filter(item => item.id !== s.id));
                        }}
                        className="p-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Auth Modal Mock */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] p-10 max-sm:p-6 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-xl">
                  <Database className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">CloudSync</h2>
              </div>
              <button onClick={() => setIsAuthModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-full transition-colors">
                <X className="w-6 h-6 text-slate-400" />
              </button>
            </div>
            <p className="text-slate-500 text-sm mb-10 leading-relaxed font-medium">
              Create a free account to sync your watchlist, bookmarks, and resolve history across devices.
            </p>
            <div className="space-y-4">
              <button 
                onClick={handleAuth}
                className="w-full bg-slate-900 text-white font-bold py-4 rounded-2xl hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
              >
                Continue as Guest
              </button>
              <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-100"></div></div>
                <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-300 bg-white px-3 tracking-[0.2em]">Bypass Locked Features</div>
              </div>
              <button className="w-full border-2 border-slate-100 text-slate-600 font-bold py-4 rounded-2xl hover:bg-slate-50 transition-all flex items-center justify-center gap-3">
                 Cloud Provider Connect
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-10 uppercase tracking-widest leading-relaxed font-bold">
              Discover public cloud contents responsibly.
            </p>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-10 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="bg-blue-600 p-1 rounded-md">
              <Search className="w-4 h-4 text-white" />
            </div>
            <span className="font-black text-slate-900 text-lg tracking-tight">FireFind</span>
          </div>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-widest leading-relaxed">
            Universal Public Link Indexer &copy; {new Date().getFullYear()}
          </p>
          <div className="flex items-center justify-center gap-8 mt-6">
            <a href="#" className="text-slate-400 hover:text-blue-600 text-[10px] transition-colors font-black uppercase tracking-widest">Docs</a>
            <a href="#" className="text-slate-400 hover:text-blue-600 text-[10px] transition-colors font-black uppercase tracking-widest">Status</a>
            <a href="#" className="text-slate-400 hover:text-blue-600 text-[10px] transition-colors font-black uppercase tracking-widest">Github</a>
            <a href="#" className="text-slate-400 hover:text-blue-600 text-[10px] transition-colors font-black uppercase tracking-widest">API</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
