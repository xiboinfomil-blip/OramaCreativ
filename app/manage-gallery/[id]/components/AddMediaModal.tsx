'use client';

import { useState, useCallback } from 'react';
import { MEDIA_TYPES } from '@/db/schema';
import MediaViewport from '@/components/media-viewport';
import MediaLibraryHeader, { FilterOption, SortOption } from '@/components/SearchSortFilter';
import Pagination from '@/components/Pagination';
import BaseModal from '@/components/BaseModal';
import { CustomButton } from '@/components/ui/CustomButton';
import { HiCheck, HiPlus, HiPhoto } from 'react-icons/hi2';

// --- Types ---
interface MediaOption {
  id: string;
  thumbnailUrl: string;
  fullResUrl?: string;
  title?: string | null;
  type: 'image' | 'video' | 'gif';
  uploadedAt?: Date | string;
  galleryCount?: number;
}

interface PaginationData {
  total: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface AddMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  galleryId: string;
  availableMedia: MediaOption[];
  modalPagination: PaginationData;
  initialFilters: {
    search: string;
    type: 'all' | 'image' | 'video' | 'gif';
    sortBy: 'newest' | 'oldest' | 'name';
  };
  onSearchChange: (val: string) => void;
  onSearchSubmit: () => void;
  onFilterChange: (type: 'all' | 'image' | 'video' | 'gif') => void;
  onSortChange: (sortBy: 'newest' | 'oldest' | 'name') => void;
  onPageChange: (page: number) => void;
  onAddMedia: (mediaId: string) => Promise<boolean>;
  onPreview?: (media: MediaOption) => void;
}

// --- Static Configurations ---
const TYPE_FILTERS: FilterOption[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'gif', label: 'GIFs' }
];

const SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' }
];

// --- Sub-Component: Media Card ---
interface MediaCardProps {
  media: MediaOption;
  isSelected: boolean;
  onToggle: () => void;
  onPreview: () => void;
  isAdding: boolean;
}

