// The bookings made in this browser, newest first. The backend's full booking list is staff-only
// (SEC-1), so "My bookings" shows only what was booked here, reading each one by its reference.
// SEC-2 replaces the bare reference with an opaque id plus a manage token, stored the same way.

const KEY = 'myBookings'

export function rememberedBookings(): string[] {
  try {
    const ids: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return [] // storage blocked or the value is corrupt
  }
}

function save(ids: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(ids))
  } catch {
    // storage blocked (private window): the booking still exists, it just won't be listed here
  }
}

export function rememberBooking(bookingId: string) {
  save([bookingId, ...rememberedBookings().filter((id) => id !== bookingId)])
}

export function forgetBooking(bookingId: string) {
  save(rememberedBookings().filter((id) => id !== bookingId))
}
