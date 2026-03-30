import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Measurement, Profile } from '../types'
import { dbService } from '../services/dbService'
import { computeAllMetrics, getReferenceRanges, evaluate } from '../utils/bodyMetrics'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { Printer, ArrowLeft } from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────
function Row({ label, kg, pct, range, evaluation }: {
  label: string; kg: number | string; pct: number | string
  range?: string; evaluation?: string
}) {
  const evalColor = evaluation === 'Excelente' ? '#16a34a'
    : evaluation === 'Saudável' ? '#2563eb'
    : evaluation === 'Alto' ? '#dc2626'
    : evaluation === 'Baixo' ? '#d97706' : '#374151'
  return (
    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
      <td style={td}>{label}</td>
      <td style={{ ...td, textAlign: 'center' }}>{typeof kg === 'number' ? kg.toFixed(1) : kg}</td>
      <td style={{ ...td, textAlign: 'center' }}>{typeof pct === 'number' ? pct.toFixed(1) : pct}</td>
      {range !== undefined && <td style={{ ...td, textAlign: 'center', color: '#6b7280', fontSize: 10 }}>{range}</td>}
      {evaluation !== undefined && (
        <td style={{ ...td, textAlign: 'center', color: evalColor, fontWeight: 600, fontSize: 11 }}>
          {evaluation}
        </td>
      )}
    </tr>
  )
}

function Bar({ label, value, min, max, color = '#2563eb', unit = '' }: {
  label: string; value: number; min: number; max: number; color?: string; unit?: string
}) {
  const total = max * 1.5
  const pct = Math.min(100, (value / total) * 100)
  const minPct = (min / total) * 100
  const maxPct = (max / total) * 100
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
        <span style={{ color: '#374151' }}>{label}</span>
        <span style={{ fontWeight: 600, color: '#111827' }}>{value}{unit}</span>
      </div>
      <div style={{ position: 'relative', height: 12, background: '#f3f4f6', borderRadius: 6, overflow: 'hidden' }}>
        {/* healthy zone */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0,
          left: `${minPct}%`, width: `${maxPct - minPct}%`,
          background: '#bbf7d0', opacity: 0.8
        }} />
        {/* value bar */}
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: 0,
          width: `${pct}%`, background: color, borderRadius: 6, opacity: 0.85
        }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#9ca3af', marginTop: 1 }}>
        <span>{min}</span><span style={{ color: '#6b7280' }}>Saudável</span><span>{max}</span>
      </div>
    </div>
  )
}

function ScoreRing({ score }: { score: number }) {
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const progress = circumference - (score / 100) * circumference
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#f59e0b' : '#dc2626'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
      <svg width={100} height={100} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={50} cy={50} r={radius} fill="none" stroke="#e5e7eb" strokeWidth={8} />
        <circle cx={50} cy={50} r={radius} fill="none" stroke={color} strokeWidth={8}
          strokeDasharray={circumference} strokeDashoffset={progress}
          strokeLinecap="round" />
      </svg>
      <div>
        <div style={{ fontSize: 38, fontWeight: 900, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 14, color: '#6b7280' }}>/100 Pontos</div>
      </div>
    </div>
  )
}

