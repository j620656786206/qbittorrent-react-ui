import React from 'react'
import { useMediaQuery } from '@/lib/hooks'
import { TorrentTableSkeleton } from '@/components/torrent-table-skeleton'
import { TorrentCardSkeleton } from '@/components/torrent-card-skeleton'

interface LoadingSkeletonProps {
  /**
   * Number of skeleton rows/cards to display.
   * @default 8
   */
  count?: number
}

/**
 * Responsive loading skeleton component that automatically shows:
 * - TorrentTableSkeleton on desktop (≥768px)
 * - TorrentCardSkeleton on mobile (<768px)
 *
 * This provides visual feedback about the interface being loaded,
 * reduces perceived loading time, and prevents layout shift.
 */
export function LoadingSkeleton({ count = 8 }: LoadingSkeletonProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

  if (isDesktop) {
    return <TorrentTableSkeleton rowCount={count} />
  }

  return <TorrentCardSkeleton cardCount={count} />
}
