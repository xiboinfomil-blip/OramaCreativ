'use client';

import { forwardRef, useCallback, useState } from 'react';

interface CustomVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  poster?: string; // This is your thumbnail MP4 URL
  hoverPlay?: boolean;
}

const CustomVideo = forwardRef<HTMLVideoElement, CustomVideoProps>(
  ({ 
    poster, 
    hoverPlay = true, 
    className = '', 
    onLoadedData,
    onError,
    ...props 
  }, ref) => {
    const [isLoaded, setIsLoaded] = useState(Boolean(poster));


    const handleReady = useCallback((e: React.SyntheticEvent<HTMLVideoElement>) => {
      setIsLoaded(true);
      onLoadedData?.(e);
    }, [onLoadedData]);

    const handleMouseEnter = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
      if (!hoverPlay) return;
      // Force mute right before playing to guarantee browser autoplay policies allow it
      e.currentTarget.muted = true;
      e.currentTarget.play().catch(() => {
        // Ignore autoplay prevention errors silently
      });
    }, [hoverPlay]);

    const handleMouseLeave = useCallback((e: React.MouseEvent<HTMLVideoElement>) => {
      if (!hoverPlay) return;
      e.currentTarget.pause();
      e.currentTarget.currentTime = 0; // Reset to show first frame again
    }, [hoverPlay]);

    const handleError = useCallback((e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
      console.error('Video failed to load:', props.src);
      setIsLoaded(true); // Prevent getting stuck at opacity-0 if video fails
      onError?.(e);
    }, [onError, props.src]);

    return (
      <div className="relative h-full w-full overflow-hidden bg-zinc-100">
        <video
          ref={ref}
          poster={poster}
          {...props} 
          loop
          playsInline
          preload="none"
          disablePictureInPicture 
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onLoadedMetadata={handleReady}
          onLoadedData={handleReady}
          onError={handleError}
          // CRITICAL: Placed AFTER {...props} to strictly enforce "no sound, no controls"
          muted
          controls={false}
          className={`absolute inset-0 h-full w-full object-cover transition-all duration-700 ease-[cubic-bezier(0.25,0.46,0.45,0.94)] group-hover:scale-[1.03] will-change-transform ${
            isLoaded ? 'opacity-100' : 'opacity-0'
          } ${className}`}
        />
      </div>
    );
  }
);

CustomVideo.displayName = 'CustomVideo';
export default CustomVideo;