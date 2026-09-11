'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Swal, { SweetAlertOptions } from 'sweetalert2';
import MediaCard from './components/MediaCard'; 
import AddMediaModal from './components/AddMediaModal'; 
import MediaLibraryHeader, { FilterOption, SortOption } from '@/components/SearchSortFilter';
import Pagination from '@/components/Pagination';
import FloatingActionButton from '@/components/FloatingActionButton';
import CardGrid from '@/components/displayGrid';
import { CustomButton } from '@/components/ui/CustomButton';
import { FolderOpen, GripVertical } from 'lucide-react';

// DnD Kit Imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  sortableKeyboardCoordinates,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface GalleryData {
  id: string;
  title: string;
  description?: string | null;
  visibility: string;
  slug: string;
  layoutStyle?: 'masonry' | 'row' | 'column';
}

interface MediaItem {
  id: string;
  mediaId: string;
  position: number;
  media: {
    id: string;
    thumbnailUrl: string;
    fullResUrl: string;
    title?: string | null;
    type: string;
    width?: number | null;
    height?: number | null;
  };
}

interface AvailableMediaItem {
  id: string;
  thumbnailUrl: string;
  fullResUrl: string;
  title: string;
  type: 'image' | 'video' | 'gif';
  uploadedAt: string | Date;
}

interface PaginationData {
  total: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface ManageGalleryClientProps {
  gallery: GalleryData;
  galleryMediaItems: MediaItem[];
  availableMedia: AvailableMediaItem[];
  mainPagination: PaginationData;
  modalPagination: PaginationData;
  initialFilters: {
    search: string;
    gallerySearch: string;
    type: 'all' | 'image' | 'video' | 'gif';
    sortBy: 'newest' | 'oldest' | 'name' | 'position';
  };
}

const TYPE_FILTERS: FilterOption[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'gif', label: 'GIFs' }
];

const SORT_OPTIONS: SortOption[] = [
  { value: 'position', label: 'Custom Order' },
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' }
];

