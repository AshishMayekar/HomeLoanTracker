import { useState } from 'react'
import { UtilityPage } from './components/UtilityPage'
export function App() {
  const [view, setView] = useState<'portal' | 'utility'>('utility')
  return <div>{view === 'portal' ? <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-6"><h1 className="text-2xl font-bold text-gray-800 mb-4">Main Portal</h1><button onClick={() => setView('utility')} className="bg-blue-600 text-white px-4 py-2 rounded-lg">Open Utility & Loan Noter</button></div> : <UtilityPage onBack={() => setView('portal')} />}</div>
}
export default App
