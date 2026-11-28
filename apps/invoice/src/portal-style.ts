export const portalStyles = `
:root {
  color-scheme: light;
  font-family: system-ui, sans-serif;
  color: #29251f;
  background: #faf8f4;
  line-height: 1.55;
}
* { box-sizing: border-box; }
body { margin: 0; }
main { max-width: 54rem; margin: auto; padding: 2rem clamp(1rem, 4vw, 3rem) 4rem; }
h1, h2 { font-family: "DM Serif Text", Georgia, serif; line-height: 1.15; font-weight: 500; }
h1 { margin: 1rem 0; font-size: clamp(2rem, 6vw, 3rem); }
h2 { margin: 2rem 0 .75rem; font-size: 1.5rem; }
a { color: #704522; text-underline-offset: .2em; }
form { display: flex; flex-wrap: wrap; align-items: end; gap: .75rem; }
label { display: grid; gap: .25rem; font-weight: 600; font-size: .9rem; }
input, select, button { max-width: 100%; min-height: 2.75rem; font: inherit; border-radius: .35rem; }
input, select { background: white; color: inherit; padding: .35rem .65rem; border: 1px solid #92887a; }
button { color: white; background: #57432f; border: 1px solid #57432f; padding: .4rem 1rem; cursor: pointer; }
:focus-visible { outline: 3px solid #905b20; outline-offset: 3px; }
ul { list-style: none; margin: 0; padding: 0; }
li { padding: .9rem 0; border-top: 1px solid #d6cec2; overflow-wrap: anywhere; }
li form { margin-top: .5rem; }
nav { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; font-size: .9rem; }
.email-address { overflow-wrap: anywhere; }
.dashboard { max-width: 68rem; }
.dashboard h1 { margin-block: 1.75rem 1.25rem; }
.dashboard-filters label { min-width: 10rem; }
.dashboard-totals {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem;
  margin: 1.75rem 0 .65rem; padding-block: 1rem; border-block: 1px solid #d6cec2;
}
.dashboard-totals dt { font-size: .9rem; color: #5b5145; }
.dashboard-totals dd {
  margin: .15rem 0 0; font-size: clamp(1.1rem, 4vw, 1.65rem); font-weight: 650;
  font-variant-numeric: tabular-nums; overflow-wrap: anywhere;
}
.dashboard-note { color: #5b5145; font-size: .9rem; max-width: 68ch; }
.dashboard table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.dashboard th, .dashboard td {
  text-align: left; vertical-align: top; padding: .7rem .55rem .7rem 0;
  border-bottom: 1px solid #d6cec2; overflow-wrap: anywhere;
}
.dashboard thead th { color: #5b5145; font-size: .85rem; }
.dashboard th:last-child, .dashboard td:last-child { padding-right: 0; text-align: right; }
.dashboard tbody small { display: block; font-weight: 400; color: #5b5145; }
.dashboard time { white-space: nowrap; }
.gst-review li small { display: block; color: #5b5145; }
.gst-review-table { overflow-x: auto; }
.gst-review-table th:nth-child(3), .gst-review-table td:nth-child(n+3) { white-space: nowrap; }
.gst-review-table th:nth-child(3), .gst-review-table td:nth-child(3) { text-align: right; }
.close-save { margin-bottom: .85rem; }
.close-files { display: flex; flex-wrap: wrap; gap: .35rem 1.25rem; margin-top: .35rem; font-size: .9rem; }
.close-scope { overflow-wrap: anywhere; }
.close-comparison h1 { text-wrap: balance; }
.close-comparison .dashboard-totals { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.close-pages { margin-top: .9rem; }
.close-review-form { display: grid; align-items: start; gap: .8rem; max-width: 38rem; }
.close-review-form textarea {
  width: 100%; resize: vertical; font: inherit; font-weight: 400;
  color: inherit; background: white; border: 1px solid #92887a; border-radius: .35rem;
  padding: .45rem .65rem;
}
.close-review-form p { margin: -.38rem 0 0; }
.close-review-form button { justify-self: start; }
.close-review-note { margin: .3rem 0; white-space: pre-wrap; }
.refund-lines { min-width: 0; border: 1px solid #92887a; border-radius: .35rem; }
.refund-lines label { display: flex; align-items: center; gap: .55rem; min-height: 2.75rem; }
.refund-lines input { min-height: 0; }
.close-review-log li:target { background: #f2ece2; }
.cash-close-amounts { margin-top: .35rem; }
.cash-close-amounts input { width: 100%; min-width: 0; }
@media (max-width: 35rem) {
  form { align-items: stretch; flex-direction: column; }
  label, button { width: 100%; }
  .dashboard-totals { gap: .65rem; }
  .cash-close-amounts { grid-template-columns: minmax(0, 1fr); }
  .dashboard table { font-size: .85rem; }
}
`
