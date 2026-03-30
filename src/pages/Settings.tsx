import { useState } from 'react'
import { useStore } from '../store/useStore'
import { dbService } from '../services/dbService'
import { Download, Trash2, Scale, Info } from 'lucide-react'

export default function Settings() {
  const { weightUnit, setWeightUnit, clearAllData } = useStore()
  const [confirmClear, setConfirmClear] = useState(false)

  async function handleExport() {
    const data = await dbService.exportData()
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `relaxfit-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleClear() {
    if (!confirmClear) { setConfirmClear(true); return }
    await clearAllData()
    setConfirmClear(false)
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-5">Configurações</h2>

      <div className="space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4" /> Unidade de Peso
          </h3>
          <div className="flex gap-2">
            {(['kg', 'lb'] as const).map(unit => (
              <button key={unit}
                onClick={() => setWeightUnit(unit)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${weightUnit === unit ? 'bg-primary-600 text-white' : 'border border-gray-200 text-gray-600 hover:border-primary-200'}`}>
                {unit}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <Download className="w-4 h-4" /> Dados
          </h3>
          <button onClick={handleExport}
            className="w-full flex items-center justify-center gap-2 border border-gray-200 text-gray-700 rounded-xl py-2.5 mb-2 hover:border-primary-200 hover:text-primary-700 text-sm">
            <Download className="w-4 h-4" />
            Exportar dados (JSON)
          </button>
          <button onClick={handleClear}
            className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm transition ${confirmClear ? 'bg-red-600 text-white' : 'border border-red-200 text-red-500 hover:bg-red-50'}`}>
            <Trash2 className="w-4 h-4" />
            {confirmClear ? 'Clique novamente para confirmar' : 'Limpar todos os dados'}
          </button>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
            <Info className="w-4 h-4" /> Sobre
          </h3>
          <p className="text-sm text-gray-500">RelaxFit v0.1.0</p>
          <p className="text-xs text-gray-400 mt-1">App de composição corporal para balança Relaxmedic</p>
          <p className="text-xs text-gray-400 mt-1">Requer Chrome/Edge para conexão Bluetooth</p>
        </div>
      </div>
    </div>
  )
}
