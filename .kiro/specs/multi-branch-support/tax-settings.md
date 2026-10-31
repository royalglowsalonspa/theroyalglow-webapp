# Tax and branch settings: v6

Status: provisional development configuration, checked 27 October 2026.
The user authorized using recommended GST/SAC values now and reviewing/changing
them at launch. This document changes no live billing settings. Service mapping
is based on the official descriptions; final applicability to the actual supply,
membership contract and registration must be reviewed before issuing real invoices.

## 1. Provisional service classification

Use total GST of 5% without input tax credit for covered beauty/physical wellbeing
services in development. The Ministry of Finance FAQ identifies this rate and
22 September 2025 as the effective date of the service-rate changes. This is not
authority to choose a different legal rate merely because another branch has a
different setting. [Official FAQ, questions 1 and 72](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2163560&lang=1&reg=3).

| Service performed | Provisional SAC | Development tax treatment |
| --- | --- | --- |
| Hair washing, cutting, styling, colouring and barber work | 999721 | 5% total, no ITC |
| Facial/cosmetic beauty care, manicure and pedicure | 999722 | 5% total, no ITC |
| Non-medical spa, massage and physical wellbeing sessions | 999723 | 5% total, no ITC |
| Depilation and other beauty treatments not captured by a more specific entry | 999729 | 5% total, no ITC; review exact service description |
| SPA-only prepaid membership purchase | 999723 as a provisional mapping of the underlying spa service | Test assumption: 5% at purchase; contract/time-of-supply review required at launch |

