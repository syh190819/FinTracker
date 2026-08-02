import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AuthProvider } from './contexts/AuthContext'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './App.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ConfigProvider
          locale={zhCN}
          theme={{
            token: {
              colorPrimary: '#1a1a2e',
              borderRadius: 6,
              fontSize: 13,
            },
          }}
        >
          <AuthProvider>
            <App />
          </AuthProvider>
        </ConfigProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </StrictMode>,
)
