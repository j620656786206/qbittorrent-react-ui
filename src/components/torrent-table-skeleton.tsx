import React from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// Grid column template matching torrent-table.tsx
// Columns: checkbox(40px) | name(35%) | status(20%) | speed(15%) | stats(22%) | actions(8%)
const gridTemplateColumns =
  '40px minmax(200px, 35fr) minmax(160px, 20fr) minmax(110px, 15fr) minmax(180px, 22fr) minmax(60px, 8fr)'

const ROW_HEIGHT = 50 // Fixed height matching torrent-table.tsx

interface DivTableProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function DivTable({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table"
      className={cn('relative w-full text-sm', className)}
      role="table"
      {...props}
    >
      {children}
    </div>
  )
}

function DivTableHeader({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table-header"
      className={cn('border-b', className)}
      role="rowgroup"
      {...props}
    >
      {children}
    </div>
  )
}

function DivTableBody({ className, children, ...props }: DivTableProps) {
  return (
    <div
      data-slot="div-table-body"
      className={cn(
        '[&>[data-slot=div-table-row]:last-child]:border-0',
        className,
      )}
      role="rowgroup"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableRowProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

function DivTableRow({
  className,
  children,
  style,
  ...props
}: DivTableRowProps & { style?: React.CSSProperties }) {
  return (
    <div
      data-slot="div-table-row"
      className={cn('grid border-b', className)}
      style={{ gridTemplateColumns, height: `${ROW_HEIGHT}px`, ...style }}
      role="row"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableHeadProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

function DivTableHead({ className, children, ...props }: DivTableHeadProps) {
  return (
    <div
      data-slot="div-table-head"
      className={cn(
        'text-foreground h-10 px-2 flex items-center font-medium whitespace-nowrap',
        className,
      )}
      role="columnheader"
      {...props}
    >
      {children}
    </div>
  )
}

interface DivTableCellProps extends React.HTMLAttributes<HTMLDivElement> {
  children?: React.ReactNode
}

function DivTableCell({ className, children, ...props }: DivTableCellProps) {
  return (
    <div
      data-slot="div-table-cell"
      className={cn('p-2 flex items-center whitespace-nowrap', className)}
      role="cell"
      {...props}
    >
      {children}
    </div>
  )
}

interface TorrentTableSkeletonProps {
  rowCount?: number
}

export function TorrentTableSkeleton({
  rowCount = 8,
}: TorrentTableSkeletonProps) {
  return (
    <div className="flex flex-col h-full">
      <DivTable>
        {/* Fixed header with skeleton placeholders */}
        <DivTableHeader className="sticky top-0 z-10 bg-background">
          <DivTableRow style={{ height: 'auto' }}>
            <DivTableHead className="px-3">
              <Skeleton className="h-4 w-4 rounded-sm" />
            </DivTableHead>
            <DivTableHead>
              <Skeleton className="h-4 w-16" />
            </DivTableHead>
            <DivTableHead>
              <Skeleton className="h-4 w-32" />
            </DivTableHead>
            <DivTableHead>
              <Skeleton className="h-4 w-14" />
            </DivTableHead>
            <DivTableHead>
              <Skeleton className="h-4 w-12" />
            </DivTableHead>
            <DivTableHead className="justify-end">
              <Skeleton className="h-4 w-16" />
            </DivTableHead>
          </DivTableRow>
        </DivTableHeader>
      </DivTable>

      {/* Scrollable body with skeleton rows */}
      <div className="flex-1 overflow-auto">
        <DivTable>
          <DivTableBody>
            {Array.from({ length: rowCount }).map((_, index) => (
              <DivTableRow key={index}>
                {/* Checkbox */}
                <DivTableCell className="px-3">
                  <Skeleton className="h-4 w-4 rounded-sm" />
                </DivTableCell>

                {/* Name + Category */}
                <DivTableCell className="font-medium">
                  <div className="space-y-2 w-full">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                </DivTableCell>

                {/* Status + Progress */}
                <DivTableCell>
                  <div className="space-y-2 w-full">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-10" />
                    </div>
                    <Skeleton className="h-1.5 w-full rounded-full" />
                  </div>
                </DivTableCell>

                {/* Speed */}
                <DivTableCell>
                  <div className="flex flex-col gap-1.5 w-full">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </DivTableCell>

                {/* Stats: Size, ETA, Ratio, Peers */}
                <DivTableCell>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 w-full">
                    <Skeleton className="h-3 w-16" />
                    <Skeleton className="h-3 w-12" />
                    <Skeleton className="h-3 w-14" />
                    <Skeleton className="h-3 w-16" />
                  </div>
                </DivTableCell>

                {/* Actions */}
                <DivTableCell className="justify-end">
                  <Skeleton className="h-7 w-7 rounded-md" />
                </DivTableCell>
              </DivTableRow>
            ))}
          </DivTableBody>
        </DivTable>
      </div>
    </div>
  )
}
