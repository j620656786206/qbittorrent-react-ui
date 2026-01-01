import { useTranslation } from "react-i18next"
import { ChevronDown, Folder, Loader2, Pause, Play, RefreshCw, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

interface BatchActionsToolbarProps {
  selectedCount: number
  onPause: () => void
  onResume: () => void
  onRecheck: () => void
  onDelete: () => void
  onSetCategory: (category: string) => void
  onClearSelection: () => void
  categories?: string[]
  isPending?: boolean
  className?: string
}

function BatchActionsToolbar({
  selectedCount,
  onPause,
  onResume,
  onRecheck,
  onDelete,
  onSetCategory,
  onClearSelection,
  categories = [],
  isPending = false,
  className,
}: BatchActionsToolbarProps) {
  const { t } = useTranslation()

  if (selectedCount === 0) {
    return null
  }

  return (
    <div
      data-slot="batch-actions-toolbar"
      className={cn(
        "flex items-center justify-between gap-4 rounded-lg border bg-slate-800/50 p-3 mb-4",
        className
      )}
    >
      {/* Left side: Selection count and clear button */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-slate-200">
          {t("batch.selected", { count: selectedCount })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          disabled={isPending}
          className="h-7 px-2 text-slate-400 hover:text-slate-200"
        >
          <X className="h-4 w-4 mr-1" />
          {t("batch.clearSelection")}
        </Button>
      </div>

      {/* Right side: Action buttons */}
      <div className="flex items-center gap-2">
        {/* Loading indicator when operation is in progress */}
        {isPending && (
          <span className="text-sm text-slate-400 flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("batch.processing")}
          </span>
        )}

        <Button
          variant="outline"
          size="sm"
          onClick={onPause}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Pause className="h-4 w-4 mr-2" />
          )}
          {t("common.pause")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onResume}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          {t("common.resume")}
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={onRecheck}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          {t("common.forceRecheck")}
        </Button>

        {/* Category Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Folder className="h-4 w-4 mr-2" />
              )}
              {t("batch.setCategory")}
              <ChevronDown className="h-4 w-4 ml-2" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>{t("batch.selectCategory")}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onSetCategory("")}>
              {t("torrent.uncategorized")}
            </DropdownMenuItem>
            {categories.length > 0 && <DropdownMenuSeparator />}
            {categories.map((category) => (
              <DropdownMenuItem
                key={category}
                onClick={() => onSetCategory(category)}
              >
                {category}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="destructive"
          size="sm"
          onClick={onDelete}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4 mr-2" />
          )}
          {t("common.delete")}
        </Button>
      </div>
    </div>
  )
}

export { BatchActionsToolbar }
