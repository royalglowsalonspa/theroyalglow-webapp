import { formatDateIN, formatINR, IST_TIME_ZONE } from '@rgss/business'
import { html } from 'hono/html'
import type { CashCloseDraft } from './cash-close-store'
import type { CashDepositEvidence, VoidedCashDepositEvidence } from './cash-deposit-store'

const timestamp = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: IST_TIME_ZONE,
})

const moneyFields = [
  { field: 'opening', key: 'openingPaise', label: 'Opening cash float', default: '' },
  { field: 'otherReceipts', key: 'otherReceiptsPaise', label: 'Other cash received', default: '0' },
  { field: 'refunds', key: 'refundsPaise', label: 'Cash refunds', default: '0' },
  { field: 'payouts', key: 'payoutsPaise', label: 'Cash payouts', default: '0' },
  {
    field: 'deposits',
    key: 'depositsPaise',
    label: 'Cash taken out for bank deposit',
    default: '0',
  },
  { field: 'counted', key: 'countedPaise', label: 'Cash counted', default: '' },
] as const

function varianceText(paise: number) {
  if (paise === 0) return 'Balanced'
  return `${paise > 0 ? 'Over by' : 'Short by'} ${formatINR(Math.abs(paise))}`
}

const depositStatuses = {
  recorded: 'Bank credit recorded.',
  voided: 'Bank credit link voided. The original is in the correction history.',
  'already-voided': 'That bank credit link was already voided.',
}

function depositDetails(evidence: CashDepositEvidence) {
  return html`<p>Credited <strong>${formatINR(evidence.amountPaise)}</strong> on <time datetime="${evidence.creditedOn}">${formatDateIN(new Date(`${evidence.creditedOn}T00:00:00Z`))}</time>.</p>
    <p class="dashboard-note">Bank reference <span class="email-address">${evidence.reference}</span> · Linked to revision ${evidence.draftRevision}.</p>
    <p class="dashboard-note">Recorded by <span class="email-address">${evidence.recordedBy}</span> · <time datetime="${evidence.recordedAt}">${timestamp.format(new Date(evidence.recordedAt))} IST</time></p>`
}