function MediaCard({ media, isSelected, onToggle, onPreview, isAdding }: MediaCardProps) {
  return (
    <div className={`group/card flex flex-col gap-3 transition-all duration-300 ${isAdding ? 'opacity-50 pointer-events-none' : ''}`}>
      
      {/* 1. Media Viewport Area */}
      <div 
        className="relative cursor-pointer rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white"
        onClick={onPreview}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPreview(); } }}
        tabIndex={0}
        role="button"
        aria-label={`Preview ${media.title || 'media asset'} in lightbox`}
      >
        <div className="aspect-4/3 relative">
          <MediaViewport
            mediaType={media.type as typeof MEDIA_TYPES[number]}
            fullResUrl={media.fullResUrl || media.thumbnailUrl}
            thumbnailUrl={media.thumbnailUrl}
            caption={media.title}
            className="w-full h-full object-cover"
          />
          
          {/* Overlay Gradient */}
          <div className="absolute inset-0 bg-black/0 group-hover/card:bg-black/10 transition-colors duration-300" />
        </div>

        {/* Animated Selection Badge */}
        <div 
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          className={`absolute top-3 right-3 z-20 flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-all duration-300 ease-out cursor-pointer ${
            isSelected 
              ? 'bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white text-white dark:text-zinc-900 scale-100' 
              : 'bg-white/90 dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 text-transparent scale-90 hover:scale-100 hover:border-zinc-400'
          }`}
        >
          <HiCheck className="h-3.5 w-3.5" />
        </div>

        {media.galleryCount === 0 && (
          <span className="absolute -left-10 bottom-5 z-20 w-32 -rotate-45 bg-amber-400 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-md">
            Unused
          </span>
        )}
      </div>

      {/* 2. Action & Info Bar */}
      <div className="flex items-center justify-between px-1">
        <div className="min-w-0 flex-1 pr-2">
          <p className="truncate text-xs font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            {media.title || 'Untitled Asset'}
          </p>
          <p className="mt-0.5 font-mono text-[10px] text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
            {media.type} • {media.id ? media.id.slice(0, 6) : 'N/A'}
          </p>
        </div>
        
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(); }}
          disabled={isAdding}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white ${
            isSelected
              ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 shadow-sm'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
          }`}
        >
          {isSelected ? 'Selected' : 'Select'}
        </button>
      </div>
    </div>
  );
}

// --- Main Modal Component ---
export default function AddMediaModal({ 
  isOpen, 
  onClose,
  availableMedia,
  modalPagination,
  initialFilters,
  onSearchChange,
  onSearchSubmit,
  onFilterChange,
  onSortChange,
  onPageChange,
  onAddMedia,
  onPreview
}: AddMediaModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchInput, setSearchInput] = useState(initialFilters.search);
  const [isAdding, setIsAdding] = useState(false);

  const handleReset = useCallback(() => {
    setSelectedIds(new Set());
    setSearchInput(initialFilters.search);
  }, [initialFilters.search]);

  const handleSearchSubmitLocal = useCallback(() => {
    onSearchChange(searchInput);
    onSearchSubmit();
  }, [searchInput, onSearchChange, onSearchSubmit]);

  const toggleSelection = useCallback((id: string) => {
    // Prevent toggling if ID is empty to avoid logic errors in the Set
    if (!id) return;
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  const isAllSelected = availableMedia.length > 0 && selectedIds.size === availableMedia.length;

  const selectAll = useCallback(() => {
    // Only select items that have valid IDs
    const validIds = availableMedia.filter(m => m.id).map(m => m.id);
    setSelectedIds(isAllSelected ? new Set() : new Set(validIds));
  }, [isAllSelected, availableMedia]);

  const handleAdd = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setIsAdding(true);
    try {
      const results = await Promise.all(Array.from(selectedIds).map(onAddMedia));
      const hasFailures = results.some(r => r === false);
      if (hasFailures) console.warn('Some media items failed to add.');
      setSelectedIds(new Set());
      onClose();
    } catch (err) {
      console.error('Failed to add media items', err);
    } finally {
      setIsAdding(false);
    }
  }, [selectedIds, onAddMedia, onClose]);

  const footerActions = (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
      <div className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest self-center hidden sm:block">
        {selectedIds.size > 0 ? (
          <span className="text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            {selectedIds.size} ASSETS QUEUED
          </span>
        ) : (
          <span>NO ASSETS SELECTED</span>
        )}
      </div>
      <div className="flex gap-3 w-full sm:w-auto">
        <CustomButton 
          variant="ghost"
          size="lg"
          onClick={() => {
            handleReset();
            onClose();
          }}
          disabled={isAdding}
          className="flex-1 sm:flex-none"
        >
          Cancel
        </CustomButton>
        <CustomButton 
          variant="primary"
          size="lg"
          onClick={handleAdd}
          disabled={isAdding || selectedIds.size === 0}
          isLoading={isAdding}
          leftIcon={!isAdding && <HiPlus className="w-4 h-4" />}
          className="flex-1 sm:flex-none"
        >
          {isAdding ? 'Processing...' : 'Add to Gallery'}
        </CustomButton>
      </div>
    </div>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Select Assets"
      subtitle="ADD EXISTING MEDIA TO GALLERY"
      maxWidth="7xl"
      isLoading={isAdding}
      footer={footerActions}
    >
      <div className="space-y-0 -mx-6">
        
        {/* Sticky Header */}
        <div className="sticky top-0 z-30 px-6 pt-2 pb-4 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <MediaLibraryHeader
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onSearchSubmit={handleSearchSubmitLocal}
            activeFilter={initialFilters.type}
            onFilterChange={(val) => onFilterChange(val as 'all' | 'image' | 'video' | 'gif')}
            filters={TYPE_FILTERS}
            activeSort={initialFilters.sortBy}
            onSortChange={(val) => onSortChange(val as 'newest' | 'oldest' | 'name')}
            sorts={SORT_OPTIONS}
            totalItems={modalPagination.total}
            currentPage={modalPagination.currentPage}
            totalPages={modalPagination.totalPages}
          />
        </div>

        {/* Telemetry Toolbar */}
        <div className="px-6 py-3 bg-zinc-50/50 dark:bg-zinc-900/30 border-b border-zinc-200/60 dark:border-zinc-800/60 flex justify-between items-center">
          <span className="text-[10px] font-mono font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" />
            {modalPagination.total} AVAILABLE ASSETS
          </span>
          <button 
            onClick={selectAll}
            disabled={availableMedia.length === 0 || isAdding}
            className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors disabled:opacity-50 focus:outline-none focus-visible:underline decoration-zinc-900 dark:decoration-white underline-offset-4"
          >
            {isAllSelected ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Content Area */}
        <div className="relative min-h-100 bg-white dark:bg-zinc-950">
          
          {availableMedia.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center px-4">
              <div className="w-20 h-20 mb-6 rounded-2xl bg-zinc-50 dark:bg-zinc-900 flex items-center justify-center border border-zinc-200 dark:border-zinc-800">
                <HiPhoto className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">No Assets Found</h3>
              <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-sm max-w-xs font-medium">
                {initialFilters.search ? 'Try adjusting your search parameters.' : 'Upload new media in the Library first.'}
              </p>
            </div>
          ) : (
            <div className="p-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                {availableMedia.map((media, index) => (
                  <MediaCard
                    // FIX: Use index-based key if ID is missing or empty to ensure uniqueness
                    key={media.id && media.id !== '' ? media.id : `media-item-${index}`}
                    media={media}
                    isSelected={selectedIds.has(media.id)}
                    onToggle={() => toggleSelection(media.id)}
                    onPreview={() => onPreview?.(media)}
                    isAdding={isAdding}
                  />
                ))}
              </div>

              {modalPagination.totalPages > 1 && (
                <div className="mt-10 flex justify-center">
                  <Pagination 
                    currentPage={modalPagination.currentPage}
                    totalPages={modalPagination.totalPages}
                    hasNext={modalPagination.hasNext}
                    hasPrevious={modalPagination.hasPrevious}
                    onPageChange={onPageChange}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </BaseModal>
  );
}