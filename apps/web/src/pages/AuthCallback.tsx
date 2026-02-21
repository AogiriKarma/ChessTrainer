import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { setToken } from '../lib/api'

export default function AuthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()

  useEffect(() => {
    const token = params.get('token')
    if (token) {
      setToken(token)
      navigate('/', { replace: true })
    } else {
      navigate('/login', { replace: true })
    }
  }, [params, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <p className="text-gray-400">Connexion en cours...</p>
    </div>
  )
}
