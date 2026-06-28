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

// IST display: Cloud Run runs in UTC, so shift the instant by +5:30 and let
// formatDateIN render the IST calendar date (DD/MM/YYYY).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000
function formatIssuedDateIST(issuedAt: string): string {
  return formatDateIN(new Date(new Date(issuedAt).getTime() + IST_OFFSET_MS))
}

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

const SAC_CODE = '999721'

// Build the invoice <Document> from a fully-computed render payload.
export function InvoiceDocument(payload: InvoicePdfPayload) {
  const { seller, customer, items, totals } = payload
  const hasGems = payload.gemsEarned > 0 || payload.gemsRedeemed > 0

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
            {seller.addressLines.map((line) => (
              <Text key={line} style={styles.sellerMeta}>
                {line}
              </Text>
            ))}
            {seller.gstin ? <Text style={styles.sellerMeta}>GSTIN: {seller.gstin}</Text> : null}
            {seller.phone ? <Text style={styles.sellerMeta}>Phone: {seller.phone}</Text> : null}
            {seller.email ? <Text style={styles.sellerMeta}>Email: {seller.email}</Text> : null}
            <Text style={styles.sellerMeta}>SAC: {seller.sacCode}</Text>
          </View>
          <View>
            <Text style={styles.invoiceTitle}>TAX INVOICE</Text>
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
              <Text style={styles.metaValue}>{formatIssuedDateIST(payload.issuedAt)}</Text>
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
            <Text style={[styles.th, styles.colService]}>Service</Text>
            <Text style={[styles.th, styles.colStaff]}>Staff</Text>
            <Text style={[styles.th, styles.colQty]}>Qty</Text>
            <Text style={[styles.th, styles.colUnit]}>Unit</Text>
            <Text style={[styles.th, styles.colAmount]}>Amount</Text>
          </View>

          {items.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.tableRow}>
              <View style={styles.colService}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.gemsCovered ? <Text style={styles.gemsTag}>Gems</Text> : null}
              </View>
              <Text style={[styles.colStaff, styles.itemMuted]}>{item.staffName ?? '—'}</Text>
              <Text style={styles.colQty}>{item.quantity}</Text>
              <Text style={styles.colUnit}>{formatINR(item.unitPricePaise)}</Text>
              <Text style={styles.colAmount}>
                {item.gemsCovered ? formatINR(0) : formatINR(item.totalPricePaise)}
              </Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={styles.totalsWrap}>
          <View style={styles.totals}>
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>Taxable value</Text>
              <Text>{formatINR(totals.taxableValuePaise)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>CGST</Text>
              <Text>{formatINR(totals.cgstPaise)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalKey}>SGST</Text>
              <Text>{formatINR(totals.sgstPaise)}</Text>
            </View>
            {totals.discountPaise > 0 ? (
              <View style={styles.totalLine}>
                <Text style={styles.totalKey}>Discount</Text>
                <Text>- {formatINR(totals.discountPaise)}</Text>
              </View>
            ) : null}
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
            SAC {SAC_CODE} · Prices are GST-inclusive
          </Text>
          <Text style={styles.thankYou}>Thank you for visiting The Royal Glow</Text>
        </View>
      </Page>
    </Document>
  )
}
