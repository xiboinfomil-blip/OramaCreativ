'use client';

import { useState, useRef, useEffect, useCallback, memo, useId } from 'react';
import Image from 'next/image';
import exifr from 'exifr';
import Swal from 'sweetalert2';
import { MEDIA_TYPES } from '@/db/schema';
import BaseModal from '@/components/BaseModal'; 
import { CustomTextfield } from '@/components/ui/CustomTextfield';
import { CustomButton } from '@/components/ui/CustomButton';
import StorageIndicator from './StorageIndicator';
import { 
  HiPlay, 
  HiArrowUpTray, 
  HiExclamationTriangle, 
  HiXMark, 
  HiExclamationCircle, 
  HiMapPin, 
  HiArrowPath,
  HiChevronLeft,
  HiChevronRight
} from 'react-icons/hi2';

interface ExifData {
  make: string | null;
  model: string | null;
  lensModel: string | null;
  dateTime: string | Date | null;
  exposureTime: number | null;
  fNumber: number | null;
  iso: number | null;
  focalLength: number | null;
  software: string | null;
}

interface MediaItem {
  file: File;
  caption: string;
  locationName: string;
  coordinates: { lat: string; lng: string };
  gpsDetected: boolean;
  previewUrl?: string;
  exifData?: ExifData | null; // ✅ Replaced 'any' with specific ExifData interface
}

