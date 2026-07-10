// Types mirroring the bodiala REST API.

export interface Country {
  countryCode: string
  name: string
}

export interface City {
  cityCode: string
  name: string
  countryCode: string
}

export interface Hotel {
  hotelCode: number
  name: string
  cityCode: string
  countryCode: string
  rating: number | null
  hotelAddress: string | null
  hotelPostalCode: string | null
  latitude: number | null
  longitude: number | null
  description: string | null
}

export interface Page<T> {
  content: T[]
  totalElements: number
  totalPages: number
  number: number
  size: number
}

export interface HotelView {
  hotel: Hotel
  images: string[]
  propertyAmenities: string | null
  roomAmenities: string | null
}

// --- live search ---------------------------------------------------------------

export interface RoomRequest {
  type: string
  noOfAdults: number
  noOfChilds: number
  childrenAges?: number[]
}

export interface DestinationSearchRequest {
  arrivalDate: string // yyyy-MM-dd
  departureDate: string
  countryCode: string
  cities: string[] // one or more destination codes; 2+ are searched from the cache in one call
  guestNationality: string
  hotelRatings?: number[]
  rooms: RoomRequest[]
}

export interface RoomDetail {
  type: string
  bookingKey: string
  adults: string
  children: string
  childrenAges: string
  totalRooms: string
  totalRate: string
  roomDescription: string
  boardBasis: string
}

// Provider ids as returned by the backend (uppercase enum names).
export type Provider = 'REZLIVE' | 'HOTELBEDS'

export interface FoundHotel {
  provider: Provider // which supplier returned this hotel
  searchSessionId: string // that supplier's session (needed to prebook/book)
  currency: string // that supplier's currency
  id: string
  name: string
  city: string // destination code this hotel belongs to (for multi-city results)
  rating: string
  price: string
  roomDetails: RoomDetail[]
}

export interface ProviderStatus {
  provider: Provider
  ok: boolean
  error: string | null
  hotelCount: number
}

// Combined search across every supplier: one flat, provider-tagged hotels[] list.
export interface CombinedSearchResult {
  guestNationality: string
  arrivalDate: string
  departureDate: string
  hotels: FoundHotel[]
  providerStatus: ProviderStatus[]
}

// --- booking chain -------------------------------------------------------------

export interface RoomOffer {
  type: string
  bookingKey: string
  adults: string
  children: string
  childrenAges: string
  totalRooms: string
  totalRate: string
}

export interface PrebookRequest {
  searchSessionId: string
  arrivalDate: string
  departureDate: string
  guestNationality: string
  countryCode: string
  city: string
  hotelId: string
  currency: string
  rooms: RoomOffer[]
}

export interface PreBookingResponse {
  preBookingRequest: {
    preBooking: {
      roomDetails: { type: string; bookingKey: string; totalRate: string }[]
      cancellationInformations: {
        informations: { startDate: string; endDate: string; chargeType: string; chargeAmount: string; currency: string }[]
        info: string
      } | null
    }
  } | null
  preBookingDetails: {
    bookingBeforePrice: string
    bookingAfterPrice: string
    difference: string
    agentBalance: string
    agentCurrency: string
  } | null
  error: string | null
}

export interface GuestModel {
  salutation: string
  firstName: string
  lastName: string
  isChild: boolean
  age?: number
}

export interface BookRoom extends RoomOffer {
  guests: GuestModel[]
}

export interface BookRequest {
  searchSessionId: string
  agentRefNo?: string
  arrivalDate: string
  departureDate: string
  guestNationality: string
  countryCode: string
  city: string
  hotelId: string
  hotelName: string
  currency: string
  rooms: BookRoom[]
}

export interface BookingView {
  id: number
  bookingId: string
  bookingCode: string
  agentRefNo: string
  status: string
  hotelId: string
  hotelName: string
  city: string
  countryCode: string
  arrivalDate: string
  departureDate: string
  currency: string
  price: string
  createdAt: string
  cancelledAt: string | null
  cancellationCharges: string | null
}

export interface CancellationResponse {
  bookingId: string
  bookingCode: string
  status: string
  cancellationCharges: string
  currency: string
}
