import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { HotelView, Provider, RoomDetail } from '../types'
import { IconClose, IconPin, IconSpinner, IconStar } from '../icons'
import RoomRates from './RoomRates'

/** The bookable offers for this hotel from the current search, shown as the availability list. */
export interface RoomOffers {
  rooms: RoomDetail[]
  currency: string
  stayLabel: string // e.g. "1 night, 2 adults"
}

const BANNERS = [
  'linear-gradient(135deg,#6366f1,#8b5cf6)',
  'linear-gradient(135deg,#0ea5e9,#22d3ee)',
  'linear-gradient(135deg,#f59e0b,#fb7185)',
  'linear-gradient(135deg,#10b981,#22d3ee)',
  'linear-gradient(135deg,#ec4899,#8b5cf6)',
  'linear-gradient(135deg,#3b82f6,#06b6d4)',
]
function bannerFor(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return BANNERS[h % BANNERS.length]
}

function amenityList(s: string | null | undefined): string[] {
  if (!s) return []
  return s
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean)
}

export default function HotelDetailDialog({
  hotelId,
  hotelName,
  provider,
  offers,
  onReserve,
  onClose,
}: {
  hotelId: string
  hotelName: string
  provider?: Provider
  offers?: RoomOffers
  onReserve?: (room: RoomDetail) => void
  onClose: () => void
}) {
  const [view, setView] = useState<HotelView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    api
      .hotel(hotelId, provider)
      .then((v) => active && setView(v))
      .catch((e) => active && setError(e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e)))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [hotelId, provider])

  const hotel = view?.hotel
  const rating = Math.round(Number(hotel?.rating) || 0)
  const gallery = (view?.images ?? []).slice(0, 6)
  const propertyAmenities = amenityList(view?.propertyAmenities)
  const roomAmenities = amenityList(view?.roomAmenities)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-hero">
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={18} />
          </button>
          <h3>{hotel?.name ?? hotelName}</h3>
          <div className="sub">Hotel details</div>
        </div>

        <div className="modal-body">
          {loading && (
            <div className="center-state">
              <IconSpinner size={18} /> Loading details…
            </div>
          )}

          {error && <div className="alert error">{error}</div>}

          {hotel && (
            <>
              {gallery.length > 0 && (
                <div className="detail-gallery">
                  {gallery.map((src, i) => (
                    <div
                      key={i}
                      className="detail-img"
                      style={{ backgroundImage: `url("${src}"), ${bannerFor(hotelName + i)}` }}
                    />
                  ))}
                </div>
              )}

              <div className="detail-meta">
                {rating > 0 && (
                  <span className="stars">
                    {Array.from({ length: rating }).map((_, i) => (
                      <IconStar key={i} size={14} />
                    ))}
                  </span>
                )}
                {hotel.hotelAddress && (
                  <>
                    <span className="dot">•</span>
                    <span>
                      <IconPin size={13} /> {hotel.hotelAddress}
                    </span>
                  </>
                )}
              </div>
            </>
          )}

          {offers && offers.rooms.length > 0 && (
            <div className="detail-section">
              <h4>Availability · {offers.stayLabel}</h4>
              <RoomRates rooms={offers.rooms} currency={offers.currency} onBook={(r) => onReserve?.(r)} />
            </div>
          )}

          {hotel && (
            <>

              {hotel.description && (
                <div className="detail-section">
                  <h4>About</h4>
                  <p className="detail-desc">{hotel.description}</p>
                </div>
              )}

              {propertyAmenities.length > 0 && (
                <div className="detail-section">
                  <h4>Property amenities</h4>
                  <div className="chips">
                    {propertyAmenities.map((a) => (
                      <span className="chip" key={a}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {roomAmenities.length > 0 && (
                <div className="detail-section">
                  <h4>Room amenities</h4>
                  <div className="chips">
                    {roomAmenities.map((a) => (
                      <span className="chip" key={a}>
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button className="btn primary" onClick={onClose}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
