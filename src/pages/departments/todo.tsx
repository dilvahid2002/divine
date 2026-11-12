import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  deleteDoc,
  doc,
  writeBatch,
} from 'firebase/firestore'

import { db } from '../../firebase'
import './Todo.css'

// ==========================================
// INTERFACES
// ==========================================

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
type StatusFilter = 'all' | 'pending' | 'finished'

// ==========================================
// TODO COMPONENT
// ==========================================

function Todo({ user }: TodoProps) {
  const [showForm, setShowForm] = useState(false)

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [selectedStaff, setSelectedStaff] = useState('')

  // Multiple task inputs
  const [taskTexts, setTaskTexts] = useState<string[]>([''])

  const [tasks, setTasks] = useState<TodoTask[]>([])
  const [filter, setFilter] = useState<Filter>('my-tasks')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assignedByFilter, setAssignedByFilter] = useState('all')

  const [loading, setLoading] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(false)
  const [saving, setSaving] = useState(false)

  const [finishingId, setFinishingId] = useState('')
  const [deletingId, setDeletingId] = useState('')

  const [message, setMessage] = useState('')
  const [messageType, setMessageType] = useState<
    'error' | 'success'
  >('error')

  // ==========================================
  // LOAD STAFF MEMBERS
  // ==========================================

  useEffect(() => {
    const loadStaff = async () => {
      setLoadingStaff(true)

      try {
        const snapshot = await getDocs(
          collection(db, 'users')
        )

        const members: StaffMember[] = snapshot.docs
          .map((staffDoc) => {
            const data = staffDoc.data()

            return {
              id: staffDoc.id,
              name: String(data.name ?? ''),
              username: String(data.username ?? ''),
            }
          })
          .filter(
            (member) => member.name && member.username
          )

        // Include signed-in user if missing
        if (
          !members.some(
            (member) => member.username === user.username
          )
        ) {
          members.push({
            id: user.username,
            name: user.name,
            username: user.username,
          })
        }

        members.sort((a, b) =>
          a.name.localeCompare(b.name)
        )

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

  // ==========================================
  // REAL-TIME FIRESTORE TASK LISTENER
  // ==========================================

  useEffect(() => {
    const tasksQuery = query(
      collection(db, 'todos'),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(
      tasksQuery,

      (snapshot) => {
        const taskList: TodoTask[] =
          snapshot.docs.map((taskDoc) => {
            const data = taskDoc.data()

            return {
              id: taskDoc.id,
              task: String(data.task ?? ''),

              assignedTo: data.assignedTo ?? {
                name: '',
                username: '',
              },

              assignedBy: data.assignedBy ?? {
                name: '',
                username: '',
              },

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

        setMessage(
          'Unable to load tasks. Check your Firestore permissions.'
        )

        setMessageType('error')
        setLoading(false)
      }
    )

    return unsubscribe
  }, [])

  // ==========================================
  // FILTER TASKS
  // ==========================================

  // Tasks belonging to the current tab (before status filtering)
  const tabTasks = useMemo(() => {
    return tasks.filter((task) =>
      filter === 'my-tasks'
        ? task.assignedTo.username === user.username
        : task.assignedBy.username === user.username
    )
  }, [tasks, filter, user.username])

  // People who have assigned tasks to me (for the "Assigned by" dropdown)
  const assignedByOptions = useMemo(() => {
    const map = new Map<string, { name: string; username: string; count: number }>()

    tabTasks.forEach((task) => {
      const { name, username } = task.assignedBy
      if (!username) return

      const existing = map.get(username)

      if (existing) {
        existing.count += 1
      } else {
        map.set(username, { name: name || username, username, count: 1 })
      }
    })

    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    )
  }, [tabTasks])

  // Fall back to "all" if the selected person no longer has any tasks
  const activeAssignedBy = assignedByOptions.some(
    (option) => option.username === assignedByFilter
  )
    ? assignedByFilter
    : 'all'

  // Apply the "Assigned by" filter (only in the My Tasks tab)
  const personTasks = useMemo(() => {
    if (filter !== 'my-tasks' || activeAssignedBy === 'all') {
      return tabTasks
    }

    return tabTasks.filter(
      (task) => task.assignedBy.username === activeAssignedBy
    )
  }, [tabTasks, filter, activeAssignedBy])

  // Counts for the status buttons (respect the "Assigned by" filter)
  const statusCounts = useMemo(() => {
    const finished = personTasks.filter((t) => t.finished).length

    return {
      finished,
      pending: personTasks.length - finished,
      total: personTasks.length,
    }
  }, [personTasks])

  // Final list shown in the table
  const visibleTasks = useMemo(() => {
    if (statusFilter === 'finished') {
      return personTasks.filter((t) => t.finished)
    }

    if (statusFilter === 'pending') {
      return personTasks.filter((t) => !t.finished)
    }

    return personTasks
  }, [personTasks, statusFilter])

  // ==========================================
  // ADD ANOTHER TASK INPUT
  // ==========================================

  const handleAddTaskField = () => {
    setTaskTexts((current) => [
      ...current,
      '',
    ])
  }

  // ==========================================
  // UPDATE TASK INPUT
  // ==========================================

  const handleTaskChange = (
    index: number,
    value: string
  ) => {
    setTaskTexts((current) =>
      current.map((task, i) =>
        i === index ? value : task
      )
    )
  }

  // ==========================================
  // REMOVE TASK INPUT
  // ==========================================

  const handleRemoveTaskField = (index: number) => {
    setTaskTexts((current) => {
      if (current.length === 1) {
        return ['']
      }

      return current.filter(
        (_, i) => i !== index
      )
    })
  }

  // ==========================================
  // SUBMIT MULTIPLE TASKS TO FIRESTORE
  // ==========================================

  const handleAddTask = async (
    event: React.FormEvent<HTMLFormElement>
  ) => {
    event.preventDefault()

    setMessage('')

    const assignee = staff.find(
      (member) =>
        member.username === selectedStaff
    )

    if (!assignee) {
      setMessage('Please select a staff member.')
      setMessageType('error')
      return
    }

    const validTasks = taskTexts
      .map((task) => task.trim())
      .filter((task) => task.length > 0)

    if (validTasks.length === 0) {
      setMessage('Please enter at least one task.')
      setMessageType('error')
      return
    }

    // Firestore batch supports up to 500 writes
    if (validTasks.length > 450) {
      setMessage(
        'You can assign a maximum of 450 tasks at once.'
      )
      setMessageType('error')
      return
    }

    setSaving(true)

    try {
      const batch = writeBatch(db)

      const todosRef = collection(db, 'todos')

      validTasks.forEach((task) => {
        const newTaskRef = doc(todosRef)

        batch.set(newTaskRef, {
          task: task,

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
      })

      // Save all tasks together
      await batch.commit()

      setTaskTexts([''])
      setSelectedStaff('')
      setShowForm(false)

      setMessage(
        `${validTasks.length} task(s) assigned successfully!`
      )

      setMessageType('success')

    } catch (error) {
      console.error(
        'Unable to add tasks:',
        error
      )

      setMessage(
        'Unable to assign tasks. Please try again.'
      )

      setMessageType('error')

    } finally {
      setSaving(false)
    }
  }

  // ==========================================
  // MARK TASK AS FINISHED
  // ==========================================

  const handleFinishTask = async (
    taskId: string
  ) => {
    setMessage('')
    setFinishingId(taskId)

    try {
      await updateDoc(
        doc(db, 'todos', taskId),
        {
          finished: true,

          finishedAt: serverTimestamp(),

          finishedBy: {
            name: user.name,
            username: user.username,
          },
        }
      )

    } catch (error) {
      console.error(
        'Unable to finish task:',
        error
      )

      setMessage(
        'Unable to mark the task as finished.'
      )

      setMessageType('error')

    } finally {
      setFinishingId('')
    }
  }

  // ==========================================
  // DELETE TASK ASSIGNED BY THE CURRENT USER
  // ==========================================

  const handleDeleteTask = async (task: TodoTask) => {
    // Extra client-side ownership check.
    if (task.assignedBy.username !== user.username) {
      setMessage('You can only delete tasks assigned by you.')
      setMessageType('error')
      return
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete this task?\n\n"${task.task}"`
    )

    if (!confirmed) return

    setMessage('')
    setDeletingId(task.id)

    try {
      await deleteDoc(doc(db, 'todos', task.id))

      setMessage('Task deleted successfully.')
      setMessageType('success')
    } catch (error) {
      console.error('Unable to delete task:', error)
      setMessage('Unable to delete task. Please try again.')
      setMessageType('error')
    } finally {
      setDeletingId('')
    }
  }

  // ==========================================
  // FORMAT DATE AND TIME
  // ==========================================

  const formatDateTime = (timestamp: any) => {
    if (!timestamp) return 'Just now'

    const date =
      typeof timestamp.toDate === 'function'
        ? timestamp.toDate()
        : new Date(timestamp)

    if (Number.isNaN(date.getTime())) {
      return '—'
    }

    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
  }

  // ==========================================
  // RESET FORM
  // ==========================================

  const handleCloseForm = () => {
    if (saving) return

    setShowForm(false)
    setSelectedStaff('')
    setTaskTexts([''])
    setMessage('')
  }

  // ==========================================
  // RENDER
  // ==========================================

  return (
    <div className="todo-page">

      <div className="todo-container">

        {/* HEADER */}

        <header className="todo-header">

          <div>
            <h1>Tasks</h1>

            <p>
              Assign tasks and track their completion.
            </p>
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

        {/* FILTERS */}

        <nav
          className="todo-filters"
          aria-label="Task filters"
        >

          <button
            type="button"
            className={
              filter === 'my-tasks' ? 'active' : ''
            }
            onClick={() => setFilter('my-tasks')}
          >
            My Tasks

            <span>Assigned to me</span>
          </button>

          <button
            type="button"
            className={
              filter === 'assigned-by-me'
                ? 'active'
                : ''
            }
            onClick={() => {
              setFilter('assigned-by-me')
              setAssignedByFilter('all')
            }}
          >
            Assigned by Me

            <span>Tasks I assigned</span>
          </button>

        </nav>

        {/* ADD TASK FORM */}

        {showForm && (

          <section className="todo-form-section">

            <h2>Assign New Tasks</h2>

            <form onSubmit={handleAddTask}>

              <div className="todo-form-grid">

                {/* STAFF SELECTION */}

                <div className="todo-field">

                  <label htmlFor="todo-staff">
                    Name of Staff
                  </label>

                  <select
                    id="todo-staff"
                    value={selectedStaff}
                    onChange={(event) =>
                      setSelectedStaff(
                        event.target.value
                      )
                    }
                    disabled={
                      loadingStaff || saving
                    }
                    required
                  >

                    <option value="">
                      {loadingStaff
                        ? 'Loading staff...'
                        : 'Select staff member'}
                    </option>

                    {staff.map((member) => (

                      <option
                        key={member.id}
                        value={member.username}
                      >
                        {member.name} ({member.username})
                      </option>

                    ))}

                  </select>

                </div>

                {/* MULTIPLE TASK INPUTS */}

                <div className="todo-field todo-multiple-tasks">

                  <label>Tasks</label>

                  <div className="todo-task-input-list">

                    {taskTexts.map((task, index) => (

                      <div
                        className="todo-task-input-row"
                        key={index}
                      >

                        <span className="todo-task-number">
                          {index + 1}
                        </span>

                        <textarea
                          value={task}
                          onChange={(event) =>
                            handleTaskChange(
                              index,
                              event.target.value
                            )
                          }
                          placeholder={`Enter task ${index + 1}...`}
                          rows={2}
                          disabled={saving}
                        />

                        <button
                          type="button"
                          className="todo-remove-task"
                          onClick={() =>
                            handleRemoveTaskField(index)
                          }
                          disabled={
                            saving ||
                            taskTexts.length === 1
                          }
                          title="Remove task"
                        >
                          &times;
                        </button>

                      </div>

                    ))}

                  </div>

                  {/* ADD ANOTHER TASK */}

                  <button
                    type="button"
                    className="todo-add-another"
                    onClick={handleAddTaskField}
                    disabled={saving}
                  >
                    + Add Another Task
                  </button>

                  <div className="todo-task-count">
                    {taskTexts.filter(
                      (task) => task.trim().length > 0
                    ).length}{' '}
                    task(s) ready to assign
                  </div>

                </div>

              </div>

              {/* FORM ACTIONS */}

              <div className="todo-form-actions">

                <button
                  type="button"
                  className="todo-cancel-button"
                  onClick={handleCloseForm}
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="todo-submit-button"
                  disabled={
                    saving || loadingStaff
                  }
                >
                  {saving
                    ? 'Assigning Tasks...'
                    : `Submit All Tasks (${
                        taskTexts.filter(
                          (task) => task.trim()
                        ).length
                      })`}
                </button>

              </div>

            </form>

          </section>

        )}

        {/* SUCCESS / ERROR MESSAGE */}

        {message && (

          <div
            className={`todo-message ${messageType}`}
            role="status"
          >
            {message}
          </div>

        )}

        {/* TASK TABLE */}

        <section className="todo-table-section">

          <div className="todo-table-heading">

            <h2>
              {filter === 'my-tasks'
                ? 'My Tasks'
                : 'Tasks Assigned by Me'}
            </h2>

            <span>
              {visibleTasks.length}{' '}
              task
              {visibleTasks.length === 1 ? '' : 's'}
            </span>

          </div>

          {/* ASSIGNED BY DROPDOWN (My Tasks only) */}

          {filter === 'my-tasks' && (

            <div className="todo-assigned-by-filter">

              <label htmlFor="todo-assigned-by">
                Assigned by
              </label>

              <select
                id="todo-assigned-by"
                value={activeAssignedBy}
                onChange={(event) =>
                  setAssignedByFilter(event.target.value)
                }
              >

                <option value="all">
                  All ({tabTasks.length})
                </option>

                {assignedByOptions.map((option) => (

                  <option
                    key={option.username}
                    value={option.username}
                  >
                    {option.name} ({option.count})
                  </option>

                ))}

              </select>

            </div>

          )}

          {/* STATUS FILTER BUTTONS */}

          <div
            className="todo-status-filters"
            role="group"
            aria-label="Status filter"
          >

            <button
              type="button"
              className={`status-finished ${
                statusFilter === 'finished' ? 'active' : ''
              }`}
              onClick={() => setStatusFilter('finished')}
            >
              Finished ({statusCounts.finished})
            </button>

            <button
              type="button"
              className={`status-pending ${
                statusFilter === 'pending' ? 'active' : ''
              }`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({statusCounts.pending})
            </button>

            <button
              type="button"
              className={`status-total ${
                statusFilter === 'all' ? 'active' : ''
              }`}
              onClick={() => setStatusFilter('all')}
            >
              Total ({statusCounts.total})
            </button>

          </div>

          {/* LOADING */}

          {loading ? (

            <div className="todo-empty">
              Loading tasks...
            </div>

          ) : visibleTasks.length === 0 ? (

            <div className="todo-empty">
              {statusFilter === 'all'
                ? 'No tasks found in this view.'
                : `No ${statusFilter} tasks in this view.`}
            </div>

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
                        {formatDateTime(
                          task.createdAt
                        )}
                      </td>

                      <td data-label="Assigned By">
                        {task.assignedBy.name || '—'}
                      </td>

                      <td
                        data-label="Task"
                        className="todo-task-cell"
                      >

                        {task.task}

                        {filter === 'assigned-by-me' && (

                          <small>
                            Assigned to:{' '}
                            {task.assignedTo.name}
                          </small>

                        )}

                      </td>

                      <td data-label="Status / Action">

                        {filter === 'assigned-by-me' ? (

                          <div className="todo-action-buttons">
                            {task.finished ? (
                              <span className="todo-finished-label">
                                Finished
                              </span>
                            ) : (
                              <span className="todo-pending-label">
                                Pending
                              </span>
                            )}

                            <button
                              type="button"
                              className="todo-delete-button"
                              onClick={() => handleDeleteTask(task)}
                              disabled={deletingId === task.id}
                              title="Delete this task"
                            >
                              {deletingId === task.id
                                ? 'Deleting...'
                                : 'Delete'}
                            </button>
                          </div>

                        ) : task.finished ? (

                          <span className="todo-finished-label">
                            Finished
                          </span>

                        ) : (

                          <button
                            type="button"
                            className="todo-finish-button"
                            onClick={() =>
                              handleFinishTask(task.id)
                            }
                            disabled={
                              finishingId === task.id
                            }
                          >
                            {finishingId === task.id
                              ? 'Updating...'
                              : 'Finished'}
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