// --- Sortable Wrapper Component ---
function SortableMediaCard({ 
  item, 
  index, 
  onRemove, 
  onManualOrder 
}: { 
  item: MediaItem; 
  index: number; 
  onRemove: (id: string) => void;
  onManualOrder: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      className={`relative group ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
    >
      {/* Visual Drag Handle Indicator */}
      <div 
        {...attributes} 
        {...listeners}
        className="absolute top-3 left-3 z-20 p-1.5 rounded-lg bg-black/60 backdrop-blur-md text-white opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-black/80 cursor-grab active:cursor-grabbing touch-none"
        aria-label="Drag to reorder"
      >
        <GripVertical className="w-4 h-4" />
      </div>
      
      <MediaCard 
        media={item.media} 
        onRemove={onRemove} 
        onManualOrder={onManualOrder}
        priority={index < 6} 
      />
    </div>
  );
}

export default function ManageGalleryClient({ 
  gallery, 
  galleryMediaItems,
  availableMedia,
  mainPagination,
  modalPagination,
  initialFilters
}: ManageGalleryClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [localMediaItems, setLocalMediaItems] = useState(galleryMediaItems);
  
  const [gallerySearchInput, setGallerySearchInput] = useState(initialFilters.gallerySearch);
  const [modalSearchInput, setModalSearchInput] = useState(initialFilters.search);

  // Sync server state to local state when server data changes
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setGallerySearchInput(initialFilters.gallerySearch);
    setModalSearchInput(initialFilters.search);
    setLocalMediaItems(galleryMediaItems);
  }, [initialFilters.gallerySearch, initialFilters.search, galleryMediaItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // --- Shared Reorder Logic ---
  const applyNewOrder = useCallback(async (newItems: MediaItem[], previousItems: MediaItem[]) => {
    setLocalMediaItems(newItems);
    const orderedMediaIds = newItems.map((item) => item.mediaId);

    try {
      const res = await fetch('/api/gallery-media/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galleryId: gallery.id, orderedMediaIds }),
      });
      
      if (!res.ok) throw new Error('Failed to reorder');
      
    } catch (error) {
      console.error('Failed to reorder media', error);
      Swal.fire('Error', 'Failed to update order. Please try again.', 'error');
      setLocalMediaItems(previousItems);
    }
  }, [gallery.id]);

  // --- DnD Sensors Configuration ---
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // --- DnD Handlers ---
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localMediaItems.findIndex((item) => item.id === active.id);
    const newIndex = localMediaItems.findIndex((item) => item.id === over.id);

    const newItems = arrayMove(localMediaItems, oldIndex, newIndex);
    await applyNewOrder(newItems, localMediaItems);
  };

  // --- Manual Order Handler ---
  const handleManualOrder = useCallback(async (mediaId: string) => {
    const currentIndex = localMediaItems.findIndex(item => item.id === mediaId);
    if (currentIndex === -1) return;

    const swalOptions: SweetAlertOptions = {
      title: 'Set Position',
      text: `Enter a position between 1 and ${localMediaItems.length}`,
      icon: 'question',
      input: 'number',
      inputAttributes: {
        min: '1',
        max: String(localMediaItems.length),
        step: '1'
      },
      inputValue: String(currentIndex + 1),
      showCancelButton: true,
      confirmButtonText: 'Update Position',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#18181b',
      cancelButtonColor: '#e4e4e7',
      customClass: {
        popup: 'rounded-2xl shadow-xl border border-zinc-100',
        confirmButton: 'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-zinc-800',
        cancelButton: 'px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100'
      }
    };

    const result = await Swal.fire(swalOptions);

    if (!result.isConfirmed || !result.value) return;

    const targetPosition = parseInt(result.value as string, 10);
    if (isNaN(targetPosition) || targetPosition < 1 || targetPosition > localMediaItems.length) {
      Swal.fire('Invalid Position', `Please enter a number between 1 and ${localMediaItems.length}.`, 'error');
      return;
    }

    const targetIndex = targetPosition - 1;
    if (targetIndex === currentIndex) return;

    const newItems = [...localMediaItems];
    const [movedItem] = newItems.splice(currentIndex, 1);
    newItems.splice(targetIndex, 0, movedItem);

    await applyNewOrder(newItems, localMediaItems);
    
    if (result.isConfirmed) {
      Swal.fire({
        icon: 'success',
        title: 'Position Updated',
        text: `Moved to position ${targetPosition}`,
        timer: 1500,
        showConfirmButton: false,
        background: '#ffffff',
        customClass: { popup: 'rounded-2xl shadow-xl border border-zinc-100' }
      });
    }
  }, [localMediaItems, applyNewOrder]);

  const updateMainFilters = useCallback((updates: {
    gallerySearch?: string;
    type?: 'all' | 'image' | 'video' | 'gif';
    sortBy?: 'newest' | 'oldest' | 'name' | 'position';
    page?: number;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.gallerySearch !== undefined) {
      if (updates.gallerySearch) params.set('gallerySearch', updates.gallerySearch);
      else params.delete('gallerySearch');
    }
    if (updates.type !== undefined) {
      if (updates.type !== 'all') params.set('type', updates.type);
      else params.delete('type');
    }
    if (updates.sortBy !== undefined) {
      if (updates.sortBy !== 'position') params.set('sortBy', updates.sortBy);
      else params.delete('sortBy');
    }
    if (updates.page !== undefined) {
      params.set('page', updates.page.toString());
    } else {
      params.delete('page');
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleMainSearchSubmit = useCallback(() => {
    updateMainFilters({ gallerySearch: gallerySearchInput, page: 1 });
  }, [gallerySearchInput, updateMainFilters]);

  const handleMainTypeFilter = useCallback((type: string) => {
    updateMainFilters({ type: type as 'all' | 'image' | 'video' | 'gif', page: 1 });
  }, [updateMainFilters]);

  const handleMainSortChange = useCallback((sortBy: string) => {
    updateMainFilters({ sortBy: sortBy as 'newest' | 'oldest' | 'name' | 'position', page: 1 });
  }, [updateMainFilters]);

  const handleMainPageChange = useCallback((page: number) => {
    updateMainFilters({ page });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [updateMainFilters]);

  const updateModalFilters = useCallback((updates: {
    search?: string;
    type?: 'all' | 'image' | 'video' | 'gif';
    sortBy?: 'newest' | 'oldest' | 'name';
    page?: number;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (updates.search !== undefined) {
      if (updates.search) params.set('search', updates.search);
      else params.delete('search');
    }
    if (updates.type !== undefined) {
      if (updates.type !== 'all') params.set('type', updates.type);
      else params.delete('type');
    }
    if (updates.sortBy !== undefined) {
      if (updates.sortBy !== 'newest') params.set('sortBy', updates.sortBy);
      else params.delete('sortBy');
    }
    if (updates.page !== undefined) {
      params.set('modalPage', updates.page.toString());
    } else {
      params.delete('modalPage');
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  const handleModalSearchSubmit = useCallback(() => {
    updateModalFilters({ search: modalSearchInput, page: 1 });
  }, [modalSearchInput, updateModalFilters]);

  const handleModalTypeFilter = useCallback((type: string) => {
    updateModalFilters({ type: type as 'all' | 'image' | 'video' | 'gif', page: 1 });
  }, [updateModalFilters]);

  const handleModalSortChange = useCallback((sortBy: string) => {
    updateModalFilters({ sortBy: sortBy as 'newest' | 'oldest' | 'name', page: 1 });
  }, [updateModalFilters]);

  const handleModalPageChange = useCallback((page: number) => {
    updateModalFilters({ page });
  }, [updateModalFilters]);

  const handleRemoveMedia = useCallback(async (mediaId: string) => {
    const result = await Swal.fire({
      title: 'Confirm Removal',
      text: "Remove this asset from the gallery? This does not delete the original file.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#94a3b8',
      confirmButtonText: 'Yes, remove it',
      customClass: {
        popup: 'rounded-2xl shadow-xl border border-zinc-100',
        confirmButton: 'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-red-700',
        cancelButton: 'px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100'
      }
    });

    if (!result.isConfirmed) return;

    try {
      const res = await fetch(`/api/gallery-media?galleryId=${gallery.id}&mediaId=${mediaId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to remove');
      router.refresh();
    } catch (error) {
      console.error('Failed to remove media', error);
      Swal.fire('Error', 'Failed to remove asset.', 'error');
    }
  }, [gallery.id, router]);

  const handleAddMediaToGallery = useCallback(async (mediaId: string) => {
    try {
      const res = await fetch('/api/gallery-media', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ galleryId: gallery.id, mediaId }),
      });
      if (!res.ok) throw new Error('Failed to add media');
      return true;
    } catch (error) {
      console.error('Failed to add media', error);
      return false;
    }
  }, [gallery.id]);

  const handleCloseModal = useCallback(() => {
    setIsAddModalOpen(false);
    router.refresh();
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50/50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans relative selection:bg-rose-500/30">
      <div className="relative z-10 flex flex-col min-h-screen">
        
        {/* Sticky Header */}
        <header className="sticky top-0 z-40 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl border-b border-zinc-200/60 dark:border-zinc-800/60 transition-colors duration-300">
          <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <MediaLibraryHeader
              searchValue={gallerySearchInput}
              onSearchChange={setGallerySearchInput}
              onSearchSubmit={handleMainSearchSubmit}
              activeFilter={initialFilters.type}
              onFilterChange={handleMainTypeFilter}
              filters={TYPE_FILTERS}
              activeSort={initialFilters.sortBy}
              onSortChange={handleMainSortChange}
              sorts={SORT_OPTIONS}
              totalItems={mainPagination.total}
              currentPage={mainPagination.currentPage}
              totalPages={mainPagination.totalPages}
            />
          </div>
        </header>

        <main className="flex-1 max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={localMediaItems.map((item) => item.id)}
              strategy={rectSortingStrategy}
            >
              <CardGrid<MediaItem>
                items={localMediaItems}
                renderItem={(item, index) => (
                  <SortableMediaCard 
                    item={item} 
                    index={index} 
                    onRemove={handleRemoveMedia} 
                    onManualOrder={handleManualOrder}
                  />
                )}
                getKey={(item: MediaItem) => item.id}
                emptyState={
                  <div className="flex flex-col items-center justify-center py-24 text-center bg-white dark:bg-zinc-900 rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 shadow-sm">
                    <div className="w-20 h-20 bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl flex items-center justify-center mb-6 border border-zinc-100 dark:border-zinc-800">
                      <FolderOpen className="w-8 h-8 text-zinc-400 dark:text-zinc-500" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                      {mainPagination.total === 0 ? 'Gallery is Empty' : 'No Matches Found'}
                    </h3>
                    <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2 max-w-xs font-medium">
                      {mainPagination.total === 0 ? 'Start curating by adding your first asset.' : 'Try adjusting your search parameters.'}
                    </p>
                    {mainPagination.total === 0 && (
                      <CustomButton 
                        variant="primary"
                        size="lg"
                        onClick={() => setIsAddModalOpen(true)}
                        className="mt-8"
                        leftIcon={<FolderOpen className="w-4 h-4" />}
                      >
                        Add Asset
                      </CustomButton>
                    )}
                  </div>
                }
                className="w-full min-h-100 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6"
                ariaLabel="Gallery media items"
              />
            </SortableContext>
          </DndContext>
          
          {mainPagination.totalPages > 1 && (
            <Pagination 
              currentPage={mainPagination.currentPage}
              totalPages={mainPagination.totalPages}
              hasNext={mainPagination.hasNext}
              hasPrevious={mainPagination.hasPrevious}
              onPageChange={handleMainPageChange}
              className="mt-12"
            />
          )}
        </main>

        <FloatingActionButton onClick={() => setIsAddModalOpen(true)} label="Add Asset" />

        <AddMediaModal 
          isOpen={isAddModalOpen}
          onClose={handleCloseModal}
          galleryId={gallery.id}
          availableMedia={availableMedia}
          modalPagination={modalPagination}
          initialFilters={{
            search: initialFilters.search,
            type: initialFilters.type,
            sortBy: initialFilters.sortBy === 'position' ? 'newest' : initialFilters.sortBy
          }}
          onSearchChange={setModalSearchInput}
          onSearchSubmit={handleModalSearchSubmit}
          onFilterChange={handleModalTypeFilter}
          onSortChange={handleModalSortChange}
          onPageChange={handleModalPageChange}
          onAddMedia={handleAddMediaToGallery}
        />
      </div>
    </div>
  );
}