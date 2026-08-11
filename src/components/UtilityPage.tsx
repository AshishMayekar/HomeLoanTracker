import { LoanNoter } from './LoanNoter'

interface Props { onBack: () => void }

export function UtilityPage({ onBack }: Props) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
        <button type="button" onClick={onBack} className="text-sm text-gray-600 hover:text-gray-900 border border-gray-300 hover:border-gray-400 rounded-lg px-3 py-1.5 transition-colors">← Portal</button>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Utility</h1>
          <p className="text-sm text-gray-500 mt-0.5">Personal tools - data saved locally in your browser</p>
        </div>
      </header>
      <main className="px-4 py-4"><LoanNoter /></main>
    </div>
  )
}
