import { memo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Measurement } from '../types'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

interface Props {
  measurements: Measurement[]
  field: keyof Measurement
  label: string
  color?: string
  unit?: string
}

const MeasurementChart = memo(function MeasurementChart({ measurements, field, label, color = '#0ea5e9', unit = '' }: Props) {
  const data = [...measurements]
    .reverse()
    .map(m => ({
      date: format(new Date(m.timestamp), 'dd/MM', { locale: ptBR }),
      value: m[field] as number,
    }))

  if (data.length < 2) {
    return (
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 text-center text-gray-400 text-sm py-8">
        Faça ao menos 2 medições para ver o gráfico
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-sm font-semibold text-gray-700 mb-3">{label}</p>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} unit={unit} />
          <Tooltip formatter={(v) => [`${v}${unit}`, label]} />
          <Legend />
          <Line type="monotone" dataKey="value" name={label} stroke={color} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
})

MeasurementChart.displayName = 'MeasurementChart'

export default MeasurementChart
