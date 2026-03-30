import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import MetricCard from '../components/MetricCard'
import { Bluetooth, TrendingUp, User } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return 'Abaixo do peso'
  if (bmi < 25) return 'Peso normal'
  if (bmi < 30) return 'Sobrepeso'
  return 'Obesidade'
}

export default function Dashboard() {
  const { activeProfileId, profiles, measurements, loadMeasurements } = useStore()
  const navigate = useNavigate()

  const profile = profiles.find(p => p.id === activeProfileId)
  const last = measurements[0]

  useEffect(() => {
    if (activeProfileId) loadMeasurements(activeProfileId)
  }, [activeProfileId])

  if (!profile) {
    return (
      <div className="text-center py-16">
        <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 mb-4">Nenhum perfil selecionado</p>
        <button onClick={() => navigate('/')} className="bg-primary-600 text-white px-6 py-2 rounded-xl">
          Selecionar Perfil
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="bg-primary-700 text-white rounded-xl p-5 mb-5 shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-primary-200 text-xs mb-1">Perfil ativo</p>
            <h2 className="text-xl font-bold">{profile.name}</h2>
            <p className="text-primary-300 text-sm mt-1">
              {profile.sex === 'male' ? 'Masculino' : 'Feminino'} · {profile.age} anos · {profile.height} cm
            </p>
          </div>
          <User className="w-8 h-8 text-primary-300" />
        </div>
        {last && (
          <p className="text-primary-200 text-xs mt-3">
            Última medição: {format(new Date(last.timestamp), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        )}
      </div>

      {last ? (
        <>
          <h3 className="text-sm font-semibold text-gray-600 mb-3 uppercase tracking-wide">Última medição</h3>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <MetricCard label="Peso" value={last.weight} unit="kg" />
            <MetricCard label="IMC" value={last.bmi} sub={bmiCategory(last.bmi)} />
            <MetricCard label="Gordura" value={last.fatPercent} unit="%" sub={`${last.fatMass} kg`} />
            <MetricCard label="Massa Muscular" value={last.musclePercent} unit="%" sub={`${last.muscleMass} kg`} />
            <MetricCard label="Água" value={last.waterPercent} unit="%" sub={`${last.waterMass} kg`} />
            <MetricCard label="Massa Óssea" value={last.boneMass} unit="kg" />
            <MetricCard label="Gordura Visceral" value={last.visceralFat} />
            <MetricCard label="Taxa Metabólica" value={last.bmr} unit="kcal" />
          </div>
          <button onClick={() => navigate('/history')}
            className="w-full flex items-center justify-center gap-2 border border-primary-200 text-primary-700 rounded-xl py-3 mb-3 hover:bg-primary-50">
            <TrendingUp className="w-4 h-4" />
            Ver Histórico Completo
          </button>
        </>
      ) : (
        <div className="text-center py-8 text-gray-400">
          <p className="mb-2">Nenhuma medição ainda</p>
          <p className="text-sm">Conecte-se à balança para começar</p>
        </div>
      )}

      <button onClick={() => navigate('/connect')}
        className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-3 font-semibold hover:bg-primary-700">
        <Bluetooth className="w-5 h-5" />
        Nova Medição
      </button>
    </div>
  )
}
