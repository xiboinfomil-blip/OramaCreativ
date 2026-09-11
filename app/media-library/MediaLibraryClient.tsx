'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import Swal from 'sweetalert2';
import MediaCard, { MediaSchema } from '@/app/media-library/components/MediaCard';
import UploadModal from '@/app/media-library/components/UploadModal'; 
import MediaLibraryHeader, { FilterOption, SortOption } from '@/components/SearchSortFilter'; 
import FloatingActionButton from '@/components/FloatingActionButton'; 
import GalleryLightbox, { MediaItem } from '@/components/GalleryLightbox';
import CardGrid from '@/components/displayGrid';
import { MEDIA_TYPES } from '@/db/schema';
import { HiPhoto } from 'react-icons/hi2';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface MediaLibraryClientProps {
  initialMedia: MediaSchema[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    limit: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
  filters: {
    search: string;
    type?: typeof MEDIA_TYPES[number];
    sortBy?: 'newest' | 'oldest' | 'name';
  };
}

const FILTER_OPTIONS: FilterOption[] = [
  { value: 'all', label: 'All Assets' },
  ...MEDIA_TYPES.map(type => ({
    value: type,
    label: type === 'image' ? 'Images' : type === 'video' ? 'Videos' : 'GIFs'
  }))
];

const SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' }
];

const MEDIA_CARD_SIZES = '(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw';

