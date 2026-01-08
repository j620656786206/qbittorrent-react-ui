import '@testing-library/jest-dom'

// Polyfill DragEvent for jsdom
if (typeof DragEvent === 'undefined') {
  class DragEventPolyfill extends Event {
    dataTransfer: DataTransfer | null

    constructor(type: string, eventInitDict?: DragEventInit) {
      super(type, eventInitDict)
      this.dataTransfer = eventInitDict?.dataTransfer || null
    }
  }

  global.DragEvent = DragEventPolyfill as any
}
