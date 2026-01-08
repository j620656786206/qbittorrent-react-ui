import * as React from "react"
import { ChevronDown, Tag as TagIcon, X } from "lucide-react"

import type { Tag, TagColor } from "@/types/tag"
import { cn } from "@/lib/utils"

/**
 * Get Tailwind background class for a tag color
 */
function getColorClass(color: TagColor | string | undefined): string {
  if (!color) return "bg-slate-500"
  return `bg-${color}-500`
}

/**
 * Props for the TagChip component
 */
interface TagChipProps {
  tag: Tag
  onRemove?: () => void
  className?: string
  disabled?: boolean
}

/**
 * A single tag chip with color indicator and optional remove button
 */
function TagChip({ tag, onRemove, className, disabled }: TagChipProps) {
  return (
    <span
      data-slot="tag-chip"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        "bg-slate-700/50 text-slate-200",
        className
      )}
    >
      <span
        className={cn(
          "size-2 rounded-full shrink-0",
          getColorClass(tag.color as TagColor | undefined)
        )}
      />
      <span className="truncate max-w-[100px]" title={tag.name}>
        {tag.name}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          disabled={disabled}
          className="ml-0.5 rounded-full p-0.5 hover:bg-slate-600/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  )
}

/**
 * Props for the TagInput component
 */
interface TagInputProps {
  /** Available tags to select from */
  availableTags: Array<Tag>
  /** Currently selected tag names */
  value: Array<string>
  /** Callback when selection changes */
  onChange: (selectedTagNames: Array<string>) => void
  /** Placeholder text when no tags selected */
  placeholder?: string
  /** Additional CSS classes */
  className?: string
  /** Whether the input is disabled */
  disabled?: boolean
}

/**
 * A multi-select tag input component with color support
 * Allows users to select multiple tags from a dropdown and displays them as colored chips
 */
function TagInput({
  availableTags,
  value,
  onChange,
  placeholder = "Select tags...",
  className,
  disabled = false,
}: TagInputProps) {
  const [isOpen, setIsOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Get selected tags as Tag objects
  const selectedTags = React.useMemo(() => {
    return availableTags.filter((tag) =>
      value.some((name) => name.toLowerCase() === tag.name.toLowerCase())
    )
  }, [availableTags, value])

  // Get unselected tags for dropdown
  const unselectedTags = React.useMemo(() => {
    return availableTags.filter(
      (tag) =>
        !value.some((name) => name.toLowerCase() === tag.name.toLowerCase())
    )
  }, [availableTags, value])

  // Handle adding a tag
  const handleAddTag = (tag: Tag) => {
    if (!value.includes(tag.name)) {
      onChange([...value, tag.name])
    }
  }

  // Handle removing a tag
  const handleRemoveTag = (tagName: string) => {
    onChange(value.filter((name) => name !== tagName))
  }

  // Handle toggling a tag
  const handleToggleTag = (tag: Tag) => {
    const isSelected = value.some(
      (name) => name.toLowerCase() === tag.name.toLowerCase()
    )
    if (isSelected) {
      handleRemoveTag(tag.name)
    } else {
      handleAddTag(tag)
    }
  }

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      setIsOpen(!isOpen)
    } else if (e.key === "Escape") {
      setIsOpen(false)
    }
  }

  return (
    <div
      ref={containerRef}
      data-slot="tag-input"
      className={cn("relative", className)}
    >
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={cn(
          "flex min-h-9 w-full items-center justify-between rounded-md border px-3 py-1.5",
          "bg-transparent text-sm shadow-xs transition-[color,box-shadow]",
          "border-input dark:bg-input/30",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "outline-none"
        )}
      >
        <div className="flex flex-wrap gap-1 flex-1 min-w-0">
          {selectedTags.length > 0 ? (
            selectedTags.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                onRemove={disabled ? undefined : () => handleRemoveTag(tag.name)}
                disabled={disabled}
              />
            ))
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 ml-2 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown */}
      {isOpen && !disabled && (
        <div
          data-slot="tag-input-dropdown"
          className={cn(
            "absolute z-50 mt-1 w-full rounded-md border bg-popover p-1 shadow-md",
            "animate-in fade-in-0 zoom-in-95"
          )}
        >
          {availableTags.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              <TagIcon className="mx-auto mb-2 size-5 opacity-50" />
              No tags available
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto">
              {availableTags.map((tag) => {
                const isSelected = value.some(
                  (name) => name.toLowerCase() === tag.name.toLowerCase()
                )
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() => handleToggleTag(tag)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                      "outline-none cursor-default select-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      "focus:bg-accent focus:text-accent-foreground",
                      isSelected && "bg-accent/50"
                    )}
                  >
                    <span
                      className={cn(
                        "size-3 rounded-full shrink-0",
                        getColorClass(tag.color as TagColor | undefined)
                      )}
                    />
                    <span className="flex-1 truncate text-left">{tag.name}</span>
                    {isSelected && (
                      <span className="text-xs text-muted-foreground">✓</span>
                    )}
                  </button>
                )
              })}
            </div>
          )}

          {/* Show hint for unselected tags */}
          {unselectedTags.length === 0 && selectedTags.length > 0 && (
            <div className="px-2 py-1.5 text-xs text-muted-foreground border-t mt-1 pt-1">
              All tags selected
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export { TagInput, TagChip, getColorClass }
export type { TagInputProps, TagChipProps }