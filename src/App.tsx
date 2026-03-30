import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Connect from './pages/Connect'
import MeasurementResult from './pages/MeasurementResult'
import History from './pages/History'
import Settings from './pages/Settings'
import ReportPage from './pages/ReportPage'

export default function App() {
  return (
    <Routes>
      {/* Report page is standalone (no navbar) */}
      <Route path="/report/:id" element={<ReportPage />} />

      <Route path="/" element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="connect" element={<Connect />} />
        <Route path="result" element={<MeasurementResult />} />
        <Route path="history" element={<History />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  )
}
