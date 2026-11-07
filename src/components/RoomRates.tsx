import type { RoomDetail } from '../types'
import { count, money, tidy } from '../format'

export const roomPrice = (r: RoomDetail) => Number(r.totalRate.split('|')[0])

/**
 * A hotel's bookable offers, grouped the way Hotelbeds shows them: one group per room type (cheapest
 * first), one row per meal plan / rate with its price and a Book button.
 */
export default function RoomRates({
  rooms,
  currency,
  onBook,
}: {
  rooms: RoomDetail[]
  currency: string
  onBook: (room: RoomDetail) => void
}) {
  const groups = new Map<string, RoomDetail[]>()
  for (const r of [...rooms].sort((a, b) => roomPrice(a) - roomPrice(b))) {
    groups.set(r.type, [...(groups.get(r.type) ?? []), r])
  }

  return (
    <div className="room-groups">
      {[...groups.entries()].map(([type, rates]) => {
        const adults = Number(rates[0].adults) || 0
        return (
          <div className="room-group" key={type}>
            <div className="room-group-head">
              <strong>1 x {tidy(type)}</strong>
              {adults > 0 && ` for ${count(adults, 'adult', 'adults')}`}
            </div>
            {rates.map((r, i) => (
              <div className="rate-row" key={`${r.bookingKey}:${i}`}>
                <span className="rate-board">{tidy(r.boardBasis) || 'Room only'}</span>
                <span className="rate-price">{money(roomPrice(r), currency)}</span>
                <button className="btn primary" onClick={() => onBook(r)}>
                  Book
                </button>
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
