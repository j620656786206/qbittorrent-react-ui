import React from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Files, Loader2, RefreshCw } from 'lucide-react'

import type { FilePriority } from '@/types/torrent'
import { getTorrentFiles, setFilePriority } from '@/lib/api'
import {
  buildFileTree,
  findNodeByPath,
  getFileIndicesFromFolder,
} from '@/lib/fileTree'
import { FileTree } from '@/components/FileTreeNode'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/use-toast'

type TorrentFileListProps = {
  hash: string
  baseUrl: string
}

/**
 * TorrentFileList component displays the files within a torrent
 * with tree structure navigation and priority controls.
 *
 * Features:
 * - Fetches file list from qBittorrent API with 5-second polling
 * - Parses flat file list into hierarchical tree structure
 * - Allows priority changes for individual files
 * - Handles loading, error, and empty states
 * - Gracefully handles 409 (metadata pending) errors
 */
export function TorrentFileList({ hash, baseUrl }: TorrentFileListProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { showSuccess, showError } = useToast()

  // Query for fetching torrent files
  const {
    data: files,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['torrent-files', hash],
    queryFn: () => getTorrentFiles(baseUrl, hash),
    refetchInterval: 5000, // Refresh every 5 seconds for progress updates
    enabled: !!hash, // Only fetch if hash is provided
    retry: (failureCount, retryError) => {
      // Don't retry on 409 (metadata pending) or 404 (not found)
      if (retryError instanceof Error) {
        const statusMatch = retryError.message.match(/status: (\d+)/)
        if (statusMatch) {
          const status = parseInt(statusMatch[1], 10)
          if (status === 409 || status === 404) {
            return false
          }
        }
      }
      return failureCount < 3
    },
  })

  // Mutation for changing file priority
  const priorityMutation = useMutation({
    mutationFn: async ({
      fileIds,
      priority,
    }: {
      fileIds: number | Array<number>
      priority: FilePriority
    }) => {
      return setFilePriority(baseUrl, hash, fileIds, priority)
    },
    onSuccess: () => {
      // Invalidate the files query to refresh the list
      queryClient.invalidateQueries({ queryKey: ['torrent-files', hash] })
      showSuccess('toast.success.setFilePriority')
    },
    onError: (
      mutationError: Error,
      variables: { fileIds: number | Array<number>; priority: FilePriority },
    ) => {
      showError('toast.error.setFilePriority', {
        description: mutationError.message,
        onRetry: () => priorityMutation.mutate(variables),
      })
    },
    retry: 3, // Retry failed mutations up to 3 times
  })

  // Handle priority change for a single file
  const handlePriorityChange = React.useCallback(
    (fileIndex: number, priority: FilePriority) => {
      priorityMutation.mutate({ fileIds: fileIndex, priority })
    },
    [priorityMutation],
  )

  // Handle priority change for all files in a folder
  const handleFolderPriorityChange = React.useCallback(
    (folderPath: string, priority: FilePriority) => {
      if (!files) return

      // Build tree and find the folder node
      const tree = buildFileTree(files)
      const folderNode = findNodeByPath(tree, folderPath)

      if (folderNode && folderNode.isFolder) {
        // Get all file indices from this folder
        const fileIndices = getFileIndicesFromFolder(folderNode)
        if (fileIndices.length > 0) {
          priorityMutation.mutate({ fileIds: fileIndices, priority })
        }
      }
    },
    [files, priorityMutation],
  )

  // Build tree structure from flat file list
  const fileTree = React.useMemo(() => {
    if (!files || files.length === 0) {
      return []
    }
    return buildFileTree(files)
  }, [files])

  // Check if error is a 409 (metadata pending)
  const isMetadataPending = React.useMemo(() => {
    if (!error || !(error instanceof Error)) return false
    return error.message.includes('status: 409')
  }, [error])

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-400 text-sm">
          {t('fileList.loading')}
        </span>
      </div>
    )
  }

  // Error state - metadata pending (409)
  if (isMetadataPending) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-8 w-8 text-amber-400 mb-3" />
        <p className="text-slate-300 text-sm mb-2">
          {t('fileList.metadataPending')}
        </p>
        <p className="text-slate-500 text-xs mb-4">
          {t('fileList.metadataPendingHint')}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          {t('common.refresh')}
        </Button>
      </div>
    )
  }

  // Error state - other errors
  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <AlertCircle className="h-8 w-8 text-red-400 mb-3" />
        <p className="text-slate-300 text-sm mb-2">{t('fileList.error')}</p>
        <p className="text-slate-500 text-xs mb-4">
          {error instanceof Error ? error.message : String(error)}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-xs"
        >
          {isFetching ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <RefreshCw className="h-3 w-3 mr-1" />
          )}
          {t('common.retry')}
        </Button>
      </div>
    )
  }

  // Empty state
  if (!files || files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <Files className="h-8 w-8 text-slate-500 mb-3" />
        <p className="text-slate-400 text-sm">{t('fileList.noFiles')}</p>
      </div>
    )
  }

  // Normal state - render file tree
  return (
    <div className="space-y-3">
      {/* Header with file count and refresh indicator */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Files className="h-4 w-4" />
          <span>{t('fileList.fileCount', { count: files.length })}</span>
          {isFetching && (
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          )}
        </div>
        {priorityMutation.isPending && (
          <span className="text-xs text-slate-500">
            {t('fileList.updatingPriority')}
          </span>
        )}
      </div>

      {/* File Tree */}
      <div className="bg-slate-900/50 rounded-lg border border-slate-700/50 p-2 max-h-[400px] overflow-y-auto">
        <FileTree
          nodes={fileTree}
          onPriorityChange={handlePriorityChange}
          onFolderPriorityChange={handleFolderPriorityChange}
          isPriorityChanging={priorityMutation.isPending}
          defaultExpanded={files.length <= 50} // Auto-expand for small file lists
        />
      </div>
    </div>
  )
}
