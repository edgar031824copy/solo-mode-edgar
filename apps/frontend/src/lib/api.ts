import axios from 'axios'

// Base URL from env; Vite dev proxy routes /auth → http://localhost:3001 when empty
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '',
})

// Attach JWT from localStorage to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers = config.headers ?? {}
    config.headers['Authorization'] = `Bearer ${token}`
  }
  return config
})

// On 401: clear token and redirect to /login
// Using window.location to avoid circular dependency with AuthContext
// Exception: /auth/login 401s must propagate so the login form can display errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config?.url?.includes('/auth/login')
    ) {
      localStorage.removeItem('auth_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Typed wrappers for candidate report + post-screening endpoints
export function downloadReport(candidateId: string) {
  return api.get(`/candidates/${candidateId}/report`)
}

export function runPostScreening(candidateId: string, transcriptFile: File) {
  const formData = new FormData()
  formData.append('transcript', transcriptFile)
  return api.post(`/candidates/${candidateId}/post-screen`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function recordDecision(candidateId: string, choice: 'pass' | 'no_pass') {
  return api.post(`/candidates/${candidateId}/decision`, { choice })
}

export default api
