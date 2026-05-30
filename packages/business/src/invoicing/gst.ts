const GST_RATE = 0.18

// Prices are stored GST-inclusive (18%, SAC 999721). Back-calculate the taxable
// base and split GST into equal CGST/SGST halves (intra-state, Karnataka). All
// integer paise math — the base is rounded, GST is the remainder so base + gst
// always reconstructs the original inclusive amount exactly.
export function splitGST(inclusivePaise: number): {
  basePaise: number
  gstPaise: number
  cgstPaise: number
  sgstPaise: number
  totalPaise: number
} {
  const basePaise = Math.round(inclusivePaise / (1 + GST_RATE))
  const gstPaise = inclusivePaise - basePaise
  const cgstPaise = Math.floor(gstPaise / 2)
  const sgstPaise = gstPaise - cgstPaise
  return { basePaise, gstPaise, cgstPaise, sgstPaise, totalPaise: inclusivePaise }
}
