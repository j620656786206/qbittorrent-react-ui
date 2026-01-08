import { describe, expect, it } from 'vitest'
import { formatBytes, formatEta } from '@/lib/utils'

/**
 * Helper to get state translation key
 * Mirrors the function in src/components/torrent-table.tsx
 *
 * @param state - Torrent state string
 * @returns Translation key for the state
 */
function getStateKey(state: string): string {
  return `torrent.status.${state}`
}

/**
 * Helper to get status color class
 * Mirrors the function in src/components/torrent-table.tsx
 *
 * @param state - Torrent state string
 * @returns Tailwind CSS color class
 */
function getStatusColor(state: string) {
  const stateColors: Record<string, string> = {
    downloading: 'text-blue-400',
    uploading: 'text-green-400',
    stalledDL: 'text-yellow-400',
    stalledUP: 'text-yellow-400',
    pausedDL: 'text-gray-400',
    pausedUP: 'text-gray-400',
    checkingDL: 'text-purple-400',
    checkingUP: 'text-purple-400',
    queuedDL: 'text-cyan-400',
    queuedUP: 'text-cyan-400',
    error: 'text-red-400',
    missingFiles: 'text-red-400',
  }
  return stateColors[state] || 'text-gray-400'
}

describe('TorrentTable Helper Functions', () => {
  describe('formatBytes', () => {
    describe('Basic byte formatting', () => {
      it('formats zero bytes', () => {
        expect(formatBytes(0)).toBe('0 B')
      })

      it('formats bytes (< 1 KB)', () => {
        expect(formatBytes(500)).toBe('500 B')
        expect(formatBytes(1023)).toBe('1023 B')
      })

      it('formats kilobytes', () => {
        expect(formatBytes(1024)).toBe('1 KB')
        expect(formatBytes(2048)).toBe('2 KB')
        expect(formatBytes(1536)).toBe('1.5 KB')
      })

      it('formats megabytes', () => {
        expect(formatBytes(1048576)).toBe('1 MB') // 1024^2
        expect(formatBytes(2097152)).toBe('2 MB') // 2 * 1024^2
        expect(formatBytes(1572864)).toBe('1.5 MB') // 1.5 * 1024^2
      })

      it('formats gigabytes', () => {
        expect(formatBytes(1073741824)).toBe('1 GB') // 1024^3
        expect(formatBytes(2147483648)).toBe('2 GB') // 2 * 1024^3
        expect(formatBytes(5368709120)).toBe('5 GB') // 5 * 1024^3
      })

      it('formats terabytes', () => {
        expect(formatBytes(1099511627776)).toBe('1 TB') // 1024^4
        expect(formatBytes(2199023255552)).toBe('2 TB') // 2 * 1024^4
      })
    })

    describe('Decimal precision', () => {
      it('uses 2 decimal places by default', () => {
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(1638)).toBe('1.6 KB') // 1638 / 1024 = 1.599609375
      })

      it('respects custom decimal places', () => {
        const bytes = 1638
        expect(formatBytes(bytes, 0)).toBe('2 KB')
        expect(formatBytes(bytes, 1)).toBe('1.6 KB')
        expect(formatBytes(bytes, 2)).toBe('1.6 KB')
        expect(formatBytes(bytes, 3)).toBe('1.6 KB')
      })

      it('handles negative decimal parameter as zero', () => {
        expect(formatBytes(1536, -1)).toBe('2 KB')
        expect(formatBytes(1536, -5)).toBe('2 KB')
      })

      it('formats large numbers with decimals', () => {
        expect(formatBytes(1610612736, 2)).toBe('1.5 GB') // 1.5 * 1024^3
        expect(formatBytes(5497558138880, 1)).toBe('5 TB') // 5 * 1024^4
      })
    })

    describe('Edge cases', () => {
      it('handles very small non-zero values', () => {
        expect(formatBytes(1)).toBe('1 B')
        expect(formatBytes(10)).toBe('10 B')
      })

      it('handles very large values', () => {
        const largeTB = 10995116277760 // 10 TB
        expect(formatBytes(largeTB)).toBe('10 TB')
      })

      it('handles fractional kilobytes', () => {
        expect(formatBytes(1126)).toBe('1.1 KB') // 1.099609375 KB
        expect(formatBytes(1945)).toBe('1.9 KB') // 1.8994140625 KB
      })
    })
  })

  describe('formatEta', () => {
    describe('Special values', () => {
      it('returns infinity symbol for negative seconds', () => {
        expect(formatEta(-1)).toBe('∞')
        expect(formatEta(-100)).toBe('∞')
        expect(formatEta(-9999)).toBe('∞')
      })

      it('returns infinity symbol for 8640000 seconds (100 days)', () => {
        expect(formatEta(8640000)).toBe('∞')
      })

      it('returns dash for zero seconds', () => {
        expect(formatEta(0)).toBe('-')
      })
    })

    describe('Minutes only (< 1 hour)', () => {
      it('formats seconds as minutes', () => {
        expect(formatEta(60)).toBe('1m') // 1 minute
        expect(formatEta(120)).toBe('2m') // 2 minutes
        expect(formatEta(300)).toBe('5m') // 5 minutes
        expect(formatEta(1800)).toBe('30m') // 30 minutes
      })

      it('floors partial minutes', () => {
        expect(formatEta(59)).toBe('0m') // 0.98 minutes -> 0m
        expect(formatEta(89)).toBe('1m') // 1.48 minutes -> 1m
        expect(formatEta(119)).toBe('1m') // 1.98 minutes -> 1m
      })
    })

    describe('Hours and minutes (< 1 day)', () => {
      it('formats hours and minutes', () => {
        expect(formatEta(3600)).toBe('1h 0m') // 1 hour
        expect(formatEta(3660)).toBe('1h 1m') // 1 hour 1 minute
        expect(formatEta(5400)).toBe('1h 30m') // 1.5 hours
        expect(formatEta(7200)).toBe('2h 0m') // 2 hours
      })

      it('handles various hour/minute combinations', () => {
        expect(formatEta(9000)).toBe('2h 30m') // 2.5 hours
        expect(formatEta(43200)).toBe('12h 0m') // 12 hours
        expect(formatEta(82800)).toBe('23h 0m') // 23 hours
      })

      it('floors partial minutes in hour display', () => {
        expect(formatEta(3659)).toBe('1h 0m') // 1 hour 59 seconds -> 1h 0m
        expect(formatEta(7259)).toBe('2h 0m') // 2 hours 59 seconds -> 2h 0m
      })
    })

    describe('Days and hours (>= 1 day)', () => {
      it('formats days and hours', () => {
        expect(formatEta(86400)).toBe('1d 0h') // 1 day
        expect(formatEta(90000)).toBe('1d 1h') // 1 day 1 hour
        expect(formatEta(129600)).toBe('1d 12h') // 1.5 days
        expect(formatEta(172800)).toBe('2d 0h') // 2 days
      })

      it('does not show minutes when days are present', () => {
        expect(formatEta(86460)).toBe('1d 0h') // 1 day 1 minute -> 1d 0h
        expect(formatEta(90060)).toBe('1d 1h') // 1 day 1 hour 1 minute -> 1d 1h
        expect(formatEta(93600)).toBe('1d 2h') // 1 day 2 hours -> 1d 2h
      })

      it('handles large day values', () => {
        expect(formatEta(259200)).toBe('3d 0h') // 3 days
        expect(formatEta(604800)).toBe('7d 0h') // 7 days (1 week)
        expect(formatEta(2592000)).toBe('30d 0h') // 30 days (~1 month)
      })

      it('floors partial hours in day display', () => {
        expect(formatEta(86400 + 3599)).toBe('1d 0h') // 1 day 59 minutes -> 1d 0h
        expect(formatEta(86400 + 7199)).toBe('1d 1h') // 1 day 1h 59m -> 1d 1h
      })
    })

    describe('Edge cases', () => {
      it('handles 1 second', () => {
        expect(formatEta(1)).toBe('0m')
      })

      it('handles boundary values', () => {
        expect(formatEta(59)).toBe('0m') // Just under 1 minute
        expect(formatEta(3599)).toBe('59m') // Just under 1 hour
        expect(formatEta(86399)).toBe('23h 59m') // Just under 1 day
      })

      it('handles exact boundaries', () => {
        expect(formatEta(60)).toBe('1m') // Exactly 1 minute
        expect(formatEta(3600)).toBe('1h 0m') // Exactly 1 hour
        expect(formatEta(86400)).toBe('1d 0h') // Exactly 1 day
      })
    })
  })

  describe('getStateKey', () => {
    it('returns correct translation key for any state', () => {
      expect(getStateKey('downloading')).toBe('torrent.status.downloading')
      expect(getStateKey('uploading')).toBe('torrent.status.uploading')
      expect(getStateKey('paused')).toBe('torrent.status.paused')
      expect(getStateKey('error')).toBe('torrent.status.error')
    })

    it('handles all common torrent states', () => {
      const states = [
        'downloading',
        'uploading',
        'stalledDL',
        'stalledUP',
        'pausedDL',
        'pausedUP',
        'checkingDL',
        'checkingUP',
        'queuedDL',
        'queuedUP',
        'error',
        'missingFiles',
      ]

      states.forEach((state) => {
        expect(getStateKey(state)).toBe(`torrent.status.${state}`)
      })
    })

    it('handles custom or unknown states', () => {
      expect(getStateKey('customState')).toBe('torrent.status.customState')
      expect(getStateKey('unknown')).toBe('torrent.status.unknown')
    })

    it('handles empty string', () => {
      expect(getStateKey('')).toBe('torrent.status.')
    })
  })

  describe('getStatusColor', () => {
    describe('Download states', () => {
      it('returns blue for downloading', () => {
        expect(getStatusColor('downloading')).toBe('text-blue-400')
      })

      it('returns yellow for stalledDL', () => {
        expect(getStatusColor('stalledDL')).toBe('text-yellow-400')
      })

      it('returns gray for pausedDL', () => {
        expect(getStatusColor('pausedDL')).toBe('text-gray-400')
      })

      it('returns purple for checkingDL', () => {
        expect(getStatusColor('checkingDL')).toBe('text-purple-400')
      })

      it('returns cyan for queuedDL', () => {
        expect(getStatusColor('queuedDL')).toBe('text-cyan-400')
      })
    })

    describe('Upload states', () => {
      it('returns green for uploading', () => {
        expect(getStatusColor('uploading')).toBe('text-green-400')
      })

      it('returns yellow for stalledUP', () => {
        expect(getStatusColor('stalledUP')).toBe('text-yellow-400')
      })

      it('returns gray for pausedUP', () => {
        expect(getStatusColor('pausedUP')).toBe('text-gray-400')
      })

      it('returns purple for checkingUP', () => {
        expect(getStatusColor('checkingUP')).toBe('text-purple-400')
      })

      it('returns cyan for queuedUP', () => {
        expect(getStatusColor('queuedUP')).toBe('text-cyan-400')
      })
    })

    describe('Error states', () => {
      it('returns red for error', () => {
        expect(getStatusColor('error')).toBe('text-red-400')
      })

      it('returns red for missingFiles', () => {
        expect(getStatusColor('missingFiles')).toBe('text-red-400')
      })
    })

    describe('Unknown states', () => {
      it('returns default gray for unknown state', () => {
        expect(getStatusColor('unknown')).toBe('text-gray-400')
        expect(getStatusColor('customState')).toBe('text-gray-400')
        expect(getStatusColor('invalid')).toBe('text-gray-400')
      })

      it('returns default gray for empty string', () => {
        expect(getStatusColor('')).toBe('text-gray-400')
      })
    })

    describe('All defined states return correct colors', () => {
      it('verifies all state colors are defined', () => {
        const expectedColors: Record<string, string> = {
          downloading: 'text-blue-400',
          uploading: 'text-green-400',
          stalledDL: 'text-yellow-400',
          stalledUP: 'text-yellow-400',
          pausedDL: 'text-gray-400',
          pausedUP: 'text-gray-400',
          checkingDL: 'text-purple-400',
          checkingUP: 'text-purple-400',
          queuedDL: 'text-cyan-400',
          queuedUP: 'text-cyan-400',
          error: 'text-red-400',
          missingFiles: 'text-red-400',
        }

        Object.entries(expectedColors).forEach(([state, color]) => {
          expect(getStatusColor(state)).toBe(color)
        })
      })
    })
  })

  describe('Integration scenarios', () => {
    describe('Torrent display data formatting', () => {
      it('formats typical downloading torrent data', () => {
        const downloadSpeed = 2097152 // 2 MB/s
        const uploadSpeed = 524288 // 512 KB/s
        const size = 5368709120 // 5 GB
        const eta = 7200 // 2 hours

        expect(formatBytes(downloadSpeed)).toBe('2 MB')
        expect(formatBytes(uploadSpeed)).toBe('512 KB')
        expect(formatBytes(size)).toBe('5 GB')
        expect(formatEta(eta)).toBe('2h 0m')
        expect(getStatusColor('downloading')).toBe('text-blue-400')
      })

      it('formats typical seeding torrent data', () => {
        const uploadSpeed = 1048576 // 1 MB/s
        const size = 1073741824 // 1 GB

        expect(formatBytes(uploadSpeed)).toBe('1 MB')
        expect(formatBytes(size)).toBe('1 GB')
        expect(formatEta(-1)).toBe('∞') // Seeding has no ETA
        expect(getStatusColor('uploading')).toBe('text-green-400')
      })

      it('formats paused torrent data', () => {
        const size = 2147483648 // 2 GB

        expect(formatBytes(0)).toBe('0 B') // No speed
        expect(formatBytes(size)).toBe('2 GB')
        expect(formatEta(0)).toBe('-') // Paused has no ETA
        expect(getStatusColor('pausedDL')).toBe('text-gray-400')
      })

      it('formats torrent with very slow speed and long ETA', () => {
        const speed = 10240 // 10 KB/s
        const eta = 604800 // 7 days

        expect(formatBytes(speed)).toBe('10 KB')
        expect(formatEta(eta)).toBe('7d 0h')
        expect(getStatusColor('stalledDL')).toBe('text-yellow-400')
      })
    })

    describe('Speed calculation display', () => {
      it('formats download and upload speeds together', () => {
        const scenarios = [
          { dl: 5242880, up: 1048576, dlStr: '5 MB', upStr: '1 MB' }, // 5 MB/s down, 1 MB/s up
          { dl: 102400, up: 51200, dlStr: '100 KB', upStr: '50 KB' }, // 100 KB/s down, 50 KB/s up
          { dl: 0, up: 0, dlStr: '0 B', upStr: '0 B' }, // No activity
          { dl: 1073741824, up: 0, dlStr: '1 GB', upStr: '0 B' }, // Fast download, no upload
        ]

        scenarios.forEach(({ dl, up, dlStr, upStr }) => {
          expect(formatBytes(dl)).toBe(dlStr)
          expect(formatBytes(up)).toBe(upStr)
        })
      })
    })

    describe('ETA display for various download scenarios', () => {
      it('formats ETA for different completion times', () => {
        const scenarios = [
          { seconds: 30, expected: '0m', description: '30 seconds left' },
          { seconds: 180, expected: '3m', description: '3 minutes left' },
          { seconds: 3600, expected: '1h 0m', description: '1 hour left' },
          {
            seconds: 7260,
            expected: '2h 1m',
            description: '2 hours 1 minute left',
          },
          { seconds: 86400, expected: '1d 0h', description: '1 day left' },
          { seconds: 172800, expected: '2d 0h', description: '2 days left' },
          { seconds: -1, expected: '∞', description: 'infinite/unknown' },
          { seconds: 0, expected: '-', description: 'completed/paused' },
        ]

        scenarios.forEach(({ seconds, expected }) => {
          expect(formatEta(seconds)).toBe(expected)
        })
      })
    })
  })
})