interface StorageUsage {
  plan: string;
  lastUpdated: string;
  storage: {
    used: string;
    rawUsed: number;
    limit: string;
    rawLimit: number;
    percentageUsed: string;
  };
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface CloudinaryUploadResponse {
  public_id: string;
  secure_url: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

const getValidMimeTypes = () => {
  const mimeMap: Record<typeof MEDIA_TYPES[number], string[]> = {
    image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
    video: ['video/mp4', 'video/webm', 'video/quicktime'],
    gif: ['image/gif']
  };
  return MEDIA_TYPES.flatMap(type => mimeMap[type]);
};

const VALID_TYPES = getValidMimeTypes();
const MAX_SIZE = 50 * 1024 * 1024; // 50MB

// --- Sub-Components ---
const ThumbnailItem = memo(({ 
  item, 
  idx, 
  currentIndex, 
  onClick, 
  isLoading 
}: { 
  item: MediaItem; 
  idx: number; 
  currentIndex: number; 
  onClick: () => void;
  isLoading: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={isLoading}
    className={`group relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 ${
      idx === currentIndex 
        ? 'border-zinc-900 dark:border-white ring-2 ring-zinc-900/10 dark:ring-white/10 scale-105 z-10' 
        : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 opacity-60 hover:opacity-100'
    }`}
    aria-label={`Select media ${idx + 1}`}
    aria-pressed={idx === currentIndex}
  >
    {item.file.type.startsWith('image/') ? (
      <Image 
        src={item.previewUrl!} 
        alt={`Thumbnail ${idx + 1}`} 
        width={64} 
        height={64} 
        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
        unoptimized
      />
    ) : (
      <div className="w-full h-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
        <HiPlay className="w-6 h-6 text-zinc-400" />
      </div>
    )}
    <div className="absolute top-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-md">
      {idx + 1}
    </div>
  </button>
));
ThumbnailItem.displayName = 'ThumbnailItem';

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const captionId = useId();
  const locationId = useId();
  const latId = useId();
  const lngId = useId();
  
  const [isDragging, setIsDragging] = useState(false);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingStorage, setIsCheckingStorage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [currentUploadIndex, setCurrentUploadIndex] = useState(0);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);
  const mediaItemsRef = useRef(mediaItems);

  const resetModalState = useCallback(() => {
    setMediaItems(prev => {
      prev.forEach(item => {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      });
      return [];
    });
    setCurrentIndex(0);
    setError(null);
    setUploadProgress(0);
    setCurrentUploadIndex(0);
    setRejectedFiles([]);
    setIsDragging(false);
  }, []);

  useEffect(() => {
    mediaItemsRef.current = mediaItems;
  }, [mediaItems]);

  useEffect(() => () => {
    mediaItemsRef.current.forEach(item => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
  }, []);

  const fetchStorageUsage = useCallback(async () => {
    setIsCheckingStorage(true);
    try {
      const res = await fetch('/api/storage');
      if (res.ok) {
        const data = await res.json();
        setStorageUsage(data.usage);
      }
    } catch (err) {
      console.error('Failed to fetch storage usage:', err);
    } finally {
      setIsCheckingStorage(false);
    }
  }, []);

  const hasFetchedRef = useRef(false);
  useEffect(() => {
    if (isOpen && !hasFetchedRef.current) {
      fetchStorageUsage();
      hasFetchedRef.current = true;
    } else if (!isOpen) {
      hasFetchedRef.current = false;
    }
  }, [isOpen, fetchStorageUsage]);

  const formatBytes = useCallback((bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }, []);

  const handleFileSelect = useCallback(async (files: FileList | File[]) => {
    setError(null);
    const newItems: MediaItem[] = [];
    const rejected: string[] = [];
    const fileArray = Array.isArray(files) ? files : Array.from(files);

    for (const file of fileArray) {
      if (!VALID_TYPES.includes(file.type)) {
        rejected.push(`${file.name} (Invalid type)`);
        continue;
      }
      if (file.size > MAX_SIZE) {
        rejected.push(`${file.name} (>50MB)`);
        continue;
      }

      const previewUrl = URL.createObjectURL(file);
      const newItem: MediaItem = {
        file,
        caption: file.name.split('.')[0],
        locationName: '',
        coordinates: { lat: '', lng: '' },
        gpsDetected: false,
        previewUrl,
        exifData: null,
      };

      if (file.type.startsWith('image/')) {
        try {
          const exif = await exifr.parse(file, { gps: true });
          
          if (exif) {
            if (exif.latitude && exif.longitude) {
              newItem.coordinates = {
                lat: exif.latitude.toFixed(6),
                lng: exif.longitude.toFixed(6)
              };
              newItem.gpsDetected = true;
            }

            // ✅ Type-safe EXIF extraction
            newItem.exifData = {
              make: exif.Make || null,
              model: exif.Model || null,
              lensModel: exif.LensModel || null,
              dateTime: exif.DateTimeOriginal || exif.DateTime || null,
              exposureTime: exif.ExposureTime || null,
              fNumber: exif.FNumber || null,
              iso: exif.ISO || null,
              focalLength: exif.FocalLength || null,
              software: exif.Software || null,
            };
          }
        } catch (err) {
          console.warn('EXIF parse failed:', err);
        }
      }
      newItems.push(newItem);
    }

    if (rejected.length > 0) {
      setRejectedFiles(rejected);
      setTimeout(() => setRejectedFiles([]), 6000);
    }

    if (newItems.length > 0) {
      setMediaItems(prev => {
        const updated = [...prev, ...newItems];
        if (prev.length === 0) setCurrentIndex(0);
        return updated;
      });
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const detectLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by this browser.');
      return;
    }
    setIsDetectingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setMediaItems(prev => prev.map((item, idx) => 
          idx === currentIndex 
            ? {
                ...item,
                coordinates: {
                  lat: position.coords.latitude.toFixed(6),
                  lng: position.coords.longitude.toFixed(6)
                },
                gpsDetected: false
              }
            : item
        ));
        setError(null);
        setIsDetectingLocation(false);
      },
      () => {
        setError('Location access denied. Please enable permissions or enter coordinates manually.');
        setIsDetectingLocation(false);
      }
    );
  }, [currentIndex]);

  const updateCurrentItem = useCallback((updates: Partial<MediaItem>) => {
    setMediaItems(prev => prev.map((item, idx) => 
      idx === currentIndex ? { ...item, ...updates } : item
    ));
  }, [currentIndex]);

  const removeItem = useCallback((index: number) => {
    setMediaItems(prev => {
      const item = prev[index];
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      const newItems = prev.filter((_, idx) => idx !== index);
      
      if (newItems.length === 0) setCurrentIndex(0);
      else if (currentIndex >= newItems.length) setCurrentIndex(newItems.length - 1);
      else if (currentIndex > index) setCurrentIndex(currentIndex - 1);
      
      return newItems;
    });
  }, [currentIndex]);

