import { useEffect, useRef, useState } from 'react'
import type { Disbursal, Loan, OtherPayment, OwnContribution, Payment } from '../utils/loanCalc'
import { calcEMI, calcPaymentInterest, calcSummary } from '../utils/loanCalc'
import {
  exportToExcel, importFromExcel, seedIfEmpty,
  loadDisbursals, loadLoans, loadOtherPayments, loadPayments,
  saveDisbursals, saveLoans, saveOtherPayments, savePayments,
} from '../utils/loanStorage'

type Tab = 'payments' | 'disbursements' | 'builder' | 'other'

function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}` }
function fmtCurrency(n: number) { return '₹' + n.toLocaleString('en-IN') }
function fmtDate(d: string | null) {
  if (!d) return '-'
  const text = d.trim()
  if (!text) return '-'
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    return new Date(year, month - 1, day).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  if (/^\d{4}-\d{2}$/.test(text)) {
    const [year, month] = text.split('-').map(Number)
    return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  }
  const parsed = new Date(text)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }
  return text
}

const OTHER_COST_CATEGORIES = [
  'Agreement Stamp Duty', 'Loan Stamp Duty', 'TDS', 'Agreement Cash',
  'Registration', 'Bank Processing Fee', 'Other',
]

const IC = 'border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:ring-1 focus:ring-blue-500'
const IC_FULL = 'border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500'

function DR({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-2 text-xs"><span className="text-gray-400">{label}</span><span className="text-gray-800 font-medium text-right">{value}</span></div>
}

function TB({ type }: { type: string }) {
  const cfg: Record<string, string> = { emi: 'bg-blue-100 text-blue-700', 'pre-emi': 'bg-amber-100 text-amber-700', part: 'bg-green-100 text-green-700', disbursement: 'bg-purple-100 text-purple-700' }
  const labels: Record<string, string> = { emi: 'EMI', 'pre-emi': 'Pre-EMI', part: 'Part', disbursement: 'Disbursement' }
  return <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${cfg[type] ?? 'bg-gray-100 text-gray-600'}`}>{labels[type] ?? type}</span>
}

