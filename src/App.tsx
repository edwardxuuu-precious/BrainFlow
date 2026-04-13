import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthGate } from './features/auth/AuthGate'
import { StorageConflictDialogHost } from './features/storage/ui/StorageConflictDialogHost'

const HomePage = lazy(async () => {
  const module = await import('./pages/home/HomePage')
  return { default: module.HomePage }
})

const MapEditorPage = lazy(async () => {
  const module = await import('./pages/editor/MapEditorPage')
  return { default: module.MapEditorPage }
})

const StorageSettingsPage = lazy(async () => {
  const module = await import('./features/storage/ui/StorageSettingsPage')
  return { default: module.StorageSettingsPage }
})

const AiSettingsPage = lazy(async () => {
  const module = await import('./pages/ai-settings/AiSettingsPage')
  return { default: module.AiSettingsPage }
})

function AuthenticatedApp() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#888' }}>正在加载…</div>}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map/:documentId" element={<MapEditorPage />} />
          <Route path="/settings" element={<StorageSettingsPage />} />
          <Route path="/ai-settings" element={<AiSettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <StorageConflictDialogHost />
    </BrowserRouter>
  )
}

function App() {
  return (
    <AuthGate>
      <AuthenticatedApp />
    </AuthGate>
  )
}

export default App
