import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
/************************************************************
 * Author       : KATABATHUNI BOSE
 *
 * Project      : theroyalglow-webapp
 * Module Name  : invoicing/template/InvoiceDocument
 * Scope        : Presentation (vector PDF template)
 *
 * Description  : Minimalist, brand-clean GST invoice rendered as a TEMPLATED
 *                VECTOR PDF via @react-pdf/renderer (no Chromium, no images).
 *                Uses only the built-in Helvetica family (zero font assets) to
 *                keep the container image small. Generous whitespace, hairline
 *                rules, a single restrained gold accent. A4.
 *
 * Money/format : All monetary values are pre-computed integer paise from the
 *                payload — formatted for display ONLY via @rgss/business
 *                (formatINR / formatDateIN / amountInWordsINR). NEVER recomputed.
 ************************************************************/
import { amountInWordsINR, formatDateIN, formatINR } from '@rgss/business'
import type { InvoicePdfPayload } from '@rgss/types'

// Single restrained gold accent + a neutral ink/muted/hairline palette.
const GOLD = '#C9A227'
const INK = '#1A1A1A'
const MUTED = '#6B7280'
const HAIRLINE = '#E5E7EB'

// IST display: formatDateIN formats in Asia/Kolkata itself, whatever the host
// timezone, so the issue instant is passed as is (adding +5:30 first would
// move an invoice issued after 18:30 IST to the next day).

const styles = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingHorizontal: 48,
    paddingBottom: 64,
    fontFamily: 'Helvetica',
    fontSize: 9,
    color: INK,
    lineHeight: 1.4,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sellerName: { fontFamily: 'Helvetica-Bold', fontSize: 16, color: INK },
  sellerMeta: { fontSize: 8, color: MUTED, marginTop: 2 },
  invoiceTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: GOLD,
    textAlign: 'right',
    letterSpacing: 1,
  },
  accentRule: { height: 2, backgroundColor: GOLD, marginTop: 12 },
  hairline: { height: 1, backgroundColor: HAIRLINE },

  // Meta + Bill To row
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 20 },
  metaBlock: { width: '48%' },
  sectionLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  metaLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  metaKey: { color: MUTED },
  metaValue: { fontFamily: 'Helvetica-Bold' },

  // Items table
  table: { marginTop: 24 },
  tableHead: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: INK,
    paddingBottom: 6,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: HAIRLINE,
    paddingVertical: 8,
  },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: MUTED, letterSpacing: 0.5 },
  colService: { width: '34%' },
  colStaff: { width: '22%' },
  colQty: { width: '10%', textAlign: 'right' },
  colUnit: { width: '17%', textAlign: 'right' },
  colAmount: { width: '17%', textAlign: 'right' },
  // Template v2: per-line SAC code and GST rate (service + SAC + staff +
  // qty + unit + rate + amount = 100%).
  colServiceV2: { width: '27%' },
  colSac: { width: '11%' },
  colStaffV2: { width: '16%' },
  colRate: { width: '9%', textAlign: 'right' },
  testBadge: {
    marginTop: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    color: MUTED,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  itemName: { fontFamily: 'Helvetica-Bold', fontSize: 9 },
  itemMuted: { color: MUTED },
  gemsTag: {
    marginTop: 3,
    alignSelf: 'flex-start',
    fontSize: 7,
    color: GOLD,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 2,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },

  // Totals
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  totals: { width: '46%' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalKey: { color: MUTED },
  grandLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 2,
    borderTopColor: GOLD,
  },
  grandKey: { fontFamily: 'Helvetica-Bold', fontSize: 11 },
  grandValue: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: GOLD },

  // Words + gems note
  words: { marginTop: 18 },
  wordsValue: { fontFamily: 'Helvetica-Bold', marginTop: 2 },
  gemsNote: {
    marginTop: 14,
    padding: 8,
    backgroundColor: '#FBF7EA',
    borderLeftWidth: 2,
    borderLeftColor: GOLD,
    fontSize: 8,
    color: INK,
  },
  notes: { marginTop: 14, fontSize: 8, color: MUTED },

  // Footer
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 48,
    right: 48,
  },
  footerText: { fontSize: 7, color: MUTED, textAlign: 'center', marginTop: 2 },
  thankYou: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    color: GOLD,
    textAlign: 'center',
  },
})

