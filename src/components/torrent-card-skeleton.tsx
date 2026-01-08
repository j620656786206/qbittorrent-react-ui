import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'

interface TorrentCardSkeletonProps {
  cardCount?: number
}

export function TorrentCardSkeleton({
  cardCount = 8,
}: TorrentCardSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: cardCount }).map((_, index) => (
        <div
          key={index}
          className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50"
        >
          {/* Header: Checkbox, Name, and Actions */}
          <div className="flex items-start gap-3 mb-3">
            {/* Checkbox */}
            <div className="flex-shrink-0 pt-0.5">
              <Skeleton className="h-4 w-4 rounded-sm" />
            </div>
            {/* Name - two lines for line-clamp-2 effect */}
            <div className="flex-1 min-w-0 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
            {/* Actions */}
            <div className="flex-shrink-0">
              <Skeleton className="h-8 w-8 rounded-md" />
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-10" />
            </div>
            <Skeleton className="h-2 w-full rounded-full" />
          </div>

          {/* Stats Grid - 2x2 grid */}
          <div className="grid grid-cols-2 gap-2">
            {/* Size */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3 w-16" />
            </div>
            {/* ETA */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3 w-14" />
            </div>
            {/* Download speed */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3 w-20" />
            </div>
            {/* Upload speed */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-3.5 rounded-sm" />
              <Skeleton className="h-3 w-18" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
