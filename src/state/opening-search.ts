// Story 3.6: the search string the app opened on, as typed. The router
// rewrites the address bar with the validated search before any route
// renders (an invalid `sort` or `hash` is dropped), so the `_authed` layout
// would take a link with a bad param for a bare one and override it with
// the remembered category. The router's creator notes the history's own
// location first; the layout reads it when it mounts and then forgets it.

let opening: string | null = null

/** Notes the history's current search, before the router first renders. */
export function noteOpeningSearch(router: {
  history: { location: { search: string } }
}): void {
  opening = router.history.location.search
}

/** The noted search; `null` when none was noted or it was forgotten. */
export function openingSearch(): string | null {
  return opening
}

/** Later mounts of the layout are no opening. */
export function forgetOpeningSearch(): void {
  opening = null
}
