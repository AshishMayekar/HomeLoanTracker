export interface OwnContribution {
  id: string
  date?: string
  amount: number
  notes?: string
}
export interface Loan {
  id: string
  bankName: string
  loanAmount: number
  interestRate: number
  tenureMonths: number
  startDate: string
  emi: number
  outstandingOverride?: number
  propertyTotalCost?: number
  ownContributions?: OwnContribution[]
  notes?: string
}
export interface Payment {
  id: string
  loanId: string
  date: string
  amount: number
  type: 'emi' | 'pre-emi' | 'part'
  newOutstanding?: number
  remainingTenure?: number
  notes?: string
}
export interface Disbursal {
  id: string
  loanId: string
  date: string
  amount: number
  builderDemand?: number
  newOutstanding?: number
  newEmi?: number
  remainingTenure?: number
  notes?: string
}
export interface OtherPayment {
  id: string
  loanId: string
  date?: string
  amount: number
  category: string
  notes?: string
}
export function calcEMI(principal: number, annualRate: number, tenureMonths: number): number {
  const r = annualRate / 12 / 100
  if (r === 0) return Math.round(principal / tenureMonths)
  const x = Math.pow(1 + r, tenureMonths)
  return Math.round((principal * r * x) / (x - 1))
}
function getRateForDate(loan: Loan, date: string): number {
  const notes = (loan.notes ?? '').toLowerCase()
  if ((notes.includes('7.65') && notes.includes('7.4')) || (notes.includes('7.4') && notes.includes('7.65'))) {
    return date < '2026-02-01' ? 7.65 : 7.4
  }
  return loan.interestRate
}

export function calcPaymentInterest(loan: Loan, payment: Payment, payments: Payment[], disbursals: Disbursal[]): number {
  let balance = disbursals.length > 0 ? 0 : loan.loanAmount
  const events = [
    ...disbursals.map(d => ({ date: d.date, kind: 'disbursal' as const, value: d })),
    ...payments.map(p => ({ date: p.date, kind: 'payment' as const, value: p })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'disbursal' ? -1 : 1))

  for (const event of events) {
    if (event.kind === 'disbursal') {
      balance += event.value.amount
      continue
    }
    const current = event.value
    if (current.id === payment.id) {
      if (current.type !== 'emi') return 0
      if (current.newOutstanding != null) {
        return Math.max(0, current.amount - Math.max(0, balance - current.newOutstanding))
      }
      return Math.max(0, balance * getRateForDate(loan, current.date) / 100 / 12)
    }
    if (current.type === 'pre-emi') continue
    if (current.type === 'part') {
      balance = current.newOutstanding ?? Math.max(0, balance - current.amount)
    } else if (current.newOutstanding != null) {
      balance = current.newOutstanding
    } else {
      const interest = balance * getRateForDate(loan, current.date) / 100 / 12
      balance = Math.max(0, balance - Math.max(0, current.amount - interest))
    }
  }
  return 0
}

export function calcSummary(loan: Loan, payments: Payment[], disbursals: Disbursal[]) {
  const emiPayments = payments.filter(p => p.type === 'emi')
  const preEmiPayments = payments.filter(p => p.type === 'pre-emi')
  const partPayments = payments.filter(p => p.type === 'part')
  const preEmiTotal = preEmiPayments.reduce((s, p) => s + p.amount, 0)
  const emiTotal = [...emiPayments, ...preEmiPayments].reduce((sum, p) => sum + p.amount, 0)
  const partPaymentTotal = partPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = emiTotal + partPaymentTotal
  let balance = loan.loanAmount
  if (disbursals.length > 0) balance = 0
  let interestPaid = 0
  let totalPrincipalPaid = 0
  const events = [
    ...disbursals.map(d => ({ date: d.date, kind: 'disbursal' as const, value: d })),
    ...payments.map(p => ({ date: p.date, kind: 'payment' as const, value: p })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'disbursal' ? -1 : 1))
  for (const event of events) {
    if (event.kind === 'disbursal') {
      balance += event.value.amount
      continue
    }
    const p = event.value
    const rate = getRateForDate(loan, p.date) / 100 / 12
    if (p.type === 'pre-emi') {
      interestPaid += p.amount
      continue
    }
    const interest = p.type === 'part' ? 0 : p.newOutstanding != null
      ? Math.max(0, p.amount - Math.max(0, balance - p.newOutstanding))
      : balance * rate
    const principal = Math.max(0, p.amount - interest)
    interestPaid += interest
    totalPrincipalPaid += principal
    balance = p.newOutstanding != null ? p.newOutstanding : Math.max(0, balance - principal)
  }
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date))
  const lastPayment = sortedPayments.length > 0 ? sortedPayments[sortedPayments.length - 1] : null

  return {
    outstandingBalance: Math.round(balance),
    emiTotal,
    emiCount: emiPayments.length + preEmiPayments.length,
    partPaymentTotal,
    partPaymentCount: partPayments.length,
    totalPaid: Math.round(totalPaid),
    interestPaid: Math.round(interestPaid),
    totalPrincipalPaid: Math.round(totalPrincipalPaid),
    lastPaymentDate: lastPayment?.date ?? null,
  }
}
