interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  color?: string
}

export default function MetricCard({ label, value, unit, sub, color = 'bg-white' }: MetricCardProps) {
  return (
    <div className={`${color} rounded-xl p-4 shadow-sm border border-gray-100`}>
      <dl>
        <dt className="text-xs text-gray-500 mb-1">{label}</dt>
        <dd className="text-2xl font-bold text-gray-800" aria-label={`${label}: ${value}${unit ? ` ${unit}` : ''}`}>
          {value}
          {unit && <span className="text-sm font-normal text-gray-500 ml-1" aria-hidden="true">{unit}</span>}
        </dd>
        {sub && <dd className="text-xs text-gray-400 mt-1" aria-label={`Detalhe: ${sub}`}>{sub}</dd>}
      </dl>
    </div>
  )
}
