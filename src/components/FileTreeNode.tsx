import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowUp,
  ArrowUpCircle,
  Ban,
  ChevronDown,
  ChevronRight,
  File,
  Folder,
} from 'lucide-react'

import type { FileTreeNode as FileTreeNodeType } from '@/types/torrent'
import { FilePriority, FilePriorityLabels } from '@/types/torrent'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { cn,  formatBytes  } from '@/lib/utils'

// Get priority icon based on priority value
function getPriorityIcon(priority: FilePriority): React.ReactNode {
  switch (priority) {
    case FilePriority.DO_NOT_DOWNLOAD:
      return <Ban className="h-3 w-3 text-slate-400" />
    case FilePriority.HIGH:
      return <ArrowUp className="h-3 w-3 text-orange-400" />
    case FilePriority.MAXIMUM:
      return <ArrowUpCircle className="h-3 w-3 text-red-400" />
    default:
      return null
  }
}

// Get priority button styles based on priority value
function getPriorityButtonStyles(priority: FilePriority): string {
  switch (priority) {
    case FilePriority.DO_NOT_DOWNLOAD:
      return 'text-slate-400 hover:text-slate-300'
    case FilePriority.HIGH:
      return 'text-orange-400 hover:text-orange-300'
    case FilePriority.MAXIMUM:
      return 'text-red-400 hover:text-red-300'
    default:
      return 'text-slate-300 hover:text-white'
  }
}

type FileTreeNodeProps = {
  node: FileTreeNodeType
  depth?: number
  onPriorityChange?: (fileIndex: number, priority: FilePriority) => void
  onFolderPriorityChange?: (folderPath: string, priority: FilePriority) => void
  isPriorityChanging?: boolean
  defaultExpanded?: boolean
}

export function FileTreeNode({
  node,
  depth = 0,
  onPriorityChange,
  onFolderPriorityChange,
  isPriorityChanging = false,
  defaultExpanded = false,
}: FileTreeNodeProps) {
  const { t } = useTranslation()
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  const handleToggleExpand = () => {
    if (node.isFolder) {
      setIsExpanded(!isExpanded)
    }
  }

  const handlePriorityChange = (value: string) => {
    const newPriority = parseInt(value, 10) as FilePriority
    if (node.isFolder && onFolderPriorityChange) {
      onFolderPriorityChange(node.path, newPriority)
    } else if (node.fileIndex !== undefined && onPriorityChange) {
      onPriorityChange(node.fileIndex, newPriority)
    }
  }

  // Calculate indentation based on depth
  const indentStyle = { paddingLeft: `${depth * 20}px` }

  // Priority dropdown for files (and optionally folders for bulk operations)
  const priorityDropdown = (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors focus:outline-none',
          getPriorityButtonStyles(node.priority ?? FilePriority.NORMAL),
          isPriorityChanging && 'opacity-50 cursor-not-allowed'
        )}
        disabled={isPriorityChanging}
      >
        {getPriorityIcon(node.priority ?? FilePriority.NORMAL)}
        <span>{t(FilePriorityLabels[node.priority ?? FilePriority.NORMAL])}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[160px]">
        <DropdownMenuRadioGroup
          value={String(node.priority ?? FilePriority.NORMAL)}
          onValueChange={handlePriorityChange}
        >
          <DropdownMenuRadioItem value={String(FilePriority.DO_NOT_DOWNLOAD)}>
            <Ban className="h-4 w-4 text-slate-400 mr-2" />
            {t(FilePriorityLabels[FilePriority.DO_NOT_DOWNLOAD])}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value={String(FilePriority.NORMAL)}>
            {t(FilePriorityLabels[FilePriority.NORMAL])}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value={String(FilePriority.HIGH)}>
            <ArrowUp className="h-4 w-4 text-orange-400 mr-2" />
            {t(FilePriorityLabels[FilePriority.HIGH])}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="select-none">
      {/* Node Row */}
      <div
        className={cn(
          'flex items-center gap-2 py-1.5 px-2 rounded-sm hover:bg-slate-800/50 transition-colors',
          node.isFolder && 'cursor-pointer'
        )}
        style={indentStyle}
        onClick={handleToggleExpand}
      >
        {/* Expand/Collapse Icon for Folders */}
        <div className="w-4 h-4 flex items-center justify-center">
          {node.isFolder ? (
            isExpanded ? (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-400" />
            )
          ) : null}
        </div>

        {/* File/Folder Icon */}
        <div className="flex-shrink-0">
          {node.isFolder ? (
            <Folder className="h-4 w-4 text-blue-400" />
          ) : (
            <File className="h-4 w-4 text-slate-400" />
          )}
        </div>

        {/* Name */}
        <div
          className={cn(
            'flex-1 min-w-0 text-sm truncate',
            node.priority === FilePriority.DO_NOT_DOWNLOAD
              ? 'text-slate-500'
              : 'text-white'
          )}
          title={node.name}
        >
          {node.name}
        </div>

        {/* Size */}
        <div className="text-xs text-slate-400 flex-shrink-0 w-20 text-right">
          {formatBytes(node.size)}
        </div>

        {/* Progress */}
        <div
          className="flex-shrink-0 w-24 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <Progress
            value={node.progress * 100}
            className={cn(
              'h-1.5 flex-1',
              node.priority === FilePriority.DO_NOT_DOWNLOAD && 'opacity-50'
            )}
          />
          <span className="text-xs text-slate-400 w-10 text-right">
            {(node.progress * 100).toFixed(0)}%
          </span>
        </div>

        {/* Priority Control (files only) */}
        <div
          className="flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {!node.isFolder && priorityDropdown}
        </div>
      </div>

      {/* Children (for expanded folders) */}
      {node.isFolder && isExpanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onPriorityChange={onPriorityChange}
              onFolderPriorityChange={onFolderPriorityChange}
              isPriorityChanging={isPriorityChanging}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Component for rendering the entire file tree
 */
type FileTreeProps = {
  nodes: Array<FileTreeNodeType>
  onPriorityChange?: (fileIndex: number, priority: FilePriority) => void
  onFolderPriorityChange?: (folderPath: string, priority: FilePriority) => void
  isPriorityChanging?: boolean
  defaultExpanded?: boolean
}

export function FileTree({
  nodes,
  onPriorityChange,
  onFolderPriorityChange,
  isPriorityChanging = false,
  defaultExpanded = true,
}: FileTreeProps) {
  const { t } = useTranslation()

  if (nodes.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400 text-sm">
        {t('fileTree.noFiles')}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          onPriorityChange={onPriorityChange}
          onFolderPriorityChange={onFolderPriorityChange}
          isPriorityChanging={isPriorityChanging}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  )
}
