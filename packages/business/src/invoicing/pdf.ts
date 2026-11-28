const decoder = new TextDecoder()

export function hasCompleteInvoicePdf(bytes: Uint8Array): boolean {
  const header = decoder.decode(bytes.subarray(0, 5))
  const trailer = decoder.decode(bytes.subarray(-1024))
  return (
    header === '%PDF-' &&
    /(?:^|[\r\n])startxref[ \t\r\n]+\d+[ \t\r\n]+%%EOF[ \t\r\n\f]*$/.test(trailer)
  )
}
