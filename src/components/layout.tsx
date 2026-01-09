import React from 'react'
import { Toaster } from './ui/toast'

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen bg-gray-900 text-white">
      <main className="h-full">
        {children}
      </main>
      <Toaster />
    </div>
  )
}