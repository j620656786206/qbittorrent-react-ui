import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed/')({ component: Home })

// The title is in the app shell's header; story 1.8 adds the list here.
function Home() {
  return null
}
