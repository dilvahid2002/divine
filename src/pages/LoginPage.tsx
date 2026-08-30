import { useState } from 'react'
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'
import './LoginPage.css'

interface LoggedInUser {
  name: string
  username: string
  password: string
  roles: string[]
}

interface LoginPageProps {
  onLogin: (user: LoggedInUser) => void
}

function LoginPage({ onLogin }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setError('')
    setLoading(true)

    try {
      // Admin account
      if (username === 'admin' && password === 'admin') {
        onLogin({
          name: 'Administrator',
          username: 'admin',
          password: 'admin',
          roles: ['MD'],
        })

        return
      }

      // Search Firestore for the username
      const usersRef = collection(db, 'users')

      const userQuery = query(
        usersRef,
        where('username', '==', username.trim()),
      )

      const snapshot = await getDocs(userQuery)

      if (snapshot.empty) {
        setError('Invalid username or password')
        return
      }

      const userDocument = snapshot.docs[0]
      const userData = userDocument.data()

      // Check password
      if (userData.password !== password) {
        setError('Invalid username or password')
        return
      }

      // Successful login
      onLogin({
        name: userData.name,
        username: userData.username,
        password: userData.password,
        roles: Array.isArray(userData.roles)
          ? userData.roles
          : [],
      })
    } catch (firebaseError) {
      console.error('Login error:', firebaseError)
      setError('Unable to connect to Firebase.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>DIVINE SIGNAGE <br /> Work Manager</h1>

        <p className="login-subtitle">
          Sign in to continue
        </p>

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label htmlFor="username">
              Username
            </label>

            <input
              id="username"
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(event) =>
                setUsername(event.target.value)
              }
              autoComplete="username"
              disabled={loading}
            />
          </div>

          <div className="input-group">
            <label htmlFor="password">
              Password
            </label>

            <input
              id="password"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(event) =>
                setPassword(event.target.value)
              }
              autoComplete="current-password"
              disabled={loading}
            />
          </div>

          {error && (
            <p className="login-error">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="login-button"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default LoginPage