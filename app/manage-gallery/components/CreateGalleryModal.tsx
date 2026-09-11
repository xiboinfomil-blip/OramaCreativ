'use client';

import { useState, useId, useCallback, useEffect } from 'react';
import { VISIBILITY_STATUSES, MEDIA_TYPES, type LayoutStyle } from '@/db/schema';
import BaseModal from '@/components/BaseModal';
import MediaLibraryHeader, { FilterOption, SortOption } from '@/components/SearchSortFilter';
import Pagination from '@/components/Pagination';
import MediaViewport from '@/components/media-viewport';
import { CustomTextfield } from '@/components/ui/CustomTextfield';
import { CustomButton } from '@/components/ui/CustomButton';
import { 
  HiChevronDown, 
  HiExclamationCircle, 
  HiPhoto, 
  HiCheck, 
  HiInformationCircle,
  HiArrowPath,
  HiOutlineViewColumns,
  HiOutlineListBullet,
  HiSquaresPlus
} from 'react-icons/hi2';

interface GalleryData {
  id?: string;
  title: string;
  description?: string | null;
  visibility: typeof VISIBILITY_STATUSES[number];
  password?: string;
  coverMediaId?: string | null;
  layoutStyle?: LayoutStyle;
  coverMedia?: MediaOption | null;
}

interface MediaOption {
  id: string;
  thumbnailUrl: string;
  fullResUrl?: string; 
  title?: string | null;
  type: typeof MEDIA_TYPES[number];
  originalFilename?: string | null;
  caption?: string | null;
}

interface PaginationData {
  total: number;
  currentPage: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
}

interface CreateGalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: GalleryData | null;
}

const TYPE_FILTERS: FilterOption[] = [
  { value: 'all', label: 'All Assets' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'gif', label: 'GIFs' },
];

const SORT_OPTIONS: SortOption[] = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name', label: 'Name A-Z' },
];

const DEFAULT_FORM_DATA: GalleryData = {
  title: '',
  description: '',
  visibility: 'public',
  password: '',
  coverMediaId: '',
  layoutStyle: 'masonry',
  coverMedia: null,
};