export function renderCashClose({
  branches,
  branch,
  day,
  latestDay,
  today,
  canEdit,
  canApprove,
  draftId,
  source,
  drafts,
  error,
  saved,
  approved,
  approvalNote,
  deposit,
  voidedDeposits,
  depositRequestId,
  depositMessage,
  depositValues,
  values,
}: {
  branches: string[]
  branch?: string
  day: string
  latestDay: string
  today: string
  canEdit: boolean
  canApprove: boolean
  draftId: string
  source: { observedAt: string; serviceCashPaise: number } | null
  drafts: CashCloseDraft[]
  error?: string
  saved?: boolean
  approved?: boolean
  approvalNote?: string
  deposit: CashDepositEvidence | null
  voidedDeposits: VoidedCashDepositEvidence[]
  depositRequestId: string
  depositMessage?: keyof typeof depositStatuses
  depositValues?: { creditDate: string; bankReference: string; bankAmount: string }
  values?: Readonly<Record<string, string>>
}) {
  const month = day.slice(0, 7)
  const filters = new URLSearchParams(branch ? { branch, month } : { month })

  return html`<!doctype html><html lang="en"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="/portal/styles.css"><title>Cash drawer close · Royal Glow</title></head>
    <body><main class="dashboard">
      <nav aria-label="Invoice portal">
        <a href="/portal/home?${filters}">Invoice dashboard</a>
        <a href="/portal/collections?${filters}">Recorded service collections</a>
        <a href="/portal/cash-close/month?${filters}">Monthly cash close review</a>
      </nav>
      <h1>Cash drawer close</h1>
      <form action="/portal/cash-close" method="get" class="dashboard-filters">
        <label>Branch
          <select name="branch" required>
            <option value="">Select a branch</option>
            ${branches.map(
              (id) => html`<option value="${id}" ${id === branch ? 'selected' : ''}>${id}</option>`,
            )}
          </select>
        </label>
        <label>Closed business date (IST)
          <input type="date" name="day" required value="${day}" max="${latestDay}">
        </label>
        <button type="submit">Show cash close</button>
      </form>
      ${error ? html`<p role="alert">${error}</p>` : ''}
      ${saved ? html`<p role="status">Cash close draft saved.</p>` : ''}
      ${approved ? html`<p role="status">Cash close approved.</p>` : ''}
      ${depositMessage ? html`<p role="status">${depositStatuses[depositMessage]}</p>` : ''}
      ${
        branch
          ? html`<section aria-labelledby="cash-source">
              <h2 id="cash-source">Recorded service cash</h2>
              ${
                source
                  ? html`<p><strong>${formatINR(source.serviceCashPaise)}</strong></p>
                      <p class="dashboard-note">This covers service receipts recorded in the ledger, including the cash portion of split payments. Older checkout receipts may be missing. Source read <time datetime="${source.observedAt}">${timestamp.format(new Date(source.observedAt))} IST</time>.</p>`
                  : html`<p class="dashboard-note">A collections snapshot taken after this business date ended is required to prepare or approve a draft.</p>`
              }
              ${canEdit ? '' : html`<p class="dashboard-note">Your branch access is read-only.</p>`}
            </section>
            ${
              canEdit && source
                ? html`<section aria-labelledby="cash-draft">
                    <h2 id="cash-draft">${drafts.length ? 'Revise cash close draft' : 'Prepare cash close draft'}</h2>
                    <p class="dashboard-note" id="cash-count-help">Enter amounts in rupees. Use other cash received for verified receipts missing from the service ledger. Expected cash adds the opening float and receipts, then subtracts refunds, payouts and bank deposits.</p>
                    <form action="/portal/cash-close" method="post" class="close-review-form" aria-describedby="cash-count-help">
                      <input type="hidden" name="branch" value="${branch}">
                      <input type="hidden" name="day" value="${day}">
                      <input type="hidden" name="draftId" value="${draftId}">
                      <input type="hidden" name="observedAt" value="${source.observedAt}">
                      <input type="hidden" name="serviceCashPaise" value="${source.serviceCashPaise}">
                      <div class="dashboard-totals cash-close-amounts">
                        ${moneyFields.map((money) => {
                          const value = values?.[money.field] ?? money.default
                          return html`<label>${money.label}
                            <input type="text" inputmode="decimal" name="${money.field}" value="${value}" pattern="[0-9]{1,8}([.][0-9]{1,2})?" required>
                          </label>`
                        })}
                      </div>
                      <label>Reason
                        <textarea name="note" rows="3" maxlength="500" aria-describedby="cash-note-help" ${drafts.length ? 'required' : ''}>${values?.note ?? ''}</textarea>
                      </label>
                      <p id="cash-note-help" class="dashboard-note">Explain any difference between expected and counted cash or any revision to a saved draft.</p>
                      <button type="submit">Save cash close draft</button>
                    </form>
                  </section>`
                : ''
            }
            <section aria-labelledby="cash-history">
              <h2 id="cash-history">Saved drafts</h2>
              ${
                drafts.length
                  ? html`${drafts.length === 10 ? html`<p class="dashboard-note">Showing the 10 most recent drafts.</p>` : ''}
                    <ul class="close-review-log">${drafts.map((draft, index) => {
                      const latest = index === 0
                      const sourceMatches =
                        source &&
                        source.serviceCashPaise === draft.serviceCashPaise &&
                        Date.parse(source.observedAt) >= Date.parse(draft.observedAt)
                      const status = draft.approval
                        ? 'Approved'
                        : latest
                          ? 'Awaiting owner approval'
                          : 'Unapproved'
                      return html`<li id="cash-draft-${draft.id}">
                        <details ${latest ? 'open' : ''}>
                          <summary>Revision ${draft.revision}${latest ? ' (latest)' : ''} · ${varianceText(draft.variancePaise)} · ${status}</summary>
                          <p class="dashboard-note">Recorded by <span class="email-address">${draft.recordedBy}</span> · <time datetime="${draft.createdAt}">${timestamp.format(new Date(draft.createdAt))} IST</time></p>
                          <table aria-label="Cash close revision ${draft.revision}"><tbody>
                            <tr><th scope="row">Expected cash</th><td>${formatINR(draft.expectedPaise)}</td></tr>
                            <tr><th scope="row">Counted minus expected</th><td>${draft.variancePaise > 0 ? '+' : ''}${formatINR(draft.variancePaise)}</td></tr>
                            <tr><th scope="row">Recorded service cash</th><td>${formatINR(draft.serviceCashPaise)}</td></tr>
                            ${moneyFields.map(
                              ({ label, key }) =>
                                html`<tr><th scope="row">${label}</th><td>${formatINR(draft.amounts[key])}</td></tr>`,
                            )}
                          </tbody></table>
                          <p class="dashboard-note">Source read <time datetime="${draft.observedAt}">${timestamp.format(new Date(draft.observedAt))} IST</time>.</p>
                          ${draft.note ? html`<p class="close-review-note"><strong>Reason</strong> ${draft.note}</p>` : ''}
                          ${
                            draft.approval
                              ? html`<p class="dashboard-note">Approved by <span class="email-address">${draft.approval.approvedBy}</span> · <time datetime="${draft.approval.approvedAt}">${timestamp.format(new Date(draft.approval.approvedAt))} IST</time></p>
                                  ${draft.approval.note ? html`<p class="close-review-note"><strong>Approval note</strong> ${draft.approval.note}</p>` : ''}`
                              : ''
                          }
                          ${
                            latest && source && !sourceMatches
                              ? html`<p class="dashboard-note">The current collections snapshot differs from this revision. Save a revision with the current source before approval.</p>`
                              : ''
                          }
                          ${
                            latest && canApprove && sourceMatches && !draft.approval
                              ? html`<form method="post" action="/portal/cash-close/approve" class="close-review-form">
                                  <input type="hidden" name="branch" value="${branch}">
                                  <input type="hidden" name="day" value="${day}">
                                  <input type="hidden" name="draftId" value="${draft.id}">
                                  <label>${draft.variancePaise ? 'Reason for approving the variance' : 'Approval note (optional)'}
                                    <textarea name="approvalNote" rows="3" maxlength="500" ${draft.variancePaise ? 'required' : ''}>${approvalNote ?? ''}</textarea>
                                  </label>
                                  <button type="submit">Approve revision ${draft.revision}</button>
                                </form>`
                              : ''
                          }
                          ${
                            latest &&
                            (
                              deposit ||
                                voidedDeposits.length ||
                                (draft.approval && draft.amounts.depositsPaise > 0)
                            )
                              ? html`<section aria-labelledby="bank-deposit-credit">
                                  <h3 id="bank-deposit-credit">Bank deposit credit</h3>
                                  ${draft.approval ? html`<p>Expected deposit for this revision <strong>${formatINR(draft.amounts.depositsPaise)}</strong>.</p>` : ''}
                                  ${
                                    deposit
                                      ? html`${depositDetails(deposit)}
                                          ${draft.approval && deposit.amountPaise !== draft.amounts.depositsPaise ? html`<p>The recorded bank credit differs from the deposit on this approved revision. Review both records.</p>` : ''}
                                          ${
                                            canApprove
                                              ? html`<details>
                                                  <summary>Correct this link</summary>
                                                  <form method="post" action="/portal/cash-close/deposit/void" class="close-review-form" aria-describedby="void-credit-help">
                                                    <input type="hidden" name="branch" value="${branch}">
                                                    <input type="hidden" name="day" value="${day}">
                                                    <input type="hidden" name="evidenceId" value="${deposit.id}">
                                                    <label>Reason for voiding
                                                      <textarea name="voidReason" rows="3" maxlength="500" required></textarea>
                                                    </label>
                                                    <p id="void-credit-help" class="dashboard-note">Voiding ends this link and keeps its details in the correction history. You can link a replacement to the latest approved revision when its totals match current recorded service cash.</p>
                                                    <button type="submit">Void bank credit link</button>
                                                  </form>
                                                </details>`
                                              : ''
                                          }`
                                      : draft.approval && draft.amounts.depositsPaise > 0
                                        ? html`<p class="dashboard-note">Awaiting a matching bank credit.</p>
                                          ${
                                            canApprove && sourceMatches
                                              ? html`<form method="post" action="/portal/cash-close/deposit" class="close-review-form" aria-describedby="bank-credit-help">
                                                  <input type="hidden" name="branch" value="${branch}">
                                                  <input type="hidden" name="day" value="${day}">
                                                  <input type="hidden" name="draftId" value="${draft.id}">
                                                  <input type="hidden" name="requestId" value="${depositRequestId}">
                                                  <label>Bank credit date (IST)
                                                    <input name="creditDate" type="date" min="${day}" max="${today}" value="${depositValues?.creditDate ?? ''}" required>
                                                  </label>
                                                  <label>Bank transaction reference
                                                    <input name="bankReference" type="text" maxlength="80" value="${depositValues?.bankReference ?? ''}" autocomplete="off" required>
                                                  </label>
                                                  <label>Amount credited (₹)
                                                    <input name="bankAmount" type="text" inputmode="decimal" maxlength="11" pattern="[0-9]{1,8}([.][0-9]{1,2})?" value="${depositValues?.bankAmount ?? ''}" required>
                                                  </label>
                                                  <p id="bank-credit-help" class="dashboard-note">Use the credit date, transaction reference, and full amount shown on the bank statement.</p>
                                                  <button type="submit">Link bank credit</button>
                                                </form>`
                                              : ''
                                          }`
                                        : ''
                                  }
                                  ${
                                    voidedDeposits.length
                                      ? html`<details>
                                    <summary>Voided bank credit links (${voidedDeposits.length === 10 ? 'latest 10' : voidedDeposits.length})</summary>
                                    <ul>${voidedDeposits.map(
                                      (evidence) => html`<li>
                                      ${depositDetails(evidence)}
                                      <p class="dashboard-note">Voided by <span class="email-address">${evidence.voidedBy}</span> · <time datetime="${evidence.voidedAt}">${timestamp.format(new Date(evidence.voidedAt))} IST</time></p>
                                      <p class="close-review-note"><strong>Reason for voiding</strong> ${evidence.voidReason}</p>
                                    </li>`,
                                    )}</ul>
                                  </details>`
                                      : ''
                                  }
                                </section>`
                              : ''
                          }
                        </details>
                      </li>`
                    })}</ul>`
                  : html`<p>No cash close drafts saved for this branch and date.</p>`
              }
            </section>`
          : html`<p>Select a branch and closed business date to view saved drafts.</p>`
      }
    </main></body></html>`
}
