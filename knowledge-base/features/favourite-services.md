# Favourite Services — Feature Specification

> Customers can "heart" services to mark them as favourites. Favourited services appear first in the booking dialog (Step 3) on subsequent bookings, reducing friction for repeat customers.

---

## High-Level Design (HLD)

### Problem Statement
Repeat customers at Royal Glow typically book the same 2-4 services every visit. Currently, they must scroll through all services each time. This adds unnecessary friction to the booking flow.

### Solution
Add a "heart" icon on every service card. Tapping toggles the favourite state. On subsequent bookings, favourited services are shown in a "Your Favourites" section above the regular service list in Step 3 of the booking dialog.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser)                                                │
│                                                                   │
│  /services page ──────── Heart icon on each service card         │
│  Booking Dialog Step 3 ─ "Your Favourites" section at top        │
│                                                                   │
│  Toggle favourite:                                                │
│    POST /api/favourites     (add)                                │
│    DELETE /api/favourites    (remove)                             │
│                                                                   │
│  Fetch favourites:                                                │
│    GET /api/favourites      (list user's favourites)             │
└─────────────────────────────────────────────────────────────────┘
         │                           │
         ▼                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  SERVER (Next.js API Routes)                                     │
│                                                                   │
│  POST /api/favourites                                            │
│    → Validate auth + serviceId                                   │
│    → INSERT into favourite_service (upsert, ignore if exists)    │
│    → Return { success: true }                                    │
│                                                                   │
│  DELETE /api/favourites                                           │
│    → Validate auth + serviceId                                   │
│    → DELETE from favourite_service                                │
│    → Return { success: true }                                    │
│                                                                   │
│  GET /api/favourites                                             │
│    → Validate auth                                               │
│    → SELECT service_id FROM favourite_service WHERE user_id = ?  │
│    → Return { favourites: string[] }                             │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  DATABASE (Neon PostgreSQL)                                       │
│                                                                   │
│  Table: favourite_service                                        │
│  ┌─────────────┬─────────────┬─────────────────────────────┐   │
│  │ user_id     │ service_id  │ created_at                   │   │
│  │ (FK → user) │ (FK → svc)  │ (timestamptz, default now()) │   │
│  └─────────────┴─────────────┴─────────────────────────────┘   │
│  Primary Key: (user_id, service_id) — composite                 │
│  Index: user_id (for fast lookup of user's favourites)          │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Store in DB (not localStorage) | Persists across devices, survives app reinstall, works with PWA |
| Composite primary key | Prevents duplicate favourites, no need for separate unique constraint |
| No limit on favourites | With 20-40 services, no practical reason to limit |
| Optimistic UI | Heart toggles instantly on tap, API call in background |
| Soft approach (no confirmation) | One-tap toggle like Instagram — no "Are you sure?" dialogs |
| Show on /services page AND booking Step 3 | Maximum visibility of the feature |
| "Your Favourites" section in booking | Grouped above regular services, clearly labelled |

---

## Low-Level Design (LLD)

### Database Schema

```sql
CREATE TABLE favourite_service (
  user_id       TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  service_id    TEXT NOT NULL REFERENCES service(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  PRIMARY KEY (user_id, service_id)
);

-- Index for fast lookup of a user's favourites
CREATE INDEX idx_favourite_service_user ON favourite_service(user_id);
```

**Notes:**
- CASCADE delete: if user is deleted, their favourites are removed
- CASCADE delete: if a service is removed/deactivated, favourites for it are cleaned up
- `created_at` allows future sorting by "most recently favourited"
- No `updated_at` needed — it's a simple presence/absence record

### API Endpoints

#### `POST /api/favourites` — Add a favourite

**Auth:** Required (customer+)
**Body:** `{ serviceId: string }`
**Validation:** serviceId must exist and be active
**Response:** `{ success: true }`
**Side effects:** None (no notifications, no analytics event needed)
**Conflict handling:** If already favourited, return success silently (idempotent)

```typescript
// POST /api/favourites
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  
  const { serviceId } = await req.json();
  
  // Validate service exists and is active
  const service = await db.query.service.findFirst({
    where: eq(service.id, serviceId)
  });
  if (!service || !service.active) return notFound();
  
  // Upsert (ignore if already exists)
  await db.insert(favouriteService)
    .values({ userId: session.user.id, serviceId })
    .onConflictDoNothing();
  
  return Response.json({ success: true });
}
```

#### `DELETE /api/favourites` — Remove a favourite

**Auth:** Required (customer+)
**Body:** `{ serviceId: string }`
**Response:** `{ success: true }`
**Side effects:** None
**Not-found handling:** If not favourited, return success silently (idempotent)

```typescript
// DELETE /api/favourites
export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  
  const { serviceId } = await req.json();
  
  await db.delete(favouriteService)
    .where(and(
      eq(favouriteService.userId, session.user.id),
      eq(favouriteService.serviceId, serviceId)
    ));
  
  return Response.json({ success: true });
}
```

#### `GET /api/favourites` — List user's favourites

**Auth:** Required (customer+)
**Response:** `{ favourites: string[] }` (array of service IDs)
**Cache:** No cache (changes on every toggle)

```typescript
// GET /api/favourites
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session) return unauthorized();
  
  const rows = await db.query.favouriteService.findMany({
    where: eq(favouriteService.userId, session.user.id),
    orderBy: desc(favouriteService.createdAt)
  });
  
  return Response.json({ 
    favourites: rows.map(r => r.serviceId) 
  });
}
```

### UI Implementation

#### Heart Icon Component

```typescript
// components/FavouriteHeart.tsx
'use client';
import { useState, useOptimistic } from 'react';

export function FavouriteHeart({ serviceId, isFavourited, onToggle }) {
  const [optimistic, setOptimistic] = useOptimistic(isFavourited);
  
  const toggle = async () => {
    setOptimistic(!optimistic); // Instant UI update
    
    if (optimistic) {
      await fetch('/api/favourites', { 
        method: 'DELETE', 
        body: JSON.stringify({ serviceId }) 
      });
    } else {
      await fetch('/api/favourites', { 
        method: 'POST', 
        body: JSON.stringify({ serviceId }) 
      });
    }
    onToggle?.();
  };
  
  return (
    <button 
      onClick={toggle}
      aria-label={optimistic ? 'Remove from favourites' : 'Add to favourites'}
      aria-pressed={optimistic}
      className="favourite-heart"
    >
      {optimistic ? '❤️' : '♡'}
    </button>
  );
}
```

#### Booking Dialog Step 3 — Service Ordering

```typescript
// In booking dialog Step 3, sort services:
function sortServices(services: Service[], favouriteIds: string[]) {
  const favouriteSet = new Set(favouriteIds);
  
  const favourites = services.filter(s => favouriteSet.has(s.id));
  const rest = services.filter(s => !favouriteSet.has(s.id));
  
  return { favourites, rest };
}

// Render:
// {favourites.length > 0 && (
//   <section>
//     <h3>Your Favourites</h3>
//     {favourites.map(s => <ServiceCard key={s.id} service={s} favourited />)}
//   </section>
// )}
// <section>
//   <h3>All Services</h3>
//   {rest.map(s => <ServiceCard key={s.id} service={s} />)}
// </section>
```

### Data Flow

```
Page load (/services or booking dialog):
    │
    ├── GET /api/services (public, cached in KV)
    │   → Returns all services with categories
    │
    ├── GET /api/favourites (auth required)
    │   → Returns array of service IDs user has favourited
    │
    ▼
Client merges both responses:
    │
    ├── Mark each service card with filled/empty heart
    │
    └── In booking Step 3: split into "Your Favourites" + "All Services"


Toggle favourite:
    │
    ├── Optimistic UI update (heart fills/empties instantly)
    │
    ├── POST or DELETE /api/favourites (background)
    │
    └── On error: revert optimistic state + show toast "Something went wrong"
```

### Edge Cases

| Edge Case | Handling |
|-----------|----------|
| User not signed in | Heart icon hidden (favourites require auth) |
| Service deactivated after being favourited | CASCADE delete removes it; if still in cache, filter out inactive services client-side |
| User has 0 favourites | "Your Favourites" section not shown (no empty state needed) |
| Network error on toggle | Revert optimistic state, show error toast |
| Same service favourited from /services and booking dialog | Same API, same DB row — no conflict |
| User deletes account | CASCADE delete removes all favourites |

### Performance Considerations

| Concern | Solution |
|---------|----------|
| Extra API call on page load | GET /api/favourites is a simple indexed query (~2ms) |
| Frequent toggles | Debounce not needed (each toggle is a separate INSERT/DELETE) |
| Scale | Even with 10,000 users × 10 favourites each = 100K rows — trivial for Postgres |
| Caching | No cache needed — the table is tiny and queries are fast |

### Accessibility

- Heart button: `aria-label="Add to favourites"` / `"Remove from favourites"`
- `aria-pressed="true/false"` for toggle state
- Keyboard: Enter/Space toggles
- Focus ring visible on tab navigation
- Colour is not the only indicator (filled vs outline shape)

### Analytics (PostHog)

| Event | When | Properties |
|-------|------|-----------|
| `service_favourited` | User taps empty heart | `{ serviceId, serviceName, category }` |
| `service_unfavourited` | User taps filled heart | `{ serviceId, serviceName }` |

These events help understand which services are most "loved" — useful for marketing.

---

## Where It Appears in the UI

| Location | Behaviour |
|----------|-----------|
| `/services` page | Heart icon on each service card (top-right corner) |
| Booking Dialog Step 3 | "Your Favourites" section above "All Services"; heart icon on each card |
| `/profile` page (future) | Optional: "My Favourite Services" list (Phase 2, not required at launch) |

---

## Implementation Priority

**Phase 1 (Launch):**
- DB table + migration
- 3 API endpoints (GET, POST, DELETE)
- Heart icon on booking dialog Step 3
- "Your Favourites" section ordering in booking

**Phase 2 (Post-launch):**
- Heart icon on `/services` page
- "My Favourites" section on `/profile`
- Analytics events

---

## References

- [features.md](../features.md) — Main feature specification
- [database-schema.md](../database-schema.md) — Database table definitions
- [pages/customer-authenticated.md](../pages/customer-authenticated.md) — Customer page specs
- [pages/api-routes.md](../pages/api-routes.md) — API route documentation
