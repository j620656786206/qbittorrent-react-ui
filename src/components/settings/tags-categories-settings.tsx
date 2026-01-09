import React from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  Loader2,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react'
import type { CategoriesResponse, Category } from '@/types/preferences'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import {
  createCategory,
  createTag,
  deleteCategory,
  deleteTag,
  editCategory,
  getCategories,
  getTags,
} from '@/lib/api'

/**
 * Get the effective base URL for API calls
 */
function getEffectiveBaseUrl(): string {
  return (
    import.meta.env.VITE_QBIT_BASE_URL ||
    localStorage.getItem('qbit_baseUrl') ||
    window.location.origin
  )
}

/**
 * Collapsible section component for grouping related settings
 */
function SettingsSection({
  title,
  description,
  icon,
  children,
  defaultOpen = true,
}: {
  title: string
  description?: string
  icon?: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [isOpen, setIsOpen] = React.useState(defaultOpen)

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="flex items-center justify-between w-full p-4 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {icon}
          <div>
            <h3 className="font-medium">{title}</h3>
            {description && (
              <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
            )}
          </div>
        </div>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4 space-y-4">{children}</div>}
    </div>
  )
}

/**
 * Tags management section component
 */
function TagsManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const baseUrl = getEffectiveBaseUrl()

  // State for new tag input
  const [newTagName, setNewTagName] = React.useState('')
  const [error, setError] = React.useState('')

  // Delete confirmation state
  const [deleteConfirmTag, setDeleteConfirmTag] = React.useState<string | null>(null)

  // Fetch tags
  const {
    data: tags = [],
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ['qbit-tags'],
    queryFn: () => getTags(baseUrl),
    staleTime: 30 * 1000, // 30 seconds
  })

  // Create tag mutation
  const createTagMutation = useMutation({
    mutationFn: (tagName: string) => createTag(baseUrl, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbit-tags'] })
      setNewTagName('')
      setError('')
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('qbittorrent.tagsCategories.tags.createFailed', 'Failed to create tag'))
    },
  })

  // Delete tag mutation
  const deleteTagMutation = useMutation({
    mutationFn: (tagName: string) => deleteTag(baseUrl, tagName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbit-tags'] })
      setDeleteConfirmTag(null)
    },
  })

  // Handle creating a new tag
  const handleCreateTag = () => {
    setError('')
    const trimmedName = newTagName.trim()

    if (!trimmedName) {
      setError(t('qbittorrent.tagsCategories.tags.error.emptyName', 'Tag name cannot be empty'))
      return
    }

    if (tags.includes(trimmedName)) {
      setError(t('qbittorrent.tagsCategories.tags.error.duplicate', 'Tag already exists'))
      return
    }

    createTagMutation.mutate(trimmedName)
  }

  // Handle key press for input
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateTag()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
        {fetchError instanceof Error ? fetchError.message : t('qbittorrent.tagsCategories.tags.fetchError', 'Failed to load tags')}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Create New Tag */}
        <div className="space-y-2">
          <Label>{t('qbittorrent.tagsCategories.tags.createNew', 'Create New Tag')}</Label>
          <div className="flex gap-2">
            <Input
              value={newTagName}
              onChange={(e) => {
                setNewTagName(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyPress}
              placeholder={t('qbittorrent.tagsCategories.tags.namePlaceholder', 'Enter tag name...')}
              className="flex-1"
              disabled={createTagMutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCreateTag}
              disabled={!newTagName.trim() || createTagMutation.isPending}
              title={t('qbittorrent.tagsCategories.tags.add', 'Add Tag')}
            >
              {createTagMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
            </Button>
          </div>
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        {/* Tags List */}
        <div className="space-y-2">
          <Label>{t('qbittorrent.tagsCategories.tags.existing', 'Existing Tags')} ({tags.length})</Label>
          {tags.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-4 text-center">
              {t('qbittorrent.tagsCategories.tags.noTags', 'No tags defined')}
            </div>
          ) : (
            <div className="max-h-[200px] overflow-y-auto space-y-1">
              {tags.map((tag) => (
                <div
                  key={tag}
                  className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group"
                >
                  <TagIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="flex-1 text-sm truncate">{tag}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteConfirmTag(tag)}
                    disabled={deleteTagMutation.isPending}
                    title={t('common.delete', 'Delete')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmTag !== null}
        onOpenChange={(open) => !open && setDeleteConfirmTag(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('qbittorrent.tagsCategories.tags.delete.title', 'Delete Tag')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('qbittorrent.tagsCategories.tags.delete.description', 'Are you sure you want to delete the tag "{{name}}"? This will remove it from all torrents.', { name: deleteConfirmTag })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmTag && deleteTagMutation.mutate(deleteConfirmTag)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteTagMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Category item for display and editing
 */
interface CategoryItemProps {
  name: string
  category: Category
  onEdit: (name: string, savePath: string) => void
  onDelete: (name: string) => void
  isDeleting: boolean
}

function CategoryItem({ name, category, onEdit, onDelete, isDeleting }: CategoryItemProps) {
  const { t } = useTranslation()
  const [isEditing, setIsEditing] = React.useState(false)
  const [editSavePath, setEditSavePath] = React.useState(category.savePath)
  const [editError, setEditError] = React.useState('')

  const handleSave = () => {
    if (!editSavePath.trim()) {
      setEditError(t('qbittorrent.tagsCategories.categories.error.emptySavePath', 'Save path cannot be empty'))
      return
    }
    onEdit(name, editSavePath.trim())
    setIsEditing(false)
    setEditError('')
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditSavePath(category.savePath)
    setEditError('')
  }

  if (isEditing) {
    return (
      <div className="p-3 rounded-md bg-muted/50 space-y-2">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="font-medium text-sm">{name}</span>
        </div>
        <div className="flex gap-2">
          <Input
            value={editSavePath}
            onChange={(e) => {
              setEditSavePath(e.target.value)
              setEditError('')
            }}
            placeholder={t('qbittorrent.tagsCategories.categories.savePathPlaceholder', '/path/to/save')}
            className="flex-1 h-8"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleSave()
              } else if (e.key === 'Escape') {
                handleCancel()
              }
            }}
            autoFocus
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleSave}
            title={t('common.save', 'Save')}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={handleCancel}
            title={t('common.cancel', 'Cancel')}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {editError && (
          <div className="text-xs text-destructive">{editError}</div>
        )}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 group">
      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{name}</div>
        <div className="text-xs text-muted-foreground truncate" title={category.savePath}>
          {category.savePath || t('qbittorrent.tagsCategories.categories.defaultPath', 'Default save path')}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
        onClick={() => setIsEditing(true)}
        title={t('common.edit', 'Edit')}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(name)}
        disabled={isDeleting}
        title={t('common.delete', 'Delete')}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}

/**
 * Categories management section component
 */
function CategoriesManager() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const baseUrl = getEffectiveBaseUrl()

  // State for new category input
  const [newCategoryName, setNewCategoryName] = React.useState('')
  const [newCategorySavePath, setNewCategorySavePath] = React.useState('')
  const [error, setError] = React.useState('')

  // Delete confirmation state
  const [deleteConfirmCategory, setDeleteConfirmCategory] = React.useState<string | null>(null)

  // Fetch categories
  const {
    data: categories = {} as CategoriesResponse,
    isLoading,
    error: fetchError,
  } = useQuery({
    queryKey: ['qbit-categories'],
    queryFn: () => getCategories(baseUrl),
    staleTime: 30 * 1000, // 30 seconds
  })

  const categoryNames = Object.keys(categories)

  // Create category mutation
  const createCategoryMutation = useMutation({
    mutationFn: ({ name, savePath }: { name: string; savePath?: string }) =>
      createCategory(baseUrl, name, savePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbit-categories'] })
      setNewCategoryName('')
      setNewCategorySavePath('')
      setError('')
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : t('qbittorrent.tagsCategories.categories.createFailed', 'Failed to create category'))
    },
  })

  // Edit category mutation
  const editCategoryMutation = useMutation({
    mutationFn: ({ name, savePath }: { name: string; savePath: string }) =>
      editCategory(baseUrl, name, savePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbit-categories'] })
    },
  })

  // Delete category mutation
  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryName: string) => deleteCategory(baseUrl, categoryName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['qbit-categories'] })
      setDeleteConfirmCategory(null)
    },
  })

  // Handle creating a new category
  const handleCreateCategory = () => {
    setError('')
    const trimmedName = newCategoryName.trim()

    if (!trimmedName) {
      setError(t('qbittorrent.tagsCategories.categories.error.emptyName', 'Category name cannot be empty'))
      return
    }

    if (categoryNames.includes(trimmedName)) {
      setError(t('qbittorrent.tagsCategories.categories.error.duplicate', 'Category already exists'))
      return
    }

    createCategoryMutation.mutate({
      name: trimmedName,
      savePath: newCategorySavePath.trim() || undefined,
    })
  }

  // Handle key press for input
  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleCreateCategory()
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (fetchError) {
    return (
      <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
        {fetchError instanceof Error ? fetchError.message : t('qbittorrent.tagsCategories.categories.fetchError', 'Failed to load categories')}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {/* Create New Category */}
        <div className="space-y-3">
          <Label>{t('qbittorrent.tagsCategories.categories.createNew', 'Create New Category')}</Label>
          <div className="grid gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => {
                setNewCategoryName(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyPress}
              placeholder={t('qbittorrent.tagsCategories.categories.namePlaceholder', 'Category name...')}
              disabled={createCategoryMutation.isPending}
            />
            <Input
              value={newCategorySavePath}
              onChange={(e) => setNewCategorySavePath(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={t('qbittorrent.tagsCategories.categories.savePathPlaceholder', 'Save path (optional)')}
              disabled={createCategoryMutation.isPending}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleCreateCategory}
              disabled={!newCategoryName.trim() || createCategoryMutation.isPending}
              className="w-full"
            >
              {createCategoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t('qbittorrent.tagsCategories.categories.add', 'Add Category')}
            </Button>
          </div>
          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        {/* Categories List */}
        <div className="space-y-2">
          <Label>{t('qbittorrent.tagsCategories.categories.existing', 'Existing Categories')} ({categoryNames.length})</Label>
          {categoryNames.length === 0 ? (
            <div className="text-sm text-muted-foreground italic py-4 text-center">
              {t('qbittorrent.tagsCategories.categories.noCategories', 'No categories defined')}
            </div>
          ) : (
            <div className="max-h-[300px] overflow-y-auto space-y-1">
              {categoryNames.map((name) => (
                <CategoryItem
                  key={name}
                  name={name}
                  category={categories[name]}
                  onEdit={(catName, savePath) =>
                    editCategoryMutation.mutate({ name: catName, savePath })
                  }
                  onDelete={setDeleteConfirmCategory}
                  isDeleting={deleteCategoryMutation.isPending}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={deleteConfirmCategory !== null}
        onOpenChange={(open) => !open && setDeleteConfirmCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('qbittorrent.tagsCategories.categories.delete.title', 'Delete Category')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('qbittorrent.tagsCategories.categories.delete.description', 'Are you sure you want to delete the category "{{name}}"? Torrents in this category will become uncategorized.', { name: deleteConfirmCategory })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmCategory && deleteCategoryMutation.mutate(deleteConfirmCategory)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteCategoryMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {t('common.delete', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Tags & Categories settings component
 * Provides CRUD operations for qBittorrent tags and categories
 */
export function TagsCategoriesSettings() {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {/* Tags Section */}
      <SettingsSection
        title={t('qbittorrent.tagsCategories.tags.title', 'Tags')}
        description={t('qbittorrent.tagsCategories.tags.description', 'Manage tags to organize your torrents')}
        icon={<TagIcon className="h-5 w-5 text-muted-foreground" />}
      >
        <TagsManager />
      </SettingsSection>

      {/* Categories Section */}
      <SettingsSection
        title={t('qbittorrent.tagsCategories.categories.title', 'Categories')}
        description={t('qbittorrent.tagsCategories.categories.description', 'Manage categories with custom save paths')}
        icon={<FolderOpen className="h-5 w-5 text-muted-foreground" />}
      >
        <CategoriesManager />
      </SettingsSection>
    </div>
  )
}

/**
 * Tags & Categories settings tab wrapper
 * Standalone component for use in settings tabs
 */
export function TagsCategoriesSettingsTab() {
  return <TagsCategoriesSettings />
}
