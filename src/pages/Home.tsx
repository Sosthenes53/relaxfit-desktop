import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../store/useStore'
import { Profile } from '../types'
import { PlusCircle, User, Trash2, ChevronRight } from 'lucide-react'

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

export default function Home() {
  const { profiles, loadProfiles, saveProfile, deleteProfile, setActiveProfile, activeProfileId } = useStore()
  const navigate = useNavigate()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', sex: 'male' as 'male' | 'female', age: '', height: '' })
  const [error, setError] = useState('')

  useEffect(() => { loadProfiles() }, [])

  async function handleCreate() {
    if (!form.name.trim()) { setError('Nome é obrigatório'); return }
    if (!form.age || !form.height) { setError('Preencha todos os campos'); return }
    const profile: Profile = {
      id: generateId(),
      name: form.name.trim(),
      sex: form.sex,
      age: parseInt(form.age),
      height: parseInt(form.height),
      createdAt: new Date().toISOString(),
    }
    await saveProfile(profile)
    setForm({ name: '', sex: 'male', age: '', height: '' })
    setShowForm(false)
    setError('')
  }

  function selectProfile(id: string) {
    setActiveProfile(id)
    navigate('/dashboard')
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-800 mb-1">Perfis</h2>
      <p className="text-sm text-gray-500 mb-6">Selecione ou crie um perfil para começar</p>

      <div className="space-y-3 mb-6">
        {profiles.length === 0 && (
          <p className="text-center text-gray-400 py-8">Nenhum perfil criado ainda.</p>
        )}
        {profiles.map(p => (
          <div key={p.id}
            className={`flex items-center bg-white rounded-xl p-4 shadow-sm border cursor-pointer transition-all ${activeProfileId === p.id ? 'border-primary-400 ring-1 ring-primary-300' : 'border-gray-100 hover:border-primary-200'}`}
            onClick={() => selectProfile(p.id)}
          >
            <div className="bg-primary-100 text-primary-700 rounded-full p-2 mr-3">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-gray-800">{p.name}</p>
              <p className="text-xs text-gray-400">{p.sex === 'male' ? 'Masculino' : 'Feminino'} · {p.age} anos · {p.height} cm</p>
            </div>
            <button onClick={e => { e.stopPropagation(); deleteProfile(p.id) }} className="text-gray-300 hover:text-red-400 mr-2 p-1">
              <Trash2 className="w-4 h-4" />
            </button>
            <ChevronRight className="w-4 h-4 text-gray-300" />
          </div>
        ))}
      </div>

      {showForm ? (
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-800 mb-4">Novo Perfil</h3>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <div className="space-y-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Nome</label>
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
                placeholder="Ex: João Silva"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Sexo</label>
              <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
                value={form.sex}
                onChange={e => setForm(f => ({ ...f, sex: e.target.value as 'male' | 'female' }))}>
                <option value="male">Masculino</option>
                <option value="female">Feminino</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Idade</label>
                <input type="number" min="1" max="120"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
                  placeholder="25"
                  value={form.age}
                  onChange={e => setForm(f => ({ ...f, age: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Altura (cm)</label>
                <input type="number" min="100" max="250"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary-400"
                  placeholder="170"
                  value={form.height}
                  onChange={e => setForm(f => ({ ...f, height: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => { setShowForm(false); setError('') }}
              className="flex-1 border border-gray-200 text-gray-600 rounded-lg py-2 text-sm">
              Cancelar
            </button>
            <button onClick={handleCreate}
              className="flex-1 bg-primary-600 text-white rounded-lg py-2 text-sm font-semibold hover:bg-primary-700">
              Criar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white rounded-xl py-3 font-semibold hover:bg-primary-700 transition">
          <PlusCircle className="w-5 h-5" />
          Novo Perfil
        </button>
      )}
    </div>
  )
}
