import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { BookingView, FoundHotel, PreBookingResponse, Provider, RoomOffer } from '../types'
import { IconCheck, IconClose, IconSpinner } from '../icons'

export interface SearchContext {
  provider: Provider
  searchSessionId: string
  currency: string
  arrivalDate: string
  departureDate: string
  countryCode: string
  city: string
  cityName: string
  guestNationality: string
  adults: number
  children: number
}

type Phase = 'prebooking' | 'review' | 'booking' | 'done' | 'error'

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

const money = (v: string, currency: string) =>
  `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function offerFrom(hotel: FoundHotel): RoomOffer {
  const r = hotel.roomDetails[0]
  return {
    type: r.type,
    bookingKey: r.bookingKey,
    adults: r.adults,
    children: r.children,
    childrenAges: r.childrenAges,
    totalRooms: r.totalRooms,
    totalRate: r.totalRate,
  }
}

export default function BookHotelDialog({
  hotel,
  ctx,
  onClose,
  onBooked,
}: {
  hotel: FoundHotel
  ctx: SearchContext
  onClose: () => void
  onBooked: () => void
}) {
  const [phase, setPhase] = useState<Phase>('prebooking')
  const [error, setError] = useState<string | null>(null)
  const [prebook, setPrebook] = useState<PreBookingResponse | null>(null)
  const [confirmed, setConfirmed] = useState<BookingView | null>(null)

  const [salutation, setSalutation] = useState('Mr')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')

  const offer = offerFrom(hotel)

  useEffect(() => {
    let active = true
    api
      .prebook(
        {
          searchSessionId: ctx.searchSessionId,
          arrivalDate: ctx.arrivalDate,
          departureDate: ctx.departureDate,
          guestNationality: ctx.guestNationality,
          countryCode: ctx.countryCode,
          city: ctx.city,
          hotelId: hotel.id,
          currency: ctx.currency,
          rooms: [offer],
        },
        ctx.provider,
      )
      .then((res) => {
        if (!active) return
        setPrebook(res)
        setPhase('review')
      })
      .catch((e) => {
        if (!active) return
        setError(e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e))
        setPhase('error')
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshedKey =
    prebook?.preBookingRequest?.preBooking?.roomDetails?.[0]?.bookingKey ?? offer.bookingKey
  const policy = prebook?.preBookingRequest?.preBooking?.cancellationInformations
  const details = prebook?.preBookingDetails

  async function confirmBooking() {
    setError(null)
    setPhase('booking')
    try {
      const view = await api.book(
        {
          searchSessionId: ctx.searchSessionId,
          arrivalDate: ctx.arrivalDate,
          departureDate: ctx.departureDate,
          guestNationality: ctx.guestNationality,
          countryCode: ctx.countryCode,
          city: ctx.city,
          hotelId: hotel.id,
          hotelName: hotel.name,
          currency: ctx.currency,
          rooms: [{ ...offer, bookingKey: refreshedKey, guests: [{ salutation, firstName, lastName, isChild: false }] }],
        },
        ctx.provider,
      )
      setConfirmed(view)
      setPhase('done')
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e))
      setPhase('error')
    }
  }

  const canConfirm = firstName.trim() && lastName.trim() && phase === 'review'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hero" style={{ backgroundImage: bannerFor(hotel.name) }}>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
          <h3>{hotel.name}</h3>
          <div className="sub">
            {ctx.cityName} · {ctx.arrivalDate} → {ctx.departureDate}
          </div>
        </div>

        <div className="modal-body">
          {phase === 'prebooking' && (
            <div className="center-state">
              <IconSpinner size={18} /> Confirming latest price…
            </div>
          )}

          {phase === 'error' && (
            <>
              <div className="alert error">{error}</div>
              <div className="modal-actions">
                <button className="btn" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}

          {(phase === 'review' || phase === 'booking') && (
            <>
              <div className="review">
                <div className="review-row">
                  <span>Room</span>
                  <strong>{offer.type}</strong>
                </div>
                <div className="review-row">
                  <span>Guests</span>
                  <strong>
                    {ctx.adults} adult{ctx.adults === 1 ? '' : 's'}
                    {ctx.children ? `, ${ctx.children} child` : ''}
                  </strong>
                </div>
                {details && (
                  <div className="review-row highlight">
                    <span>Total</span>
                    <strong>
                      {money(details.bookingAfterPrice, ctx.currency)}
                      {details.difference && Number(details.difference) !== 0 && (
                        <em className="muted" style={{ fontSize: 12, fontWeight: 500 }}>
                          {' '}
                          was {Number(details.bookingBeforePrice).toFixed(2)}
                        </em>
                      )}
                    </strong>
                  </div>
                )}
              </div>

              {policy && policy.informations.length > 0 && (
                <details className="policy">
                  <summary>Cancellation policy</summary>
                  <ul>
                    {policy.informations.map((p, i) => (
                      <li key={i}>
                        {p.startDate} – {p.endDate}: <strong>{p.chargeAmount}</strong>
                        {p.chargeType === 'Percentage' ? '%' : ` ${p.currency}`}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="guest-form">
                <h4>Lead guest</h4>
                <div className="guest-fields">
                  <select value={salutation} onChange={(e) => setSalutation(e.target.value)}>
                    <option>Mr</option>
                    <option>Mrs</option>
                    <option>Ms</option>
                  </select>
                  <input placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                  <input placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn" onClick={onClose} disabled={phase === 'booking'}>
                  Cancel
                </button>
                <button className="btn primary" onClick={confirmBooking} disabled={!canConfirm}>
                  {phase === 'booking' ? (
                    <>
                      <IconSpinner size={18} /> Booking…
                    </>
                  ) : (
                    'Confirm booking'
                  )}
                </button>
              </div>
            </>
          )}

          {phase === 'done' && confirmed && (
            <>
              <div className="booked-ok">
                <div className="check">
                  <IconCheck size={30} />
                </div>
                <h4>Booking {confirmed.status}</h4>
                <p>
                  Reference <span className="ref-tag">{confirmed.bookingId}</span>
                </p>
                <p className="muted">
                  {confirmed.hotelName} · {money(confirmed.price, confirmed.currency)}
                </p>
              </div>
              <div className="modal-actions">
                <button className="btn primary" onClick={onBooked}>
                  View my bookings
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
