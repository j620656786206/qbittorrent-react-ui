import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

// Temporary page until the list screen (story 1.8).
function Home() {
  return (
    <main className="p-page-phone lg:p-page-desktop">
      <h1 className="text-page-title">種子</h1>
    </main>
  )
}
