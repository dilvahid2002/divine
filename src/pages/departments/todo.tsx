import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Todo.css'

interface TodoProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

interface StaffMember {
  id: string
  name: string
  username: string
}

interface TodoTask {
  id: string
  task: string
  assignedTo: {
    name: string
    username: string
  }
  assignedBy: {
    name: string
    username: string
  }
  createdAt: any
  finished: boolean
  finishedAt?: any
}

type Filter = 'my-tasks' | 'assigned-by-me'

function Todo({ user }: TodoProps) {
  const [showForm, setShowForm] = useState(false)
  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')
  const [taskText, setTaskText] = useState('')
  const [tasks, setTasks] = useState<TodoTask[]>([])
  const [filter, setFilter] = useState<Filter>('my-tasks')
  const [loading, setLoading] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [saving, setSaving] = useState(false)
  const [finishingId, setFinishingId] = useState('')
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<'error' | 'success'>('error')

  // Load staff members for the assignment dropdown.
  useEffect(() => {
    const loadStaff = async () => {
      setLoadingStaff(true)
      try {
        const snapshot = await getDocs(collection(db, 'users'))
        const members = snapshot.docs.map((staffDoc) => {
          const data = staffDoc.data()
          return {
            id: staffDoc.id,
            name: String(data.name ?? ''),
            username: String(data.username ?? ''),
          }
        }).filter((member) => member.name && member.username)

        // Include the signed-in user if they are not present in the users query.
        if (!members.some((member) => member.username === user.username)) {
          members.push({
            id: user.username,
            name: user.name,
            username: user.username,
          })
        }

        members.sort((a, b) => a.name.localeCompare(b.name))
        setStaff(members)
      } catch (error) {
        console.error('Unable to load staff:', error)
        setMessage('Unable to load staff members.')
        setMessageType('error')
      } finally {
        setLoadingStaff(false)
      }
    }

    loadStaff()
  }, [user.name, user.username])

  // Subscribe to task changes so the table updates in real time.
  useEffect(() => {
    const tasksQuery = query(
      collection(db, 'todos'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      tasksQuery,
      (snapshot) => {
        const taskList: TodoTask[] = snapshot.docs.map((taskDoc) => {
          const data = taskDoc.data()
          return {
            id: taskDoc.id,
            task: String(data.task ?? ''),
            assignedTo: data.assignedTo ?? { name: '', username: '' },
            assignedBy: data.assignedBy ?? { name: '', username: '' },
            createdAt: data.createdAt ?? null,
            finished: Boolean(data.finished),
            finishedAt: data.finishedAt ?? null,
          }
        })
        setTasks(taskList)
        setLoading(false)
      },
      (error) => {
        console.error('Unable to load tasks:', error)
        setMessage('Unable to load tasks. Check your Firestore permissions.')
        setMessageType('error')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (filter === 'my-tasks') {
        return task.assignedTo.username === user.username
      }
      return task.assignedBy.username === user.username
    })
  }, [tasks, filter, user.username])

  const handleAddTask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMessage('')

    const assignee = staff.find((member) => member.username === selectedStaff)
    if (!assignee) {
      setMessage('Please select a staff member.')
      setMessageType('error')
      return
    }

    if (!taskText.trim()) {
      setMessage('Please enter a task.')
      setMessageType('error')
      return
    }

    setSaving(true)
    try {
      await addDoc(collection(db, 'todos'), {
        task: taskText.trim(),
        assignedTo: {
          name: assignee.name,
          username: assignee.username,
        },
        assignedBy: {
          name: user.name,
          username: user.username,
        },
        createdAt: serverTimestamp(),
        finished: false,
        finishedAt: null,
      })

      setTaskText('')
      setSelectedStaff('')
      setShowForm(false)
      setMessage('Task assigned successfully.')
      setMessageType('success')
    } catch (error) {
      console.error('Unable to add task:', error)
      setMessage('Unable to assign the task. Please try again.')
      setMessageType('error')
    } finally {
      setSaving(false)
    }
  }

  const handleFinishTask = async (taskId: string) => {
    setMessage('')
    setFinishingId(taskId)
    try {
      await updateDoc(doc(db, 'todos', taskId), {
        finished: true,
        finishedAt: serverTimestamp(),
        finishedBy: {
          name: user.name,
          username: user.username,
        },
      })
    } catch (error) {
      console.error('Unable to finish task:', error)
      setMessage('Unable to mark the task as finished.')
      setMessageType('error')
    } finally {
      setFinishingId('')
    }
  }

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'Just now'
    const date = typeof timestamp.toDate === 'function'
      ? timestamp.toDate()
      : new Date(timestamp)

    if (Number.isNaN(date.getTime())) return '—'

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  return (
    <div className="todo-page">
      <div className="todo-container">
        <header className="todo-header">
          <div>
            <h1>Tasks</h1>
            <p>Assign tasks and track their completion.</p>
          </div>

          <button
            type="button"
            className="todo-add-button"
            onClick={() => {
              setMessage('')
              setShowForm((current) => !current)
            }}
          >
            {showForm ? 'Close' : '+ Add Task'}
          </button>
        </header>

        <nav className="todo-filters" aria-label="Task filters">
          <button
            type="button"
            className={filter === 'my-tasks' ? 'active' : ''}
            onClick={() => setFilter('my-tasks')}
          >
            My Tasks
            <span>Assigned to me</span>
          </button>
          <button
            type="button"
            className={filter === 'assigned-by-me' ? 'active' : ''}
            onClick={() => setFilter('assigned-by-me')}
          >
            Assigned by Me
            <span>Tasks I assigned</span>
          </button>
        </nav>

        {showForm && (
          <section className="todo-form-section">
            <h2>Assign a New Task</h2>
            <form onSubmit={handleAddTask}>
              <div className="todo-form-grid">
                <div className="todo-field">
                  <label htmlFor="todo-staff">Name of Staff</label>
                  <select
                    id="todo-staff"
                    value={selectedStaff}
                    onChange={(event) => setSelectedStaff(event.target.value)}
                    disabled={loadingStaff || saving}
                    required
                  >
                    <option value="">
                      {loadingStaff ? 'Loading staff...' : 'Select staff member'}
                    </option>
                    {staff.map((member) => (
                      <option key={member.id} value={member.username}>
                        {member.name} ({member.username})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="todo-field">
                  <label htmlFor="todo-task">Task</label>
                  <textarea
                    id="todo-task"
                    value={taskText}
                    onChange={(event) => setTaskText(event.target.value)}
                    placeholder="Describe the task..."
                    rows={3}
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="todo-form-actions">
                <button
                  type="button"
                  className="todo-cancel-button"
                  onClick={() => setShowForm(false)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="todo-submit-button"
                  disabled={saving || loadingStaff}
                >
                  {saving ? 'Assigning...' : 'Submit Task'}
                </button>
              </div>
            </form>
          </section>
        )}

        {message && (
          <div className={`todo-message ${messageType}`} role="status">
            {message}
          </div>
        )}

        <section className="todo-table-section">
          <div className="todo-table-heading">
            <h2>{filter === 'my-tasks' ? 'My Tasks' : 'Tasks Assigned by Me'}</h2>
            <span>{visibleTasks.length} task{visibleTasks.length === 1 ? '' : 's'}</span>
          </div>

          {loading ? (
            <div className="todo-empty">Loading tasks...</div>
          ) : visibleTasks.length === 0 ? (
            <div className="todo-empty">No tasks found in this view.</div>
          ) : (
            <div className="todo-table-wrapper">
              <table className="todo-table">
                <thead>
                  <tr>
                    <th>Date and Time</th>
                    <th>Assigned By</th>
                    <th>Task</th>
                    <th>Status / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.map((task) => (
                    <tr key={task.id}>
                      <td data-label="Date and Time">
                        {formatDateTime(task.createdAt)}
                      </td>
                      <td data-label="Assigned By">
                        {task.assignedBy.name || '—'}
                      </td>
                      <td data-label="Task" className="todo-task-cell">
                        {task.task}
                        {filter === 'assigned-by-me' && (
                          <small>Assigned to: {task.assignedTo.name}</small>
                        )}
                      </td>
                      <td data-label="Status / Action">
                        {task.finished ? (
                          <span className="todo-finished-label">Finished</span>
                        ) : (
                          <button
                            type="button"
                            className="todo-finish-button"
                            onClick={() => handleFinishTask(task.id)}
                            disabled={finishingId === task.id}
                          >
                            {finishingId === task.id ? 'Updating...' : 'Finished'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default Todo
