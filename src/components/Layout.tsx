import { NavLink, Outlet } from 'react-router-dom'
import { Activity, Home, History, Settings, Bluetooth } from 'lucide-react'

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-primary-700 text-white px-4 py-3 flex items-center gap-2 shadow">
        <Activity className="w-6 h-6" />
        <h1 className="text-lg font-bold tracking-wide">RelaxFit</h1>
        <span className="text-primary-300 text-xs ml-1">Composição Corporal</span>
      </header>

      <main className="flex-1 container mx-auto max-w-2xl px-4 py-6">
        <Outlet />
      </main>

      <nav className="bg-white border-t border-gray-200 flex justify-around py-2 sticky bottom-0" role="navigation" aria-label="Navegação principal">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-4 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
          aria-label="Página inicial"
        >
          {({ isActive }) => (
            <>
              <Home className="w-5 h-5" aria-hidden="true" />
              <span aria-current={isActive ? 'page' : undefined}>Início</span>
            </>
          )}
        </NavLink>
        <NavLink
          to="/dashboard"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-4 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
          aria-label="Dashboard de métricas"
        >
          {({ isActive }) => (
            <>
              <Activity className="w-5 h-5" aria-hidden="true" />
              <span aria-current={isActive ? 'page' : undefined}>Dashboard</span>
            </>
          )}
        </NavLink>
        <NavLink
          to="/connect"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-4 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
          aria-label="Conectar balança e fazer medição"
        >
          {({ isActive }) => (
            <>
              <Bluetooth className="w-5 h-5" aria-hidden="true" />
              <span aria-current={isActive ? 'page' : undefined}>Medir</span>
            </>
          )}
        </NavLink>
        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-4 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
          aria-label="Histórico de medições"
        >
          {({ isActive }) => (
            <>
              <History className="w-5 h-5" aria-hidden="true" />
              <span aria-current={isActive ? 'page' : undefined}>Histórico</span>
            </>
          )}
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 px-4 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 rounded ${isActive ? 'text-primary-600' : 'text-gray-500'}`
          }
          aria-label="Configurações do aplicativo"
        >
          {({ isActive }) => (
            <>
              <Settings className="w-5 h-5" aria-hidden="true" />
              <span aria-current={isActive ? 'page' : undefined}>Config</span>
            </>
          )}
        </NavLink>
      </nav>
    </div>
  )
}