function Del({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-gray-300 hover:text-red-500 transition-colors leading-none">&times;</button>
}

function EditBtn({ onClick }: { onClick: () => void }) {
  return <button type="button" onClick={onClick} className="text-blue-500 hover:text-blue-700 text-[10px] hover:underline">Edit</button>
}

function SCard({ label, value, sub, tone, action }: {
  label: string; value: React.ReactNode; sub?: string
  tone?: 'blue' | 'indigo' | 'orange' | 'green' | 'gray'
  action?: React.ReactNode
}) {
  const cls = tone === 'blue' ? 'text-blue-700' : tone === 'indigo' ? 'text-indigo-600'
    : tone === 'orange' ? 'text-orange-600' : tone === 'green' ? 'text-green-700' : 'text-gray-800'
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-tight">{label}</p>
      <p className={`font-bold mt-0.5 tabular-nums text-lg leading-tight ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      {action}
    </div>
  )
}

function LoanOutstandingCard({ outstanding, remainingToBuilder, total, editing, input, onEdit, onInput, onSave, onCancel }: {
  outstanding: number; remainingToBuilder: number | null; total: number
  editing: boolean; input: string; onEdit: () => void; onInput: (value: string) => void; onSave: () => void; onCancel: () => void
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-tight">Loan Outstanding</p>
      {editing ? <div className="mt-1 flex flex-col gap-1"><input type="number" value={input} onChange={e => onInput(e.target.value)} className={IC} /><div className="flex gap-2"><EditBtn onClick={onSave} /><button type="button" onClick={onCancel} className="text-gray-400 text-[10px]">Cancel</button></div></div> : <><p className="font-bold mt-0.5 tabular-nums text-lg leading-tight text-blue-700">{fmtCurrency(outstanding)}</p><EditBtn onClick={onEdit} /></>}
      <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-tight">Remaining to Builder</p>
          <p className="font-bold tabular-nums text-sm leading-tight text-orange-600">{remainingToBuilder != null ? fmtCurrency(remainingToBuilder) : '-'}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 leading-tight">Total</p>
          <p className="font-bold tabular-nums text-sm leading-tight text-gray-800">{fmtCurrency(total)}</p>
        </div>
      </div>
    </div>
  )
}

interface LFD { bankName: string; loanAmount: string; interestRate: string; tenureMonths: string; startDate: string; emi: string; notes: string }
const ELF: LFD = { bankName: '', loanAmount: '', interestRate: '', tenureMonths: '', startDate: '', emi: '', notes: '' }

function LoanForm({ data, isEdit, onChange, onSubmit, onCancel }: {
  data: LFD; isEdit: boolean
  onChange: (f: keyof LFD, v: string) => void
  onSubmit: (e: React.FormEvent) => void; onCancel: () => void
}) {
  return (
    <form onSubmit={onSubmit} className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-gray-800">{isEdit ? 'Edit Loan' : 'Add Loan'}</h3>
      <div className="grid sm:grid-cols-3 gap-3">
        {([
          { label: 'Bank Name', field: 'bankName', type: 'text', placeholder: 'e.g. ICICI' },
          { label: 'Loan Amount (₹)', field: 'loanAmount', type: 'number', placeholder: '50,00,000' },
          { label: 'Interest Rate (%)', field: 'interestRate', type: 'number', placeholder: '8.5', step: '0.01' },
          { label: 'Tenure (months)', field: 'tenureMonths', type: 'number', placeholder: '240' },
          { label: 'Start Date', field: 'startDate', type: 'month', placeholder: '' },
          { label: 'Initial EMI (₹)', field: 'emi', type: 'number', placeholder: 'Auto' },
        ] as const).map(({ label, field, type, placeholder, ...rest }) => (
          <div key={field} className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-gray-500">{label} <span className="text-red-400">*</span></label>
            <input type={type} value={data[field as keyof LFD]}
              onChange={e => onChange(field as keyof LFD, e.target.value)}
              placeholder={placeholder} required {...('step' in rest ? { step: rest.step } : {})} className={IC_FULL} />
          </div>
        ))}
        <div className="flex flex-col gap-1 sm:col-span-3">
          <label className="text-[11px] font-medium text-gray-500">Notes</label>
          <input type="text" value={data.notes} onChange={e => onChange('notes', e.target.value)}
            placeholder="Loan number, account..." className={IC_FULL} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium transition-colors">{isEdit ? 'Save' : 'Add Loan'}</button>
        <button type="button" onClick={onCancel} className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
      </div>
    </form>
  )
}

export function LoanNoter() {
  const [loans, setLoans] = useState<Loan[]>(() => loadLoans())
  const [payments, setPayments] = useState<Payment[]>(() => loadPayments())
  const [disbursals, setDisbursals] = useState<Disbursal[]>(() => loadDisbursals())
  const [otherPayments, setOtherPayments] = useState<OtherPayment[]>(() => loadOtherPayments())
  const [tab, setTab] = useState<Tab>('payments')
  const [showLoanForm, setShowLoanForm] = useState(false)
  const [loanForm, setLoanForm] = useState<LFD>(ELF)
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null)
  const [editOutstanding, setEditOutstanding] = useState(false)
  const [outstandingInput, setOutstandingInput] = useState('')

  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [payType, setPayType] = useState<'emi' | 'pre-emi' | 'part'>('emi')
  const [payAmount, setPayAmount] = useState('')
  const [payNewOut, setPayNewOut] = useState('')
  const [payTenure, setPayTenure] = useState('')
  const [payNotes, setPayNotes] = useState('')

  const [disbDate, setDisbDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [disbDemand, setDisbDemand] = useState('')
  const [disbAmount, setDisbAmount] = useState('')
  const [disbNewEmi, setDisbNewEmi] = useState('')
  const [disbTenure, setDisbTenure] = useState('')
  const [disbNotes, setDisbNotes] = useState('')

  const [propCostInput, setPropCostInput] = useState('')
  const [editPropCost, setEditPropCost] = useState(false)
  const [ownDate, setOwnDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [ownAmount, setOwnAmount] = useState('')
  const [ownNotes, setOwnNotes] = useState('')

  const [otherDate, setOtherDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [otherCategory, setOtherCategory] = useState(OTHER_COST_CATEGORIES[0])
  const [otherAmount, setOtherAmount] = useState('')
  const [otherNotes, setOtherNotes] = useState('')

  const [paySort, setPaySort] = useState<'asc' | 'desc'>('desc')
  const [disbSort, setDisbSort] = useState<'asc' | 'desc'>('desc')
  const [ownSort, setOwnSort] = useState<'asc' | 'desc'>('asc')
  const [otherSort, setOtherSort] = useState<'asc' | 'desc'>('asc')

  const [editPay, setEditPay] = useState<Payment | null>(null)
  const [editDisb, setEditDisb] = useState<Disbursal | null>(null)
  const [editOwn, setEditOwn] = useState<OwnContribution | null>(null)
  const [editOther, setEditOther] = useState<OtherPayment | null>(null)

  const [exporting, setExporting] = useState(false)
  const importRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    seedIfEmpty().then(seeded => {
      if (!seeded) return
      setLoans(loadLoans()); setPayments(loadPayments()); setDisbursals(loadDisbursals()); setOtherPayments(loadOtherPayments())
    })
  }, [])

  const loan = loans[0] ?? null
  const loanPayments = payments.filter(p => loan && p.loanId === loan.id)
  const loanDisbursals = disbursals.filter(d => loan && d.loanId === loan.id).sort((a, b) => a.date.localeCompare(b.date))
  const loanOther = otherPayments.filter(o => loan && o.loanId === loan.id).sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''))
  const summary = loan ? calcSummary(loan, loanPayments, loanDisbursals) : null
  const displayOutstanding = loan?.outstandingOverride ?? summary?.outstandingBalance ?? 0

  const totalDisbursed = loanDisbursals.reduce((s, d) => s + d.amount, 0)
  const totalOwn = (loan?.ownContributions ?? []).reduce((s, c) => s + c.amount, 0)
  const totalOtherCosts = loanOther.reduce((s, o) => s + o.amount, 0)
  const grandTotalPaid = (summary?.totalPaid ?? 0) + totalOwn + totalOtherCosts
  const totalShortfall = loanDisbursals.reduce((s, d) => s + (d.builderDemand && d.builderDemand > d.amount ? d.builderDemand - d.amount : 0), 0)
  const paidToBuilder = totalDisbursed + totalOwn
  const remainingToBuilder = loan?.propertyTotalCost != null ? loan.propertyTotalCost - paidToBuilder : null
  const totalProjectValue = displayOutstanding + (remainingToBuilder ?? 0)
  const sortedDisbursals = [...loanDisbursals].sort((a, b) => a.date.localeCompare(b.date))
  const disbursalOutstandings = new Map<string, number>()
  let previousPaymentOutstanding: number | undefined
  const outstandingEvents = [
    ...loanPayments.map(p => ({ date: p.date, kind: 'payment' as const, value: p })),
    ...sortedDisbursals.map(d => ({ date: d.date, kind: 'disbursal' as const, value: d })),
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'disbursal' ? -1 : 1))
  outstandingEvents.forEach(event => {
    if (event.kind === 'payment') {
      if (event.value.newOutstanding != null) previousPaymentOutstanding = event.value.newOutstanding
    } else if (previousPaymentOutstanding != null) {
      disbursalOutstandings.set(event.value.id, previousPaymentOutstanding + event.value.amount)
    }
  })
  const runningTotals = new Map<string, number>()
  sortedDisbursals.reduce((total, d) => { const next = total + d.amount; runningTotals.set(d.id, next); return next }, 0)
  const currentEmi = [...loanDisbursals].filter(d => d.newEmi).sort((a, b) => b.date.localeCompare(a.date))[0]?.newEmi ?? (loan?.emi ?? 0)
  const paymentHistory = [...loanPayments.map(p => ({ ...p, kind: 'payment' as const })), ...loanDisbursals.map(d => ({
    id: d.id,
    loanId: d.loanId,
    date: d.date,
    amount: d.amount,
    type: 'disbursement' as const,
    newOutstanding: disbursalOutstandings.get(d.id),
    remainingTenure: d.remainingTenure,
    notes: d.notes,
    kind: 'disbursement' as const,
  }))].sort((a, b) => b.date.localeCompare(a.date))

  function persist(nl: Loan[], np: Payment[] = payments, nd: Disbursal[] = disbursals, no: OtherPayment[] = otherPayments) {
    setLoans(nl); saveLoans(nl); setPayments(np); savePayments(np); setDisbursals(nd); saveDisbursals(nd); setOtherPayments(no); saveOtherPayments(no)
  }

  function handleLFChange(f: keyof LFD, v: string) {
    const n = { ...loanForm, [f]: v }
    if (['loanAmount', 'interestRate', 'tenureMonths'].includes(f)) {
      const p = parseFloat(n.loanAmount), r = parseFloat(n.interestRate), t = parseInt(n.tenureMonths, 10)
      if (p > 0 && r > 0 && t > 0) n.emi = String(calcEMI(p, r, t))
    }
    setLoanForm(n)
  }

  function handleSaveLoan(e: React.FormEvent) {
    e.preventDefault()
    const base = editingLoanId ? loans.find(l => l.id === editingLoanId) : undefined
    const d: Loan = {
      ...(base ?? {}), id: editingLoanId ?? uid(),
      bankName: loanForm.bankName, loanAmount: parseFloat(loanForm.loanAmount),
      interestRate: parseFloat(loanForm.interestRate), tenureMonths: parseInt(loanForm.tenureMonths, 10),
      startDate: loanForm.startDate, emi: parseFloat(loanForm.emi), notes: loanForm.notes || undefined,
    }
    persist(editingLoanId ? loans.map(l => l.id === editingLoanId ? d : l) : [...loans, d])
    setShowLoanForm(false); setEditingLoanId(null)
  }

  function openEditLoan() {
    if (!loan) return
    setLoanForm({ bankName: loan.bankName, loanAmount: String(loan.loanAmount), interestRate: String(loan.interestRate),
      tenureMonths: String(loan.tenureMonths), startDate: loan.startDate, emi: String(loan.emi), notes: loan.notes ?? '' })
    setEditingLoanId(loan.id); setShowLoanForm(true)
  }

  function handleAddPayment(e: React.FormEvent) {
    e.preventDefault()
    if (!loan || !payAmount) return
    const p: Payment = { id: uid(), loanId: loan.id, date: payDate, amount: parseFloat(payAmount), type: payType,
      newOutstanding: payNewOut ? parseFloat(payNewOut) : undefined,
      remainingTenure: payTenure ? parseInt(payTenure, 10) : undefined, notes: payNotes || undefined }
    persist(loans, [...payments, p]); setPayAmount(''); setPayNewOut(''); setPayTenure(''); setPayNotes('')
  }
  function saveEditPay() {
    if (!editPay) return
    persist(loans, payments.map(p => p.id === editPay.id ? editPay : p)); setEditPay(null)
  }
  function handleAddDisb(e: React.FormEvent) {
    e.preventDefault()
    if (!loan || !disbAmount) return
    persist(loans, payments, [...disbursals, { id: uid(), loanId: loan.id, date: disbDate, amount: parseFloat(disbAmount),
      builderDemand: disbDemand ? parseFloat(disbDemand) : undefined, newEmi: disbNewEmi ? parseFloat(disbNewEmi) : undefined,
      remainingTenure: disbTenure ? parseInt(disbTenure, 10) : undefined, notes: disbNotes || undefined }])
    setDisbDemand(''); setDisbAmount(''); setDisbNewEmi(''); setDisbTenure(''); setDisbNotes('')
  }
  function saveEditDisb() {
    if (!editDisb) return
    persist(loans, payments, disbursals.map(d => d.id === editDisb.id ? editDisb : d)); setEditDisb(null)
  }
  function handleAddOwn(e: React.FormEvent) {
    e.preventDefault()
    if (!loan || !ownAmount) return
    const c: OwnContribution = { id: uid(), date: ownDate || undefined, amount: parseFloat(ownAmount), notes: ownNotes || undefined }
    persist(loans.map(l => l.id === loan.id ? { ...l, ownContributions: [...(l.ownContributions ?? []), c] } : l))
    setOwnAmount(''); setOwnNotes('')
  }
  function saveEditOwn() {
    if (!editOwn || !loan) return
    persist(loans.map(l => l.id === loan.id ? { ...l, ownContributions: (l.ownContributions ?? []).map(c => c.id === editOwn.id ? editOwn : c) } : l)); setEditOwn(null)
  }
  function handleAddOther(e: React.FormEvent) {
    e.preventDefault()
    if (!loan || !otherAmount) return
    persist(loans, payments, disbursals, [...otherPayments, { id: uid(), loanId: loan.id, date: otherDate || undefined, amount: parseFloat(otherAmount), category: otherCategory, notes: otherNotes || undefined }])
    setOtherAmount(''); setOtherNotes('')
  }
  function saveEditOther() {
    if (!editOther) return
    persist(loans, payments, disbursals, otherPayments.map(o => o.id === editOther.id ? editOther : o)); setEditOther(null)
  }
  function deletePayment(id: string) {
    persist(loans, payments.filter(p => p.id !== id))
    if (editPay?.id === id) setEditPay(null)
  }
  function deleteDisbursal(id: string) {
    persist(loans, payments, disbursals.filter(d => d.id !== id))
    if (editDisb?.id === id) setEditDisb(null)
  }
  function deleteOwn(id: string) {
    if (!loan) return
    persist(loans.map(l => l.id === loan.id ? { ...l, ownContributions: (l.ownContributions ?? []).filter(c => c.id !== id) } : l))
    if (editOwn?.id === id) setEditOwn(null)
  }
  function deleteOther(id: string) {
    persist(loans, payments, disbursals, otherPayments.filter(o => o.id !== id))
    if (editOther?.id === id) setEditOther(null)
  }
  function savePropertyCost() {
    if (!loan || !propCostInput) return
    persist(loans.map(l => l.id === loan.id ? { ...l, propertyTotalCost: parseFloat(propCostInput) } : l))
    setEditPropCost(false)
  }
  async function handleExport() {
    setExporting(true)
    try { await exportToExcel(loans, payments, disbursals, otherPayments) } finally { setExporting(false) }
  }
  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return
    const r = await importFromExcel(file); if (r) persist(r.loans, r.payments, r.disbursals, r.otherPayments)
    e.target.value = ''
  }

  if (!loan && !showLoanForm) return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900">Loan Noter</h2>
        <button onClick={() => importRef.current?.click()} className="text-xs border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50">Import Excel</button>
        <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl px-6 py-10 flex flex-col items-center gap-2 text-center">
        <p className="text-gray-700 font-medium">No loan added yet</p>
        <p className="text-xs text-gray-400">Add your home loan to start tracking</p>
        <button onClick={() => { setLoanForm(ELF); setShowLoanForm(true) }} className="mt-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium">Add Loan</button>
      </div>
    </div>
  )

  if (showLoanForm) return <LoanForm data={loanForm} isEdit={!!editingLoanId} onChange={handleLFChange} onSubmit={handleSaveLoan} onCancel={() => { setShowLoanForm(false); setEditingLoanId(null) }} />

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-base font-semibold text-gray-900">Loan Noter</h2>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button onClick={() => { setLoanForm(ELF); setEditingLoanId(null); setShowLoanForm(true) }} className="text-xs border border-blue-300 text-blue-700 rounded px-2.5 py-1 hover:bg-blue-50">+ Loan</button>
          <button onClick={handleExport} disabled={exporting || !loans.length} className="text-xs border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50 disabled:opacity-40">{exporting ? 'Exporting...' : 'Export Excel'}</button>
          <button onClick={() => importRef.current?.click()} className="text-xs border border-gray-300 rounded px-2.5 py-1 hover:bg-gray-50">Import Excel</button>
          <input ref={importRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
        </div>
      </div>
      {loan && summary && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            <LoanOutstandingCard outstanding={displayOutstanding} remainingToBuilder={remainingToBuilder} total={totalProjectValue} editing={editOutstanding} input={outstandingInput} onEdit={() => { setOutstandingInput(String(displayOutstanding)); setEditOutstanding(true) }} onInput={setOutstandingInput} onSave={() => {
              if (!outstandingInput) return
              persist(loans.map(l => l.id === loan.id ? { ...l, outstandingOverride: parseFloat(outstandingInput) } : l))
              setEditOutstanding(false)
            }} onCancel={() => setEditOutstanding(false)} />
            <SCard label="EMI Paid" tone="indigo" value={fmtCurrency(summary.emiTotal)} sub={`${summary.emiCount} payments`} />
            <SCard label="Interest Paid" tone="orange" value={fmtCurrency(summary.interestPaid)} />
            <SCard label="Part Payments" tone="green" value={fmtCurrency(summary.partPaymentTotal)} sub={`${summary.partPaymentCount} times`} />
            <SCard label="Own Contributions" value={fmtCurrency(totalOwn)} sub={`${(loan.ownContributions ?? []).length} entries`} />
            <SCard label="Other Costs" value={fmtCurrency(totalOtherCosts)} sub={`${loanOther.length} entries`} />
            <SCard label="Grand Total Paid" value={fmtCurrency(grandTotalPaid)} sub="All categories" />
          </div>
          <div className="grid md:grid-cols-4 gap-4 items-start">
            <div className="flex flex-col gap-3">
              <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5">
                <div className="flex items-center justify-between"><h3 className="text-xs font-semibold text-gray-700">Loan Details</h3><EditBtn onClick={openEditLoan} /></div>
                <DR label="Bank" value={loan.bankName} /><DR label="Sanctioned" value={fmtCurrency(loan.loanAmount)} /><DR label="Total Disbursed" value={fmtCurrency(totalDisbursed)} />
                <DR label="Rate" value={`${loan.interestRate}% p.a.`} /><DR label="Tenure" value={`${loan.tenureMonths} mo`} /><DR label="Start" value={fmtDate(loan.startDate)} /><DR label="Initial EMI" value={fmtCurrency(loan.emi)} />
                {currentEmi !== loan.emi && <DR label="Current EMI" value={fmtCurrency(currentEmi)} />}
                {loan.notes && <DR label="Notes" value={loan.notes} />}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-3 flex flex-col gap-1.5">
                <h3 className="text-xs font-semibold text-gray-700">Loan Status</h3>
                <DR label="EMI Payments" value={String(summary.emiCount)} /><DR label="Part Payments" value={String(summary.partPaymentCount)} />
                <DR label="Principal Repaid" value={fmtCurrency(summary.totalPrincipalPaid)} /><DR label="Disbursals" value={`${loanDisbursals.length} · ${fmtCurrency(totalDisbursed)}`} />
                <DR label="Last Payment" value={fmtDate(summary.lastPaymentDate)} />
              </div>
            </div>
            <div className="md:col-span-3 flex flex-col gap-3">
              <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5 text-sm font-medium">
                {(['payments', 'disbursements', 'builder', 'other'] as Tab[]).map(t => <button key={t} onClick={() => setTab(t)} className={`flex-1 py-1 rounded-md transition-colors ${tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-4 text-xs text-gray-500">
                {tab === 'payments' && (
                  <div className="space-y-3">
                    <form onSubmit={handleAddPayment} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Payment</h3>
                      <div className="grid gap-2">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-2 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Date</label>
                            <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className={IC} />
                          </div>
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Type</label>
                            <div className="flex gap-0">
                              <button type="button" onClick={() => setPayType('emi')} className={`flex-1 py-1 px-1 rounded-l text-[10px] font-medium transition-colors ${payType === 'emi' ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 hover:bg-gray-100'}`}>EMI</button>
                              <button type="button" onClick={() => setPayType('pre-emi')} className={`flex-1 py-1 px-1 text-[10px] font-medium transition-colors ${payType === 'pre-emi' ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 border-l-0 hover:bg-gray-100'}`}>Pre-EMI</button>
                              <button type="button" onClick={() => setPayType('part')} className={`flex-1 py-1 px-1 rounded-r text-[10px] font-medium transition-colors ${payType === 'part' ? 'bg-blue-600 text-white' : 'border border-gray-300 text-gray-600 border-l-0 hover:bg-gray-100'}`}>Part</button>
                            </div>
                          </div>
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Amount (₹)</label>
                            <input type="number" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder="₹" className={IC} />
                          </div>
                          <div className="col-span-4 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Outstanding After (₹)</label>
                            <input type="number" value={payNewOut} onChange={e => setPayNewOut(e.target.value)} placeholder="Enter from bank" className={IC} />
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-4 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Rem. Tenure (Mo)</label>
                            <input type="number" value={payTenure} onChange={e => setPayTenure(e.target.value)} placeholder="Optional" className={IC} />
                          </div>
                          <div className="col-span-8 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">Notes</label>
                            <input type="text" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" className={IC} />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-start pt-1">
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-xs font-medium">Add Payment</button>
                      </div>
                    </form>
                    {paymentHistory.length ? (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600 font-medium">Total: {paymentHistory.length} entries</div>
                        <div className="overflow-hidden border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200 text-left">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setPaySort(paySort === 'asc' ? 'desc' : 'asc')}>Date {paySort === 'asc' ? '↑' : '↓'}</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Type</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Amount</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Interest</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Outstanding After</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Remaining Tenure</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Notes</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {[...paymentHistory].sort((a, b) => paySort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)).map(row => {
                                const interest = row.kind === 'payment' ? calcPaymentInterest(loan, row, loanPayments, loanDisbursals) : 0
                                return (
                                  <tr key={row.id} className="align-top">
                                    {editPay?.id === row.id ? (
                                      <>
                                        <td className="px-2 py-2"><input type="date" value={editPay.date} onChange={e => setEditPay({ ...editPay, date: e.target.value })} className={IC} /></td>
                                        <td className="px-2 py-2"><select value={editPay.type} onChange={e => setEditPay({ ...editPay, type: e.target.value as Payment['type'] })} className={IC}><option value="emi">EMI</option><option value="pre-emi">Pre-EMI</option><option value="part">Part</option></select></td>
                                        <td className="px-2 py-2"><input type="number" value={editPay.amount} onChange={e => setEditPay({ ...editPay, amount: parseFloat(e.target.value) || 0 })} className={IC} /></td>
                                        <td className="px-2 py-2">-</td>
                                        <td className="px-2 py-2"><input type="number" value={editPay.newOutstanding ?? ''} onChange={e => setEditPay({ ...editPay, newOutstanding: e.target.value ? parseFloat(e.target.value) : undefined })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="number" value={editPay.remainingTenure ?? ''} onChange={e => setEditPay({ ...editPay, remainingTenure: e.target.value ? parseInt(e.target.value, 10) : undefined })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="text" value={editPay.notes ?? ''} onChange={e => setEditPay({ ...editPay, notes: e.target.value || undefined })} className={IC} /><div className="flex gap-2 mt-1"><EditBtn onClick={saveEditPay} /><button type="button" onClick={() => setEditPay(null)} className="text-gray-400 hover:text-gray-600 text-[10px]">Cancel</button></div></td>
                                      </>
                                    ) : (
                                      <>
                                        <td className="px-2 py-2">{fmtDate(row.date)}</td>
                                        <td className="px-2 py-2"><TB type={row.type} /></td>
                                        <td className="px-2 py-2 tabular-nums text-gray-800">{fmtCurrency(row.amount)}</td>
                                        <td className="px-2 py-2 tabular-nums text-orange-600 font-medium">{row.type === 'emi' ? fmtCurrency(Math.round(interest)) : '-'}</td>
                                        <td className="px-2 py-2 tabular-nums text-gray-700">{row.newOutstanding != null ? fmtCurrency(row.newOutstanding) : '-'}</td>
                                        <td className="px-2 py-2 tabular-nums text-gray-700">{row.remainingTenure ?? '-'}</td>
                                        <td className="px-2 py-2 max-w-[180px] text-gray-500">{row.notes ?? '-'}</td>
                                      </>
                                    )}
                                    <td className="px-2 py-2">{row.kind === 'payment' && <div className="flex items-center gap-2">{editPay?.id !== row.id && <EditBtn onClick={() => setEditPay(row)} />}<Del onClick={() => deletePayment(row.id)} /></div>}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p>No payment entries yet.</p>
                    )}
                  </div>
                )}
                {tab === 'disbursements' && (
                  <div className="space-y-3">
                    <form onSubmit={handleAddDisb} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Disbursal</h3>
                      <div className="grid gap-2">
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">DATE</label>
                            <input type="date" value={disbDate} onChange={e => setDisbDate(e.target.value)} className={IC} />
                          </div>
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">BUILDER DEMAND (₹)</label>
                            <input type="number" value={disbDemand} onChange={e => setDisbDemand(e.target.value)} placeholder="Optional" className={IC} />
                          </div>
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">BANK DISBURSED (₹)</label>
                            <input type="number" value={disbAmount} onChange={e => setDisbAmount(e.target.value)} placeholder="Required" className={IC} />
                          </div>
                        </div>
                        <div className="grid grid-cols-12 gap-2">
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">NEW EMI (₹)</label>
                            <input type="number" value={disbNewEmi} onChange={e => setDisbNewEmi(e.target.value)} placeholder="As per bank" className={IC} />
                          </div>
                          <div className="col-span-3 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">REM. TENURE (MO)</label>
                            <input type="number" value={disbTenure} onChange={e => setDisbTenure(e.target.value)} placeholder="As per bank" className={IC} />
                          </div>
                          <div className="col-span-6 flex flex-col gap-1">
                            <label className="text-[11px] text-gray-500">NOTES</label>
                            <input type="text" value={disbNotes} onChange={e => setDisbNotes(e.target.value)} placeholder="e.g. 3rd floor slab" className={IC} />
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-start pt-1">
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-1.5 text-xs font-medium">Add Disbursal</button>
                      </div>
                    </form>
                    {loanDisbursals.length ? (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600 font-medium">Disbursals ({loanDisbursals.length})</div>
                        <div className="overflow-hidden border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200 text-left">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setDisbSort(disbSort === 'asc' ? 'desc' : 'asc')}>Date {disbSort === 'asc' ? '↑' : '↓'}</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Demand</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Disbursed</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Shortfall</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Running Total</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">New EMI</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Tenure</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Notes</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {[...loanDisbursals].sort((a, b) => disbSort === 'asc' ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)).map(d => {
                                const shortfall = d.builderDemand && d.builderDemand > d.amount ? d.builderDemand - d.amount : 0
                                return (
                                  <tr key={d.id} className="align-top">
                                    {editDisb?.id === d.id ? (
                                      <>
                                        <td className="px-2 py-2"><input type="date" value={editDisb.date} onChange={e => setEditDisb({ ...editDisb, date: e.target.value })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="number" value={editDisb.builderDemand ?? ''} onChange={e => setEditDisb({ ...editDisb, builderDemand: e.target.value ? parseFloat(e.target.value) : undefined })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="number" value={editDisb.amount} onChange={e => setEditDisb({ ...editDisb, amount: parseFloat(e.target.value) || 0 })} className={IC} /></td>
                                        <td className="px-2 py-2">-</td><td className="px-2 py-2">-</td>
                                        <td className="px-2 py-2"><input type="number" value={editDisb.newEmi ?? ''} onChange={e => setEditDisb({ ...editDisb, newEmi: e.target.value ? parseFloat(e.target.value) : undefined })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="number" value={editDisb.remainingTenure ?? ''} onChange={e => setEditDisb({ ...editDisb, remainingTenure: e.target.value ? parseInt(e.target.value, 10) : undefined })} className={IC} /></td>
                                        <td className="px-2 py-2"><input type="text" value={editDisb.notes ?? ''} onChange={e => setEditDisb({ ...editDisb, notes: e.target.value || undefined })} className={IC} /></td>
                                      </>
                                    ) : <><td className="px-2 py-2">{fmtDate(d.date)}</td><td className="px-2 py-2">{d.builderDemand != null ? fmtCurrency(d.builderDemand) : '-'}</td><td className="px-2 py-2">{fmtCurrency(d.amount)}</td><td className="px-2 py-2">{shortfall > 0 ? fmtCurrency(shortfall) : '-'}</td><td className="px-2 py-2">{fmtCurrency(runningTotals.get(d.id) ?? d.amount)}</td><td className="px-2 py-2">{d.newEmi != null ? fmtCurrency(d.newEmi) : '-'}</td><td className="px-2 py-2">{d.remainingTenure ?? '-'}</td><td className="px-2 py-2 text-gray-500">{d.notes ?? '-'}</td></>}
                                    <td className="px-2 py-2"><div className="flex items-center gap-2">{editDisb?.id === d.id ? <div className="flex gap-2"><EditBtn onClick={saveEditDisb} /><button type="button" onClick={() => setEditDisb(null)} className="text-gray-400 text-[10px]">Cancel</button></div> : <EditBtn onClick={() => setEditDisb(d)} />}<Del onClick={() => deleteDisbursal(d.id)} /></div></td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ) : (
                      <p>No disbursement entries yet.</p>
                    )}
                  </div>
                )}
                {tab === 'builder' && (
                  <div className="space-y-3">
                    <div className="grid md:grid-cols-3 gap-2">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-gray-400">Property Total Cost</p>
                          {!editPropCost && <p className="mt-1 text-lg font-bold text-gray-800 tabular-nums">{loan.propertyTotalCost != null ? fmtCurrency(loan.propertyTotalCost) : '-'}</p>}
                        </div>
                        {!editPropCost && <EditBtn onClick={() => { setPropCostInput(String(loan.propertyTotalCost ?? '')); setEditPropCost(true) }} />}
                        {editPropCost && <div className="flex gap-2 mt-2"><input type="number" value={propCostInput} onChange={e => setPropCostInput(e.target.value)} placeholder="Enter total property cost" className={IC} /><EditBtn onClick={savePropertyCost} /><button type="button" onClick={() => setEditPropCost(false)} className="text-gray-400 text-[10px]">Cancel</button></div>}
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Paid to Builder</p>
                        <p className="mt-1 text-lg font-bold text-red-600 tabular-nums">{fmtCurrency(paidToBuilder)}</p>
                        <p className="mt-1 text-[10px] text-gray-400">Bank {fmtCurrency(totalDisbursed)} + Own {fmtCurrency(totalOwn)}</p>
                      </div>
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                        <p className="text-[10px] uppercase tracking-wide text-gray-400">Remaining to Builder</p>
                        <p className="mt-1 text-lg font-bold text-red-600 tabular-nums">{remainingToBuilder != null ? fmtCurrency(remainingToBuilder) : '-'}</p>
                      </div>
                    </div>
                    <form onSubmit={handleAddOwn} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Own Contributions</h3>
                      </div>
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <label className="col-span-2 flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Date</span>
                          <input type="date" value={ownDate} onChange={e => setOwnDate(e.target.value)} className={IC} />
                        </label>
                        <label className="col-span-3 flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Amount</span>
                          <input type="number" value={ownAmount} onChange={e => setOwnAmount(e.target.value)} className={IC} />
                        </label>
                        <label className="col-span-6 flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Notes</span>
                          <input type="text" value={ownNotes} onChange={e => setOwnNotes(e.target.value)} placeholder="Optional" className={IC} />
                        </label>
                      </div>
                      <button type="submit" className="col-span-1 bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">Add</button>
                    </form>
                    {(loan.ownContributions ?? []).length ? (
                      <div className="space-y-2">
                        <div className="overflow-hidden border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200 text-left">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setOwnSort(ownSort === 'asc' ? 'desc' : 'asc')}>Date {ownSort === 'asc' ? '↑' : '↓'}</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Amount</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Notes</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {[...(loan.ownContributions ?? [])].sort((a, b) => ownSort === 'asc' ? (a.date ?? '').localeCompare(b.date ?? '') : (b.date ?? '').localeCompare(a.date ?? '')).map((c, index) => (
                                <tr key={c.id ?? `${c.date ?? 'date'}-${index}`} className="align-top">
                                  {editOwn?.id === c.id ? <><td className="px-2 py-2"><input type="date" value={editOwn.date ?? ''} onChange={e => setEditOwn({ ...editOwn, date: e.target.value || undefined })} className={IC} /></td><td className="px-2 py-2"><input type="number" value={editOwn.amount} onChange={e => setEditOwn({ ...editOwn, amount: parseFloat(e.target.value) || 0 })} className={IC} /></td><td className="px-2 py-2"><input type="text" value={editOwn.notes ?? ''} onChange={e => setEditOwn({ ...editOwn, notes: e.target.value || undefined })} className={IC} /></td></> : <><td className="px-2 py-2">{c.date ? fmtDate(c.date) : '-'}</td><td className="px-2 py-2 tabular-nums text-gray-800">{fmtCurrency(c.amount)}</td><td className="px-2 py-2 text-gray-500">{c.notes ?? '-'}</td></>}
                                  <td className="px-2 py-2"><div className="flex items-center gap-2">{editOwn?.id === c.id ? <div className="flex gap-2"><EditBtn onClick={saveEditOwn} /><button type="button" onClick={() => setEditOwn(null)} className="text-gray-400 text-[10px]">Cancel</button></div> : <EditBtn onClick={() => setEditOwn(c)} />}<Del onClick={() => deleteOwn(c.id)} /></div></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-left text-xs text-gray-600 font-medium">Total: {fmtCurrency(totalOwn)}</div>
                      </div>
                    ) : (
                      <p>No own contributions yet.</p>
                    )}
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                      <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Bank Disbursals</h3>
                      {loanDisbursals.length ? <div className="mt-2 space-y-1.5">{loanDisbursals.map(d => <div key={d.id} className="flex items-center justify-between gap-2 text-xs"><span className="text-gray-500">{fmtDate(d.date)}</span><span className="font-medium text-gray-800 tabular-nums">{fmtCurrency(d.amount)}</span></div>)}<div className="flex justify-between border-t border-gray-200 pt-1.5 text-xs font-semibold text-gray-700"><span>Total Bank Disbursals</span><span className="tabular-nums">{fmtCurrency(totalDisbursed)}</span></div></div> : <p className="mt-2 text-xs text-gray-400">No bank disbursals yet.</p>}
                    </div>
                  </div>
                )}
                {tab === 'other' && (
                  <div className="space-y-3">
                    <form onSubmit={handleAddOther} className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Add Cost</h3>
                      </div>
                      <div className="grid md:grid-cols-4 gap-2 items-end">
                        <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Date</span>
                          <input type="date" value={otherDate} onChange={e => setOtherDate(e.target.value)} className={IC} />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Category</span>
                          <select value={otherCategory} onChange={e => setOtherCategory(e.target.value)} className={IC}>
                            {OTHER_COST_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Amount</span>
                          <input type="number" value={otherAmount} onChange={e => setOtherAmount(e.target.value)} className={IC} />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                          <span>Notes</span>
                          <input type="text" value={otherNotes} onChange={e => setOtherNotes(e.target.value)} placeholder="Optional" className={IC} />
                        </label>
                      </div>
                      <div className="flex justify-start">
                        <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-3 py-1.5 text-xs font-medium">Add Cost</button>
                      </div>
                    </form>
                    {loanOther.length ? (
                      <div className="space-y-2">
                        <div className="text-xs text-gray-600 font-medium">Cost History ({loanOther.length})</div>
                        <div className="overflow-hidden border border-gray-200 rounded-lg">
                          <table className="min-w-full divide-y divide-gray-200 text-left">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left cursor-pointer hover:bg-gray-100 transition-colors" onClick={() => setOtherSort(otherSort === 'asc' ? 'desc' : 'asc')}>Date {otherSort === 'asc' ? '↑' : '↓'}</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Category</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Amount</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Notes</th>
                                <th className="px-2 py-2 font-medium text-gray-600 text-left">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 bg-white">
                              {[...loanOther].sort((a, b) => otherSort === 'asc' ? (a.date ?? '').localeCompare(b.date ?? '') : (b.date ?? '').localeCompare(a.date ?? '')).map(o => (
                                <tr key={o.id} className="align-top">
                                  {editOther?.id === o.id ? <><td className="px-2 py-2"><input type="date" value={editOther.date ?? ''} onChange={e => setEditOther({ ...editOther, date: e.target.value || undefined })} className={IC} /></td><td className="px-2 py-2"><select value={editOther.category} onChange={e => setEditOther({ ...editOther, category: e.target.value })} className={IC}>{OTHER_COST_CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}</select></td><td className="px-2 py-2"><input type="number" value={editOther.amount} onChange={e => setEditOther({ ...editOther, amount: parseFloat(e.target.value) || 0 })} className={IC} /></td><td className="px-2 py-2"><input type="text" value={editOther.notes ?? ''} onChange={e => setEditOther({ ...editOther, notes: e.target.value || undefined })} className={IC} /></td></> : <><td className="px-2 py-2">{o.date ? fmtDate(o.date) : '-'}</td><td className="px-2 py-2 text-gray-700">{o.category}</td><td className="px-2 py-2 tabular-nums text-gray-800">{fmtCurrency(o.amount)}</td><td className="px-2 py-2 text-gray-500">{o.notes ?? '-'}</td></>}
                                  <td className="px-2 py-2"><div className="flex items-center gap-2">{editOther?.id === o.id ? <div className="flex gap-2"><EditBtn onClick={saveEditOther} /><button type="button" onClick={() => setEditOther(null)} className="text-gray-400 text-[10px]">Cancel</button></div> : <EditBtn onClick={() => setEditOther(o)} />}<Del onClick={() => deleteOther(o.id)} /></div></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="text-left text-xs text-gray-600 font-medium">Total: {fmtCurrency(totalOtherCosts)}</div>
                      </div>
                    ) : (
                      <p>No extra cost entries yet.</p>
                    )}
                  </div>
                )}
                <p className="mt-3">Disbursed: {fmtCurrency(totalDisbursed)} · Outstanding: {fmtCurrency(displayOutstanding)} · Shortfall: {fmtCurrency(totalShortfall)}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
