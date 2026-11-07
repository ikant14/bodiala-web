// Search state that survives a refresh, Back/Forward and switching pages:
//  - the submitted search (+ results page + open hotel) lives in the URL query string;
//  - its results are kept per tab in sessionStorage, so restoring a search never re-spends supplier quota;
//  - the unsubmitted form draft and the last search URL are kept per tab too.
import type { CombinedSearchResult, DestinationSearchRequest } from './types'

/** A submitted search: everything needed to (re-)run it against the supplier. */
export interface SearchCriteria {
  country: string
  cities: string[]
  arrival: string // yyyy-MM-dd
  departure: string
  adults: number
  children: number
}

export type SortKey = 'top' | 'price' | 'price-desc' | 'stars'
const SORT_KEYS: SortKey[] = ['top', 'price', 'price-desc', 'stars']

/**
 * How the results of a search are shown — filters, sort, page, open hotel. Applied in the browser, so
 * changing any of it never calls the supplier.
 */
export interface ResultsView {
  page: number // 0-based
  hotel?: string // hotel whose details are open
  stars: number[]
  meals: string[] // board basis names, e.g. "BED AND BREAKFAST"
  sort: SortKey
}

const DATE = /^\d{4}-\d{2}-\d{2}$/

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

function int(v: string | null, fallback: number, min: number, max: number): number {
  if (v == null || v === '') return fallback
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

/** The search held in the URL, or null when the URL doesn't hold a complete one. */
export function criteriaFromParams(p: URLSearchParams): SearchCriteria | null {
  const country = p.get('country') ?? ''
  const cities = list(p.get('cities'))
  const arrival = p.get('in') ?? ''
  const departure = p.get('out') ?? ''
  if (!country || cities.length === 0 || !DATE.test(arrival) || !DATE.test(departure)) return null
  return {
    country,
    cities,
    arrival,
    departure,
    adults: int(p.get('adults'), 2, 1, 8),
    children: int(p.get('children'), 0, 0, 6),
  }
}

export function viewFromParams(p: URLSearchParams): ResultsView {
  const sort = p.get('sort') as SortKey | null
  return {
    page: int(p.get('page'), 1, 1, 100_000) - 1,
    hotel: p.get('hotel') || undefined,
    stars: [...new Set(list(p.get('stars')).map(Number))].filter((n) => Number.isInteger(n) && n >= 1 && n <= 5).sort(),
    meals: [...new Set(list(p.get('meal')))],
    sort: sort && SORT_KEYS.includes(sort) ? sort : 'top',
  }
}

// Commas stay literal so lists read naturally in the address bar (…&cities=PMI,BCN).
const enc = (v: string) => encodeURIComponent(v).replace(/%2C/gi, ',')

/** `?…` query string for a search, plus how its results are shown (filters, sort, page, open hotel). */
export function toQuery(c: SearchCriteria, view: Partial<ResultsView> = {}): string {
  const parts: [string, string][] = [
    ['country', c.country],
    ['cities', c.cities.join(',')],
    ['in', c.arrival],
    ['out', c.departure],
    ['adults', String(c.adults)],
    ['children', String(c.children)],
  ]
  if (view.stars?.length) parts.push(['stars', [...view.stars].sort().join(',')])
  if (view.meals?.length) parts.push(['meal', view.meals.join(',')])
  if (view.sort && view.sort !== 'top') parts.push(['sort', view.sort])
  if (view.page && view.page > 0) parts.push(['page', String(view.page + 1)])
  if (view.hotel) parts.push(['hotel', view.hotel])
  return '?' + parts.map(([k, v]) => `${k}=${enc(v)}`).join('&')
}

/** Identity of a search — ignores how its results are shown. */
export const criteriaKey = (c: SearchCriteria) => toQuery(c)

export function toRequest(c: SearchCriteria): DestinationSearchRequest {
  return {
    arrivalDate: c.arrival,
    departureDate: c.departure,
    countryCode: c.country,
    cities: c.cities,
    guestNationality: c.country,
    rooms: [{ type: 'Room-1', noOfAdults: c.adults, noOfChilds: c.children }],
  }
}

/** Nights between two yyyy-MM-dd dates (at least 1). */
export function nights(arrival: string, departure: string): number {
  const ms = Date.parse(departure + 'T00:00:00Z') - Date.parse(arrival + 'T00:00:00Z')
  return Math.max(1, Math.round(ms / 86_400_000))
}

// --- per-tab storage (sessionStorage; every access guarded — it can be full or blocked) ------------

const RESULTS_PREFIX = 'results:'
const RESULTS_KEPT = 5 // newest searches kept, so a long session can't fill the ~5 MB storage quota
const DRAFT_KEY = 'searchDraft'
const LAST_SEARCH_KEY = 'lastSearch'

export interface SavedResults {
  results: CombinedSearchResult
  savedAt: number // epoch ms — shown so restored prices aren't mistaken for live ones
}

function read<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage full or blocked: the state just won't survive a refresh.
  }
}

export const savedResults = (key: string) => read<SavedResults>(RESULTS_PREFIX + key)

export function saveResults(key: string, results: CombinedSearchResult) {
  try {
    const older = Object.keys(sessionStorage)
      .filter((k) => k.startsWith(RESULTS_PREFIX) && k !== RESULTS_PREFIX + key)
      .map((k) => ({ k, at: read<SavedResults>(k)?.savedAt ?? 0 }))
      .sort((a, b) => b.at - a.at)
    older.slice(RESULTS_KEPT - 1).forEach(({ k }) => sessionStorage.removeItem(k))
  } catch {
    // ignore — eviction is best-effort
  }
  write(RESULTS_PREFIX + key, { results, savedAt: Date.now() } satisfies SavedResults)
}

/** The search form as typed, submitted or not — restored when the URL holds no search. */
export const savedDraft = () => read<SearchCriteria>(DRAFT_KEY)
export const saveDraft = (d: SearchCriteria) => write(DRAFT_KEY, d)

/** Where the "Search" tab goes back to: the last search page visited in this tab. */
export const lastSearchHref = () => '/' + (read<string>(LAST_SEARCH_KEY) ?? '')
export const rememberLastSearch = (search: string) => write(LAST_SEARCH_KEY, search)
