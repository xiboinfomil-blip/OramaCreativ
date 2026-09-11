import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { galleryHelpers, mediaHelpers, galleryMediaHelpers } from '@/lib/db-helpers';
import ManageGalleryClient from './ManageGalleryClient';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';
import Skeleton from '@/components/Skeleton'; // Adjust path if your Skeleton component is located elsewhere

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ 
    page?: string;          // Main gallery list page
    modalPage?: string;     // Available media modal page
    search?: string;        // Available media search
    gallerySearch?: string; // Main gallery list search
    sortBy?: 'newest' | 'oldest' | 'name' | 'position'; 
    type?: 'all' | 'image' | 'video' | 'gif';
  }>;
}

function ManageGalleryLoading() {
  return (
    <div className="min-h-screen bg-white px-6 lg:px-12 py-12">
      {/* Header Skeleton */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
        <div className="h-10 w-64 rounded-lg bg-zinc-100 dark:bg-zinc-900 overflow-hidden relative">
           <div className="absolute inset-0 skeleton-shimmer" />
        </div>
        <div className="flex gap-2">
          <div className="h-10 w-32 rounded-lg bg-zinc-100 dark:bg-zinc-900 overflow-hidden relative">
             <div className="absolute inset-0 skeleton-shimmer" />
          </div>
          <div className="h-10 w-32 rounded-lg bg-zinc-100 dark:bg-zinc-900 overflow-hidden relative">
             <div className="absolute inset-0 skeleton-shimmer" />
          </div>
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 lg:gap-8">
        {[...Array(8)].map((_, i) => (
          <Skeleton key={i} variant="grid-card" />
        ))}
      </div>
    </div>
  );
}

async function ManageGalleryContent({ params, searchParams }: PageProps) {
  const { id } = await params;
  const filters = await searchParams;
  
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  // 1. Fetch Gallery Details
  const galleryResult = await galleryHelpers.findById(id);
  
  if (!galleryResult) {
    notFound();
  }

  // Security Check: Ensure the user owns this gallery
  // Cast to unknown first to satisfy TypeScript's strict overlap checks
  const galleryWithUser = galleryResult as unknown as { userId?: string };
  if (galleryWithUser.userId && galleryWithUser.userId !== session.user.id) {
    redirect('/manage-gallery');
  }

  // 2. Fetch Paginated/Filtered Gallery Media Items (Main List)
  const mainPage = Number(filters.page) || 1;
  const mainLimit = 12;
  const mainOffset = (mainPage - 1) * mainLimit;

  const { items: galleryMediaItemsRaw, total: totalGalleryMedia } = await galleryMediaHelpers.findByGalleryId(id, {
    limit: mainLimit,
    offset: mainOffset,
    search: filters.gallerySearch,
    sortBy: filters.sortBy || 'position'
  });

  // Transform raw DB results to the format expected by ManageGalleryClient
  const formattedGalleryMedia = galleryMediaItemsRaw.map(item => ({
    id: item.media.id,
    mediaId: item.media.id,
    position: item.position,
    media: {
      id: item.media.id,
      thumbnailUrl: item.media.thumbnailUrl,
      // Fix: Ensure fullResUrl is always a string, defaulting to empty if null/undefined
      fullResUrl: item.media.fullResUrl || '',
      title: item.media.originalFilename || item.media.caption || 'Untitled',
      type: item.media.type,
      width: item.media.width,
      height: item.media.height,
    }
  }));

  // 3. Fetch Available Media for the "Add" Modal
  // Lightweight fetch for all media IDs in this gallery to ensure accurate exclusion
  const allGalleryMediaIds = await galleryMediaHelpers.getGalleryMediaIds(id);
  const existingMediaIds = allGalleryMediaIds.map(gm => gm.mediaId);

  const modalPage = Number(filters.modalPage) || 1;
  const modalLimit = 12;
  const modalOffset = (modalPage - 1) * modalLimit;

  const { items: allUserMedia, total: totalAvailableMedia } = await mediaHelpers.findAll({
    search: filters.search,
    filter: filters.type || 'all', // ✅ Changed 'type' to 'filter' to match mediaHelpers.findAll signature
    sortBy: (filters.sortBy === 'position' ? 'newest' : filters.sortBy) || 'newest',
    limit: modalLimit,
    offset: modalOffset,
    excludeIds: existingMediaIds.length > 0 ? existingMediaIds : undefined
  });

  // Transform available media
  const availableMedia = allUserMedia.map(m => ({
    id: m.id,
    thumbnailUrl: m.thumbnailUrl,
    // Fix: Ensure fullResUrl is always a string
    fullResUrl: m.fullResUrl || '',
    title: m.originalFilename || m.caption || 'Untitled',
    type: m.type,
    uploadedAt: m.uploadedAt
  }));

  // Calculate pagination stats for the modal
  const totalModalPages = Math.ceil(totalAvailableMedia / modalLimit);
  const modalHasNext = modalPage < totalModalPages;
  const modalHasPrevious = modalPage > 1;

  // Calculate pagination stats for the main list
  const totalMainPages = Math.ceil(totalGalleryMedia / mainLimit);
  const mainHasNext = mainPage < totalMainPages;
  const mainHasPrevious = mainPage > 1;

  return (
    <ManageGalleryClient 
      gallery={galleryResult}
      galleryMediaItems={formattedGalleryMedia}
      availableMedia={availableMedia}
      mainPagination={{
        total: totalGalleryMedia,
        currentPage: mainPage,
        totalPages: totalMainPages,
        hasNext: mainHasNext,
        hasPrevious: mainHasPrevious
      }}
      modalPagination={{
        total: totalAvailableMedia,
        currentPage: modalPage,
        totalPages: totalModalPages,
        hasNext: modalHasNext,
        hasPrevious: modalHasPrevious
      }}
      initialFilters={{
        search: filters.search || '',
        gallerySearch: filters.gallerySearch || '',
        type: filters.type || 'all',
        sortBy: filters.sortBy || 'position'
      }}
    />
  );
}

export default async function ManageGalleryPage(props: PageProps) {
  return (
    <Suspense fallback={<ManageGalleryLoading />}>
      <ManageGalleryContent {...props} />
    </Suspense>
  );
}