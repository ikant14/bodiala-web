import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ApiError, api } from '../api'
import type { City, CombinedSearchResult, Country, FoundHotel, Provider } from '../types'
import {
  type SearchCriteria,
  criteriaFromParams,
  criteriaKey,
  pageFromParams,
  rememberLastSearch,
  saveDraft,
  saveResults,
  savedDraft,
  savedResults,
  searchOnce,
  toQuery,
  toRequest,
} from '../searchState'
import BookHotelDialog, { type SearchContext } from './BookHotelDialog'
import HotelDetailDialog from './HotelDetailDialog'
import {
  IconBed,
  IconCalendar,
  IconClose,
  IconGlobe,
  IconInfo,
  IconPin,
  IconSearch,
  IconSpinner,
  IconStar,
  IconUsers,
} from '../icons'

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
const PROVIDER_COLOR: Record<Provider, string> = { REZLIVE: '#6366f1', HOTELBEDS: '#0ea5e9' }

function ProviderBadge({ provider }: { provider: Provider }) {
  return (
    <span
      style={{
        background: PROVIDER_COLOR[provider],
        color: '#fff',
        fontSize: 11,
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: 999,
        letterSpacing: 0.2,
      }}
    >
      {PROVIDER_LABEL[provider]}
    </span>
  )
}

