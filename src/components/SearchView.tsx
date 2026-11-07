import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { City, CombinedSearchResult, Country, FoundHotel, Provider, RoomDetail } from '../types'
import {
  type ResultsView,
  type SearchCriteria,
  type SortKey,
  criteriaFromParams,
  criteriaKey,
  nights,
  rememberLastSearch,
  saveDraft,
  saveResults,
  savedDraft,
  savedResults,
  searchOnce,
  toQuery,
  toRequest,
  viewFromParams,
} from '../searchState'
import { tidy } from '../format'
import BookHotelDialog, { type SearchContext } from './BookHotelDialog'
import HotelDetailDialog from './HotelDetailDialog'
import { IconCalendar, IconClose, IconGlobe, IconPin, IconSearch, IconSpinner, IconStar, IconUsers } from '../icons'

function isoDate(daysFromNow: number): string {
  const d = new Date()
  d.setDate(d.getDate() + daysFromNow)
  return d.toISOString().slice(0, 10)
}

const BANNERS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#fb7185)',
  'linear-gradient(135deg,#10b981,#22d3ee)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#3b82f6,#06b6d4)',
  'linear-gradient(135deg,#8b5cf6,#ec4899)',
  'linear-gradient(135deg,#f43f5e,#f59e0b)',
]

function bannerFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return BANNERS[h % BANNERS.length]
}

const PROVIDER_LABEL: Record<Provider, string> = { REZLIVE: 'RezLive', HOTELBEDS: 'Hotelbeds' }

// Availability can return many hotels (a busy destination is 50+); render one page at a time so the
// list stays light.
const PAGE_SIZE = 12

// Restored results older than this get a "Refresh prices" prompt — restoring never searches by itself.
const STALE_AFTER_MS = 30 * 60 * 1000

const SORT_LABEL: Record<SortKey, string> = {
  top: 'Our top picks',
  price: 'Price (lowest first)',
  'price-desc': 'Price (highest first)',
  stars: 'Property rating (high to low)',
}

const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e)

const roomPrice = (r: RoomDetail) => Number(r.totalRate.split('|')[0])

/** Star rating from the supplier's category ("4", "4EST" …); 0 when unknown. */
const starsOf = (h: FoundHotel) => parseInt(h.rating, 10) || 0

