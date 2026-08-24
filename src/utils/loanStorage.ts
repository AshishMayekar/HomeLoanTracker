import type { Disbursal, Loan, OtherPayment, Payment } from './loanCalc'
const LOANS_KEY = 'app-analyzer:loans'
const PAYMENTS_KEY = 'app-analyzer:payments'
const DISBURSALS_KEY = 'app-analyzer:disbursals'
const OTHER_PAYMENTS_KEY = 'app-analyzer:other-payments'
const SEEDED_KEY = 'app-analyzer:seeded:v1'

function normalizeText(value: unknown): string { return String(value ?? '').trim() }
function normalizeKey(value: unknown): string { return normalizeText(value).toLowerCase().replace(/[^a-z0-9]/g, '') }
function pickValue(row: Record<string, unknown>, aliases: string[]): unknown {
  const flattened = Object.fromEntries(Object.entries(row).map(([k, v]) => [normalizeKey(k), v]))
  for (const alias of aliases) {
    const key = normalizeKey(alias)
    if (Object.prototype.hasOwnProperty.call(flattened, key)) {
      const value = flattened[key]
      if (value !== undefined && value !== null && normalizeText(value) !== '') return value
    }
  }
  return undefined
}
function parseOwnContributions(value: unknown): Array<{ id: string; date?: string; amount: number; notes?: string }> {
  if (value == null || value === '') return []
  const raw = normalizeText(value)
  if (!raw) return []
  const matches = raw.match(/([0-9,]+(?:\.\d+)?)\s*\(([^)]*)\)/g) ?? []
  if (matches.length > 0) {
    return matches.map((match, idx) => {
      const amountMatch = match.match(/([0-9,]+(?:\.\d+)?)\s*\(([^)]*)\)/)
      if (!amountMatch) return null
      const amount = parseNumber(amountMatch[1])
      const notes = normalizeText(amountMatch[2]) || undefined
      return { id: `own-import-${idx}-${Date.now()}`, amount, notes }
    }).filter(Boolean) as Array<{ id: string; date?: string; amount: number; notes?: string }>
  }
  const numberOnly = raw.replace(/\|/g, ',').split(',').map(part => part.trim()).filter(Boolean)
  if (numberOnly.length > 0) {
    return numberOnly.map((part, idx) => ({ id: `own-import-${idx}-${Date.now()}`, amount: parseNumber(part), notes: undefined }))
  }
  const numeric = parseNumber(raw)
  return numeric > 0 ? [{ id: `own-import-0-${Date.now()}`, amount: numeric, notes: undefined }] : []
}
function parseNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const text = String(value ?? '').replace(/₹|,/g, '').replace(/\s+/g, '').replace(/%/g, '').trim()
  if (!text) return 0
  const n = Number(text)
  return Number.isFinite(n) ? n : 0
}
function parseOptionalNumber(value: unknown): number | undefined {
  const n = parseNumber(value)
  return n > 0 || value === 0 ? n : undefined
}
function normalizePaymentType(value: unknown): Payment['type'] {
  const raw = normalizeText(value).toLowerCase()
  if (raw.includes('pre')) return 'pre-emi'
  if (raw.includes('part')) return 'part'
  return 'emi'
}
function normalizeSheetName(name: string): string { return name.toLowerCase().replace(/[^a-z]/g, '') }
function getSheetByKeywords(wb: { Sheets: Record<string, unknown> }, keywords: string[]): string | undefined {
  const names = Object.keys(wb.Sheets)
  return names.find((name) => keywords.some(k => normalizeSheetName(name).includes(normalizeSheetName(k))))
}
function toIsoDate(value: unknown): string {
  if (value == null || value === '') return ''
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'number') {
    const asDate = new Date((value - 25569) * 86400 * 1000)
    if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10)
    return ''
  }
  const text = normalizeText(value)
  if (!text) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [d, m, y] = text.split('/')
    return `${y}-${m}-${d}`
  }
  if (/^\d{2}-\d{2}-\d{4}$/.test(text)) {
    const [d, m, y] = text.split('-')
    return `${y}-${m}-${d}`
  }
  if (/^\d{1,2}[- ](?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[- ]\d{4}$/i.test(text)) {
    const match = text.match(/^(\d{1,2})[- ]([a-z]{3})[- ](\d{4})$/i)
    if (!match) return text
    const monthMap: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' }
    return `${match[3]}-${monthMap[match[2].toLowerCase()]}-${String(match[1]).padStart(2, '0')}`
  }
  if (/^\d{1,2}[- /]\d{1,2}[- /]\d{4}$/.test(text)) {
    const [a, b, y] = text.split(/[\/\-]/)
    if (a && b) return `${y}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`
  }
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`
  const asDate = new Date(text)
  if (!Number.isNaN(asDate.getTime())) return asDate.toISOString().slice(0, 10)
  return text
}

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
    const loanSheetName = getSheetByKeywords(wb, ['Loans', 'Loan'])
    const paymentSheetName = getSheetByKeywords(wb, ['Payments', 'Payment'])
    const disbSheetName = getSheetByKeywords(wb, ['Disbursements', 'Disbursement'])
    const otherSheetName = getSheetByKeywords(wb, ['Other Costs', 'OtherPayments', 'Other'])
    const ownSheetName = getSheetByKeywords(wb, ['Own Contributions', 'Own Contribution', 'OwnContributions'])

    const loansFromSheet = loanSheetName ? utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[loanSheetName]) : []
    const loans: Loan[] = loansFromSheet.map((r, i) => {
      const ownContributions = parseOwnContributions(pickValue(r, ['Own Contributions', 'OwnContributions', 'Own Contribution']))
      return {
        id: `loan-import-${i}-${Date.now()}`,
        bankName: normalizeText(pickValue(r, ['Bank', 'Bank Name']) ?? ''),
        loanAmount: parseNumber(pickValue(r, ['Loan Amount', 'Sanctioned Amount', 'LoanSanctioned'])),
        interestRate: parseNumber(pickValue(r, ['Interest Rate (%)', 'Rate', 'InterestRate'])),
        tenureMonths: parseNumber(pickValue(r, ['Tenure (months)', 'Tenure Months', 'Tenure', 'LoanTenure'])),
        startDate: toIsoDate(pickValue(r, ['Start Date', 'Disbursement Date', 'Date'])) ,
        emi: parseNumber(pickValue(r, ['EMI', 'Initial EMI', 'Monthly EMI'])),
        outstandingOverride: parseOptionalNumber(pickValue(r, ['Outstanding', 'Current Outstanding', 'Outstanding Balance'])),
        propertyTotalCost: parseOptionalNumber(pickValue(r, ['Property Total Cost', 'PropertyTotalCost', 'Total Property Cost'])),
        ownContributions: ownContributions.length ? ownContributions : undefined,
        notes: normalizeText(pickValue(r, ['Notes', 'Note'])) ? String(pickValue(r, ['Notes', 'Note'])) : undefined,
      }
    })

    if (!loans.length && paymentSheetName) {
      const paymentRows = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[paymentSheetName])
      const banks = [...new Set(paymentRows.map(r => normalizeText(pickValue(r, ['Bank', 'Bank Name']) ?? '')).filter(Boolean))]
      if (banks.length) {
        for (const [idx, bankName] of banks.entries()) {
          loans.push({
            id: `loan-import-${idx}-${Date.now()}`,
            bankName,
            loanAmount: 0,
            interestRate: 0,
            tenureMonths: 0,
            startDate: '',
            emi: 0,
            notes: undefined,
          })
        }
      }
    }

    const createLoanByBank = (row: Record<string, unknown>) => {
      const bankName = normalizeText(pickValue(row, ['Bank', 'Bank Name']) ?? '')
      if (!bankName && loans.length === 1) return loans[0]
      if (!bankName) return undefined
      return loans.find(l => normalizeText(l.bankName) === bankName) ?? loans.find(l => normalizeText(l.bankName).toLowerCase() === bankName.toLowerCase()) ?? loans[0]
    }

    const ownRowMap = new Map<string, Array<{ id: string; date?: string; amount: number; notes?: string }>>()
    if (ownSheetName) {
      const ownRows = utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[ownSheetName])
      for (const [idx, r] of ownRows.entries()) {
        const bankName = normalizeText(pickValue(r, ['Bank', 'Bank Name']) ?? '')
        if (!bankName) continue
        const entry = {
          id: `own-import-${idx}-${Date.now()}`,
          date: toIsoDate(pickValue(r, ['Date', 'Contribution Date'])),
          amount: parseNumber(pickValue(r, ['Amount', 'Contribution Amount', 'Own Contribution'])),
          notes: normalizeText(pickValue(r, ['Notes', 'Narration'])) ? String(pickValue(r, ['Notes', 'Narration'])) : undefined,
        }
        const existing = ownRowMap.get(bankName) ?? []
        existing.push(entry)
        ownRowMap.set(bankName, existing)
      }
    }

    const loansWithOwn = loans.map((loan) => {
      const entries = ownRowMap.get(normalizeText(loan.bankName)) ?? []
      return { ...loan, ownContributions: entries.length ? entries : loan.ownContributions }
    })

    const payments: Payment[] = paymentSheetName ? utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[paymentSheetName]).map((r, i) => ({
      id: `pay-import-${i}-${Date.now()}`,
      loanId: createLoanByBank(r)?.id ?? loansWithOwn[0]?.id ?? '',
      date: toIsoDate(pickValue(r, ['Date', 'Payment Date', 'Transaction Date'])),
      amount: parseNumber(pickValue(r, ['Amount', 'EMI Amount', 'Part Payment Amount', 'Payment Amount'])),
      type: normalizePaymentType(pickValue(r, ['Type', 'Transaction Type', 'Payment Type'])),
      newOutstanding: parseOptionalNumber(pickValue(r, ['Outstanding After', 'Outstanding Balance', 'Balance Outstanding', 'OutstandingAfter'])),
      remainingTenure: parseOptionalNumber(pickValue(r, ['Remaining Tenure', 'Tenure Remaining', 'Remaining Months', 'RemainingTenure'])),
      notes: normalizeText(pickValue(r, ['Notes', 'Narration'])) ? String(pickValue(r, ['Notes', 'Narration'])) : undefined,
    })) : []

    const disbursals: Disbursal[] = disbSheetName ? utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[disbSheetName]).map((r, i) => ({
      id: `disb-import-${i}-${Date.now()}`,
      loanId: createLoanByBank(r)?.id ?? loansWithOwn[0]?.id ?? '',
      date: toIsoDate(pickValue(r, ['Date', 'Disbursal Date', 'Transaction Date'])),
      amount: parseNumber(pickValue(r, ['Amount', 'Disbursed Amount', 'Disbursement Amount'])),
      builderDemand: parseOptionalNumber(pickValue(r, ['Builder Demand', 'Builder Demand Amount', 'BuilderDemand'])),
      newEmi: parseOptionalNumber(pickValue(r, ['New EMI', 'Revised EMI', 'Updated EMI', 'NewEMI'])),
      remainingTenure: parseOptionalNumber(pickValue(r, ['Remaining Tenure', 'Tenure Remaining', 'RemainingMonths'])),
      notes: normalizeText(pickValue(r, ['Notes', 'Narration'])) ? String(pickValue(r, ['Notes', 'Narration'])) : undefined,
    })) : []

    const otherPayments: OtherPayment[] = otherSheetName ? utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[otherSheetName]).map((r, i) => ({
      id: `other-import-${i}-${Date.now()}`,
      loanId: createLoanByBank(r)?.id ?? loansWithOwn[0]?.id ?? '',
      date: toIsoDate(pickValue(r, ['Date', 'Payment Date', 'Transaction Date'])),
      amount: parseNumber(pickValue(r, ['Amount', 'Cost Amount', 'Other Amount'])),
      category: normalizeText(pickValue(r, ['Category', 'Type', 'Description']) ?? 'Other'),
      notes: normalizeText(pickValue(r, ['Notes', 'Narration'])) ? String(pickValue(r, ['Notes', 'Narration'])) : undefined,
    })) : []

    return { loans: loansWithOwn, payments, disbursals, otherPayments }
  } catch {
    return null
  }
}