const money = (v: string, currency: string) =>
  `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Availability can return many hotels (a busy destination is 50+); render one page at a time so the
// grid stays light.
const PAGE_SIZE = 12

// Restored results older than this get a "Refresh prices" prompt — restoring never searches by itself.
const STALE_AFTER_MS = 30 * 60 * 1000

const errorText = (e: unknown) =>
  e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e)

export default function SearchView({ onBooked }: { onBooked: () => void }) {
  // The URL is the source of truth for the submitted search, the results page and the open hotel, so a
  // refresh, Back/Forward or a pasted link lands on the same view.
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const criteria = useMemo(() => criteriaFromParams(searchParams), [searchParams])
  const key = criteria ? criteriaKey(criteria) : ''
  const page = pageFromParams(searchParams)
  const detailId = searchParams.get('hotel')

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
  const [ratings, setRatings] = useState<number[]>(initial?.stars ?? [])

  const [results, setResults] = useState<CombinedSearchResult | null>(null)
  const [resultsAt, setResultsAt] = useState(0)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<{ hotel: FoundHotel; ctx: SearchContext } | null>(null)
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
    saveDraft({ country, cities: selectedCities, arrival, departure, adults, children, stars: ratings })
  }, [country, selectedCities, arrival, departure, adults, children, ratings])

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
    setRatings(criteria.stars)
    const fresh = freshNext.current
    freshNext.current = false
    loadResults(criteria, fresh)
    // `key` identifies `criteria`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, loadResults])

  // Map a destination code to its display name (falls back to the code). Used for the selected-city
  // chips and to label each result hotel by its own city in a multi-city search.
  const cityNameOf = useMemo(() => {
    const byCode = new Map(cities.map((c) => [c.cityCode, c.name]))
    return (code: string) => byCode.get(code) ?? code
  }, [cities])
  const canSearch = country && selectedCities.length > 0 && arrival && departure && !searching

  // Submitting puts the search in the URL (a new history entry), which loads it — always fresh from the
  // supplier. Re-submitting the search already shown refreshes its prices in place.
  function doSearch() {
    const c: SearchCriteria = {
      country,
      cities: selectedCities,
      arrival,
      departure,
      adults,
      children,
      stars: [...ratings].sort(),
    }
    if (criteria && criteriaKey(c) === key) {
      navigate({ search: toQuery(c) }, { replace: true }) // back to page 1, details closed
      loadResults(c, true)
    } else {
      freshNext.current = true
      navigate({ search: toQuery(c) })
    }
  }

  const goToPage = (p: number) => criteria && navigate({ search: toQuery(criteria, { page: p }) })

  // Details are part of the URL too: Back closes them, a refresh keeps them open.
  const openDetail = (h: FoundHotel) =>
    criteria && navigate({ search: toQuery(criteria, { page, hotel: h.id }) }, { state: { detailFromResults: true } })
  const closeDetail = () => {
    if ((location.state as { detailFromResults?: boolean } | null)?.detailFromResults) navigate(-1)
    else if (criteria) navigate({ search: toQuery(criteria, { page }) }, { replace: true })
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

  const totalHotels = results?.hotels.length ?? 0
  const pageCount = Math.max(1, Math.ceil(totalHotels / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageHotels = results ? results.hotels.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) : []
  const detailHotel = detailId ? results?.hotels.find((h) => h.id === detailId) : undefined
  const stale = results != null && Date.now() - resultsAt > STALE_AFTER_MS

  // Search results only carry photos for hotels already in the cache. For the rest, fetch covers for
  // the cards on the current page only (one batched backend call → at most one Hotelbeds request per
  // page). A hotel is asked for once per session, so revisiting a page never re-spends quota.
  const [covers, setCovers] = useState<Record<string, string>>({})
  const coversRequested = useRef(new Set<string>())
  const coverKey = (h: FoundHotel) => `${h.provider}:${h.id}`
  useEffect(() => {
    const byProvider = new Map<Provider, string[]>()
    for (const h of pageHotels) {
      const key = coverKey(h)
      if (h.image || coversRequested.current.has(key)) continue
      coversRequested.current.add(key)
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
        .catch((e) => console.warn('Could not load hotel photos', e)) // cosmetic: cards keep the placeholder
    })
    // pageHotels is derived from these two.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, safePage])

  // Bring the results back into view when paging through a long list (not on first load: a refresh
  // keeps the browser's own scroll position).
  const pageSeen = useRef(page)
  useEffect(() => {
    if (page === pageSeen.current) return
    pageSeen.current = page
    if (results) resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page])

  return (
    <div className="search-view">
      <div className="hero">
        <h2>
          Find your <span className="grad">next stay</span>
        </h2>
        <p>Pick one or more destinations and dates — availability is fetched live from Hotelbeds.</p>
      </div>

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

        </div>

        <div className="search-extras">
          <span className="filter-label">Star rating</span>
          <div className="star-chips">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`star-chip ${ratings.includes(n) ? 'on' : ''}`}
                onClick={() =>
                  setRatings((rs) => (rs.includes(n) ? rs.filter((x) => x !== n) : [...rs, n]))
                }
              >
                {n} <IconStar size={13} />
              </button>
            ))}
          </div>
        </div>

        <button className="btn navy search-btn" disabled={!canSearch} onClick={doSearch}>
          {searching ? <IconSpinner size={18} /> : <IconSearch size={18} />}
          {searching ? 'Searching…' : 'Search hotels'}
        </button>
      </section>

      {searching && (
        <section className="results">
          <div className="hotel-grid">
            {Array.from({ length: 6 }).map((_, i) => (
              <div className="skeleton-card" key={i}>
                <div className="sk sk-banner" />
                <div className="sk-body">
                  <div className="sk sk-line lg" />
                  <div className="sk sk-line w40" />
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
        <section className="results" ref={resultsRef}>
          <div className="results-head">
            <h2>
              {results.hotels.length} hotel{results.hotels.length === 1 ? '' : 's'} in{' '}
              {criteria.cities.map(cityNameOf).join(', ')}
              {pageCount > 1 && (
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                  {' '}
                  · showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalHotels)}
                </span>
              )}
            </h2>
            <span className="pill">
              <IconCalendar size={13} /> {criteria.arrival} → {criteria.departure}
            </span>
          </div>

          {stale && (
            <div className="alert" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <span>
                Prices from {new Date(resultsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} —
                availability may have changed.
              </span>
              <button className="btn" onClick={() => loadResults(criteria, true)}>
                Refresh prices
              </button>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 16px' }}>
            {results.providerStatus.map((s) => (
              <span
                key={s.provider}
                title={s.error ?? undefined}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  padding: '4px 10px',
                  borderRadius: 999,
                  color: s.ok ? '#fff' : '#b91c1c',
                  background: s.ok ? PROVIDER_COLOR[s.provider] : '#fee2e2',
                }}
              >
                {PROVIDER_LABEL[s.provider]}
                {s.ok ? ` · ${s.hotelCount}` : ` · ${s.error ?? 'error'}`}
              </span>
            ))}
          </div>

          {results.hotels.length === 0 ? (
            <div className="empty">No availability for these dates. Try a different range.</div>
          ) : (
            <>
            <div className="hotel-grid">
              {pageHotels.map((h, idx) => {
                const stars = Math.round(Number(h.rating) || 0)
                const photo = h.image ?? covers[coverKey(h)]
                return (
                  <article className="hotel-card" key={`${h.provider}:${h.id}:${safePage}:${idx}`} style={{ animationDelay: `${idx * 60}ms` }}>
                    <div
                      className="hotel-banner"
                      // The gradient sits under the photo, so a missing/broken image still looks intentional.
                      style={{ backgroundImage: photo ? `url("${photo}"), ${bannerFor(h.name)}` : bannerFor(h.name) }}
                    >
                      {!photo && <span className="initial">{h.name.trim().charAt(0).toUpperCase()}</span>}
                      <span className="rating-chip">
                        <IconStar size={12} /> {stars}.0
                      </span>
                      <span style={{ position: 'absolute', top: 10, left: 10 }}>
                        <ProviderBadge provider={h.provider} />
                      </span>
                    </div>
                    <div className="hotel-body">
                      <div className="hotel-title">
                        <h3>{h.name}</h3>
                        <span className="hotel-loc">
                          <IconPin size={13} /> {cityNameOf(h.city)}
                        </span>
                      </div>
                      <div className="price-row">
                        <span className="price">
                          <span className="cur">{h.currency}</span>
                          {Number(h.price).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </span>
                        <span className="muted">/ stay</span>
                      </div>
                      <ul className="rooms">
                        {h.roomDetails.slice(0, 3).map((r, i) => (
                          <li key={i}>
                            <span className="room-info">
                              <IconBed size={15} />
                              <span className="rt">
                                <strong>{r.type}</strong>
                                <span className="muted" style={{ fontSize: 12 }}>
                                  {r.boardBasis}
                                </span>
                              </span>
                            </span>
                            <span className="room-rate">{money(r.totalRate.split('|')[0], h.currency)}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="card-actions">
                        <button className="btn" onClick={() => openDetail(h)}>
                          <IconInfo size={15} /> Details
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => setBooking({ hotel: h, ctx: ctxFor(h, criteria) })}
                        >
                          Book now
                        </button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
            {pageCount > 1 && (
              <div
                className="pager"
                style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 14, marginTop: 24 }}
              >
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
        </section>
      )}

      {booking && (
        <BookHotelDialog
          hotel={booking.hotel}
          ctx={booking.ctx}
          onClose={() => setBooking(null)}
          onBooked={() => {
            setBooking(null)
            onBooked()
          }}
        />
      )}

      {detailId && (
        <HotelDetailDialog
          key={detailId}
          hotelId={detailId}
          hotelName={detailHotel?.name ?? ''}
          provider={detailHotel?.provider}
          onClose={closeDetail}
        />
      )}
    </div>
  )
}
