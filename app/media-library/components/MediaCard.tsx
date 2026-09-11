'use client';

import { useCallback, memo } from 'react';
import { formatDistanceToNow } from 'date-fns';
import Swal from 'sweetalert2';
import { MEDIA_TYPES } from '@/db/schema';
import MediaViewport from '@/components/media-viewport';
import { 
  HiPlay, 
  HiMapPin, 
  HiTrash, 
  HiArrowPath,
  HiCamera 
} from 'react-icons/hi2';

export interface MediaSchema {
  id: string;
  type: typeof MEDIA_TYPES[number];
  thumbnailUrl: string;
  fullResUrl: string;
  originalFilename: string | null;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  exifData: Record<string, unknown> | null;
  caption: string | null;
  locationName: string | null;
  coordinates: [number, number] | null;
  uploadedAt: string | Date;
  galleryCount: number;
}

interface MediaCardProps {
  media: MediaSchema;
  onDelete: (id: string) => void;
  onOpenLightbox: () => void;
  isDeleting?: boolean;
  priority?: boolean;
  sizes?: string;
}

const formatDuration = (seconds: number | null): string | null => {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const getExifString = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return String(value);
};

const MediaCard = memo(function MediaCard({ 
  media, 
  onDelete, 
  onOpenLightbox, 
  isDeleting = false,
  priority = false,
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
}: MediaCardProps) {
  const exif = media.exifData || {};
  
  const isoStr = getExifString(exif.ISO ?? exif.iso);
  const apertureStr = getExifString(exif.FNumber ?? exif.fNumber);
  const shutterStr = getExifString(exif.ExposureTime ?? exif.exposureTime);
  const cameraModelStr = getExifString(exif.model);
  
  const hasTechnicalData = !!isoStr || !!apertureStr || !!shutterStr || !!cameraModelStr;
  const resolution = media.width && media.height ? `${media.width}×${media.height}` : null;

  const handleDeleteClick = useCallback(async (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (isDeleting) return;

    const result = await Swal.fire({
      title: 'Delete Asset?',
      html: `<span class="text-zinc-500">You are about to permanently remove <strong class="text-zinc-900">${media.originalFilename || 'this asset'}</strong>.</span>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#ef4444',
      cancelButtonColor: '#e4e4e7',
      confirmButtonText: 'Yes, delete it',
      cancelButtonText: 'Cancel',
      background: '#ffffff',
      customClass: {
        popup: 'rounded-2xl shadow-xl border border-zinc-100',
        title: 'font-semibold text-zinc-900 text-lg',
        htmlContainer: 'mt-2',
        confirmButton: 'px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:bg-red-600 hover:shadow-md',
        cancelButton: 'px-5 py-2.5 rounded-xl text-sm font-medium text-zinc-600 hover:bg-zinc-100'
      }
    });

    if (result.isConfirmed) {
      onDelete(media.id);
    }
  }, [isDeleting, onDelete, media.id, media.originalFilename]);

  return (
    <figure className="group relative flex flex-col w-full bg-white dark:bg-zinc-900 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-zinc-200/50 dark:hover:shadow-black/50 transition-all duration-500 ease-out h-full border border-zinc-100/60 dark:border-zinc-800/60">
      
      {/* --- Media Viewport Wrapper --- */}
      <div 
        className="relative aspect-4/3 bg-zinc-50 dark:bg-zinc-950 overflow-hidden cursor-zoom-in shrink-0"
        onClick={onOpenLightbox}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onOpenLightbox(); }}
        role="button"
        tabIndex={0}
        aria-label={`Open ${media.originalFilename || 'media asset'} in lightbox`}
      >
        <MediaViewport
          mediaType={media.type}
          fullResUrl={media.fullResUrl}
          thumbnailUrl={media.thumbnailUrl}
          caption={media.caption}
          originalFilename={media.originalFilename}
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105 will-change-transform"
          priority={priority}
          sizes={sizes}
        />

        {/* Gradient Overlay for better contrast on hover */}
        <div className="absolute inset-0 bg-linear-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

        {/* Top Badges (Glassmorphism) */}
        <div className="absolute top-3 left-3 z-10 flex gap-2 pointer-events-none">
          <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border border-white/20 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 shadow-sm">
            {media.type === 'video' && (
              <HiPlay className="w-3 h-3 text-rose-500" />
            )}
            {media.type === 'video' ? 'Video' : 'Photo'}
          </span>
          
          {media.locationName && (
            <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md border border-white/20 dark:border-zinc-800 text-[10px] font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 shadow-sm max-w-32 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
              <HiMapPin className="w-3 h-3 text-zinc-500 shrink-0" />
              <span className="truncate">{media.locationName}</span>
            </span>
          )}
        </div>

        {media.galleryCount === 0 && (
          <span className="absolute -left-10 bottom-5 z-20 w-32 -rotate-45 bg-amber-400 py-1 text-center text-[9px] font-black uppercase tracking-[0.16em] text-amber-950 shadow-md">
            Unused
          </span>
        )}

        {/* Delete Button - Appears on Hover */}
        <button 
          onClick={handleDeleteClick}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDeleteClick(e); }}
          disabled={isDeleting}
          className={`absolute top-3 right-3 z-20 p-2 rounded-full bg-white/90 dark:bg-zinc-950/90 backdrop-blur-md shadow-sm border border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2
            ${isDeleting 
              ? 'cursor-not-allowed opacity-60' 
              : 'text-zinc-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 hover:border-rose-200 dark:hover:border-rose-900/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100'
            }
          `}
          aria-label={`Delete ${media.originalFilename || 'media asset'}`}
        >
          {isDeleting ? (
            <HiArrowPath className="animate-spin h-4 w-4 text-rose-600" />
          ) : (
            <HiTrash className="w-4 h-4" />
          )}
        </button>

        {/* Duration Badge for Video */}
        {media.type === 'video' && media.durationSeconds && (
          <div className="absolute bottom-3 right-3 z-10 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur-md text-[10px] font-mono font-bold text-white shadow-sm pointer-events-none">
            {formatDuration(media.durationSeconds)}
          </div>
        )}
      </div>

      {/* --- Content Body --- */}
      <figcaption className="flex flex-col flex-1 p-5 bg-white dark:bg-zinc-900">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-snug truncate pr-2 transition-colors group-hover:text-zinc-700 dark:group-hover:text-zinc-300">
            {media.caption || media.originalFilename || 'Untitled'}
          </h3>
          <p className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 mt-1.5 uppercase tracking-widest">
            {formatDistanceToNow(new Date(media.uploadedAt), { addSuffix: true })}
          </p>
        </div>

        {hasTechnicalData ? (
          <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800">
            <div className="grid grid-cols-2 gap-y-2 gap-x-4">
              {cameraModelStr && (
                <div className="col-span-2 flex items-center justify-between text-[10px] pb-2 border-b border-zinc-50 dark:border-zinc-800 mb-1">
                  <span className="font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <HiCamera className="w-3 h-3" />
                    Camera
                  </span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">{cameraModelStr}</span>
                </div>
              )}
              {isoStr && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">ISO</span>
                  <span className="text-[10px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">{isoStr}</span>
                </div>
              )}
              {apertureStr && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Aperture</span>
                  <span className="text-[10px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">f/{apertureStr}</span>
                </div>
              )}
              {shutterStr && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Shutter</span>
                  <span className="text-[10px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">{shutterStr}s</span>
                </div>
              )}
              {resolution && (
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Res</span>
                  <span className="text-[10px] font-mono font-semibold text-zinc-700 dark:text-zinc-300">{resolution}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-auto pt-4 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[10px]">
             <span className="font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">No additional metadata</span>
             {resolution && <span className="font-mono font-semibold text-zinc-500 dark:text-zinc-400">{resolution}</span>}
          </div>
        )}
      </figcaption>
    </figure>
  );
});

export default MediaCard;