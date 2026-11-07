import { useEffect, useState } from 'react'
import { ApiError, api } from '../api'
import type { BookingView } from '../types'
import { IconSpinner } from '../icons'

/** Today's local date as yyyy-MM-dd, comparable with the bookings' arrival dates. */
function localToday(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const money = (v: string, currency: string) =>
  `${currency} ${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function BookingsView() {
  const [bookings, setBookings] = useState<BookingView[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const today = localToday()

  function load() {
    setLoading(true)
    setError(null)
    api
      .listBookings()
      .then(setBookings)
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  async function cancel(bookingId: string) {
    setCancelling(bookingId)
    setError(null)
    try {
      await api.cancel(bookingId)
      load()
    } catch (e) {
      setError(e instanceof ApiError ? `${e.status ? e.status + ' · ' : ''}${e.message}` : String(e))
    } finally {
      setCancelling(null)
    }
  }

  if (loading) {
    return (
      <div className="center-state" style={{ justifyContent: 'center', padding: 48 }}>
        <IconSpinner size={20} /> Loading bookings…
      </div>
    )
  }

  return (
    <div className="bookings-view">
      <div className="hero">
        <h2>
          My <span className="grad">bookings</span>
        </h2>
        <p>Everything you've booked through the demo, with live cancellation.</p>
      </div>

      {error && <div className="alert error">{error}</div>}

      {bookings.length === 0 ? (
        <div className="empty">No bookings yet — search for a hotel and book one.</div>
      ) : (
        <table className="bookings-table">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Hotel</th>
              <th>Stay</th>
              <th>Price</th>
              <th>Status</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((b) => {
              const cancelled = b.status?.toLowerCase() === 'cancelled'
              // A stay that already started can't be cancelled at the supplier; don't offer it.
              const past = b.arrivalDate < today
              return (
                <tr key={b.id} className={cancelled ? 'row-cancelled' : ''}>
                  <td>
                    <span className="mono">{b.bookingId}</span>
                  </td>
                  <td>
                    <strong>{b.hotelName}</strong>
                  </td>
                  <td className="muted">
                    {b.arrivalDate} → {b.departureDate}
                  </td>
                  <td>{money(b.price, b.currency)}</td>
                  <td>
                    <span className={`badge ${cancelled ? 'grey' : 'green'}`}>{b.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {!cancelled && past && <span className="muted">Past stay</span>}
                    {!cancelled && !past && (
                      <button
                        className="btn small danger"
                        disabled={cancelling === b.bookingId}
                        onClick={() => cancel(b.bookingId)}
                      >
                        {cancelling === b.bookingId ? 'Cancelling…' : 'Cancel'}
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