export default function MediaLibraryClient({ 
  initialMedia, 
  pagination,
  filters 
}: MediaLibraryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [media, setMedia] = useState(initialMedia);
  const [hasMore, setHasMore] = useState(pagination.hasNext);
  const nextPageRef = useRef(pagination.currentPage + 1);

  useEffect(() => {
    // URL changes from filters replace the list and restart loading at page one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMedia(initialMedia);
    setHasMore(pagination.hasNext);
    nextPageRef.current = pagination.currentPage + 1;
  }, [initialMedia, pagination.hasNext, pagination.currentPage]);

  // ✅ Explicitly type the useMemo return and cast the object to satisfy the Slide union type
  const slides = useMemo((): MediaItem[] => media.map(item => {
    const isVideo = item.type === 'video';
    
    return {
      // ✅ Lightbox only supports 'image', 'video', or 'iframe'. GIFs are rendered as 'image'.
      type: isVideo ? 'video' : 'image',
      src: !isVideo ? item.fullResUrl : undefined,
      sources: isVideo ? [{ src: item.fullResUrl, type: 'video/mp4' as const }] : undefined,
      poster: isVideo ? item.thumbnailUrl : undefined,
      width: item.width || 800,
      height: item.height || 600,
      alt: item.originalFilename || 'Media asset',
      title: item.originalFilename || undefined,
      description: item.caption || undefined,
    } as MediaItem;
  }), [media]);

  const updateSearchParams = useCallback((params: Record<string, string | undefined>) => {
    const newParams = new URLSearchParams(searchParams.toString());
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === '') {
        newParams.delete(key);
      } else {
        newParams.set(key, value);
      }
    });
    if (params.search !== undefined || params.type !== undefined || params.sortBy !== undefined) {
      newParams.set('page', '1');
    }
    router.push(`${pathname}?${newParams.toString()}`);
  }, [router, pathname, searchParams]);

  const handleSearch = useCallback(() => {
    updateSearchParams({ search: searchInput || undefined });
  }, [searchInput, updateSearchParams]);

  const handleTypeFilter = useCallback((type: string) => {
    updateSearchParams({ type: type === 'all' ? undefined : type as typeof MEDIA_TYPES[number] });
  }, [updateSearchParams]);

  const handleSort = useCallback((sortBy: string) => {
    updateSearchParams({ sortBy });
  }, [updateSearchParams]);

  const loadMore = useCallback(async () => {
    if (!hasMore) return;

    const page = nextPageRef.current;
    const params = new URLSearchParams({
      page: page.toString(),
      search: filters.search,
      type: filters.type || 'all',
      sortBy: filters.sortBy || 'newest',
      limit: pagination.limit.toString(),
    });
    const response = await fetch(`/api/media?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load more media.');

    const data = await response.json() as { items: MediaSchema[]; hasMore: boolean };
    setMedia((current) => {
      const existingIds = new Set(current.map((item) => item.id));
      return [...current, ...data.items.filter((item) => !existingIds.has(item.id))];
    });
    setHasMore(data.hasMore);
    nextPageRef.current = page + 1;
  }, [filters, hasMore, pagination.limit]);

  const { sentinelRef, isLoading, error } = useInfiniteScroll({ hasMore, onLoadMore: loadMore });

  const handleDelete = useCallback(async (id: string) => {
    const result = await Swal.fire({
      title: 'Delete Asset?',
      text: "This will permanently remove this item from your library.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#71717a',
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      background: '#ffffff',
      customClass: {
        popup: 'rounded-2xl shadow-xl border border-zinc-100',
        title: 'font-semibold text-zinc-900 text-lg',
        htmlContainer: 'text-zinc-600 font-medium',
        confirmButton: 'font-semibold px-4 py-2.5 rounded-xl transition-colors hover:bg-red-700',
        cancelButton: 'font-semibold px-4 py-2.5 rounded-xl transition-colors hover:bg-zinc-100 text-zinc-700'
      }
    });

    if (!result.isConfirmed) return;

    setIsDeleting(id);
    try {
      const res = await fetch(`/api/media?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      
      await Swal.fire({
        icon: 'success',
        title: 'Deleted',
        text: 'The asset has been removed.',
        timer: 1500,
        showConfirmButton: false,
        background: '#ffffff',
        customClass: { popup: 'rounded-2xl shadow-xl border border-zinc-100', title: 'font-semibold text-zinc-900' }
      });
      router.refresh();
    } catch (error) {
      console.error('Failed to delete media:', error);
      await Swal.fire({
        icon: 'error',
        title: 'Deletion Failed',
        text: 'An error occurred. Please try again.',
        background: '#ffffff',
        customClass: { popup: 'rounded-2xl shadow-xl border border-zinc-100', title: 'font-semibold text-zinc-900' }
      });
    } finally {
      setIsDeleting(null);
    }
  }, [router]);

  const handleResetFilters = useCallback(() => {
    setSearchInput('');
    updateSearchParams({ search: undefined, type: undefined, sortBy: undefined });
  }, [updateSearchParams]);

  const handleCloseUpload = useCallback(() => {
    setIsUploadOpen(false);
    router.refresh();
  }, [router]);

  const handleOpenLightbox = useCallback((index: number) => setLightboxIndex(index), []);
  const handleCloseLightbox = useCallback(() => setLightboxIndex(-1), []);

  const currentFilter = filters.type || 'all';
  const currentSort = filters.sortBy || 'newest';

  const mediaEmptyState = (
    <div className="flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
      <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-6 border border-zinc-100 dark:border-zinc-800">
        <HiPhoto className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
      </div>
      <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">No assets found</h3>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2 max-w-xs font-medium">No items match your current filters. Try adjusting your search or upload new media.</p>
      <button 
        onClick={handleResetFilters}
        className="mt-8 px-6 py-3 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-bold uppercase tracking-widest rounded-xl hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-all duration-300 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white focus-visible:ring-offset-2"
      >
        Clear Filters
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-rose-500/30 selection:text-rose-900 dark:selection:text-rose-100 relative">
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Sticky Header with Glassmorphism */}
        <header className="sticky top-0 z-40">
          <MediaLibraryHeader
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            onSearchSubmit={handleSearch}
            activeFilter={currentFilter}
            onFilterChange={handleTypeFilter}
            filters={FILTER_OPTIONS}
            activeSort={currentSort}
            onSortChange={handleSort}
            sorts={SORT_OPTIONS}
            totalItems={pagination.totalItems}
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
          />
        </header>

        <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1600px]">
          <div className="sr-only" aria-live="polite" aria-atomic="true">
            Showing {initialMedia.length} of {pagination.totalItems} assets.
          </div>

          <CardGrid
            items={media}
            ariaLabel="Media library assets"
            emptyState={mediaEmptyState}
            renderItem={(item, index) => (
                <MediaCard 
                media={item} 
                onDelete={handleDelete}
                onOpenLightbox={() => handleOpenLightbox(index)}
                isDeleting={isDeleting === item.id}
                priority={index < 4}
                sizes={MEDIA_CARD_SIZES}
              />
            )}
          />

          <div ref={sentinelRef} className="flex min-h-20 items-center justify-center py-8" aria-live="polite">
            {isLoading && <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Loading more media...</span>}
            {!isLoading && error && <span className="text-xs font-medium text-rose-600">{error}</span>}
            {!isLoading && !hasMore && media.length > 0 && <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">All media loaded</span>}
          </div>
        </main>

        <FloatingActionButton onClick={() => setIsUploadOpen(true)} label="Upload Media" />

        <UploadModal isOpen={isUploadOpen} onClose={handleCloseUpload} />
      </div>
      
      <GalleryLightbox index={lightboxIndex} slides={slides} onClose={handleCloseLightbox} />
    </div>
  );
}