const wholeMoney = (v: number, currency: string) =>
  `${currency} ${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

/** One result row: the hotel and the offer it's shown with — its cheapest room on the chosen meal plans. */
interface Row {
  hotel: FoundHotel
  room: RoomDetail
  price: number
}

function cheapestRoom(h: FoundHotel, meals: string[]): RoomDetail | undefined {
  let best: RoomDetail | undefined
  for (const r of h.roomDetails) {
    if (meals.length && !meals.includes(r.boardBasis)) continue
    if (!best || roomPrice(r) < roomPrice(best)) best = r
  }
  return best
}

/** The sidebar filters and the sort, applied in the browser — never a supplier call. */
function arrange(hotels: FoundHotel[], view: ResultsView): Row[] {
  const rows: Row[] = []
  for (const hotel of hotels) {
    if (view.stars.length && !view.stars.includes(starsOf(hotel))) continue
    const room = cheapestRoom(hotel, view.meals)
    if (room) rows.push({ hotel, room, price: roomPrice(room) })
  }
  switch (view.sort) {
    case 'price':
      return rows.sort((a, b) => a.price - b.price)
    case 'price-desc':
      return rows.sort((a, b) => b.price - a.price)
    case 'stars':
      return rows.sort((a, b) => starsOf(b.hotel) - starsOf(a.hotel) || a.price - b.price)
    default:
      return rows // supplier order
  }
}

/** Filter options, each with how many hotels in the results have it. */
function facets(hotels: FoundHotel[]) {
  const stars = new Map<number, number>()
  const meals = new Map<string, number>()
  for (const h of hotels) {
    const s = starsOf(h)
    if (s) stars.set(s, (stars.get(s) ?? 0) + 1)
    for (const m of new Set(h.roomDetails.map((r) => r.boardBasis).filter(Boolean))) {
      meals.set(m, (meals.get(m) ?? 0) + 1)
    }
  }
  return {
    stars: [5, 4, 3, 2, 1].filter((s) => stars.has(s)).map((s) => ({ value: s, count: stars.get(s)! })),
    meals: [...meals.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, count: n })),
  }
}

const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export default function SearchView({ onBooked }: { onBooked: () => void }) {
  // The URL is the source of truth for the submitted search and how its results are shown (filters,
  // sort, page, open hotel), so a refresh, Back/Forward or a pasted link lands on the same view.
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const criteria = useMemo(() => criteriaFromParams(searchParams), [searchParams])
  const view = useMemo(() => viewFromParams(searchParams), [searchParams])
  const key = criteria ? criteriaKey(criteria) : ''

  // The form is a draft: it starts from the URL's search (or the last unsubmitted draft in this tab).
  const [initial] = useState(() => criteria ?? savedDraft())
  const [countries, setCountries] = useState<Country[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [country, setCountry] = useState(initial?.country ?? '')
  const [selectedCities, setSelectedCities] = useState<string[]>(initial?.cities ?? [])
  const [arrival, setArrival] = useState(initial?.arrival ?? isoDate(7))
  const [departure, setDeparture] = useState(initial?.departure ?? isoDate(8))
  const [adults, setAdults] = useState(initial?.adults ?? 2)
  const [children, setChildren] = useState(initial?.children ?? 0)

  const [results, setResults] = useState<CombinedSearchResult | null>(null)
  const [resultsAt, setResultsAt] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<{ hotel: FoundHotel; room: RoomDetail; ctx: SearchContext } | null>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const searchSeq = useRef(0) // ignores a response once a newer search has started
  const freshNext = useRef(false) // the next URL-driven load is a user search: skip saved results

  useEffect(() => {
    api.countries()
      .then(setCountries)
      .catch((e: ApiError) => setError(e.message))
  }, [])

  useEffect(() => {
    setCities([])
    if (!country) return
    api.cities(country)
      .then(setCities)
      .catch((e: ApiError) => setError(e.message))
  }, [country])

  useEffect(() => {
    saveDraft({ country, cities: selectedCities, arrival, departure, adults, children })
  }, [country, selectedCities, arrival, departure, adults, children])

  useEffect(() => rememberLastSearch(location.search), [location.search])

  // Show a search's results: the ones saved in this tab when there are any (refresh, Back, Search tab —
  // no supplier quota spent), otherwise run it.
  const loadResults = useCallback(async (c: SearchCriteria, fresh: boolean) => {
    const k = criteriaKey(c)
    const saved = fresh ? null : savedResults(k)
    const seq = ++searchSeq.current
    setError(null)
    if (saved) {
      setResults(saved.results)
      setResultsAt(saved.savedAt)
      setSearching(false)
      return
    }
    setResults(null)
    setSearching(true)
    try {
      const res = await searchOnce(k, () => api.searchByDestination(toRequest(c)))
      if (seq !== searchSeq.current) return
      saveResults(k, res)
      setResults(res)
      setResultsAt(Date.now())
    } catch (e) {
      if (seq === searchSeq.current) setError(errorText(e))
    } finally {
      if (seq === searchSeq.current) setSearching(false)
    }
  }, [])

  // Whenever the URL's search changes (new search, Back/Forward, refresh) load it and mirror it in the form.
  useEffect(() => {
    if (!criteria) {
      searchSeq.current++
      setResults(null)
      setSearching(false)
      return
    }
    setCountry(criteria.country)
    setSelectedCities(criteria.cities)
    setArrival(criteria.arrival)
    setDeparture(criteria.departure)
    setAdults(criteria.adults)
    setChildren(criteria.children)
    const fresh = freshNext.current
    freshNext.current = false
    loadResults(criteria, fresh)
    // `key` identifies `criteria`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadResults])

  // Map a destination code to its display name (falls back to the code).
  const cityNameOf = useMemo(() => {
    const byCode = new Map(cities.map((c) => [c.cityCode, c.name]))
    return (code: string) => byCode.get(code) ?? code
  }, [cities])
  const canSearch = country && selectedCities.length > 0 && arrival && departure && !searching

  // Submitting puts the search in the URL (a new history entry), which loads it — always fresh from the
  // supplier. Re-submitting the search already shown refreshes its prices in place. Sort and star filter
  // carry over; meal plans differ per destination, so that filter resets.
  function doSearch() {
    const c: SearchCriteria = { country, cities: selectedCities, arrival, departure, adults, children }
    const keep = { stars: view.stars, sort: view.sort }
    if (criteria && criteriaKey(c) === key) {
      navigate({ search: toQuery(c, keep) }, { replace: true })
      loadResults(c, true)
    } else {
      freshNext.current = true
      navigate({ search: toQuery(c, keep) })
    }
  }

  // Filters and sort replace the current history entry (Back leaves the results rather than undoing a
  // checkbox) and start again from page 1.
  const updateView = (patch: Partial<ResultsView>) =>
    criteria && navigate({ search: toQuery(criteria, { ...view, hotel: undefined, page: 0, ...patch }) }, { replace: true })

  const goToPage = (p: number) =>
    criteria && navigate({ search: toQuery(criteria, { ...view, hotel: undefined, page: p }) })

  // Details are part of the URL too: Back closes them, a refresh keeps them open.
  const openDetail = (h: FoundHotel) =>
    criteria &&
    navigate({ search: toQuery(criteria, { ...view, hotel: h.id }) }, { state: { detailFromResults: true } })
  const closeDetail = () => {
    if ((location.state as { detailFromResults?: boolean } | null)?.detailFromResults) navigate(-1)
    else if (criteria) navigate({ search: toQuery(criteria, { ...view, hotel: undefined }) }, { replace: true })
  }

  // Booking context is built per hotel: each carries its own supplier + session + currency, so the
  // prebook/book routes back to the supplier that returned it. Dates/guests come from the search that
  // produced the results, not from the (possibly edited) form.
  const ctxFor = (h: FoundHotel, c: SearchCriteria): SearchContext => ({
    provider: h.provider,
    searchSessionId: h.searchSessionId,
    currency: h.currency,
    arrivalDate: c.arrival,
    departureDate: c.departure,
    countryCode: c.country,
    city: h.city, // each hotel books against its own city (results can span several)
    cityName: cityNameOf(h.city),
    guestNationality: c.country,
    adults: c.adults,
    children: c.children,
  })

  const rows = useMemo(() => (results ? arrange(results.hotels, view) : []), [results, view])
  const options = useMemo(() => (results ? facets(results.hotels) : { stars: [], meals: [] }), [results])
  const totalHotels = rows.length
  const pageCount = Math.max(1, Math.ceil(totalHotels / PAGE_SIZE))
  const safePage = Math.min(view.page, pageCount - 1)
  const pageRows = rows.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const detailHotel = view.hotel ? results?.hotels.find((h) => h.id === view.hotel) : undefined
  const stale = results != null && Date.now() - resultsAt > STALE_AFTER_MS
  const filtered = view.stars.length > 0 || view.meals.length > 0
  const stay = criteria
    ? [
        count(nights(criteria.arrival, criteria.departure), 'night', 'nights'),
        count(criteria.adults, 'adult', 'adults'),
        ...(criteria.children ? [count(criteria.children, 'child', 'children')] : []),
      ].join(', ')
    : ''

  // Search results only carry photos for hotels already in the cache. For the rest, fetch covers for
  // the rows on the current page only (one batched backend call → at most one Hotelbeds request per
  // page). A hotel is asked for once per session, so revisiting a page never re-spends quota.
  const [covers, setCovers] = useState<Record<string, string>>({})
  const coversRequested = useRef(new Set<string>())
  const coverKey = (h: FoundHotel) => `${h.provider}:${h.id}`
  const pageKey = pageRows.map((r) => coverKey(r.hotel)).join('|')
  useEffect(() => {
    const byProvider = new Map<Provider, string[]>()
    for (const { hotel: h } of pageRows) {
      const k = coverKey(h)
      if (h.image || coversRequested.current.has(k)) continue
      coversRequested.current.add(k)
      byProvider.set(h.provider, [...(byProvider.get(h.provider) ?? []), h.id])
    }
    byProvider.forEach((ids, provider) => {
      api
        .hotelCovers(ids, provider)
        .then((found) =>
          setCovers((prev) => {
            const next = { ...prev }
            for (const [id, url] of Object.entries(found)) next[`${provider}:${id}`] = url
            return next
          }),
        )
        .catch((e) => console.warn('Could not load hotel photos', e)) // cosmetic: rows keep the placeholder
    })
    // pageKey identifies pageRows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageKey])

  // Bring the results back into view when paging through a long list (not on first load: a refresh
  // keeps the browser's own scroll position).
  const pageSeen = useRef(view.page)
  useEffect(() => {
    if (view.page === pageSeen.current) return
    pageSeen.current = view.page
    if (results) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.page])

  const failed = results?.providerStatus.filter((s) => !s.ok) ?? []

  return (
    <div className="search-view">
      {!criteria && (
        <div className="hero">
          <h2>
            Find your <span className="grad">next stay</span>
          </h2>
          <p>Pick one or more destinations and dates — availability is fetched live from Hotelbeds.</p>
        </div>
      )}

      <section className="panel search-card">
        <div className="search-form">
          <div className="field">
            <label>
              <IconGlobe size={14} /> Country
            </label>
            <select
              value={country}
              onChange={(e) => {
                setCountry(e.target.value)
                setSelectedCities([]) // cities belong to the previous country
              }}
            >
              <option value="">Select a country…</option>
              {countries.map((c) => (
                <option key={c.countryCode} value={c.countryCode}>
                  {c.name} ({c.countryCode})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>
              <IconPin size={14} /> Cities
            </label>
            <select
              value=""
              disabled={!country}
              onChange={(e) => {
                const code = e.target.value
                if (code) setSelectedCities((cs) => (cs.includes(code) ? cs : [...cs, code]))
              }}
            >
              <option value="">
                {country
                  ? selectedCities.length
                    ? 'Add another city…'
                    : 'Select a city…'
                  : 'Pick a country first'}
              </option>
              {cities
                .filter((c) => !selectedCities.includes(c.cityCode))
                .map((c) => (
                  <option key={c.cityCode} value={c.cityCode}>
                    {c.name} ({c.cityCode})
                  </option>
                ))}
            </select>
          </div>

          <div className="field">
            <label>
              <IconCalendar size={14} /> Check-in
            </label>
            <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} />
          </div>
          <div className="field">
            <label>
              <IconCalendar size={14} /> Check-out
            </label>
            <input type="date" value={departure} min={arrival} onChange={(e) => setDeparture(e.target.value)} />
          </div>

          <div className="field">
            <label>
              <IconUsers size={14} /> Adults
            </label>
            <input type="number" min={1} max={8} value={adults} onChange={(e) => setAdults(+e.target.value)} />
          </div>
          <div className="field">
            <label>
              <IconUsers size={14} /> Children
            </label>
            <input type="number" min={0} max={6} value={children} onChange={(e) => setChildren(+e.target.value)} />
          </div>

          <button className="btn navy search-btn" disabled={!canSearch} onClick={doSearch}>
            {searching ? <IconSpinner size={18} /> : <IconSearch size={18} />}
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {selectedCities.length > 0 && (
          <div className="city-chips">
            {selectedCities.map((code) => (
              <button
                key={code}
                type="button"
                className="city-chip"
                title="Remove"
                onClick={() => setSelectedCities((cs) => cs.filter((x) => x !== code))}
              >
                {cityNameOf(code)} <IconClose size={12} />
              </button>
            ))}
          </div>
        )}
      </section>

      {searching && (
        <section className="results">
          <div className="hotel-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="hotel-row skeleton-row" key={i}>
                <div className="sk sk-photo" />
                <div className="hotel-main">
                  <div className="sk sk-line lg" />
                  <div className="sk sk-line w40" />
                  <div className="sk sk-line w60" />
                </div>
                <div className="hotel-side">
                  <div className="sk sk-line w60" />
                  <div className="sk sk-btn" />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {error && !searching && <div className="alert error">{error}</div>}

      {results && criteria && !searching && (
        <section className="results results-layout" ref={resultsRef}>
          <aside className="filters">
            <h3>Filter by</h3>
            {options.stars.length > 0 && (
              <div className="filter-group" role="group" aria-label="Property rating">
                <h4>Property rating</h4>
                {options.stars.map(({ value, count: n }) => (
                  <label key={value} className="check">
                    <input
                      type="checkbox"
                      checked={view.stars.includes(value)}
                      onChange={() => updateView({ stars: toggle(view.stars, value) })}
                    />
                    <span>{count(value, 'star', 'stars')}</span>
                    <span className="count">{n}</span>
                  </label>
                ))}
              </div>
            )}
            {options.meals.length > 0 && (
              <div className="filter-group" role="group" aria-label="Meals">
                <h4>Meals</h4>
                {options.meals.map(({ value, count: n }) => (
                  <label key={value} className="check">
                    <input
                      type="checkbox"
                      checked={view.meals.includes(value)}
                      onChange={() => updateView({ meals: toggle(view.meals, value) })}
                    />
                    <span>{tidy(value)}</span>
                    <span className="count">{n}</span>
                  </label>
                ))}
              </div>
            )}
            {filtered && (
              <button className="link-btn" onClick={() => updateView({ stars: [], meals: [] })}>
                Clear filters
              </button>
            )}
          </aside>

          <div className="results-main">
            <div className="results-head">
              <div>
                <h2>
                  {criteria.cities.map(cityNameOf).join(', ')}: {count(totalHotels, 'property', 'properties')} found
                </h2>
                <div className="muted results-sub">
                  {shortDate(criteria.arrival)} – {shortDate(criteria.departure)} · {stay}
                  {filtered && ` · filtered from ${results.hotels.length}`}
                </div>
              </div>
              <label className="sort">
                <span>Sort by</span>
                <select value={view.sort} onChange={(e) => updateView({ sort: e.target.value as SortKey })}>
                  {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABEL[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {stale && (
              <div className="alert" style={{ alignItems: 'center', gap: 12 }}>
                <span>
                  Prices from {new Date(resultsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} —
                  availability may have changed.
                </span>
                <button className="btn small" onClick={() => loadResults(criteria, true)}>
                  Refresh prices
                </button>
              </div>
            )}

            {failed.map((s) => (
              <div className="alert error" key={s.provider}>
                {PROVIDER_LABEL[s.provider]}: {s.error ?? 'search failed'}
              </div>
            ))}

            {rows.length === 0 ? (
              <div className="empty">
                {results.hotels.length
                  ? 'No properties match these filters.'
                  : 'No availability for these dates. Try a different range.'}
              </div>
            ) : (
              <>
                <div className="hotel-list">
                  {pageRows.map(({ hotel: h, room, price }, idx) => {
                    const stars = starsOf(h)
                    const photo = h.image ?? covers[coverKey(h)]
                    const more = h.roomDetails.length - 1
                    return (
                      <article
                        className="hotel-row"
                        key={`${h.provider}:${h.id}`}
                        style={{ animationDelay: `${idx * 40}ms` }}
                      >
                        <button
                          type="button"
                          className="hotel-photo"
                          // The gradient sits under the photo, so a missing/broken image still looks intentional.
                          style={{ backgroundImage: photo ? `url("${photo}"), ${bannerFor(h.name)}` : bannerFor(h.name) }}
                          onClick={() => openDetail(h)}
                          aria-label={`Photos and details of ${h.name}`}
                        >
                          {!photo && <span className="initial">{h.name.trim().charAt(0).toUpperCase()}</span>}
                        </button>

                        <div className="hotel-main">
                          <h3>
                            <button type="button" className="hotel-name" onClick={() => openDetail(h)}>
                              {h.name.trim()}
                            </button>
                            {stars > 0 && (
                              <span className="stars" aria-label={count(stars, 'star', 'stars')}>
                                {Array.from({ length: stars }).map((_, i) => (
                                  <IconStar key={i} size={13} />
                                ))}
                              </span>
                            )}
                          </h3>
                          <div className="hotel-loc">
                            <IconPin size={13} /> {cityNameOf(h.city)}
                          </div>
                          <div className="offer">
                            <strong>{tidy(room.type)}</strong>
                            {room.boardBasis && <span className="board">{tidy(room.boardBasis)}</span>}
                            {more > 0 && <span className="muted">+{count(more, 'more room option', 'more room options')}</span>}
                          </div>
                        </div>

                        <div className="hotel-side">
                          <span className="muted stay">{stay}</span>
                          <span className="price">{wholeMoney(price, h.currency)}</span>
                          <button className="btn primary" onClick={() => openDetail(h)}>
                            See availability
                          </button>
                        </div>
                      </article>
                    )
                  })}
                </div>
                {pageCount > 1 && (
                  <div className="pager">
                    <button className="btn" disabled={safePage === 0} onClick={() => goToPage(safePage - 1)}>
                      ‹ Prev
                    </button>
                    <span className="muted">
                      Page {safePage + 1} of {pageCount}
                    </span>
                    <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => goToPage(safePage + 1)}>
                      Next ›
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      )}

      {booking && (
        <BookHotelDialog
          hotel={booking.hotel}
          room={booking.room}
          ctx={booking.ctx}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null)
            onBooked()
          }}
        />
      )}

      {view.hotel && (
        <HotelDetailDialog
          key={view.hotel}
          hotelId={view.hotel}
          hotelName={detailHotel?.name ?? ''}
          provider={detailHotel?.provider}
          offers={
            detailHotel ? { rooms: detailHotel.roomDetails, currency: detailHotel.currency, stayLabel: stay } : undefined
          }
          onReserve={(room) => {
            if (!detailHotel || !criteria) return
            setBooking({ hotel: detailHotel, room, ctx: ctxFor(detailHotel, criteria) })
            closeDetail()
          }}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
