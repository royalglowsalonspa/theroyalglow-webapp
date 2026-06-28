/************************************************************
 * Author       : KATABATHUNI BOSE
 * Date         : Created - 04-06-2026 & Updated - 04-06-2026
 *
 * Project      : theroyalglow-webapp
 * Module Name  : branches
 * Scope        : Seed Data — Branches
 *
 * Description  : Branch seed data defining the physical salon/spa locations
 *                with address, contact, geo-coordinates, and status.
 *
 * Responsibilities :
 * - Define Rayasandra branch (primary, operational)
 * - Define Marathahalli branch (upcoming, opens_soon)
 *
 * Features / Functionality :
 * - Deterministic IDs for cross-reference in other seed data
 * - Complete address with geo-coordinates for Google Maps
 * - Branch codes (RS, MH) used in booking number generation
 *
 * Tech Stack   : TypeScript, Drizzle ORM
 * Layer        : Data Access
 *
 * Dependencies : None
 *
 * Notes        : Marathahalli branch details are TBD pending lease finalization.
 ************************************************************/

export const branches = [
  {
    id: 'branch_rayasandra',
    number: 1,
    code: 'RS',
    name: 'Rayasandra',
    addressLine1: '1st Floor, Narmada Complex, 48/3, Rayasandra Main Rd',
    addressLine2: 'Above SBI Bank, Naganathapura, Parappana Agrahara',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560100',
    phone: '+91 63601 35720',
    email: 'hello@theroyalglow.in',
    googleMapsUrl:
      'https://www.google.com/maps/search/?api=1&query=Royal%20Glow%20Salon%20%26%20Spa&query_place_id=ChIJKStV0FxtrjsRngQFQMaTd7g',
    googleMapsPlaceId: 'ChIJKStV0FxtrjsRngQFQMaTd7g',
    latitude: '12.8742192',
    longitude: '77.6647590',
    status: 'operational' as const,
    isPrimary: true,
    displayOrder: 1,
  },
  {
    id: 'branch_marathahalli',
    number: 2,
    code: 'MH',
    name: 'Marathahalli',
    addressLine1: 'TBD',
    city: 'Bengaluru',
    state: 'Karnataka',
    pincode: '560037',
    phone: '+91 XXXXX XXXXX',
    status: 'opens_soon' as const,
    isPrimary: false,
    displayOrder: 2,
  },
]
