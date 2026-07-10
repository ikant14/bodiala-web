import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, api } from '../api'
import type { City, CombinedSearchResult, Country, FoundHotel, Provider } from '../types'
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

export default function SearchView({ onBooked }: { onBooked: () => void }) {
  const [countries, setCountries] = useState<Country[]>([])
  const [cities, setCities] = useState<City[]>([])
  const [country, setCountry] = useState('')
  const [selectedCities, setSelectedCities] = useState<string[]>([])
  const [arrival, setArrival] = useState(isoDate(7))
  const [departure, setDeparture] = useState(isoDate(8))
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [ratings, setRatings] = useState<number[]>([])

  const [results, setResults] = useState<CombinedSearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [booking, setBooking] = useState<{ hotel: FoundHotel; ctx: SearchContext } | null>(null)
  const [detail, setDetail] = useState<{ id: string; name: string; provider: Provider } | null>(null)
  const [page, setPage] = useState(0)
  const resultsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api.countries()
      .then(setCountries)
      .catch((e: ApiError) => setError(e.message))
  }, [])

  useEffect(() => {
    setSelectedCities([])
    setCities([])
    if (!country) return
    api.cities(country)
      .then(setCities)
      .catch((e: ApiError) => setError(e.message))
  }, [country])

  // Map a destination code to its display name (falls back to the code). Used for the selected-city
  // chips and to label each result hotel by its own city in a multi-city search.
  const cityNameOf = useMemo(() => {
    const byCode = new Map(cities.map((c) => [c.cityCode, c.name]))
    return (code: string) => byCode.get(code) ?? code
  }, [cities])
  const canSearch = country && selectedCities.length > 0 && arrival && departure && !searching

  async function doSearch() {
    setError(null)
    setResults(null)
    setSearching(true)
    try {
      const res = await api.searchByDestination({
        arrivalDate: arrival,
        departureDate: departure,
        countryCode: country,
        cities: selectedCities,
        guestNationality: country,
        hotelRatings: ratings.length ? [...ratings].sort() : undefined,
        rooms: [{ type: 'Room-1', noOfAdults: adults, noOfChilds: children }],
      })
      setResults(res)
      setPage(0)
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e))
    } finally {
      setSearching(false)
    }
  }

  // Booking context is built per hotel: each carries its own supplier + session + currency, so the
  // prebook/book routes back to the supplier that returned it.
  const ctxFor = (h: FoundHotel): SearchContext => ({
    provider: h.provider,
    searchSessionId: h.searchSessionId,
    currency: h.currency,
    arrivalDate: arrival,
    departureDate: departure,
    countryCode: country,
    city: h.city, // each hotel books against its own city (results can span several)
    cityName: cityNameOf(h.city),
    guestNationality: country,
    adults,
    children,
  })

  const totalHotels = results?.hotels.length ?? 0
  const pageCount = Math.max(1, Math.ceil(totalHotels / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageHotels = results ? results.hotels.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE) : []

  // Bring the results back into view when paging through a long list.
  useEffect(() => {
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
            <select value={country} onChange={(e) => setCountry(e.target.value)}>
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

      {results && !searching && (
        <section className="results" ref={resultsRef}>
          <div className="results-head">
            <h2>
              {results.hotels.length} hotel{results.hotels.length === 1 ? '' : 's'} in{' '}
              {selectedCities.map(cityNameOf).join(', ')}
              {pageCount > 1 && (
                <span className="muted" style={{ fontSize: 14, fontWeight: 500 }}>
                  {' '}
                  · showing {safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, totalHotels)}
                </span>
              )}
            </h2>
            <span className="pill">
              <IconCalendar size={13} /> {arrival} → {departure}
            </span>
          </div>

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
                return (
                  <article className="hotel-card" key={`${h.provider}:${h.id}:${safePage}:${idx}`} style={{ animationDelay: `${idx * 60}ms` }}>
                    <div className="hotel-banner" style={{ backgroundImage: bannerFor(h.name) }}>
                      <span className="initial">{h.name.trim().charAt(0).toUpperCase()}</span>
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
                        <button className="btn" onClick={() => setDetail({ id: h.id, name: h.name, provider: h.provider })}>
                          <IconInfo size={15} /> Details
                        </button>
                        <button
                          className="btn primary"
                          onClick={() => setBooking({ hotel: h, ctx: ctxFor(h) })}
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
                <button className="btn" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  ‹ Prev
                </button>
                <span className="muted">
                  Page {safePage + 1} of {pageCount}
                </span>
                <button className="btn" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>
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

      {detail && (
        <HotelDetailDialog
          hotelId={detail.id}
          hotelName={detail.name}
          provider={detail.provider}
          onClose={() => setDetail(null)}
        />
      )}
    </div>
  )
}
