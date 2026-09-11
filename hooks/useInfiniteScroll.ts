'use client';

import { useEffect, useRef, useState } from 'react';

interface UseInfiniteScrollOptions {
  hasMore: boolean;
  onLoadMore: () => Promise<void>;
  rootMargin?: string;
}

export function useInfiniteScroll({
  hasMore,
  onLoadMore,
  rootMargin = '600px',
}: UseInfiniteScrollOptions) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const loadingRef = useRef(false);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || loadingRef.current) return;

        loadingRef.current = true;
        setIsLoading(true);
        setError(null);
        onLoadMoreRef.current()
          .catch((loadError: unknown) => {
            setError(loadError instanceof Error ? loadError.message : 'Failed to load more items.');
          })
          .finally(() => {
            loadingRef.current = false;
            setIsLoading(false);
          });
      },
      { rootMargin, threshold: 0 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, rootMargin]);

  return { sentinelRef, isLoading, error };
}