export default function CreateGalleryModal({
  isOpen,
  onClose,
  initialData = null,
}: CreateGalleryModalProps) {
  const isEditMode = !!initialData;
  
  const titleId = useId();
  const descId = useId();
  const visibilityId = useId();
  const passwordId = useId();

  const [formData, setFormData] = useState<GalleryData>(DEFAULT_FORM_DATA);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isMediaPickerOpen, setIsMediaPickerOpen] = useState(false);
  const [availableMedia, setAvailableMedia] = useState<MediaOption[]>([]);
  const [pagination, setPagination] = useState<PaginationData>({
    total: 0, currentPage: 1, totalPages: 1, hasNext: false, hasPrevious: false,
  });
  const [isFetchingMedia, setIsFetchingMedia] = useState(false);

  const [mediaFilters, setMediaFilters] = useState({
    search: '',
    type: 'all' as 'all' | 'image' | 'video' | 'gif',
    sortBy: 'newest' as 'newest' | 'oldest' | 'name',
    page: 1,
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setFormData({
          id: initialData.id,
          title: initialData.title || '',
          description: initialData.description ?? '',
          visibility: initialData.visibility || 'public',
          password: '',
          coverMediaId: initialData.coverMediaId || '',
          layoutStyle: initialData.layoutStyle || 'masonry',
          coverMedia: initialData.coverMedia || null,
        });
      } else {
         
        setFormData(DEFAULT_FORM_DATA);
      }
    }
  }, [isOpen, initialData]);

  const executeFetch = useCallback(async (filters: typeof mediaFilters) => {
     if (!initialData?.id) return;
     setIsFetchingMedia(true);
     try {
       const params = new URLSearchParams({
         galleryId: initialData.id,
         search: filters.search,
         type: filters.type,
         sortBy: filters.sortBy,
         page: filters.page.toString(),
       });
       const res = await fetch(`/api/gallery-media/available?${params}`);
       if (res.ok) {
         const data = await res.json();
         setAvailableMedia(data.items || []);
         setPagination(data.pagination);
       }
     } catch (err) {
       console.error('Failed to fetch gallery media', err);
     } finally {
       setIsFetchingMedia(false);
     }
  }, [initialData]);

  const openMediaPicker = useCallback(() => {
    setIsMediaPickerOpen(true);
    if (isEditMode && initialData?.id) {
      executeFetch(mediaFilters);
    }
  }, [isEditMode, initialData, mediaFilters, executeFetch]);

  const closeMediaPicker = useCallback(() => setIsMediaPickerOpen(false), []);

  const handleFilterChangeSafe = useCallback((type: string) => {
    const newFilters = { ...mediaFilters, type: type as 'all' | 'image' | 'video' | 'gif', page: 1 };
    setMediaFilters(newFilters);
    if (isMediaPickerOpen && isEditMode) executeFetch(newFilters);
  }, [mediaFilters, isMediaPickerOpen, isEditMode, executeFetch]);

  const handleSortChangeSafe = useCallback((sortBy: string) => {
    const newFilters = { ...mediaFilters, sortBy: sortBy as 'newest' | 'oldest' | 'name', page: 1 };
    setMediaFilters(newFilters);
    if (isMediaPickerOpen && isEditMode) executeFetch(newFilters);
  }, [mediaFilters, isMediaPickerOpen, isEditMode, executeFetch]);

  const handleSearchSubmitSafe = useCallback(() => {
    const newFilters = { ...mediaFilters, page: 1 };
    setMediaFilters(newFilters);
    if (isMediaPickerOpen && isEditMode) executeFetch(newFilters);
  }, [mediaFilters, isMediaPickerOpen, isEditMode, executeFetch]);

  const handlePageChangeSafe = useCallback((page: number) => {
    const newFilters = { ...mediaFilters, page };
    setMediaFilters(newFilters);
    if (isMediaPickerOpen && isEditMode) executeFetch(newFilters);
  }, [mediaFilters, isMediaPickerOpen, isEditMode, executeFetch]);

  const handleSelectCover = useCallback((mediaId: string) => {
    const selectedMedia = availableMedia.find((m) => m.id === mediaId);
    setFormData((prev) => ({ ...prev, coverMediaId: mediaId, coverMedia: selectedMedia || null }));
    closeMediaPicker();
  }, [availableMedia, closeMediaPicker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const url = isEditMode ? `/api/galleries/${initialData?.id}` : '/api/galleries';
      const method = isEditMode ? 'PUT' : 'POST';

      const passwordToSend = formData.visibility === 'password_protected'
        ? formData.password?.trim() === '' ? null : formData.password
        : null;

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.title,
          description: formData.description || null,
          visibility: formData.visibility,
          password: passwordToSend,
          coverMediaId: formData.coverMediaId || null,
          layoutStyle: formData.layoutStyle || 'masonry',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to save gallery');
      }

      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const footerActions = (
    <div className="flex gap-3 w-full sm:w-auto justify-end">
      <CustomButton variant="ghost" size="lg" onClick={onClose} disabled={isLoading}>
        Cancel
      </CustomButton>
      <CustomButton
        type="submit"
        form="gallery-form-id"
        variant="primary"
        size="lg"
        isLoading={isLoading}
        disabled={isLoading || !formData.title.trim()}
      >
        {isEditMode ? 'Save Changes' : 'Create Gallery'}
      </CustomButton>
    </div>
  );

  const currentCoverObj = initialData?.coverMedia || availableMedia.find((m) => m.id === formData.coverMediaId);
  const modalTitle = isEditMode ? 'Edit Gallery' : 'New Gallery';

  return (
    <>
      <BaseModal
        isOpen={isOpen}
        onClose={onClose}
        title={modalTitle}
        subtitle={isEditMode ? 'Update gallery details' : 'Create a new collection'}
        maxWidth="2xl"
        isLoading={isLoading}
        footer={footerActions}
      >
        <form id="gallery-form-id" onSubmit={handleSubmit} className="space-y-8 relative z-10">
          {error && (
            <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-900/50 text-rose-600 dark:text-rose-400 text-sm flex items-start gap-3 animate-in fade-in slide-in-from-top-2" role="alert">
              <HiExclamationCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="font-medium">{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <CustomTextfield
              id={titleId}
              name="title"
              type="text"
              label="Gallery Title"
              value={formData.title}
              onChange={handleChange}
              required
              maxLength={255}
              placeholder="e.g., Summer Track Day 2024"
            />

            <div className="space-y-1.5">
              <label htmlFor={descId} className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400 pl-1">Description</label>
              <textarea
                id={descId}
                name="description"
                value={formData.description || ''}
                onChange={handleChange}
                rows={3}
                placeholder="Add context about this collection..."
                className="w-full px-4 py-3.5 rounded-2xl text-sm bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 border border-zinc-200/60 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-100/50 dark:focus-visible:ring-zinc-800/50 focus:border-zinc-400 dark:focus:border-zinc-600 transition-all duration-300 resize-none shadow-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-1.5">
                <label htmlFor={visibilityId} className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400 pl-1">Visibility</label>
                <div className="relative group">
                  <select
                    id={visibilityId}
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleChange}
                    className="w-full px-4 py-3.5 rounded-2xl text-sm bg-zinc-50/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-100 border border-zinc-200/60 dark:border-zinc-800/60 hover:border-zinc-300 dark:hover:border-zinc-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-zinc-100/50 dark:focus-visible:ring-zinc-800/50 focus:border-zinc-400 dark:focus:border-zinc-600 appearance-none cursor-pointer transition-all duration-300 shadow-sm"
                  >
                    {VISIBILITY_STATUSES.map((status) => (
                      <option key={status} value={status}>
                        {status === 'public' ? 'Public' : status === 'private' ? 'Private' : status === 'password_protected' ? 'Password Protected' : status === 'unlisted' ? 'Unlisted' : status}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <HiChevronDown className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div className={`space-y-1.5 transition-all duration-300 ${formData.visibility === 'password_protected' ? 'opacity-100 translate-y-0 relative' : 'opacity-0 translate-y-2 pointer-events-none absolute'}`}>
                {formData.visibility === 'password_protected' && (
                  <>
                    <CustomTextfield
                      id={passwordId}
                      name="password"
                      type="password"
                      label="Access Password"
                      value={formData.password || ''}
                      onChange={handleChange}
                      required={!isEditMode}
                      placeholder="••••••••"
                    />
                    {isEditMode && <p className="text-xs text-zinc-500 mt-1 pl-1">Leave empty to retain current password</p>}
                  </>
                )}
              </div>
            </div>

            {/* Visual Layout Selector */}
            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400 pl-1">Layout Style</label>
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'column', label: 'Column', icon: <HiOutlineViewColumns className="w-6 h-6" /> },
                  { value: 'row', label: 'Row', icon: <HiOutlineListBullet className="w-6 h-6" /> },
                  { value: 'masonry', label: 'Masonry', icon: <HiSquaresPlus className="w-6 h-6" /> },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData((prev) => ({ ...prev, layoutStyle: option.value as LayoutStyle }))}
                    className={`group relative flex flex-col items-center justify-center p-4 rounded-2xl border transition-all duration-300 gap-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 ${
                      formData.layoutStyle === option.value
                        ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-md scale-[1.02]'
                        : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span className="transition-transform duration-300 group-hover:scale-110 text-zinc-500 dark:text-zinc-400 group-hover:text-zinc-900 dark:group-hover:text-zinc-100">
                      {option.icon}
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Cover Image Selector */}
            <div className="space-y-3">
              <label className="text-[11px] font-bold uppercase tracking-[0.15em] text-zinc-500 dark:text-zinc-400 pl-1">Cover Image</label>
              <div
                onClick={() => isEditMode && openMediaPicker()}
                className={`group relative w-full h-48 rounded-2xl border-2 flex items-center justify-center transition-all duration-300 overflow-hidden ${
                  isEditMode
                    ? 'border-dashed border-zinc-300 dark:border-zinc-700 cursor-pointer hover:border-zinc-900 dark:hover:border-white hover:bg-zinc-50 dark:hover:bg-zinc-900/50'
                    : 'border-solid border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/30 cursor-not-allowed opacity-60'
                }`}
              >
                {formData.coverMediaId && currentCoverObj ? (
                  <div className="relative w-full h-full">
                    <MediaViewport
                      mediaType={currentCoverObj.type}
                      fullResUrl={currentCoverObj.fullResUrl || currentCoverObj.thumbnailUrl}
                      thumbnailUrl={currentCoverObj.thumbnailUrl}
                      caption={currentCoverObj.caption}
                      originalFilename={currentCoverObj.originalFilename}
                      className="rounded-none ring-0 shadow-none h-full object-cover"
                      priority={false}
                    />
                    {isEditMode && (
                      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center z-30">
                        <span className="text-white text-xs font-bold uppercase tracking-widest flex items-center gap-2 bg-black/50 px-4 py-2 rounded-full backdrop-blur-md">
                          <HiPhoto className="w-4 h-4" />
                          Change Cover
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-zinc-400 dark:text-zinc-500 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-colors duration-300">
                    <div className={`p-4 rounded-full bg-zinc-100 dark:bg-zinc-800 transition-all duration-300 ${isEditMode ? 'group-hover:scale-110 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700' : ''}`}>
                      <HiPhoto className="w-6 h-6" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-widest">
                      {isEditMode ? 'Select from Gallery' : 'Add Media First'}
                    </span>
                  </div>
                )}
              </div>
              {!isEditMode && (
                <p className="text-xs text-zinc-500 text-right flex items-center justify-end gap-1.5">
                  <HiInformationCircle className="w-3.5 h-3.5" />
                  Create gallery and add media to set a cover
                </p>
              )}
            </div>
          </div>
        </form>
      </BaseModal>

      {/* --- Media Picker Sub-Modal --- */}
      <BaseModal
        isOpen={isMediaPickerOpen}
        onClose={closeMediaPicker}
        title="Select Cover"
        subtitle="Choose an image or video from this gallery"
        maxWidth="6xl"
        isLoading={isFetchingMedia}
        footer={
          <div className="flex justify-end w-full">
            <CustomButton variant="ghost" size="md" onClick={closeMediaPicker}>Cancel</CustomButton>
          </div>
        }
      >
        <div className="space-y-0 -mx-6">
          <div className="px-6 pt-2 pb-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 relative z-10">
            <MediaLibraryHeader
              searchValue={mediaFilters.search}
              onSearchChange={(val: string) => setMediaFilters((prev) => ({ ...prev, search: val }))}
              onSearchSubmit={handleSearchSubmitSafe}
              activeFilter={mediaFilters.type}
              onFilterChange={handleFilterChangeSafe}
              filters={TYPE_FILTERS}
              activeSort={mediaFilters.sortBy}
              onSortChange={handleSortChangeSafe}
              sorts={SORT_OPTIONS}
              totalItems={pagination.total}
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
            />
          </div>

          <div className="relative min-h-100 bg-zinc-50/50 dark:bg-zinc-900/20 p-6">
            {isFetchingMedia ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <HiArrowPath className="w-8 h-8 text-zinc-400 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest text-zinc-500">Loading media...</span>
              </div>
            ) : availableMedia.length === 0 ? (
              <div className="text-center py-20 text-zinc-500 dark:text-zinc-400">
                <p className="font-bold text-sm uppercase tracking-widest">No Media Found</p>
                <p className="text-xs mt-2 font-medium">Add media to this gallery first.</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {availableMedia.map((media) => {
                    const isSelected = formData.coverMediaId === media.id;
                    if (!media.thumbnailUrl) return null;

                    return (
                      <button
                        key={media.id}
                        onClick={() => handleSelectCover(media.id)}
                        className={`group relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 bg-white dark:bg-zinc-900 border ${
                          isSelected
                            ? 'ring-2 ring-zinc-900 dark:ring-white ring-offset-2 dark:ring-offset-zinc-950 shadow-lg scale-[1.02] z-10'
                            : 'border-zinc-200 dark:border-zinc-800 hover:shadow-md hover:-translate-y-1 hover:border-zinc-300 dark:hover:border-zinc-700'
                        }`}
                      >
                        <MediaViewport
                          mediaType={media.type}
                          fullResUrl={media.fullResUrl || media.thumbnailUrl}
                          thumbnailUrl={media.thumbnailUrl}
                          caption={media.caption}
                          originalFilename={media.originalFilename}
                          className="aspect-square rounded-none ring-0 shadow-none object-cover"
                          priority={false}
                        />
                        <div className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center shadow-sm border transition-all duration-300 z-20 ${
                          isSelected
                            ? 'bg-zinc-900 dark:bg-white border-zinc-900 dark:border-white scale-100'
                            : 'bg-white/90 dark:bg-zinc-800/90 border-zinc-200 dark:border-zinc-700 scale-0 group-hover:scale-100'
                        }`}>
                          {isSelected ? (
                            <HiCheck className="w-3.5 h-3.5 text-white dark:text-zinc-900" />
                          ) : (
                            <div className="w-2 h-2 bg-zinc-400 dark:bg-zinc-500 rounded-full" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <Pagination
                  currentPage={pagination.currentPage}
                  totalPages={pagination.totalPages}
                  hasNext={pagination.hasNext}
                  hasPrevious={pagination.hasPrevious}
                  onPageChange={handlePageChangeSafe}
                  className="mt-8"
                />
              </>
            )}
          </div>
        </div>
      </BaseModal>
    </>
  );
}