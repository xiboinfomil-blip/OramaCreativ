import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { mediaHelpers } from '@/lib/db-helpers';
import MediaLibraryClient from './MediaLibraryClient';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import type { MediaSchema } from '@/app/media-library/components/MediaCard';
import { MEDIA_TYPES } from '@/db/schema';
import Skeleton from '@/components/Skeleton'; // Adjust path if your Skeleton component is located elsewhere

export const metadata = {
  title: 'Media Library | Racecar Portfolio',
  description: 'Manage your uploaded photos and videos',
};

interface MediaLibraryPageProps {
  searchParams: Promise<{
    page?: string;
    limit?: string;
    search?: string;
    type?: typeof MEDIA_TYPES[number];
    sortBy?: 'newest' | 'oldest' | 'name';
  }>;
}

export default async function MediaLibraryPage({ searchParams }: MediaLibraryPageProps) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user?.id) {
    redirect('/login');
  }

  const params = await searchParams;

  const page = Math.max(1, parseInt(params.page || '1', 10));
  const limit = Math.min(100, Math.max(10, parseInt(params.limit || '20', 10)));
  const offset = (page - 1) * limit;
  const search = params.search || '';
  const type = params.type;
  const sortBy = params.sortBy || 'newest';

  const result = await mediaHelpers.findAll({ 
    limit, 
    offset,
    search: search || undefined,
    filter: type || undefined,
    sortBy: sortBy as 'newest' | 'oldest' | 'name'
  });

  const safeMedia: MediaSchema[] = result.items.map((m) => ({
    id: m.id,
    type: m.type as typeof MEDIA_TYPES[number],
    thumbnailUrl: m.thumbnailUrl,
    fullResUrl: m.fullResUrl,
    originalFilename: m.originalFilename,
    mimeType: m.mimeType,
    width: m.width,
    height: m.height,
    durationSeconds: m.durationSeconds,
    exifData: m.exifData as Record<string, unknown> | null,
    caption: m.caption,
    locationName: m.locationName,
    coordinates: m.coordinates 
      ? [Number(m.coordinates[0]), Number(m.coordinates[1])] as [number, number] 
      : null,
    uploadedAt: m.uploadedAt,
    galleryCount: m.galleryCount,
  }));

  const totalPages = Math.ceil(result.total / limit);

  return (
    <Suspense fallback={<MediaLibrarySkeleton />}>
      <MediaLibraryClient 
        initialMedia={safeMedia}
        pagination={{
          currentPage: page,
          totalPages,
          totalItems: result.total,
          limit,
          hasNext: result.hasMore,
          hasPrevious: page > 1
        }}
        filters={{
          search,
          type,
          sortBy
        }}
      />
    </Suspense>
  );
}

function MediaLibrarySkeleton() {
  return (
    <div className="w-full px-6 lg:px-12 py-12">
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