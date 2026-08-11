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
export function calcSummary(loan: Loan, payments: Payment[], disbursals: Disbursal[]) {
  const emiPayments = payments.filter(p => p.type === 'emi')
  const partPayments = payments.filter(p => p.type === 'part')
  const preEmiTotal = payments.filter(p => p.type === 'pre-emi').reduce((s, p) => s + p.amount, 0)
  const emiTotal = emiPayments.reduce((sum, p) => sum + p.amount, 0)
  const partPaymentTotal = partPayments.reduce((sum, p) => sum + p.amount, 0)
  const totalPaid = emiTotal + partPaymentTotal + preEmiTotal
  let balance = disbursals.length > 0 ? 0 : loan.loanAmount
  for (const d of disbursals) balance += d.amount
  let interestPaid = 0
  let totalPrincipalPaid = 0
  const rate = loan.interestRate / 100 / 12
  const sortedPayments = [...payments].sort((a, b) => a.date.localeCompare(b.date))
  for (const p of sortedPayments) {
    if (p.type === 'part') {
      const nb = p.newOutstanding ?? Math.max(0, balance - p.amount)
      totalPrincipalPaid += Math.max(0, balance - nb)
      balance = nb
    } else if (p.type === 'pre-emi') {
      interestPaid += p.amount
    } else if (p.newOutstanding != null) {
      const principal = Math.max(0, balance - p.newOutstanding)
      interestPaid += Math.max(0, p.amount - principal)
      totalPrincipalPaid += principal
      balance = p.newOutstanding
    } else {
      const interest = balance * rate
      const principal = Math.max(0, p.amount - interest)
      interestPaid += interest
      totalPrincipalPaid += principal
      balance = Math.max(0, balance - principal)
    }
  }
  const lastPayment = sortedPayments.length > 0 ? sortedPayments[sortedPayments.length - 1] : null

  return {
    outstandingBalance: Math.round(balance),
    emiTotal,
    emiCount: emiPayments.length,
    partPaymentTotal,
    partPaymentCount: partPayments.length,
    totalPaid: Math.round(totalPaid),
    interestPaid: Math.round(interestPaid),
    totalPrincipalPaid: Math.round(totalPrincipalPaid),
    lastPaymentDate: lastPayment?.date ?? null,
  }
}
