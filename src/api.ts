import type {
  BookRequest,
  BookingView,
  CancellationResponse,
  City,
  CombinedSearchResult,
  Country,
  DestinationSearchRequest,
  Hotel,
  HotelView,
  Page,
  PrebookRequest,
  PreBookingResponse,
  Provider,
} from './types'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, options)
  } catch {
    throw new ApiError(0, 'Cannot reach the backend. Is bodiala running on :8080?')
  }
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) {
    // Spring ProblemDetail uses "detail"; other errors may use "error"/"message".
    const detail = body?.detail || body?.error || body?.message || res.statusText
    throw new ApiError(res.status, detail)
  }
  return body as T
}

const q = (s: string) => encodeURIComponent(s)

export const api = {
  countries: () => request<Country[]>('/api/static-data/countries'),

  cities: (country: string) => request<City[]>(`/api/static-data/cities?country=${q(country)}`),

  hotels: (city: string) => request<Page<Hotel>>(`/api/static-data/hotels?city=${q(city)}&size=200`),

  // On a cache miss the backend can fetch the hotel live from `provider` (e.g. a Hotelbeds
  // availability result that isn't in the bounded catalog import).
  hotel: (hotelCode: string | number, provider?: Provider) =>
    request<HotelView>(`/api/static-data/hotels/${hotelCode}${provider ? `?provider=${q(provider)}` : ''}`),

  // Cover photo per hotel code (codes without one are omitted). With `provider`, hotels not cached
  // yet are fetched live in one batched call — so ask only for the cards actually on screen.
  hotelCovers: (codes: string[], provider?: Provider) =>
    request<Record<string, string>>(
      `/api/static-data/hotel-covers?codes=${codes.map(q).join(',')}${provider ? `&provider=${q(provider)}` : ''}`,
    ),

  searchByDestination: (r: DestinationSearchRequest) =>
    request<CombinedSearchResult>('/api/search/by-destination', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(r),
    }),

  // prebook/book target the supplier that returned the hotel (?provider=), so the booking
  // routes back to the right side with that supplier's session/rate key.
  prebook: (r: PrebookRequest, provider: Provider) =>
    request<PreBookingResponse>(`/api/bookings/prebook?provider=${q(provider)}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(r),
    }),

  book: (r: BookRequest, provider: Provider) =>
    request<BookingView>(`/api/bookings?provider=${q(provider)}`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(r),
    }),

  listBookings: () => request<BookingView[]>('/api/bookings'),

  cancel: (bookingId: string) =>
    request<CancellationResponse>(`/api/bookings/${q(bookingId)}/cancel`, { method: 'POST' }),
}
