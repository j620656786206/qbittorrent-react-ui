import {  clsx } from "clsx"
import { twMerge } from "tailwind-merge"
import type {ClassValue} from "clsx";
import i18n from '@/i18n'

export function cn(...inputs: Array<ClassValue>) {
  return twMerge(clsx(inputs))
}

// Helper function to format bytes
export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const num = bytes / Math.pow(k, i)
  const fmt = new Intl.NumberFormat(i18n.language || 'en', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dm,
    useGrouping: false
  }).format(num)
  return fmt + ' ' + sizes[i]
}

// Helper function to format ETA
export function formatEta(seconds: number) {
  if (seconds < 0 || seconds === 8640000) return '∞'
  if (seconds === 0) return '-'

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  const fmt = new Intl.NumberFormat(i18n.language || 'en').format

  if (days > 0) return `${fmt(days)}d ${fmt(hours)}h`
  if (hours > 0) return `${fmt(hours)}h ${fmt(minutes)}m`
  return `${fmt(minutes)}m`
}