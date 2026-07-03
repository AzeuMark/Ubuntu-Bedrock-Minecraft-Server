import { Navigate, useLocation } from 'react-router-dom'

// Wraps any route that requires login. If the user isn't authenticated,
// redirect to /login (remembering where they were trying to go).
export default function ProtectedRoute({ loggedIn, children }) {
  const location = useLocation()
  if (!loggedIn) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}