  const getCloudinarySignature = useCallback(async () => {
    const res = await fetch('/api/sign-upload', { method: 'POST' });
    if (!res.ok) throw new Error('Failed to prepare upload');
    return res.json();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (mediaItems.length === 0) return;

    if (storageUsage) {
      const totalNewSize = mediaItems.reduce((acc, item) => acc + item.file.size, 0);
      const limit = storageUsage.storage.rawLimit;
      const used = storageUsage.storage.rawUsed;

      if (limit > 0 && (used + totalNewSize) > limit) {
        const available = limit - used;
        setError(`Storage capacity exceeded. Required: ${formatBytes(totalNewSize)}, Available: ${formatBytes(available)}`);
        return;
      }
    }

    setIsLoading(true);
    setError(null);
    setUploadProgress(0);
    setCurrentUploadIndex(0);

    try {
      for (let i = 0; i < mediaItems.length; i++) {
        const item = mediaItems[i];
        setCurrentUploadIndex(i);
        
        const { signature, timestamp, apiKey, cloudName } = await getCloudinarySignature();

        const formData = new FormData();
        formData.append('file', item.file);
        formData.append('signature', signature);
        formData.append('timestamp', timestamp.toString());
        formData.append('api_key', apiKey);
        formData.append('folder', 'media-library');

        const xhr = new XMLHttpRequest();
        const uploadUrl = `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`;

        const cloudinaryPromise = new Promise<CloudinaryUploadResponse>((resolve, reject) => {
          xhr.open('POST', uploadUrl);
          
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const completedFilesProgress = (i / mediaItems.length) * 100;
              const currentFileProgress = (event.loaded / event.total) * (100 / mediaItems.length);
              setUploadProgress(completedFilesProgress + currentFileProgress);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try { resolve(JSON.parse(xhr.responseText)); } 
              catch { reject(new Error('Invalid JSON response')); }
            } else {
              let errorMsg = 'Upload failed';
              try {
                const errData = JSON.parse(xhr.responseText);
                errorMsg = errData.error?.message || errorMsg;
              } catch {
                // Ignore parsing error if we already have a generic message
              }
              reject(new Error(errorMsg));
            }
          };

          xhr.onerror = () => reject(new Error('Network error'));
          xhr.send(formData);
        });

        const cloudinaryResult = await cloudinaryPromise;

        const saveRes = await fetch('/api/media', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            cloudinaryPublicId: cloudinaryResult.public_id,
            url: cloudinaryResult.secure_url,
            thumbnailUrl: cloudinaryResult.secure_url.replace('/upload/', '/upload/w_400,q_auto/'),
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
            format: cloudinaryResult.format,
            fileSize: cloudinaryResult.bytes,
            title: item.caption,
            locationName: item.locationName.trim() || null,
            coordinates: (item.coordinates.lat && item.coordinates.lng) 
              ? `${item.coordinates.lng},${item.coordinates.lat}` 
              : null,
            originalFilename: item.file.name,
            mimeType: item.file.type,
            exifData: item.exifData || null, // ✅ Send extracted EXIF data to API
          }),
        });

        if (!saveRes.ok) {
          const errData = await saveRes.json();
          throw new Error(errData.error || 'Failed to save metadata');
        }
      }

      setUploadProgress(100);
      
      await Swal.fire({
        icon: 'success',
        title: 'Upload Complete',
        text: `${mediaItems.length} asset(s) successfully added.`,
        timer: 1500,
        showConfirmButton: false,
        background: '#ffffff',
        color: '#18181b'
      });

      onClose();

    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Upload failed';
      console.error('Upload Error:', err);
      setError(errorMessage);
      await Swal.fire({
        icon: 'error',
        title: 'Upload Failed',
        text: errorMessage,
        confirmButtonColor: '#dc2626',
        background: '#ffffff',
        color: '#18181b'
      });
    } finally {
      setIsLoading(false);
    }
  }, [mediaItems, storageUsage, getCloudinarySignature, onClose, formatBytes]);

  const currentItem = mediaItems[currentIndex];

  const handleClose = useCallback(() => {
    resetModalState();
    onClose();
  }, [resetModalState, onClose]);

  const footerActions = (
    <>
      <div className="flex-1 text-xs font-medium text-zinc-500 self-center hidden sm:block">
        {mediaItems.length > 0 ? `${mediaItems.length} item${mediaItems.length !== 1 ? 's' : ''} queued` : 'No assets selected'}
      </div>
      <div className="flex gap-3 w-full sm:w-auto">
        <CustomButton 
          variant="ghost"
          size="lg"
          onClick={handleClose}
          disabled={isLoading}
          className="flex-1 sm:flex-none"
        >
          Cancel
        </CustomButton>
        <CustomButton 
          variant="primary"
          size="lg"
          onClick={handleSubmit}
          disabled={mediaItems.length === 0 || isLoading || isCheckingStorage}
          isLoading={isLoading}
          leftIcon={!isCheckingStorage && !isLoading ? <HiArrowUpTray className="w-4 h-4" /> : undefined}
          className="flex-1 sm:flex-none"
        >
          {isCheckingStorage ? 'Checking...' : `Upload ${mediaItems.length > 1 ? `${mediaItems.length} Assets` : 'Asset'}`}
        </CustomButton>
      </div>
    </>
  );

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Ingest Media"
      subtitle="Add photos and videos to your library."
      maxWidth="5xl"
      isLoading={isLoading}
      footer={footerActions}
    >
      <div className="space-y-6">
        <StorageIndicator 
          storage={storageUsage?.storage || null} 
          isLoading={isCheckingStorage} 
        />

        {rejectedFiles.length > 0 && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 text-amber-900 dark:text-amber-200 rounded-xl text-sm font-medium flex items-start gap-3" role="alert" aria-live="polite">
            <HiExclamationTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
            <div className="flex-1">
              <p className="font-semibold text-amber-800 dark:text-amber-300 text-xs mb-1 uppercase tracking-wide">Files Excluded</p>
              <p className="text-amber-700/80 dark:text-amber-200/70 leading-relaxed">{rejectedFiles.join(', ')}</p>
            </div>
            <button 
              onClick={() => setRejectedFiles([])} 
              className="p-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
              aria-label="Dismiss exclusion notice"
            >
              <HiXMark className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-200 rounded-xl text-sm font-medium flex items-start gap-3" role="alert" aria-live="assertive">
            <HiExclamationCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {mediaItems.length === 0 ? (
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`group relative border-2 border-dashed rounded-2xl p-12 sm:p-16 text-center cursor-pointer transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white focus-visible:ring-offset-2 ${
              isDragging 
                ? 'border-zinc-900 dark:border-white bg-zinc-50 dark:bg-zinc-900/50' 
                : 'border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50/50 dark:hover:bg-zinc-900/30'
            }`}
            role="button"
            tabIndex={0}
            aria-label="Click or drag files to upload"
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept={MEDIA_TYPES.map(type => {
                if (type === 'image') return 'image/*';
                if (type === 'video') return 'video/*';
                return 'image/gif';
              }).join(',')}
              multiple
              onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
              aria-hidden="true"
            />
            
            <div className={`mx-auto w-16 h-16 mb-6 rounded-2xl flex items-center justify-center transition-all duration-300 ${
              isDragging 
                ? 'bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300' 
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 group-hover:bg-zinc-200 dark:group-hover:bg-zinc-700 group-hover:text-zinc-600 dark:group-hover:text-zinc-300'
            }`}>
              <HiArrowUpTray className="w-8 h-8" />
            </div>
            
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-300 transition-colors">
              {isDragging ? 'Drop files to ingest' : 'Click or drag files to ingest'}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 font-mono uppercase tracking-wide">
              JPG, PNG, GIF, MP4, WebM • Max 50MB
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-5 space-y-6">
              <div className="relative bg-zinc-100 dark:bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-inner aspect-square flex items-center justify-center group">
                 {currentItem.file.type.startsWith('image/') ? (
                    <Image 
                      src={currentItem.previewUrl!} 
                      alt="Preview"
                      width={500}
                      height={500}
                      className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <video 
                      src={currentItem.previewUrl}
                      className="max-w-full max-h-full object-contain"
                      controls
                      aria-label="Video preview"
                    />
                  )}
                  
                  {mediaItems.length > 1 && (
                    <>
                      <button
                        onClick={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
                        disabled={currentIndex === 0 || isLoading}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white"
                        aria-label="Previous media"
                      >
                        <HiChevronLeft className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                      </button>
                      <button
                        onClick={() => setCurrentIndex(prev => Math.min(mediaItems.length - 1, prev + 1))}
                        disabled={currentIndex === mediaItems.length - 1 || isLoading}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md rounded-full shadow-lg border border-zinc-200 dark:border-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:focus-visible:ring-white"
                        aria-label="Next media"
                      >
                        <HiChevronRight className="w-5 h-5 text-zinc-700 dark:text-zinc-300" />
                      </button>
                    </>
                  )}
              </div>

              {mediaItems.length > 1 && (
                <div className="bg-white dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                  <div className="flex items-center justify-between mb-2 px-1">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">Queue ({mediaItems.length})</span>
                     <button 
                        onClick={() => removeItem(currentIndex)}
                        disabled={isLoading}
                        className="text-[10px] font-bold uppercase tracking-widest text-rose-500 hover:text-rose-600 disabled:opacity-50 transition-colors"
                      >
                        Remove Current
                      </button>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide snap-x">
                    {mediaItems.map((item, idx) => (
                      <ThumbnailItem
                        key={idx}
                        item={item}
                        idx={idx}
                        currentIndex={currentIndex}
                        onClick={() => setCurrentIndex(idx)}
                        isLoading={isLoading}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-7 space-y-6">
              <div className="flex items-start justify-between gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 truncate" title={currentItem.file.name}>{currentItem.file.name}</p>
                    <div className="flex items-center gap-3 mt-2 font-mono text-[10px] text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{formatBytes(currentItem.file.size)}</span>
                      <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                      <span className="bg-zinc-100 dark:bg-zinc-800 px-2 py-1 rounded">{currentItem.file.type.split('/')[1].toUpperCase()}</span>
                      {currentItem.gpsDetected && (
                         <>
                          <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <HiMapPin className="w-3 h-3" />
                            GPS Detected
                          </span>
                         </>
                      )}
                    </div>
                  </div>
              </div>

              <div className="space-y-5">
                <CustomTextfield 
                  id={captionId}
                  type="text" 
                  value={currentItem.caption}
                  onChange={(e) => updateCurrentItem({ caption: e.target.value })}
                  disabled={isLoading}
                  placeholder="Describe this asset..."
                  label="Caption"
                />

                <CustomTextfield
                  id={locationId}
                  type="text" 
                  value={currentItem.locationName}
                  onChange={(e) => updateCurrentItem({ locationName: e.target.value })}
                  disabled={isLoading}
                  placeholder="e.g., Silverstone Circuit, UK"
                  label="Location Name"
                />

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                      GPS Coordinates
                    </span>
                    {!currentItem.gpsDetected && (
                      <CustomButton
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={detectLocation}
                        disabled={isLoading || isDetectingLocation}
                        className="text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 h-8 px-3 text-[10px] uppercase tracking-wider"
                      >
                        {isDetectingLocation ? (
                          <>
                            <HiArrowPath className="animate-spin h-3 w-3 mr-1.5" /> 
                            Detecting...
                          </>
                        ) : 'Auto-Detect'}
                      </CustomButton>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <CustomTextfield
                      id={latId}
                      type="number"
                      step="any"
                      value={currentItem.coordinates.lat}
                      onChange={(e) => updateCurrentItem({ coordinates: { ...currentItem.coordinates, lat: e.target.value } })}
                      disabled={isLoading || currentItem.gpsDetected}
                      placeholder="00.000000"
                      label="Latitude"
                    />
                    <CustomTextfield
                      id={lngId}
                      type="number"
                      step="any"
                      value={currentItem.coordinates.lng}
                      onChange={(e) => updateCurrentItem({ coordinates: { ...currentItem.coordinates, lng: e.target.value } })}
                      disabled={isLoading || currentItem.gpsDetected}
                      placeholder="00.000000"
                      label="Longitude"
                    />
                  </div>
                </div>
              </div>

              {isLoading && (
                <div className="space-y-3 pt-6 border-t border-zinc-100 dark:border-zinc-800" role="progressbar" aria-valuenow={Math.round(uploadProgress)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                  <div className="flex justify-between text-xs font-mono text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    <span>Uploading asset {currentUploadIndex + 1} of {mediaItems.length}</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-bold">{Math.round(uploadProgress)}%</span>
                  </div>
                  <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden transition-colors duration-300">
                    <div 
                      className="h-full bg-zinc-900 dark:bg-zinc-100 transition-all duration-200 ease-out rounded-full"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </BaseModal>
  );
}