function ImpedanceTable({ imp }: { imp: Measurement['impedances'] }) {
  const rows = [
    { label: '20 (kHz)', values: [imp.rightArm20, imp.leftArm20, imp.trunk20, imp.rightLeg20, imp.leftLeg20] },
    { label: '100 (kHz)', values: [imp.rightArm100, imp.leftArm100, imp.trunk100, imp.rightLeg100, imp.leftLeg100] },
  ]
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ background: '#e8f0fb' }}>
          <th style={{ ...th, width: '18%' }}>Z(Ω)</th>
          {['Braço dir.', 'Braço esq.', 'Tronco', 'Perna dir.', 'Perna esq.'].map(h => (
            <th key={h} style={th}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.label} style={{ borderBottom: '1px solid #e5e7eb' }}>
            <td style={{ ...td, background: '#f8fafc', fontWeight: 600 }}>{row.label}</td>
            {row.values.map((v, i) => (
              <td key={i} style={{ ...td, textAlign: 'center' }}>{v > 0 ? v.toFixed(1) : '—'}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SegmentalTable({ fat, muscle }: {
  fat: NonNullable<Measurement['segFat']>
  muscle: NonNullable<Measurement['segMuscle']>
}) {
  const cols = ['Braço dir.', 'Braço esq.', 'Tronco', 'Perna dir.', 'Perna esq.']
  const fatVals    = [fat.rightArm, fat.leftArm, fat.trunk, fat.rightLeg, fat.leftLeg]
  const muscleVals = [muscle.rightArm, muscle.leftArm, muscle.trunk, muscle.rightLeg, muscle.leftLeg]
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
      <thead>
        <tr style={{ background: '#e8f0fb' }}>
          <th style={{ ...th, width: '18%' }}>Segmento</th>
          {cols.map(c => <th key={c} style={th}>{c}</th>)}
        </tr>
      </thead>
      <tbody>
        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
          <td style={{ ...td, background: '#fef9c3', fontWeight: 600 }}>Gordura (kg)</td>
          {fatVals.map((v, i) => <td key={i} style={{ ...td, textAlign: 'center' }}>{v.toFixed(1)}</td>)}
        </tr>
        <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
          <td style={{ ...td, background: '#dcfce7', fontWeight: 600 }}>Músculo (kg)</td>
          {muscleVals.map((v, i) => <td key={i} style={{ ...td, textAlign: 'center' }}>{v.toFixed(1)}</td>)}
        </tr>
      </tbody>
    </table>
  )
}

// ─── styles ───────────────────────────────────────────────────────────────────
const th: React.CSSProperties = { padding: '5px 6px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#1e3a5f' }
const td: React.CSSProperties = { padding: '4px 6px', fontSize: 11, color: '#111827' }
const sectionTitle: React.CSSProperties = {
  fontWeight: 700, fontSize: 13, color: '#1e3a5f',
  borderBottom: '2px solid #2563eb', paddingBottom: 3, marginBottom: 8, marginTop: 14
}
const pill: React.CSSProperties = {
  display: 'inline-block', padding: '2px 8px', borderRadius: 999,
  fontSize: 10, fontWeight: 600
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function ReportPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [measurement, setMeasurement] = useState<Measurement | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      if (!id) return
      const profiles = await dbService.getProfiles()
      for (const p of profiles) {
        const measurements = await dbService.getMeasurements(p.id)
        const found = measurements.find(m => m.id === id)
        if (found) {
          const enriched = computeAllMetrics(found, p)
          setMeasurement(enriched)
          setProfile(p)
          return
        }
      }
    }
    load()
  }, [id])

  function handlePrint() {
    window.print()
  }

  if (!measurement || !profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ color: '#6b7280' }}>Carregando relatório...</p>
      </div>
    )
  }

  const m = measurement
  const ref = getReferenceRanges(m.weight, profile.height, profile.sex, profile.age)
  const evalFat      = evaluate(m.fatMass, ref.fat.min, ref.fat.max)
  const evalWater    = evaluate(m.waterMass, ref.water.min, ref.water.max)
  const evalProtein  = evaluate(m.proteinMass, ref.protein.min, ref.protein.max)
  const evalSalt     = evaluate(m.boneMass, ref.salt.min, ref.salt.max)
  const evalMuscle   = evaluate(m.muscleMass, ref.muscle.min, ref.muscle.max)
  const evalSkeletal = m.skeletalMuscleMass
    ? evaluate(m.skeletalMuscleMass, ref.skeletal.min, ref.skeletal.max)
    : 'Saudável' as const

  const bmiCategory =
    m.bmi < 18.5 ? 'Abaixo do peso'
    : m.bmi < 25  ? 'Peso normal'
    : m.bmi < 30  ? 'Sobrepeso'
    : 'Obesidade'

  const evalColor = (e: string) =>
    e === 'Excelente' ? { background: '#dcfce7', color: '#166534' }
    : e === 'Saudável' ? { background: '#dbeafe', color: '#1e40af' }
    : e === 'Alto'     ? { background: '#fee2e2', color: '#991b1b' }
    : { background: '#fef3c7', color: '#92400e' }

  const weightControl = m.targetWeight ? m.weight - m.targetWeight : 0

  // Suppress unused ref warning — used for potential future screenshot/PDF
  void reportRef

  return (
    <>
      {/* Print/action bar — hidden when printing */}
      <div className="no-print" style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: '#1e3a5f', color: 'white',
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
      }}>
        <button onClick={() => navigate(-1)} style={{
          background: 'none', border: 'none', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 6, fontSize: 14
        }}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handlePrint} style={{
          background: '#2563eb', border: 'none', color: 'white', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 18px',
          borderRadius: 8, fontWeight: 600, fontSize: 14
        }}>
          <Printer size={16} /> Imprimir / Salvar PDF
        </button>
      </div>

      {/* ─── REPORT BODY ─── */}
      <div ref={reportRef} style={{
        fontFamily: "'Segoe UI', Arial, sans-serif",
        background: 'white', maxWidth: 900, margin: '0 auto', padding: '20px 24px',
      }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#111827', margin: 0 }}>
              Relatório de análise de composição corporal
            </h1>
          </div>
          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: 22, fontWeight: 900 }}>
              <span style={{ color: '#111827' }}>Relax</span>
              <span style={{ color: '#2563eb' }}>fit</span>
            </span>
          </div>
        </div>

        {/* ── Patient bar ── */}
        <div style={{
          background: '#f1f5f9', borderRadius: 6, padding: '7px 14px',
          display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, fontSize: 12
        }}>
          {[
            ['ID', profile.name],
            ['Sexo', profile.sex === 'male' ? 'Masculino' : 'Feminino'],
            ['Idade', `${profile.age}`],
            ['Altura', `${profile.height}cm`],
            ['Horário da medição', format(new Date(m.timestamp), "dd/MM/yyyy HH:mm", { locale: ptBR })],
          ].map(([k, v]) => (
            <span key={k}><span style={{ color: '#6b7280' }}>{k}:</span> <strong>{v}</strong></span>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20 }}>

          {/* ═══ LEFT COLUMN ═══ */}
          <div>
            {/* ── Análise da composição corporal ── */}
            <p style={sectionTitle}>Análise da composição corporal</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#e8f0fb' }}>
                  <th style={{ ...th, width: '28%' }}></th>
                  <th style={{ ...th, textAlign: 'center' }}>Medição (kg)</th>
                  <th style={{ ...th, textAlign: 'center' }}>Proporção (%)</th>
                  <th style={{ ...th, textAlign: 'center' }}>Referência</th>
                  <th style={{ ...th, textAlign: 'center' }}>Avaliação</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Peso" kg={m.weight} pct={100}
                  range={`${ref.weight.min}–${ref.weight.max}`} evaluation={evaluate(m.weight, ref.weight.min, ref.weight.max)} />
                <Row label="Gordura corporal" kg={m.fatMass} pct={m.fatPercent}
                  range={`${ref.fat.min}–${ref.fat.max}`} evaluation={evalFat} />
                <Row label="Sal inorgânico" kg={m.boneMass} pct={m.boneMass > 0 ? parseFloat(((m.boneMass/m.weight)*100).toFixed(1)) : 0}
                  range={`${ref.salt.min}–${ref.salt.max}`} evaluation={evalSalt} />
                <Row label="Proteína" kg={m.proteinMass} pct={m.proteinPercent}
                  range={`${ref.protein.min}–${ref.protein.max}`} evaluation={evalProtein} />
                <Row label="Água corporal" kg={m.waterMass} pct={m.waterPercent}
                  range={`${ref.water.min}–${ref.water.max}`} evaluation={evalWater} />
                <Row label="Músculo" kg={m.muscleMass} pct={m.musclePercent}
                  range={`${ref.muscle.min}–${ref.muscle.max}`} evaluation={evalMuscle} />
                {m.skeletalMuscleMass && (
                  <Row label="Músculo esquelético" kg={m.skeletalMuscleMass} pct={m.skeletalMusclePercent ?? 0}
                    range={`${ref.skeletal.min}–${ref.skeletal.max}`} evaluation={evalSkeletal} />
                )}
              </tbody>
            </table>

            {/* ── Análise de gordura muscular (bars) ── */}
            <p style={sectionTitle}>Análise de gordura muscular</p>
            <div style={{ padding: '4px 0' }}>
              <Bar label="Peso (kg)" value={m.weight} min={ref.weight.min} max={ref.weight.max} color="#2563eb" />
              {m.skeletalMuscleMass && (
                <Bar label="Músculo esquelético (kg)" value={m.skeletalMuscleMass}
                  min={ref.skeletal.min} max={ref.skeletal.max} color="#16a34a" />
              )}
              <Bar label="Massa gorda (kg)" value={m.fatMass} min={ref.fat.min} max={ref.fat.max} color="#f97316" />
            </div>

            {/* ── Análise segmentar ── */}
            {m.segFat && m.segMuscle && (
              <>
                <p style={sectionTitle}>Análise segmentar (estimado)</p>
                <SegmentalTable fat={m.segFat} muscle={m.segMuscle} />
                <p style={{ fontSize: 9, color: '#9ca3af', marginTop: 4 }}>
                  * Valores segmentares são estimativas calculadas a partir das impedâncias medidas.
                </p>
              </>
            )}

            {/* ── Impedância bioelétrica ── */}
            <p style={sectionTitle}>Impedância bioelétrica</p>
            <ImpedanceTable imp={m.impedances} />
          </div>

          {/* ═══ RIGHT COLUMN ═══ */}
          <div>
            {/* ── Pontuação corporal ── */}
            <p style={{ ...sectionTitle, marginTop: 0 }}>Pontuação corporal</p>
            {m.bodyScore !== undefined && <ScoreRing score={m.bodyScore} />}
            <p style={{ fontSize: 10, color: '#6b7280', marginTop: 4 }}>
              * A pontuação total reflete o valor avaliado da composição corporal.
            </p>

            {/* ── Controle de peso ── */}
            <p style={sectionTitle}>Controle de peso</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <tbody>
                {[
                  ['Peso alvo', `${m.targetWeight?.toFixed(1) ?? '—'} kg`],
                  ['Controle de peso', `${weightControl > 0 ? '+' : ''}${weightControl.toFixed(1)} kg`],
                  ['Controle de gordura', `${Math.min(0, (m.fatMass - (m.weight * 0.15))).toFixed(1)} kg`],
                  ['Controle muscular', '0.0 kg'],
                ].map(([k, v]) => (
                  <tr key={k} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, color: '#6b7280' }}>{k}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Avaliação da obesidade ── */}
            <p style={sectionTitle}>Avaliação da obesidade</p>
            <div style={{ padding: '4px 0', fontSize: 11 }}>
              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: '#374151' }}>IMC (kg/m²)</span>
                  <strong>{m.bmi}</strong>
                </div>
                <div style={{ display: 'flex', gap: 2, height: 16 }}>
                  {[['Abaixo', '#93c5fd'], ['Saudável', '#86efac'], ['Alto', '#fcd34d'], ['Alto risco', '#f87171']].map(([label, color]) => (
                    <div key={String(label)} style={{ flex: 1, background: String(color), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: '#374151' }}>{label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ textAlign: 'right', marginTop: 2, fontSize: 10, color: '#6b7280' }}>▲ {bmiCategory}</div>
              </div>

              <div style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ color: '#374151' }}>Taxa de gordura corporal (%)</span>
                  <strong>{m.fatPercent.toFixed(1)}</strong>
                </div>
                <div style={{ display: 'flex', gap: 2, height: 16 }}>
                  {[['Baixo', '#93c5fd'], ['Saudável', '#86efac'], ['Alto', '#fcd34d'], ['Alto risco', '#f87171']].map(([label, color]) => (
                    <div key={String(label)} style={{ flex: 1, background: String(color), borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 8, fontWeight: 600, color: '#374151' }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {m.obesity !== undefined && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: '#374151' }}>Obesidade (peso/peso alvo)</span>
                    <strong>{m.obesity.toFixed(0)}%</strong>
                  </div>
                  <div style={{ background: '#f3f4f6', borderRadius: 4, height: 10, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', width: `${Math.min(100, m.obesity)}%`,
                      background: m.obesity > 120 ? '#ef4444' : m.obesity > 110 ? '#f97316' : '#22c55e',
                      borderRadius: 4
                    }} />
                  </div>
                </div>
              )}
            </div>

            {/* ── Avaliação do tipo de corpo ── */}
            {m.bodyType && (
              <>
                <p style={sectionTitle}>Avaliação do tipo de corpo</p>
                <div style={{ textAlign: 'center', padding: '8px 0' }}>
                  <span style={{
                    ...pill, fontSize: 13, padding: '6px 16px',
                    ...evalColor(m.bmi >= 25 && m.fatPercent > 20 ? 'Alto'
                      : m.bmi < 25 && m.fatPercent < 20 ? 'Excelente' : 'Saudável')
                  }}>
                    {m.bodyType}
                  </span>
                  <p style={{ fontSize: 10, color: '#6b7280', marginTop: 6 }}>
                    IMC {m.bmi} · Gordura {m.fatPercent.toFixed(1)}%
                  </p>
                </div>
              </>
            )}

            {/* ── Outros indicadores ── */}
            <p style={sectionTitle}>Outros indicadores</p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <tbody>
                {[
                  ['Grau de gordura visceral', m.visceralFat],
                  ['Taxa metabólica basal', `${m.bmr} kcal`],
                  ['Peso corporal livre de gordura', `${m.leanMass?.toFixed(1) ?? '—'} kg`],
                  ['Gordura subcutânea', `${m.subcutaneousFat?.toFixed(1) ?? '—'} %`],
                  ['SMI', m.smi ? `${m.smi.toFixed(1)} kg/m²` : '—'],
                  ['Idade do corpo', m.bodyAge !== undefined ? `${m.bodyAge} anos` : '—'],
                ].map(([k, v]) => (
                  <tr key={String(k)} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, color: '#6b7280' }}>{k}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{String(v)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 20, paddingTop: 10, borderTop: '1px solid #e5e7eb',
          fontSize: 9, color: '#9ca3af', textAlign: 'center'
        }}>
          Relatório gerado pelo RelaxFit · {format(new Date(), "dd/MM/yyyy HH:mm", { locale: ptBR })} ·{' '}
          Os dados segmentares são estimativas. Consulte um profissional de saúde para interpretação clínica.
        </div>
      </div>
    </>
  )
}
