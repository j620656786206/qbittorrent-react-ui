import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { FileUp, Link2, Upload } from 'lucide-react'
import type { Tag } from '@/types/tag'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { addTorrentFile, addTorrentMagnet, getCategories } from '@/lib/api'
import { TagInput } from '@/components/ui/tag-input'
import { formatTagString, getTags } from '@/lib/tag-storage'

type TabType = 'magnet' | 'file'

interface AddTorrentModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddTorrentModal({ isOpen, onClose }: AddTorrentModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Form state
  const [activeTab, setActiveTab] = React.useState<TabType>('magnet')
  const [magnetLink, setMagnetLink] = React.useState('')
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null)
  const [savePath, setSavePath] = React.useState('')
  const [category, setCategory] = React.useState('')
  const [selectedTags, setSelectedTags] = React.useState<Array<string>>([])
  const [startPaused, setStartPaused] = React.useState(false)
  const [error, setError] = React.useState('')

  // Available tags from localStorage
  const [availableTags, setAvailableTags] = React.useState<Array<Tag>>([])

  // Load tags when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setAvailableTags(getTags())
    }
  }, [isOpen])

  // File input ref
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // Helper to get baseUrl from localStorage
  const getBaseUrl = () =>
    localStorage.getItem('qbit_baseUrl') || 'http://localhost:8080'

  // Fetch categories
  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getCategories(getBaseUrl()),
    enabled: isOpen,
  })

  // Add torrent via magnet link mutation
  const addMagnetMutation = useMutation({
    mutationFn: (magnet: string) =>
      addTorrentMagnet(getBaseUrl(), magnet, {
        savepath: savePath || undefined,
        category: category || undefined,
        tags:
          selectedTags.length > 0 ? formatTagString(selectedTags) : undefined,
        paused: startPaused,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      handleClose()
    },
    onError: (err: Error) => {
      setError(err.message || t('addTorrent.error.failed'))
    },
  })

  // Add torrent via file mutation
  const addFileMutation = useMutation({
    mutationFn: (file: File) =>
      addTorrentFile(getBaseUrl(), file, {
        savepath: savePath || undefined,
        category: category || undefined,
        tags:
          selectedTags.length > 0 ? formatTagString(selectedTags) : undefined,
        paused: startPaused,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maindata'] })
      handleClose()
    },
    onError: (err: Error) => {
      setError(err.message || t('addTorrent.error.failed'))
    },
  })

  // Reset form state
  const resetForm = () => {
    setActiveTab('magnet')
    setMagnetLink('')
    setSelectedFile(null)
    setSavePath('')
    setCategory('')
    setSelectedTags([])
    setStartPaused(false)
    setError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Handle modal close
  const handleClose = () => {
    resetForm()
    onClose()
  }

  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError('')
    }
  }

  // Validate magnet link
  const isValidMagnetLink = (link: string): boolean => {
    return link.trim().startsWith('magnet:?')
  }

  // Handle form submission
  const handleSubmit = () => {
    setError('')

    if (activeTab === 'magnet') {
      if (!magnetLink.trim()) {
        setError(t('addTorrent.error.invalidMagnet'))
        return
      }
      if (!isValidMagnetLink(magnetLink)) {
        setError(t('addTorrent.error.invalidMagnet'))
        return
      }
      addMagnetMutation.mutate(magnetLink.trim())
    } else {
      if (!selectedFile) {
        setError(t('addTorrent.error.noFile'))
        return
      }
      addFileMutation.mutate(selectedFile)
    }
  }

  const isSubmitting = addMagnetMutation.isPending || addFileMutation.isPending
  const categoryList = categoriesData ? Object.keys(categoriesData) : []

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('addTorrent.title')}</DialogTitle>
          <DialogDescription>{t('addTorrent.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Tab Buttons */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={activeTab === 'magnet' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setActiveTab('magnet')}
            >
              <Link2 className="h-4 w-4 mr-2" />
              {t('addTorrent.tabs.magnetLink')}
            </Button>
            <Button
              type="button"
              variant={activeTab === 'file' ? 'default' : 'outline'}
              className="flex-1"
              onClick={() => setActiveTab('file')}
            >
              <FileUp className="h-4 w-4 mr-2" />
              {t('addTorrent.tabs.file')}
            </Button>
          </div>

          {/* Magnet Link Input */}
          {activeTab === 'magnet' && (
            <div className="grid gap-2">
              <Label htmlFor="magnetLink">
                {t('addTorrent.magnetLink.label')}
              </Label>
              <Input
                id="magnetLink"
                value={magnetLink}
                onChange={(e) => {
                  setMagnetLink(e.target.value)
                  setError('')
                }}
                placeholder={t('addTorrent.magnetLink.placeholder')}
                className="font-mono text-sm"
              />
            </div>
          )}

          {/* File Upload Input */}
          {activeTab === 'file' && (
            <div className="grid gap-2">
              <Label htmlFor="torrentFile">{t('addTorrent.file.label')}</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  readOnly
                  value={selectedFile?.name || ''}
                  placeholder={t('addTorrent.file.noFile')}
                  className="flex-1 cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  {t('addTorrent.file.browse')}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".torrent"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
            </div>
          )}

          {/* Save Path Input */}
          <div className="grid gap-2">
            <Label htmlFor="savePath">{t('addTorrent.savePath.label')}</Label>
            <Input
              id="savePath"
              value={savePath}
              onChange={(e) => setSavePath(e.target.value)}
              placeholder={t('addTorrent.savePath.placeholder')}
            />
          </div>

          {/* Category Dropdown */}
          <div className="grid gap-2">
            <Label htmlFor="category">{t('addTorrent.category.label')}</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] dark:bg-input/30"
            >
              <option value="">{t('addTorrent.category.none')}</option>
              {categoryList.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Tags Multi-select */}
          {availableTags.length > 0 && (
            <div className="grid gap-2">
              <Label>{t('addTorrent.tags.label')}</Label>
              <TagInput
                availableTags={availableTags}
                value={selectedTags}
                onChange={setSelectedTags}
                placeholder={t('addTorrent.tags.placeholder')}
              />
            </div>
          )}

          {/* Start Paused Checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="startPaused"
              checked={startPaused}
              onChange={(e) => setStartPaused(e.target.checked)}
              className="h-4 w-4 rounded border border-input bg-transparent shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
            />
            <Label htmlFor="startPaused">{t('addTorrent.startPaused')}</Label>
          </div>

          {/* Error Message */}
          {error && (
            <div className="text-sm text-red-500 bg-red-500/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Upload className="h-4 w-4 mr-2 animate-spin" />
                {t('addTorrent.adding')}
              </>
            ) : (
              t('addTorrent.add')
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