The service-specific entries follow the official explanatory notes, page 127.
A membership is not a separate SAC established by that document: the suggested
membership mapping is an inference for this project's SPA-only test product.
Retail goods, medical treatment and mixed benefits require separate classification
and must not silently inherit this service table.
[Official classification notes](https://www.gstcouncil.gov.in/sites/default/files/2024-02/explanatory_notes_01oct19.pdf).

Store the classification per service in Payload and sync it into the application.
The umbrella UI category salon/spa is too coarse to select every SAC. Payload is
not Developer-only: the Owner, Manager and Developer can all edit services. Make
the SAC field a select limited to the reviewed codes above; version history shows
who changed it, and the launch review (TX-10) checks the synced values.
Membership tiers live in the admin portal, not Payload. Each tier has an explicit
tax classification rather than reusing a universal constant; only the Developer
changes it, while Receptionists and above edit the tier's other fields. These
mappings can be corrected before launch without application edits.

For the current Karnataka intra-state test scenario, split the total 5% as 2.5%
CGST and 2.5% SGST. Do not infer place of supply solely from the GSTIN state prefix.
Cross-registration membership use and the performing branch's zero-charge session
document are product/accounting assumptions pending launch review; zero value is
not a declaration that the underlying service is legally exempt or zero-rated.

Cross-branch membership settlement (R10) needs the same review. Under section
25(4) of the CGST Act, each GST registration counts as a distinct person, even
under one owner ([CBIC circular](https://cbic-gst.gov.in/pdf/igst-circular-1.pdf)).
Supplies between distinct persons in the course of business can count as supplies
even without payment ([Karnataka GST FAQ](https://gstkarnataka.gov.in/media/pdf/FAQs/23.pdf)).
User decision (28 October 2026): a membership session is settled without GST.
The performing branch is owed the session's value minus its GST share, because
the selling branch already collected that GST and paid it. Gems settle at a
fixed value per gem, with no GST added. Questions for the CA:

- Does the performing branch need to issue a tax invoice to the selling branch
  for the settlement amount, for memberships and for gems?
- What is needed when two branches share one GST registration?

Each settlement entry stores the value, its GST share and the amount owed, so
the answers change documents, not the amounts.

## 2. Effective-dated tax configuration

Maintain branch tax versions with branch ID, tax class, total rate in integer
basis points, inclusive-price mode, effective-from instant, creator, reason and
review status. Store 5% as 500 basis points; preserve the existing inclusive-price
business convention, which also covers the agreed price typed at a membership
sale. Disallow ambiguous overlapping versions for a branch/class.
Calendar effective dates are interpreted at 00:00 Asia/Kolkata and persisted as
unambiguous instants. Existing versions referenced by invoices are immutable.

Resolve the applicable version using an explicit tax-point timestamp. For test
flows where service, invoice and payment occur together, use that event time.
Future scheduled configuration is not applied prematurely. Backdated supply,
advance payment, prepaid membership and changes spanning rate boundaries must
use the verified time-of-supply policy rather than blindly use PDF-generation or
booking-creation time. Those cases are part of launch tax review; the official FAQ
discusses rate-change timing in questions 4 and 5.

No missing/invalid tax config silently falls back to 18% or zero. The transaction
fails with an actionable configuration error before an invoice or debit commits.
The pure calculation helper accepts a validated rate; it does not read settings
itself. Checkout and membership purchase resolve and pass the branch version.
Invoice rendering, emails and reports use saved values only.

Snapshot issuer legal/trade name, GSTIN, address/state, tax-point timestamp,
configuration version, invoice number and totals on issue. Each item snapshots
its SAC, quantity, price, discounts, taxable amount, rate and tax components.
Editing a branch, service, membership tier or tax version cannot alter an issued
invoice. A re-render must reproduce the original tax facts.

Use integer arithmetic/defined rounding in paise and ensure components sum exactly
to the inclusive total. If all test items have the same rate, per-line rounding
and invoice aggregation still need a single documented rule; do not recompute
headers independently into a different result. Future differing classifications
must preserve correct per-line amounts rather than average tax percentages.

## 3. Ordinary branch settings

Booking policy and weekly business hours are branch-scoped and Developer-only.
Owner/Manager closures use their separate permissions. Saving ordinary settings
applies immediately to subsequent new bookings and actions; it does not silently
move, cancel, reprice or retroactively penalize existing bookings.

Each action resolves its booking's branch settings server-side and records the
revision used. A later cancellation/reschedule uses the current applicable policy
as requested by the user; show changed terms before confirmation. Completed
actions and their recorded outcomes are not recalculated after a policy edit.
Invalid settings must fail validation rather than silently overwrite with defaults.

Engineering default: the active-booking cap counts bookings at the selected branch
when configured per branch. Shared identity does not imply a second, undocumented
global cap. Tests must make this scope visible. Date/slot validation, cancellation,
reschedule, no-show rules, admin overrides and jobs must use the same branch
policy resolver; editing the Settings screen alone is insufficient.

## 4. Acceptance cases

- **TX-01:** Two branches can resolve different test configuration versions without
  cross-contamination; only Developer can edit them, including direct API calls.
- **TX-02:** INR 1,050 inclusive at 5% produces INR 1,000 taxable and INR 50 tax;
  the Karnataka test split is INR 25 CGST plus INR 25 SGST. Odd-paise cases sum.
- **TX-03:** Checkout and membership-purchase tests prove the saved setting changes
  the calculation; no unreachable UI-only tax setting remains.
- **TX-04:** Versions immediately before/at/after an IST effective boundary resolve
  deterministically; no invoice uses a later PDF-render timestamp as tax point.
- **TX-05:** Re-rendering an issued invoice after issuer/rate/SAC changes leaves
  seller identity, numbers, classification and all amounts unchanged.
- **TX-06:** No issued real invoice number is reused. Sequence reset is confined
  to verified test cleanup and never inferred from a launch-date change.
- **TX-07:** A zero-charge membership session records usage once, issues no second
  purchase charge and is not labelled tax-exempt merely because its value is zero.
- **TX-08:** A new branch cannot issue real invoices with missing GSTIN, unresolved
  classification or unreviewed launch tax configuration.
- **TX-09:** Updated booking policy affects the next action for its branch only;
  existing recorded actions and other branches remain unchanged.
- **TX-10:** Launch checklist records the reviewed rates, SACs, GSTINs, effective
  dates, membership treatment and invoice samples. Provisional seed values are
  visible as provisional until that review; they do not block development.
- **TX-11:** A negotiated INR 10,000.00 inclusive membership at 5% gives INR
  9,523.81 taxable and INR 476.19 tax. The Karnataka split places the odd paisa
  by the documented rule, and every component sums exactly to INR 10,000.00.
- **TX-12:** A cross-branch session's settlement entry stores its value and its
  GST share, both taken from the membership's purchase invoice, and statements
  total both. No settlement figure is recalculated from current tax settings.
  The amount owed is the value minus its GST share.
