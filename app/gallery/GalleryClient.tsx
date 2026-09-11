'use client';

import { useState, useEffect, useTransition, useCallback, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { GallerySummary } from '@/types/types'; 
import MediaLibraryHeader from '@/components/SearchSortFilter';
import CardGrid from '@/components/displayGrid'; 
import MediaViewport from '@/components/media-viewport';
import EmptyState from '@/components/gallery/EmptyState';
import { Calendar, ArrowRight, Image as ImageIcon } from 'lucide-react';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

interface GalleryClientProps {
  initialGalleries: GallerySummary[];
  totalGalleries: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
  initialParams: {
    search: string;
    sort: string;
    filter: string;
  };
}

type SortOption = 'newest' | 'oldest' | 'name';
type FilterOption = 'all' | 'public' | 'password_protected';

export default function GalleryClient({ 
  initialGalleries, 
  totalGalleries,
  currentPage,
  totalPages,
  hasNext,
  initialParams 
}: GalleryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isPending, startTransition] = useTransition();
  
  const [searchQuery, setSearchQuery] = useState(initialParams.search);
  const [sortBy, setSortBy] = useState<SortOption>(initialParams.sort as SortOption);
  const [filterType, setFilterType] = useState<FilterOption>(initialParams.filter as FilterOption);
  const [galleries, setGalleries] = useState(initialGalleries);
  const [hasMore, setHasMore] = useState(hasNext);
  const nextPageRef = useRef(currentPage + 1);

  const updateUrl = useCallback((params: Record<string, string>) => {
    startTransition(() => {
      const current = new URLSearchParams(Array.from(searchParams.entries()));
      Object.entries(params).forEach(([key, value]) => {
        if (value === '' || value === 'all' || value === 'newest') {
          current.delete(key);
        } else {
          current.set(key, value);
        }
      });
      const search = current.toString();
      const query = search ? `?${search}` : '';
      router.push(`${pathname}${query}`);
    });
  }, [searchParams, pathname, router, startTransition]);

  useEffect(() => {
    // URL changes from filters replace the list and restart loading at page one.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGalleries(initialGalleries);
    setHasMore(hasNext);
    nextPageRef.current = currentPage + 1;
  }, [initialGalleries, hasNext, currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery !== initialParams.search) {
        updateUrl({ search: searchQuery, page: '1' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery, initialParams.search, updateUrl]);

  const handleSortChange = (newSort: string) => {
    setSortBy(newSort as SortOption);
    updateUrl({ sort: newSort, page: '1' });
  };

  const handleFilterChange = (newFilter: string) => {
    setFilterType(newFilter as FilterOption);
    updateUrl({ filter: newFilter, page: '1' });
  };

  const loadMore = useCallback(async () => {
    if (!hasMore) return;

    const page = nextPageRef.current;
    const params = new URLSearchParams({
      page: page.toString(),
      search: initialParams.search,
      sort: initialParams.sort,
      filter: initialParams.filter,
    });
    const response = await fetch(`/api/galleries?${params.toString()}`);
    if (!response.ok) throw new Error('Failed to load more galleries.');

    const data = await response.json() as { items: GallerySummary[]; hasMore: boolean };
    setGalleries((current) => {
      const existingIds = new Set(current.map((gallery) => gallery.id));
      return [...current, ...data.items.filter((gallery) => !existingIds.has(gallery.id))];
    });
    setHasMore(data.hasMore);
    nextPageRef.current = page + 1;
  }, [hasMore, initialParams]);

  const { sentinelRef, isLoading, error } = useInfiniteScroll({ hasMore, onLoadMore: loadMore });

  // Simplified click handler - just navigate
  const handleGalleryClick = (gallery: GallerySummary) => {
    router.push(`/gallery/${gallery.id}`);
  };

  const displayedGalleries = galleries;

  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-zinc-900 selection:text-white font-sans antialiased">
      
      {/* Sticky Header - Full Width */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-zinc-100 transition-colors duration-300">
        <div className="w-full px-6 lg:px-12 py-6">

          <MediaLibraryHeader
            searchValue={searchQuery}
            onSearchChange={setSearchQuery}
            onSearchSubmit={() => updateUrl({ search: searchQuery, page: '1' })}
            
            activeFilter={filterType}
            onFilterChange={handleFilterChange}
            filters={[
              { value: 'all', label: 'All Views' },
              { value: 'public', label: 'Public' },
              { value: 'password_protected', label: 'Password Protected' }
            ]}
            
            activeSort={sortBy}
            onSortChange={handleSortChange}
            sorts={[
              { value: 'newest', label: 'Recent' },
              { value: 'oldest', label: 'Oldest' },
              { value: 'name', label: 'Name' }
            ]}
            
            totalItems={totalGalleries}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        </div>
      </header>

      <main className="w-full px-6 lg:px-12 py-12 min-h-[60vh]">
        {isPending && (
           <div className="fixed inset-0 z-50 bg-white/80 backdrop-blur-sm flex items-center justify-center pointer-events-none transition-opacity duration-300">
             <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-100 border-t-zinc-900"></div>
           </div>
        )}

        <CardGrid
          items={displayedGalleries}
          getKey={(item) => item.id}
          emptyState={
            <EmptyState />
          }
          ariaLabel="Photo Galleries"
          renderItem={(gallery, index) => {
            const displayMedia = gallery.randomMedia; 
            
            // --- Fallback State (No Media) ---
            if (!displayMedia) {
              return (
                <button
                  onClick={() => handleGalleryClick(gallery)}
                  className="group relative w-full aspect-[4/5] bg-zinc-50 rounded-xl border border-dashed border-zinc-200 hover:border-zinc-300 hover:bg-zinc-100 transition-all duration-300 flex flex-col items-center justify-center text-center p-8 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900"
                >
                  <div className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300">
                    <ImageIcon className="w-5 h-5 text-zinc-400" />
                  </div>
                  <h3 className="text-zinc-900 font-medium">{gallery.title}</h3>
                  <p className="text-xs text-zinc-400 mt-2 uppercase tracking-widest">Empty Collection</p>
                </button>
              );
            }

            // --- Standard Card State ---
            return (
              <article 
                onClick={() => handleGalleryClick(gallery)}
                className="group flex flex-col h-full cursor-pointer focus:outline-none"
              >
                {/* Image Container - Aspect Ratio 4:5 for elegant portrait feel */}
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-zinc-100 shadow-sm group-hover:shadow-md transition-shadow duration-500">
                  <MediaViewport
                    mediaType={displayMedia.type}
                    fullResUrl={displayMedia.fullResUrl || displayMedia.thumbnailUrl}
                    thumbnailUrl={displayMedia.thumbnailUrl}
                    caption={gallery.title}
                    originalFilename={null}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    priority={index < 4} // Prioritize first few images
                  />
                  
                  {/* Subtle Overlay Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  {/* View Button Overlay */}
                  <div className="absolute bottom-4 left-4 right-4 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                    <div className="bg-white/90 backdrop-blur-md text-zinc-900 text-sm font-medium px-4 py-2.5 rounded-lg shadow-lg flex items-center justify-center gap-2">
                      View Collection
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                {/* Content Info - Clean & Spacious */}
                <div className="mt-5 px-1">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-zinc-900 font-medium text-lg leading-snug truncate group-hover:text-zinc-600 transition-colors">
                        {gallery.title}
                      </h3>
                      {gallery.description && (
                        <p className="text-zinc-500 text-sm mt-1.5 line-clamp-2 leading-relaxed font-light">
                          {gallery.description}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {/* Meta Footer - Date Only */}
                  <div className="flex items-center gap-3 mt-4 pt-4 border-t border-zinc-100">
                    <time className="text-xs text-zinc-400 font-medium flex items-center gap-1.5 uppercase tracking-wide">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(gallery.createdAt).toLocaleDateString('en-US', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </time>
                  </div>
                </div>
              </article>
            );
          }}
        />
      </main>

      <div ref={sentinelRef} className="flex min-h-20 items-center justify-center py-8" aria-live="polite">
        {isLoading && <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">Loading more galleries...</span>}
        {!isLoading && error && <span className="text-xs font-medium text-rose-600">{error}</span>}
        {!isLoading && !hasMore && galleries.length > 0 && <span className="text-xs font-medium uppercase tracking-widest text-zinc-400">All galleries loaded</span>}
      </div>
    </div>
  );
}