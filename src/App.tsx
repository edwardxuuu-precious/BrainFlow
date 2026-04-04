import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

const HomePage = lazy(async () => {
  const module = await import('./pages/home/HomePage')
  return { default: module.HomePage }
})

const MapEditorPage = lazy(async () => {
  const module = await import('./pages/editor/MapEditorPage')
  return { default: module.MapEditorPage }
})

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/map/:documentId" element={<MapEditorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

export default App
