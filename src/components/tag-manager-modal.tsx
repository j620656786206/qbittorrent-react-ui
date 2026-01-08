import React from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Tag as TagIcon, Trash2, X } from 'lucide-react'
import type { Tag, TagColor } from '@/types/tag'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TagColors } from '@/types/tag'
import {
  createTag,
  deleteTag,
  getTags,
  tagNameExists,
  updateTag,
  validateTagName,
} from '@/lib/tag-storage'

interface TagManagerModalProps {
  isOpen: boolean
  onClose: () => void
  onTagsChange?: () => void
}

export function TagManagerModal({
  isOpen,
  onClose,
  onTagsChange,
}: TagManagerModalProps) {
  const { t } = useTranslation()

  // Tags list state
  const [tags, setTags] = React.useState<Array<Tag>>([])

  // Form state for creating new tag
  const [newTagName, setNewTagName] = React.useState('')
  const [newTagColor, setNewTagColor] = React.useState<TagColor | undefined>(
    undefined,
  )
  const [error, setError] = React.useState('')

  // Edit state
  const [editingTagId, setEditingTagId] = React.useState<string | null>(null)
  const [editTagName, setEditTagName] = React.useState('')
  const [editTagColor, setEditTagColor] = React.useState<TagColor | undefined>(
    undefined,
  )
  const [editError, setEditError] = React.useState('')

  // Delete confirmation state
  const [deleteConfirmTag, setDeleteConfirmTag] = React.useState<Tag | null>(
    null,
  )

  // Load tags when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setTags(getTags())
      resetForm()
    }
  }, [isOpen])

  // Reset form state
  const resetForm = () => {
    setNewTagName('')
    setNewTagColor(undefined)
    setError('')
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor(undefined)
    setEditError('')
  }

  // Handle modal close
  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Refresh tags from storage
  const refreshTags = () => {
    setTags(getTags())
    onTagsChange?.()
  }

  // Handle creating a new tag
  const handleCreateTag = () => {
    setError('')

    // Validate tag name
    const validationError = validateTagName(newTagName)
    if (validationError) {
      setError(
        t(
          `tags.error.${validationError === 'Tag name cannot be empty' ? 'emptyName' : validationError === 'Tag name cannot exceed 50 characters' ? 'nameTooLong' : 'invalidName'}`,
          validationError,
        ),
      )
      return
    }

    // Check for duplicate
    if (tagNameExists(newTagName)) {
      setError(t('tags.error.duplicate', { name: newTagName.trim() }))
      return
    }

    try {
      createTag(newTagName.trim(), newTagColor)
      setNewTagName('')
      setNewTagColor(undefined)
      refreshTags()
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t('tags.error.createFailed'),
      )
    }
  }

  // Start editing a tag
  const handleStartEdit = (tag: Tag) => {
    setEditingTagId(tag.id)
    setEditTagName(tag.name)
    setEditTagColor(tag.color as TagColor | undefined)
    setEditError('')
  }

  // Cancel editing
  const handleCancelEdit = () => {
    setEditingTagId(null)
    setEditTagName('')
    setEditTagColor(undefined)
    setEditError('')
  }

  // Save edited tag
  const handleSaveEdit = () => {
    if (!editingTagId) return

    setEditError('')

    // Validate tag name
    const validationError = validateTagName(editTagName)
    if (validationError) {
      setEditError(
        t(
          `tags.error.${validationError === 'Tag name cannot be empty' ? 'emptyName' : validationError === 'Tag name cannot exceed 50 characters' ? 'nameTooLong' : 'invalidName'}`,
          validationError,
        ),
      )
      return
    }

    // Check for duplicate (excluding current tag)
    if (tagNameExists(editTagName, editingTagId)) {
      setEditError(t('tags.error.duplicate', { name: editTagName.trim() }))
      return
    }

    try {
      updateTag(editingTagId, {
        name: editTagName.trim(),
        color: editTagColor,
      })
      handleCancelEdit()
      refreshTags()
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : t('tags.error.updateFailed'),
      )
    }
  }

  // Handle delete confirmation
  const handleConfirmDelete = () => {
    if (!deleteConfirmTag) return

    try {
      deleteTag(deleteConfirmTag.id)
      setDeleteConfirmTag(null)
      refreshTags()
    } catch {
      // Tag may already be deleted, refresh anyway
      refreshTags()
    }
  }

  // Handle key press for input
  const handleKeyPress = (
    e: React.KeyboardEvent<HTMLInputElement>,
    action: () => void,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      action()
    }
  }

  // Get Tailwind background class for a color
  const getColorClass = (color: TagColor | undefined) => {
    if (!color) return 'bg-slate-500'
    return `bg-${color}-500`
  }

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TagIcon className="h-5 w-5" />
              {t('tags.manager.title')}
            </DialogTitle>
            <DialogDescription>
              {t('tags.manager.description')}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Create New Tag Section */}
            <div className="space-y-3">
              <Label>{t('tags.manager.createNew')}</Label>
              <div className="flex gap-2">
                <Input
                  value={newTagName}
                  onChange={(e) => {
                    setNewTagName(e.target.value)
                    setError('')
                  }}
                  onKeyDown={(e) => handleKeyPress(e, handleCreateTag)}
                  placeholder={t('tags.manager.namePlaceholder')}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim()}
                  title={t('tags.manager.addTag')}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {/* Color Picker */}
              <div className="flex flex-wrap gap-2">
                {/* No color option */}
                <button
                  type="button"
                  className={`h-6 w-6 rounded-full border-2 bg-slate-500 transition-transform hover:scale-110 ${
                    newTagColor === undefined
                      ? 'border-white ring-2 ring-offset-2 ring-slate-500'
                      : 'border-transparent'
                  }`}
                  onClick={() => setNewTagColor(undefined)}
                  title={t('tags.manager.noColor')}
                />
                {TagColors.filter((c) => c !== 'slate' && c !== 'gray').map(
                  (color) => (
                    <button
                      key={color}
                      type="button"
                      className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${getColorClass(color)} ${
                        newTagColor === color
                          ? 'border-white ring-2 ring-offset-2 ring-' +
                            color +
                            '-500'
                          : 'border-transparent'
                      }`}
                      onClick={() => setNewTagColor(color)}
                      title={color}
                    />
                  ),
                )}
              </div>

              {/* Error Message */}
              {error && (
                <div className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            {/* Existing Tags List */}
            <div className="space-y-2">
              <Label>{t('tags.manager.existingTags')}</Label>
              {tags.length === 0 ? (
                <div className="text-sm text-slate-400 py-4 text-center">
                  {t('tags.manager.noTags')}
                </div>
              ) : (
                <div className="max-h-[200px] overflow-y-auto space-y-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center gap-2 p-2 rounded-md bg-slate-800/50"
                    >
                      {editingTagId === tag.id ? (
                        /* Edit Mode */
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <Input
                              value={editTagName}
                              onChange={(e) => {
                                setEditTagName(e.target.value)
                                setEditError('')
                              }}
                              onKeyDown={(e) =>
                                handleKeyPress(e, handleSaveEdit)
                              }
                              className="flex-1 h-8"
                              autoFocus
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={handleSaveEdit}
                              title={t('common.save')}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={handleCancelEdit}
                              title={t('common.cancel')}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              className={`h-5 w-5 rounded-full border-2 bg-slate-500 transition-transform hover:scale-110 ${
                                editTagColor === undefined
                                  ? 'border-white ring-1 ring-offset-1 ring-slate-500'
                                  : 'border-transparent'
                              }`}
                              onClick={() => setEditTagColor(undefined)}
                            />
                            {TagColors.filter(
                              (c) => c !== 'slate' && c !== 'gray',
                            ).map((color) => (
                              <button
                                key={color}
                                type="button"
                                className={`h-5 w-5 rounded-full border-2 transition-transform hover:scale-110 ${getColorClass(color)} ${
                                  editTagColor === color
                                    ? 'border-white ring-1 ring-offset-1 ring-' +
                                      color +
                                      '-500'
                                    : 'border-transparent'
                                }`}
                                onClick={() => setEditTagColor(color)}
                              />
                            ))}
                          </div>
                          {editError && (
                            <div className="text-xs text-red-500">
                              {editError}
                            </div>
                          )}
                        </div>
                      ) : (
                        /* View Mode */
                        <>
                          <span
                            className={`h-3 w-3 rounded-full shrink-0 ${getColorClass(tag.color as TagColor | undefined)}`}
                          />
                          <span
                            className="flex-1 text-sm truncate cursor-pointer hover:text-blue-400"
                            onClick={() => handleStartEdit(tag)}
                            title={t('tags.manager.clickToEdit')}
                          >
                            {tag.name}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-slate-400 hover:text-red-400"
                            onClick={() => setDeleteConfirmTag(tag)}
                            title={t('common.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmTag !== null}
        onOpenChange={(open) => !open && setDeleteConfirmTag(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('tags.delete.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('tags.delete.description', { name: deleteConfirmTag?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-500 hover:bg-red-600"
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
