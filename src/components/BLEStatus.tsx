import { BLEStatus as BLEStatusType } from '../types'
import { Bluetooth, BluetoothConnected, BluetoothOff, Loader } from 'lucide-react'

const statusConfig: Record<BLEStatusType, { label: string; color: string; icon: React.ReactNode }> = {
  idle:         { label: 'Aguardando',    color: 'text-gray-400',   icon: <Bluetooth className="w-4 h-4" /> },
  scanning:     { label: 'Procurando...',  color: 'text-blue-400',   icon: <Loader className="w-4 h-4 animate-spin" /> },
  connecting:   { label: 'Conectando...', color: 'text-yellow-500', icon: <Loader className="w-4 h-4 animate-spin" /> },
  connected:    { label: 'Conectado',     color: 'text-green-500',  icon: <BluetoothConnected className="w-4 h-4" /> },
  measuring:    { label: 'Medindo...',    color: 'text-blue-500',   icon: <Loader className="w-4 h-4 animate-spin" /> },
  error:        { label: 'Erro',          color: 'text-red-500',    icon: <BluetoothOff className="w-4 h-4" /> },
  disconnected: { label: 'Desconectado', color: 'text-gray-500',   icon: <BluetoothOff className="w-4 h-4" /> },
}

export default function BLEStatus({ status }: { status: BLEStatusType }) {
  const cfg = statusConfig[status]
  return (
    <div
      className={`flex items-center gap-2 text-sm font-medium ${cfg.color}`}
      role="status"
      aria-live="polite"
      aria-label={`Status da conexão Bluetooth: ${cfg.label}`}
    >
      {cfg.icon}
      <span>{cfg.label}</span>
    </div>
  )
}