type Line = InvoicePdfPayload['items'][number]

// "5%" for 500 basis points; "2.5%" for half of it.
function percent(bps: number): string {
  return `${bps / 100}%`
}

// The rate every line shares, or null when lines differ or carry none.
function sharedRateBps(items: readonly Line[]): number | null {
  const rates = items.map((item) => item.rateBps)
  const first = rates[0]
  if (first === undefined || first === null) {
    return null
  }
  return rates.every((rate) => rate === first) ? first : null
}

function documentTitle(payload: InvoicePdfPayload): string {
  if (payload.invoiceType === 'membership_session') {
    return 'MEMBERSHIP SESSION'
  }
  return 'TAX INVOICE'
}

// Build the invoice <Document> from a fully-computed render payload.
export function InvoiceDocument(payload: InvoicePdfPayload) {
  const { seller, customer, items, totals } = payload
  const hasGems = payload.gemsEarned > 0 || payload.gemsRedeemed > 0
  // Lines carry their own SAC code and rate on invoices issued with tax
  // versions (template v2); older ones print one code in the footer.
  const perLine = items.some((item) => item.sacCode)
  const rateBps = sharedRateBps(items)
  const halfRate = rateBps !== null ? ` @ ${percent(rateBps / 2)}` : ''
  const provisional = payload.taxReviewStatus === 'provisional'

  return (
    <Document
      title={`Invoice ${payload.invoiceNumber}`}
      author={seller.name}
      creator="The Royal Glow"
      producer="The Royal Glow Invoicing"
    >
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.sellerName}>{seller.name}</Text>
            {seller.legalName && seller.legalName !== seller.name ? (
              <Text style={styles.sellerMeta}>{seller.legalName}</Text>
            ) : null}
            {seller.addressLines.map((line) => (
              <Text key={line} style={styles.sellerMeta}>
                {line}
              </Text>
            ))}
            {seller.gstin ? <Text style={styles.sellerMeta}>GSTIN: {seller.gstin}</Text> : null}
            {seller.phone ? <Text style={styles.sellerMeta}>Phone: {seller.phone}</Text> : null}
            {seller.email ? <Text style={styles.sellerMeta}>Email: {seller.email}</Text> : null}
            {!perLine && seller.sacCode ? (
              <Text style={styles.sellerMeta}>SAC: {seller.sacCode}</Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.invoiceTitle}>{documentTitle(payload)}</Text>
            {provisional ? <Text style={styles.testBadge}>TEST · PROVISIONAL RATES</Text> : null}
          </View>
        </View>
        <View style={styles.accentRule} />

        {/* Invoice meta + Bill To */}
        <View style={styles.metaRow}>
          <View style={styles.metaBlock}>
            <Text style={styles.sectionLabel}>Invoice</Text>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Invoice No</Text>
              <Text style={styles.metaValue}>{payload.invoiceNumber}</Text>
            </View>
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Date</Text>
              {/* formatDateIN already renders the IST calendar date. */}
              <Text style={styles.metaValue}>{formatDateIN(new Date(payload.issuedAt))}</Text>
            </View>
            {payload.bookingNumber ? (
              <View style={styles.metaLine}>
                <Text style={styles.metaKey}>Booking No</Text>
                <Text style={styles.metaValue}>{payload.bookingNumber}</Text>
              </View>
            ) : null}
            <View style={styles.metaLine}>
              <Text style={styles.metaKey}>Payment</Text>
              <Text style={styles.metaValue}>{payload.paymentMethod.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.metaBlock}>
            <Text style={styles.sectionLabel}>Bill To</Text>
            <Text style={styles.metaValue}>{customer.name}</Text>
            {customer.phone ? <Text style={styles.itemMuted}>{customer.phone}</Text> : null}
            {customer.email ? <Text style={styles.itemMuted}>{customer.email}</Text> : null}
          </View>
        </View>

        {/* Items */}
        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, perLine ? styles.colServiceV2 : styles.colService]}>
              Service
            </Text>
            {perLine ? <Text style={[styles.th, styles.colSac]}>SAC</Text> : null}
            <Text style={[styles.th, perLine ? styles.colStaffV2 : styles.colStaff]}>Staff</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            {perLine ? <Text style={[styles.th, styles.colRate]}>GST</Text> : null}
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>

          {items.map((item, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: one-shot PDF render with fixed row order, no component state, and the same service name may appear twice on one invoice
            <View key={`${item.name}-${index}`} style={styles.tableRow}>
              <View style={perLine ? styles.colServiceV2 : styles.colService}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.gemsCovered ? <Text style={styles.gemsTag}>Gems</Text> : null}
                {item.discountPaise ? (
                  <Text style={styles.itemMuted}>Discount − {formatINR(item.discountPaise)}</Text>
                ) : null}
              </View>
              {perLine ? (
                <Text style={[styles.colSac, styles.itemMuted]}>{item.sacCode ?? '—'}</Text>
              ) : null}
              <Text style={[perLine ? styles.colStaffV2 : styles.colStaff, styles.itemMuted]}>
                {item.staffName ?? '—'}
              </Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatINR(item.unitPricePaise)}</Text>
              {perLine ? (
                <Text style={[styles.colRate, styles.itemMuted]}>
                  {item.rateBps !== null && item.rateBps !== undefined
                    ? percent(item.rateBps)
                    : '—'}
                </Text>
              ) : null}
              <Text style={styles.colAmount}>
                {item.gemsCovered ? formatINR(0) : formatINR(item.totalPricePaise)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            {totals.discountPaise > 0 ? (
              <>
                <View style={styles.totalLine}>
                  <Text style={styles.totalKey}>Subtotal</Text>
                  <Text>{formatINR(totals.subtotalPaise)}</Text>
                </View>
                <View style={styles.totalLine}>
                  <Text style={styles.totalKey}>Discount</Text>
                  <Text>- {formatINR(totals.discountPaise)}</Text>
                </View>
              </>
            ) : null}
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>Taxable value</Text>
              <Text>{formatINR(totals.taxableValuePaise)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>CGST{halfRate}</Text>
              <Text>{formatINR(totals.cgstPaise)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>SGST{halfRate}</Text>
              <Text>{formatINR(totals.sgstPaise)}</Text>
            </View>
            <View style={styles.grandLine}>
              <Text style={styles.grandKey}>Total</Text>
              <Text style={styles.grandValue}>{formatINR(totals.totalPaise)}</Text>
            </View>
          </View>
        </View>

        {/* Amount in words */}
        <View style={styles.words}>
          <Text style={styles.sectionLabel}>Amount in words</Text>
          <Text style={styles.wordsValue}>{amountInWordsINR(totals.totalPaise)}</Text>
        </View>

        {payload.invoiceType === 'membership_session' ? (
          <Text style={styles.notes}>
            A session of a prepaid SPA membership. Its price and tax were charged on the
            membership's purchase invoice, so nothing is due here.
          </Text>
        ) : null}

        {provisional ? (
          <Text style={styles.notes}>
            Test invoice: issued with provisional tax rates that have not been reviewed.
          </Text>
        ) : null}

        {/* Gems note */}
        {hasGems ? (
          <Text style={styles.gemsNote}>
            Gems earned: {payload.gemsEarned} · Gems redeemed: {payload.gemsRedeemed}
          </Text>
        ) : null}

        {/* Free-text notes */}
        {payload.notes ? <Text style={styles.notes}>{payload.notes}</Text> : null}

        {/* Footer */}
        <View style={styles.footer} fixed>
          <View style={styles.hairline} />
          <Text style={[styles.footerText, { marginTop: 6 }]}>
            {!perLine && seller.sacCode ? `SAC ${seller.sacCode} · ` : ''}Prices are GST-inclusive
          </Text>
          <Text style={styles.thankYou}>Thank you for visiting The Royal Glow</Text>
        </View>
      </Page>
    </Document>
  )
}
