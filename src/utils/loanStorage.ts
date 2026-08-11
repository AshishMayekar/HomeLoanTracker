import type { Disbursal, Loan, OtherPayment, Payment } from './loanCalc'
const LOANS_KEY = 'app-analyzer:loans'
const PAYMENTS_KEY = 'app-analyzer:payments'
const DISBURSALS_KEY = 'app-analyzer:disbursals'
const OTHER_PAYMENTS_KEY = 'app-analyzer:other-payments'
const SEEDED_KEY = 'app-analyzer:seeded:v1'

export function loadLoans(): Loan[] { try { return JSON.parse(localStorage.getItem(LOANS_KEY) ?? '[]') } catch { return [] } }
export async function seedIfEmpty(): Promise<boolean> {
  if (localStorage.getItem(SEEDED_KEY)) return false
  const stored: Loan[] = JSON.parse(localStorage.getItem(LOANS_KEY) ?? '[]')
  if (stored.length > 0) { localStorage.setItem(SEEDED_KEY, '1'); return false }
  return false
}
export function saveLoans(loans: Loan[]) { localStorage.setItem(LOANS_KEY, JSON.stringify(loans)) }
export function loadPayments(): Payment[] { try { return JSON.parse(localStorage.getItem(PAYMENTS_KEY) ?? '[]') } catch { return [] } }
export function savePayments(v: Payment[]) { localStorage.setItem(PAYMENTS_KEY, JSON.stringify(v)) }
export function loadDisbursals(): Disbursal[] { try { return JSON.parse(localStorage.getItem(DISBURSALS_KEY) ?? '[]') } catch { return [] } }
export function saveDisbursals(v: Disbursal[]) { localStorage.setItem(DISBURSALS_KEY, JSON.stringify(v)) }
export function loadOtherPayments(): OtherPayment[] { try { return JSON.parse(localStorage.getItem(OTHER_PAYMENTS_KEY) ?? '[]') } catch { return [] } }
export function saveOtherPayments(v: OtherPayment[]) { localStorage.setItem(OTHER_PAYMENTS_KEY, JSON.stringify(v)) }
export async function exportToExcel(loans: Loan[], payments: Payment[], disbursals: Disbursal[], otherPayments: OtherPayment[] = []) {
  const { utils, writeFile } = await import('xlsx')
  const wb = utils.book_new()
  utils.book_append_sheet(wb, utils.json_to_sheet(loans.map(l => ({ Bank: l.bankName, 'Loan Amount': l.loanAmount, 'Interest Rate (%)': l.interestRate, 'Tenure (months)': l.tenureMonths, 'Start Date': l.startDate, EMI: l.emi, Notes: l.notes ?? '' }))), 'Loans')
  utils.book_append_sheet(wb, utils.json_to_sheet(payments.map(p => ({ Date: p.date, Type: p.type, Amount: p.amount, 'Outstanding After': p.newOutstanding ?? '', 'Remaining Tenure': p.remainingTenure ?? '', Notes: p.notes ?? '' }))), 'Payments')
  utils.book_append_sheet(wb, utils.json_to_sheet(disbursals.map(d => ({ Date: d.date, Amount: d.amount, 'Builder Demand': d.builderDemand ?? '', 'New EMI': d.newEmi ?? '', Notes: d.notes ?? '' }))), 'Disbursements')
  if (otherPayments.length) utils.book_append_sheet(wb, utils.json_to_sheet(otherPayments.map(o => ({ Date: o.date ?? '', Category: o.category, Amount: o.amount, Notes: o.notes ?? '' }))), 'Other Costs')
  writeFile(wb, `loan-noter-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
export async function importFromExcel(file: File) {
  try {
    const { read, utils } = await import('xlsx')
    const wb = read(await file.arrayBuffer())
    const ls = wb.Sheets['Loans'], ps = wb.Sheets['Payments']
    if (!ls || !ps) return null
    const loans: Loan[] = utils.sheet_to_json<Record<string, unknown>>(ls).map((r, i) => ({
      id: `loan-import-${i}-${Date.now()}`, bankName: String(r.Bank ?? ''), loanAmount: Number(r['Loan Amount'] ?? 0),
      interestRate: Number(r['Interest Rate (%)'] ?? 0), tenureMonths: Number(r['Tenure (months)'] ?? 0),
      startDate: String(r['Start Date'] ?? ''), emi: Number(r.EMI ?? 0), notes: r.Notes ? String(r.Notes) : undefined
    }))
    const loanByBank = (r: Record<string, unknown>) => loans.find(l => l.bankName === String(r.Bank ?? ''))
    const payments: Payment[] = utils.sheet_to_json<Record<string, unknown>>(ps).map((r, i) => ({
      id: `pay-import-${i}-${Date.now()}`, loanId: loanByBank(r)?.id ?? '', date: String(r.Date ?? ''),
      amount: Number(r.Amount ?? 0), type: String(r.Type ?? '').toLowerCase().includes('part') ? 'part' : String(r.Type ?? '').toLowerCase().includes('pre') ? 'pre-emi' : 'emi',
      newOutstanding: r['Outstanding After'] ? Number(r['Outstanding After']) : undefined, remainingTenure: r['Remaining Tenure'] ? Number(r['Remaining Tenure']) : undefined, notes: r.Notes ? String(r.Notes) : undefined
    }))
    return { loans, payments, disbursals: [], otherPayments: [] }
  } catch { return null }
}
