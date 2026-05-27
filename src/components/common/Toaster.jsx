import { useContext } from 'react'
import AppContext from '../../context/AppContext'

export default function Toaster() {
  const { toasts, dismissToast } = useContext(AppContext)
  if (!toasts?.length) return null
  return (
    <div className="rt-toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rt-toast rt-toast--${t.variant}`}
          onClick={() => dismissToast(t.id)}
          role="status"
        >
          <span style={{ flex: 1 }}>{t.message}</span>
          <span style={{ opacity: 0.5, fontSize: '0.7rem' }}>✕</span>
        </div>
      ))}
    </div>
  )
}
