export function csvCell(value: string | number | null): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)

  // Spreadsheet engines may ignore space and invisible characters before a formula marker.
  const safe = /^(?:[\s\p{Cc}\p{Cf}]*[=+\-@＝＋－＠]|\s*[\p{Cc}\p{Cf}])/u.test(value)
    ? `'${value}`
    : value
  return /[,"\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

export function csvFile(rows: string[]): string {
  return `\uFEFF${rows.join('\r\n')}\r\n`
}
