import { useEffect, useState } from 'react'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import './UserManager.css'

interface User {
  id: string
  name: string
  username: string
  password: string
  roles: string[]
}

const availableRoles = [
  'Sales',
  'Designer',
  'Printer',
  'cutting',
  'Production',
  'Production Manager',
  'Sales Manager',
  'Live Production',
  'Accountant',
  'MD',
  'HR',
]

function UserManager() {
  const [users, setUsers] = useState<User[]>([])

  const [showForm, setShowForm] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [roles, setRoles] = useState<string[]>([])

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Load users from Firestore
  useEffect(() => {
    const usersRef = collection(db, 'users')

    const unsubscribe = onSnapshot(
      usersRef,
      (snapshot) => {
        const userData: User[] = snapshot.docs.map((item) => {
          const data = item.data()

          return {
            id: item.id,
            name: data.name || '',
            username: data.username || '',
            password: data.password || '',
            roles: Array.isArray(data.roles) ? data.roles : [],
          }
        })

        setUsers(userData)
        setLoading(false)
      },
      (firebaseError) => {
        console.error(firebaseError)
        setError('Unable to load users from Firebase.')
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  const openCreateForm = () => {
    setEditingUser(null)
    setName('')
    setUsername('')
    setPassword('')
    setRoles([])
    setError('')
    setShowForm(true)
  }

  const openEditForm = (user: User) => {
    setEditingUser(user)
    setName(user.name)
    setUsername(user.username)
    setPassword(user.password)
    setRoles(user.roles)
    setError('')
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditingUser(null)
    setName('')
    setUsername('')
    setPassword('')
    setRoles([])
    setError('')
  }

  const handleRoleChange = (role: string) => {
    setRoles((currentRoles) => {
      if (currentRoles.includes(role)) {
        return currentRoles.filter(
          (currentRole) => currentRole !== role,
        )
      }

      return [...currentRoles, role]
    })
  }

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    setError('')

    if (
      !name.trim() ||
      !username.trim() ||
      !password.trim()
    ) {
      setError('Please fill in all fields.')
      return
    }

    if (roles.length === 0) {
      setError('Please select at least one role.')
      return
    }

    const duplicate = users.find(
      (user) =>
        user.username.toLowerCase() ===
          username.trim().toLowerCase() &&
        user.id !== editingUser?.id,
    )

    if (duplicate) {
      setError('Username already exists.')
      return
    }

    setSaving(true)

    try {
      const userData = {
        name: name.trim(),
        username: username.trim(),
        password: password,
        roles: roles,
      }

      if (editingUser) {
        await updateDoc(
          doc(db, 'users', editingUser.id),
          userData,
        )
      } else {
        await addDoc(collection(db, 'users'), userData)
      }

      closeForm()
    } catch (firebaseError) {
      console.error(firebaseError)
      setError('Unable to save user.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (user: User) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete "${user.name}"?`,
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteDoc(doc(db, 'users', user.id))
    } catch (firebaseError) {
      console.error(firebaseError)
      setError('Unable to delete user.')
    }
  }

  return (
    <div className="user-manager">
      <header className="user-manager-header">
        <div>
          <h1>User Manager</h1>
          <p>Manage users and their accounts</p>
        </div>

        <button
          type="button"
          className="create-user-button"
          onClick={openCreateForm}
        >
          + Create User
        </button>
      </header>

      <main className="user-manager-content">

        {/* CREATE / EDIT FORM */}
        {showForm && (
          <div className="user-form-card">
            <div className="form-header">
              <div>
                <h2>
                  {editingUser
                    ? 'Edit User'
                    : 'Create User'}
                </h2>

                <p>
                  {editingUser
                    ? 'Update the user information.'
                    : 'Enter the new user information.'}
                </p>
              </div>

              <button
                type="button"
                className="close-button"
                onClick={closeForm}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="form-grid">

                {/* NAME */}
                <div className="form-group">
                  <label htmlFor="name">
                    Name
                  </label>

                  <input
                    id="name"
                    type="text"
                    placeholder="Enter name"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                  />
                </div>

                {/* USERNAME */}
                <div className="form-group">
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
                  />
                </div>

                {/* PASSWORD */}
                <div className="form-group">
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
                  />
                </div>

              </div>

              {/* ROLES */}
              <div className="roles-section">
                <label className="roles-title">
                  Select Roles
                </label>

                <div className="roles-grid">
                  {availableRoles.map((role) => (
                    <label
                      className="role-checkbox"
                      key={role}
                    >
                      <input
                        type="checkbox"
                        checked={roles.includes(role)}
                        onChange={() =>
                          handleRoleChange(role)
                        }
                      />

                      <span>{role}</span>
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="form-error">
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button
                  type="button"
                  className="cancel-button"
                  onClick={closeForm}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="save-button"
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : editingUser
                      ? 'Update User'
                      : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* USERS TABLE */}
        <div className="users-card">
          <div className="users-card-header">
            <div>
              <h2>All Users</h2>
              <span>
                {users.length} user(s)
              </span>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">
              <h3>Loading users...</h3>
            </div>
          ) : users.length === 0 ? (
            <div className="empty-state">
              <h3>No users found</h3>

              <p>
                Click "Create User" to add your
                first user.
              </p>
            </div>
          ) : (
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Username</th>
                    <th>Password</th>
                    <th>Roles</th>
                    <th>Actions</th>
                  </tr>
                </thead>

                <tbody>
                  {users.map((user, index) => (
                    <tr key={user.id}>
                      <td>{index + 1}</td>

                      <td className="user-name">
                        {user.name}
                      </td>

                      <td>
                        {user.username}
                      </td>

                      <td className="password-value">
                        {user.password}
                      </td>

                      <td>
                        <div className="roles-list">
                          {user.roles.map((role) => (
                            <span
                              className="role-badge"
                              key={role}
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() =>
                              openEditForm(user)
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() =>
                              handleDelete(user)
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

export default UserManager