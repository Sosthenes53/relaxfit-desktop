import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import MetricCard from '../components/MetricCard'
import { CheckCircle, TrendingUp, Home, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export default function MeasurementResult() {
  const { lastMeasurement } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    console.log('[MeasurementResult] renderizado com lastMeasurement:', lastMeasurement)
    if (!lastMeasurement) return
  }, [lastMeasurement])

  if (!lastMeasurement) {
    console.log('[MeasurementResult] ⚠ lastMeasurement é null/undefined — exibindo tela vazia')
    return (
      <div className="text-center py-16">
        <p className="text-gray-500 mb-4">Nenhuma medição disponível ainda.</p>
        <button
          onClick={() => navigate('/')}
          className="bg-primary-600 text-white px-6 py-2 rounded-xl"
          aria-label="Voltar para a tela inicial"
        >
          Voltar para Início
        </button>
      </div>
    )
  }

  const m = lastMeasurement

  return (
    <div>
      <div className="flex items-center gap-2 text-green-600 mb-2">
        <CheckCircle className="w-6 h-6" />
        <h2 className="text-xl font-bold">Medição Concluída!</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">
        {format(new Date(m.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
      </p>

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Composição Corporal</h3>
      <div className="grid grid-cols-2 gap-3 mb-5">
        <MetricCard label="Peso" value={m.weight} unit="kg" />
        <MetricCard label="IMC" value={m.bmi} />
        <MetricCard label="Gordura Corporal" value={m.fatPercent} unit="%" sub={`${m.fatMass} kg`} />
        <MetricCard label="Massa Muscular" value={m.musclePercent} unit="%" sub={`${m.muscleMass} kg`} />
        <MetricCard label="Água Corporal" value={m.waterPercent} unit="%" sub={`${m.waterMass} kg`} />
        <MetricCard label="Proteína" value={m.proteinPercent} unit="%" sub={`${m.proteinMass} kg`} />
        <MetricCard label="Massa Óssea" value={m.boneMass} unit="kg" />
        <MetricCard label="Gordura Visceral" value={m.visceralFat} />
        <MetricCard label="Idade Metabólica" value={m.metabolicAge} unit="anos" />
        <MetricCard label="Taxa Metabólica" value={m.bmr} unit="kcal" />
      </div>

      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Impedâncias (Ω)</h3>
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-5">
        <div className="grid grid-cols-2 gap-2 text-sm">
          {[
            ['Braço Dir. 20kHz', m.impedances.rightArm20],
            ['Braço Dir. 100kHz', m.impedances.rightArm100],
            ['Braço Esq. 20kHz', m.impedances.leftArm20],
            ['Braço Esq. 100kHz', m.impedances.leftArm100],
            ['Tronco 20kHz', m.impedances.trunk20],
            ['Tronco 100kHz', m.impedances.trunk100],
            ['Perna Dir. 20kHz', m.impedances.rightLeg20],
            ['Perna Dir. 100kHz', m.impedances.rightLeg100],
            ['Perna Esq. 20kHz', m.impedances.leftLeg20],
            ['Perna Esq. 100kHz', m.impedances.leftLeg100],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between py-1 border-b border-gray-50">
              <span className="text-gray-500 text-xs">{label}</span>
              <span className="font-mono text-gray-700">{value} Ω</span>
            </div>
          ))}
        </div>
      </div>

      {m.rawBytes && (
        <details className="mb-5">
          <summary className="text-xs text-gray-400 cursor-pointer mb-2">Bytes brutos (debug)</summary>
          <p className="text-xs font-mono text-gray-400 break-all bg-gray-50 rounded p-2">
            {m.rawBytes.map(b => b.toString(16).padStart(2, '0')).join(' ')}
          </p>
        </details>
      )}

      <button onClick={() => navigate(`/report/${m.id}`)}
        className="w-full flex items-center justify-center gap-2 bg-primary-700 text-white rounded-xl py-3 font-semibold hover:bg-primary-800 mb-3">
        <FileText className="w-5 h-5" />
        Ver Relatório Completo / Exportar PDF
      </button>

      <div className="flex gap-3">
        <button onClick={() => navigate('/history')}
          className="flex-1 flex items-center justify-center gap-2 border border-primary-200 text-primary-700 rounded-xl py-3">
          <TrendingUp className="w-4 h-4" />
          Ver Histórico
        </button>
        <button onClick={() => navigate('/dashboard')}
          className="flex-1 flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-3 font-semibold">
          <Home className="w-4 h-4" />
          Dashboard
        </button>
      </div>
    </div>
  )
}
