import { describe, expect, it } from 'vitest'
import { formatBytes, formatEta } from '../utils'

describe('Utility Functions', () => {
  describe('formatBytes', () => {
    describe('Basic functionality', () => {
      it('formats zero bytes', () => {
        expect(formatBytes(0)).toBe('0 B')
      })

      it('formats bytes (< 1 KB)', () => {
        expect(formatBytes(1)).toBe('1 B')
        expect(formatBytes(512)).toBe('512 B')
        expect(formatBytes(1023)).toBe('1023 B')
      })

      it('formats kilobytes', () => {
        expect(formatBytes(1024)).toBe('1 KB')
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(2048)).toBe('2 KB')
      })

      it('formats megabytes', () => {
        expect(formatBytes(1048576)).toBe('1 MB') // 1024 * 1024
        expect(formatBytes(1572864)).toBe('1.5 MB') // 1.5 * 1024 * 1024
        expect(formatBytes(5242880)).toBe('5 MB') // 5 * 1024 * 1024
      })

      it('formats gigabytes', () => {
        expect(formatBytes(1073741824)).toBe('1 GB') // 1024^3
        expect(formatBytes(1610612736)).toBe('1.5 GB') // 1.5 * 1024^3
        expect(formatBytes(10737418240)).toBe('10 GB') // 10 * 1024^3
      })

      it('formats terabytes', () => {
        expect(formatBytes(1099511627776)).toBe('1 TB') // 1024^4
        expect(formatBytes(1649267441664)).toBe('1.5 TB') // 1.5 * 1024^4
        expect(formatBytes(5497558138880)).toBe('5 TB') // 5 * 1024^4
      })
    })

    describe('Decimal precision', () => {
      it('defaults to 2 decimal places', () => {
        expect(formatBytes(1536)).toBe('1.5 KB')
        expect(formatBytes(1638)).toBe('1.6 KB') // 1638 / 1024 = 1.599609375
      })

      it('formats with 0 decimal places', () => {
        expect(formatBytes(1536, 0)).toBe('2 KB') // Rounds 1.5 to 2
        expect(formatBytes(1024, 0)).toBe('1 KB')
        expect(formatBytes(1638, 0)).toBe('2 KB')
      })

      it('formats with 1 decimal place', () => {
        expect(formatBytes(1536, 1)).toBe('1.5 KB')
        expect(formatBytes(1638, 1)).toBe('1.6 KB')
      })

      it('formats with 3 decimal places', () => {
        expect(formatBytes(1638, 3)).toBe('1.6 KB') // 1.599609375 rounds to 1.6
        expect(formatBytes(1024000, 3)).toBe('1000 KB')
      })

      it('handles negative decimal parameter as 0 decimals', () => {
        expect(formatBytes(1536, -1)).toBe('2 KB')
        expect(formatBytes(1024, -5)).toBe('1 KB')
      })
    })

    describe('Edge cases', () => {
      it('formats very small values', () => {
        expect(formatBytes(1)).toBe('1 B')
        expect(formatBytes(10)).toBe('10 B')
        expect(formatBytes(100)).toBe('100 B')
      })

      it('formats values just below unit thresholds', () => {
        expect(formatBytes(1023)).toBe('1023 B')
        expect(formatBytes(1048575)).toBe('1024 KB') // Just below 1 MB
      })

      it('formats values at exact unit thresholds', () => {
        expect(formatBytes(1024)).toBe('1 KB')
        expect(formatBytes(1048576)).toBe('1 MB')
        expect(formatBytes(1073741824)).toBe('1 GB')
        expect(formatBytes(1099511627776)).toBe('1 TB')
      })

      it('formats very large values (TB range)', () => {
        expect(formatBytes(5497558138880)).toBe('5 TB')
        expect(formatBytes(10995116277760)).toBe('10 TB')
        expect(formatBytes(109951162777600)).toBe('100 TB')
      })

      it('removes trailing zeros from decimal result', () => {
        expect(formatBytes(2048)).toBe('2 KB') // Not "2.00 KB"
        expect(formatBytes(3145728)).toBe('3 MB') // Not "3.00 MB"
      })
    })

    describe('Realistic torrent sizes', () => {
      it('formats movie file sizes', () => {
        expect(formatBytes(1500000000)).toBe('1.4 GB') // ~1.5GB movie
        expect(formatBytes(4700000000)).toBe('4.38 GB') // DVD size
        expect(formatBytes(8000000000)).toBe('7.45 GB') // HD movie
      })

      it('formats TV episode sizes', () => {
        expect(formatBytes(500000000)).toBe('476.84 MB') // ~500MB episode
        expect(formatBytes(1000000000)).toBe('953.67 MB') // ~1GB episode
      })

      it('formats large torrent collections', () => {
        expect(formatBytes(50000000000)).toBe('46.57 GB') // TV season
        expect(formatBytes(500000000000)).toBe('465.66 GB') // Large collection
        expect(formatBytes(2000000000000)).toBe('1.82 TB') // Very large collection
      })
    })
  })

  describe('formatEta', () => {
    describe('Special values', () => {
      it('returns infinity symbol for negative values', () => {
        expect(formatEta(-1)).toBe('∞')
        expect(formatEta(-100)).toBe('∞')
        expect(formatEta(-999999)).toBe('∞')
      })

      it('returns infinity symbol for 8640000 seconds (100 days)', () => {
        expect(formatEta(8640000)).toBe('∞')
      })

      it('returns dash for zero seconds', () => {
        expect(formatEta(0)).toBe('-')
      })
    })

    describe('Minutes only format (< 1 hour)', () => {
      it('formats seconds as minutes', () => {
        expect(formatEta(60)).toBe('1m') // 1 minute
        expect(formatEta(120)).toBe('2m') // 2 minutes
        expect(formatEta(300)).toBe('5m') // 5 minutes
        expect(formatEta(600)).toBe('10m') // 10 minutes
        expect(formatEta(1800)).toBe('30m') // 30 minutes
      })

      it('rounds down seconds to minutes', () => {
        expect(formatEta(59)).toBe('0m') // Less than 1 minute
        expect(formatEta(61)).toBe('1m') // 1 minute + 1 second
        expect(formatEta(119)).toBe('1m') // 1 minute + 59 seconds
        expect(formatEta(179)).toBe('2m') // 2 minutes + 59 seconds
      })

      it('formats values just below 1 hour', () => {
        expect(formatEta(3540)).toBe('59m') // 59 minutes
        expect(formatEta(3599)).toBe('59m') // 59 minutes 59 seconds
      })
    })

    describe('Hours and minutes format (1 hour to < 1 day)', () => {
      it('formats hours and minutes', () => {
        expect(formatEta(3600)).toBe('1h 0m') // 1 hour
        expect(formatEta(3660)).toBe('1h 1m') // 1 hour 1 minute
        expect(formatEta(5400)).toBe('1h 30m') // 1.5 hours
        expect(formatEta(7200)).toBe('2h 0m') // 2 hours
      })

      it('formats mid-range durations', () => {
        expect(formatEta(10800)).toBe('3h 0m') // 3 hours
        expect(formatEta(18000)).toBe('5h 0m') // 5 hours
        expect(formatEta(21600)).toBe('6h 0m') // 6 hours
        expect(formatEta(43200)).toBe('12h 0m') // 12 hours
      })

      it('formats values just below 1 day', () => {
        expect(formatEta(82800)).toBe('23h 0m') // 23 hours
        expect(formatEta(86340)).toBe('23h 59m') // 23 hours 59 minutes
        expect(formatEta(86399)).toBe('23h 59m') // 23 hours 59 minutes 59 seconds
      })

      it('rounds down seconds in hours format', () => {
        expect(formatEta(3601)).toBe('1h 0m') // 1 hour 1 second (rounds down minutes)
        expect(formatEta(3659)).toBe('1h 0m') // 1 hour 59 seconds
        expect(formatEta(7259)).toBe('2h 0m') // 2 hours 59 seconds
      })
    })

    describe('Days and hours format (≥ 1 day)', () => {
      it('formats days and hours', () => {
        expect(formatEta(86400)).toBe('1d 0h') // 1 day
        expect(formatEta(90000)).toBe('1d 1h') // 1 day 1 hour
        expect(formatEta(93600)).toBe('1d 2h') // 1 day 2 hours
        expect(formatEta(172800)).toBe('2d 0h') // 2 days
      })

      it('formats multiple days', () => {
        expect(formatEta(259200)).toBe('3d 0h') // 3 days
        expect(formatEta(432000)).toBe('5d 0h') // 5 days
        expect(formatEta(604800)).toBe('7d 0h') // 1 week
        expect(formatEta(1209600)).toBe('14d 0h') // 2 weeks
      })

      it('formats large durations', () => {
        expect(formatEta(2592000)).toBe('30d 0h') // 30 days
        expect(formatEta(5184000)).toBe('60d 0h') // 60 days
      })

      it('does not show minutes in days format', () => {
        expect(formatEta(86460)).toBe('1d 0h') // 1 day 1 minute (minutes not shown)
        expect(formatEta(90060)).toBe('1d 1h') // 1 day 1 hour 1 minute (minutes not shown)
        expect(formatEta(93659)).toBe('1d 2h') // 1 day 2 hours 59 seconds (only hours shown)
      })

      it('rounds down to hours in days format', () => {
        expect(formatEta(86401)).toBe('1d 0h') // 1 day 1 second
        expect(formatEta(89999)).toBe('1d 0h') // 1 day 3599 seconds (< 1 hour)
        expect(formatEta(90001)).toBe('1d 1h') // 1 day 1 hour 1 second
      })
    })

    describe('Edge cases', () => {
      it('formats 1 second as 0 minutes', () => {
        expect(formatEta(1)).toBe('0m')
        expect(formatEta(30)).toBe('0m')
      })

      it('formats boundary between minutes and hours', () => {
        expect(formatEta(3599)).toBe('59m')
        expect(formatEta(3600)).toBe('1h 0m')
      })

      it('formats boundary between hours and days', () => {
        expect(formatEta(86399)).toBe('23h 59m')
        expect(formatEta(86400)).toBe('1d 0h')
      })

      it('formats values approaching infinity threshold', () => {
        expect(formatEta(8639999)).toBe('99d 23h') // Just below threshold
        expect(formatEta(8640000)).toBe('∞') // At threshold
      })
    })

    describe('Realistic torrent ETAs', () => {
      it('formats quick downloads', () => {
        expect(formatEta(30)).toBe('0m') // 30 seconds
        expect(formatEta(120)).toBe('2m') // 2 minutes
        expect(formatEta(900)).toBe('15m') // 15 minutes
      })

      it('formats medium downloads', () => {
        expect(formatEta(3600)).toBe('1h 0m') // 1 hour
        expect(formatEta(7200)).toBe('2h 0m') // 2 hours
        expect(formatEta(14400)).toBe('4h 0m') // 4 hours
      })

      it('formats slow downloads', () => {
        expect(formatEta(86400)).toBe('1d 0h') // 1 day
        expect(formatEta(259200)).toBe('3d 0h') // 3 days
        expect(formatEta(604800)).toBe('7d 0h') // 1 week
      })

      it('formats very slow downloads', () => {
        expect(formatEta(2592000)).toBe('30d 0h') // 30 days
        expect(formatEta(8639999)).toBe('99d 23h') // Almost infinity
        expect(formatEta(8640000)).toBe('∞') // Infinity (too slow)
      })
    })
  })
})
