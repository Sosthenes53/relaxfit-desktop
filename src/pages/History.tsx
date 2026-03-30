import { useEffect, useState, memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import MeasurementChart from '../components/MeasurementChart'
import { Trash2, ChevronDown, ChevronUp, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { dbService } from '../services/dbService'
import { Measurement } from '../types'

const MeasurementItem = memo(({ 
  measurement, 
  isExpanded, 
  onToggle, 
  onDelete, 
  onViewReport 
}: {
  measurement: Measurement
  isExpanded: boolean
  onToggle: () => void
  onDelete: () => void
  onViewReport: () => void
}) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
    <div 
      className="flex items-center p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-inset"
      onClick={onToggle}
      tabIndex={0}
      role="button"
      aria-expanded={isExpanded}
      aria-label={`Detalhes da medição de ${format(new Date(measurement.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}`}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle() } }}
    >
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-800">
          {format(new Date(measurement.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {measurement.weight} kg · IMC {measurement.bmi} · {measurement.fatPercent}% gordura
        </p>
      </div>
      <button 
        onClick={(e) => { e.stopPropagation(); onDelete() }}
        className="text-gray-300 hover:text-red-400 p-1 mr-2 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 rounded"
        aria-label="Excluir esta medição"
      >
        <Trash2 className="w-4 h-4" aria-hidden="true" />
      </button>
      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" aria-hidden="true" /> : <ChevronDown className="w-4 h-4 text-gray-400" aria-hidden="true" />}
    </div>
    {isExpanded && (
      <div className="px-4 pb-4 border-t border-gray-50 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            ['Peso', `${measurement.weight} kg`],
            ['IMC', String(measurement.bmi)],
            ['Gordura', `${measurement.fatPercent}% (${measurement.fatMass} kg)`],
            ['Músculo', `${measurement.musclePercent}% (${measurement.muscleMass} kg)`],
            ['Água', `${measurement.waterPercent}% (${measurement.waterMass} kg)`],
            ['Ossos', `${measurement.boneMass} kg`],
            ['Proteína', `${measurement.proteinPercent}% (${measurement.proteinMass} kg)`],
            ['Gordura Visceral', String(measurement.visceralFat)],
            ['Idade Metabólica', `${measurement.metabolicAge} anos`],
            ['Taxa Metabólica', `${measurement.bmr} kcal`],
          ].map(([label, value]) => (
            <div key={label} className="text-xs">
              <span className="text-gray-400">{label}: </span>
              <span className="font-medium text-gray-700">{value}</span>
            </div>
          ))}
        </div>
        <button
          onClick={onViewReport}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-lg py-2 text-sm mt-3 hover:bg-primary-700 transition focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          aria-label="Ver relatório completo e opções de exportação"
        >
          <FileText className="w-4 h-4" aria-hidden="true" />
          Ver Relatório / Exportar PDF
        </button>
      </div>
    )}
  </div>
))

MeasurementItem.displayName = 'MeasurementItem'

export default function History() {
  const { activeProfileId, profiles, measurements, loadMeasurements } = useStore()
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [chartField, setChartField] = useState<'weight' | 'fatPercent' | 'musclePercent' | 'waterPercent'>('weight')

  const profile = profiles.find(p => p.id === activeProfileId)

  useEffect(() => {
    if (activeProfileId) loadMeasurements(activeProfileId)
  }, [activeProfileId])

  if (!profile) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Selecione um perfil primeiro</p>
        <button onClick={() => navigate('/')} className="bg-primary-600 text-white px-6 py-2 rounded-xl">
          Ir para Perfis
        </button>
      </div>
    )
  }

  async function handleDelete(id: string) {
    await dbService.deleteMeasurement(id)
    if (activeProfileId) loadMeasurements(activeProfileId)
  }

  const chartOptions = [
    { value: 'weight', label: 'Peso (kg)', unit: 'kg', color: '#0ea5e9' },
    { value: 'fatPercent', label: 'Gordura (%)', unit: '%', color: '#f97316' },
    { value: 'musclePercent', label: 'Músculo (%)', unit: '%', color: '#22c55e' },
    { value: 'waterPercent', label: 'Água (%)', unit: '%', color: '#3b82f6' },
  ] as const

  const selectedChart = chartOptions.find(o => o.value === chartField)!

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Histórico</h2>
      <p className="text-sm text-gray-500 mb-5">{profile.name} · {measurements.length} medição(ões)</p>

      {measurements.length > 1 && (
        <div className="mb-5">
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {chartOptions.map(o => (
              <button key={o.value}
                onClick={() => setChartField(o.value)}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition ${chartField === o.value ? 'bg-primary-600 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
                {o.label}
              </button>
            ))}
          </div>
          <MeasurementChart
            measurements={measurements}
            field={chartField}
            label={selectedChart.label}
            color={selectedChart.color}
            unit={selectedChart.unit}
          />
        </div>
      )}

      <div className="space-y-3">
        {measurements.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nenhuma medição registrada</p>
        )}
        {measurements.map(m => (
          <MeasurementItem
            key={m.id}
            measurement={m}
            isExpanded={expanded === m.id}
            onToggle={() => setExpanded(expanded === m.id ? null : m.id)}
            onDelete={() => handleDelete(m.id)}
            onViewReport={() => navigate(`/report/${m.id}`)}
          />
        ))}
      </div>
    </div>
  )
}
