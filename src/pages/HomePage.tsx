import './HomePage.css'

import { useEffect, useMemo, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import {
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore'

import { db } from '../firebase'

interface HomePageProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

type DutyStatus =
  | 'Not Started'
  | 'Working'
  | 'Ended'

interface DailyDutyRecord {
  date: string
  startTime: Timestamp | null
  endTime: Timestamp | null
  branch: string
  totalWorkedSeconds?: number
  totalSessions?: number
}

interface DutySession {
  status: DutyStatus
  dutyDate: string
  branch: string

  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null

  totalWorkedSeconds: number
  totalSessions: number

  dailySessions: Record<
    string,
    DailyDutyRecord
  >

  updatedAt?: Timestamp | null

  userName?: string
  username?: string
}

const dutyCollection = 'duty_sessions'

const dutyBranches = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

const availableRoles = [
  'Sales',
  'Designer',
  'Cutting',
  'Printer',
  'Production',
  'Production Manager',
  'Sales Manager',
  'Accountant',
  'MD',
  'HR',
]

const departmentPaths: Record<
  string,
  string
> = {
  Sales: '/departments/sales',
  Designer: '/departments/designer',
  Cutting: '/departments/cutting',
  Printer: '/departments/printer',
  Production: '/departments/production',
  'Production Manager':
    '/departments/production-manager',
  'Sales Manager':
    '/departments/sales-manager',
  Accountant: '/departments/accountant',
  MD: '/departments/md',
  HR: '/departments/hr',
  'Live Production':
    '/departments/live-production',
}

const getTodayDate = () => {
  const now = new Date()

  const year = now.getFullYear()

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, '0')

  const day = String(
    now.getDate(),
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function HomePage({
  user,
}: HomePageProps) {
  const navigate = useNavigate()

  const [todayDate, setTodayDate] =
    useState(getTodayDate())

  const [duty, setDuty] =
    useState<DutySession>({
      status: 'Not Started',
      dutyDate: todayDate,
      branch: '',
      totalWorkedSeconds: 0,
      totalSessions: 0,
      dailySessions: {},
    })

  const [dutyLoading, setDutyLoading] =
    useState(true)

  const [dutyBusy, setDutyBusy] =
    useState(false)

  const [dutyMessage, setDutyMessage] =
    useState('')

  const [selectedBranch, setSelectedBranch] =
    useState('')

  const [
    showBranchDropdown,
    setShowBranchDropdown,
  ] = useState(false)

  const [showUserMenu, setShowUserMenu] =
    useState(false)

  /*
   * =========================================
   * FIRESTORE DUTY DOCUMENT
   * =========================================
   */

  const dutyRef = useMemo(
    () =>
      doc(
        db,
        dutyCollection,
        user.username
          .trim()
          .toLowerCase(),
      ),
    [user.username],
  )

  /*
   * =========================================
   * KEEP DATE UPDATED
   * =========================================
   */

  useEffect(() => {
    const intervalId =
      window.setInterval(() => {
        const currentDate =
          getTodayDate()

        setTodayDate(
          (previousDate) =>
            previousDate ===
            currentDate
              ? previousDate
              : currentDate,
        )
      }, 60 * 1000)

    return () => {
      window.clearInterval(
        intervalId,
      )
    }
  }, [])

  /*
   * =========================================
   * LOAD DUTY
   * =========================================
   */

  useEffect(() => {
    setDutyLoading(true)

    const unsubscribe =
      onSnapshot(
        dutyRef,
        (snapshot) => {
          const today = todayDate

          if (!snapshot.exists()) {
            setDuty({
              status: 'Not Started',
              dutyDate: today,
              branch: '',
              totalWorkedSeconds: 0,
              totalSessions: 0,
              dailySessions: {},
              userName: user.name,
              username:
                user.username,
            })

            setSelectedBranch('')
            setShowBranchDropdown(false)
            setDutyLoading(false)

            return
          }

          const data =
            snapshot.data() as Partial<DutySession>

          const dailySessions =
            data.dailySessions &&
            typeof data.dailySessions ===
              'object'
              ? data.dailySessions
              : {}

          const todayRecord =
            dailySessions[today]

          /*
           * BACKWARD COMPATIBILITY
           */

          const legacyTodayRecord =
            !todayRecord &&
            data.dutyDate === today
              ? {
                  date: today,

                  startTime:
                    data.lastStartedAt ||
                    null,

                  endTime:
                    data.lastEndedAt ||
                    null,

                  branch:
                    data.branch || '',

                  totalWorkedSeconds:
                    Number(
                      data.totalWorkedSeconds ||
                        0,
                    ),

                  totalSessions:
                    Number(
                      data.totalSessions ||
                        0,
                    ),
                }
              : undefined

          const record =
            todayRecord ||
            legacyTodayRecord

          /*
           * NO RECORD FOR TODAY
           */

          if (!record) {
            setDuty({
              status: 'Not Started',
              dutyDate: today,
              branch: '',
              currentSessionStartedAt:
                null,
              lastStartedAt: null,
              lastEndedAt: null,
              totalWorkedSeconds: 0,
              totalSessions: 0,
              dailySessions,
              userName:
                data.userName ||
                user.name,
              username:
                data.username ||
                user.username,
              updatedAt:
                data.updatedAt ||
                null,
            })

            setSelectedBranch('')
            setShowBranchDropdown(false)
            setDutyLoading(false)

            return
          }

          const recordTotalWorkedSeconds =
            Number(
              record.totalWorkedSeconds ||
                0,
            )

          const recordTotalSessions =
            Number(
              record.totalSessions ||
                0,
            )

          /*
           * ACTIVE WORKING SESSION
           */

          const isWorking =
            data.dutyDate === today &&
            data.status === 'Working' &&
            !!data.currentSessionStartedAt

          const status: DutyStatus =
            isWorking
              ? 'Working'
              : record.endTime
                ? 'Ended'
                : 'Not Started'

          setDuty({
            status,

            dutyDate: today,

            branch:
              record.branch || '',

            currentSessionStartedAt:
              isWorking
                ? data.currentSessionStartedAt
                : null,

            lastStartedAt:
              record.startTime ||
              data.lastStartedAt ||
              null,

            lastEndedAt:
              record.endTime ||
              data.lastEndedAt ||
              null,

            totalWorkedSeconds:
              recordTotalWorkedSeconds,

            totalSessions:
              recordTotalSessions,

            dailySessions,

            updatedAt:
              data.updatedAt ||
              null,

            userName:
              data.userName ||
              user.name,

            username:
              data.username ||
              user.username,
          })

          setSelectedBranch(
            record.branch || '',
          )

          setDutyLoading(false)
        },

        (firebaseError) => {
          console.error(
            'Load duty status failed:',
            firebaseError,
          )

          setDutyLoading(false)

          setDutyMessage(
            'Unable to load duty status.',
          )
        },
      )

    return unsubscribe
  }, [
    dutyRef,
    todayDate,
    user.name,
    user.username,
  ])

  /*
   * =========================================
   * FORMAT TIME
   * =========================================
   */

  const formatDuration = (
    seconds: number,
  ) => {
    const safe = Math.max(
      0,
      Math.floor(seconds),
    )

    const hours = String(
      Math.floor(safe / 3600),
    ).padStart(2, '0')

    const minutes = String(
      Math.floor(
        (safe % 3600) / 60,
      ),
    ).padStart(2, '0')

    const secondsPart = String(
      safe % 60,
    ).padStart(2, '0')

    return `${hours}:${minutes}:${secondsPart}`
  }

  /*
   * =========================================
   * CURRENT WORKED TIME
   * =========================================
   */

  const currentWorkedSeconds = () => {
    const stored =
      Number(
        duty.totalWorkedSeconds || 0,
      )

    if (
      duty.status === 'Working' &&
      duty.currentSessionStartedAt
    ) {
      return (
        stored +
        Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              duty.currentSessionStartedAt.toMillis()
            ) / 1000,
          ),
        )
      )
    }

    return stored
  }

  /*
   * =========================================
   * START DUTY
   * =========================================
   */

  const handleStartDuty =
    async () => {
      if (dutyBusy) return

      const today =
        getTodayDate()

      if (
        duty.status === 'Working'
      ) {
        return
      }

      if (
        duty.status === 'Ended'
      ) {
        setDutyMessage(
          "Today's duty already has an end time. Use 'Resume Duty' to continue today's duty.",
        )

        return
      }

      if (!selectedBranch) {
        setShowBranchDropdown(true)

        setDutyMessage(
          'Please select a branch before starting duty.',
        )

        return
      }

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        const existingDailySessions =
          duty.dailySessions || {}

        /*
         * DO NOT OVERWRITE EXISTING DAY
         */

        if (
          existingDailySessions[
            today
          ]
        ) {
          setDutyMessage(
            "Today's duty record already exists. Use 'Resume Duty' if it has ended.",
          )

          return
        }

        const dailyRecord: DailyDutyRecord =
          {
            date: today,
            startTime: now,
            endTime: null,
            branch: selectedBranch,
            totalWorkedSeconds: 0,
            totalSessions: 1,
          }

        const dailySessions = {
          ...existingDailySessions,
          [today]: dailyRecord,
        }

        await setDoc(
          dutyRef,
          {
            status: 'Working',

            dutyDate: today,

            branch:
              selectedBranch,

            currentSessionStartedAt:
              now,

            lastStartedAt: now,

            lastEndedAt: null,

            totalWorkedSeconds: 0,

            totalSessions: 1,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        setShowBranchDropdown(false)

        setDutyMessage(
          `Duty started at ${selectedBranch}.`,
        )
      } catch (error) {
        console.error(
          'Start duty failed:',
          error,
        )

        setDutyMessage(
          'Could not start duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================
   * END DUTY
   * =========================================
   */

  const handleEndDuty =
    async () => {
      if (
        dutyBusy ||
        duty.status !== 'Working'
      ) {
        return
      }

      const today =
        getTodayDate()

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        const started =
          duty.currentSessionStartedAt
            ?.toMillis() ??
          now.toMillis()

        const sessionSeconds =
          Math.max(
            0,
            Math.floor(
              (
                now.toMillis() -
                started
              ) / 1000,
            ),
          )

        const previousWorkedSeconds =
          Number(
            duty.totalWorkedSeconds ||
              0,
          )

        const newTotalWorkedSeconds =
          previousWorkedSeconds +
          sessionSeconds

        const existingDailySessions =
          duty.dailySessions || {}

        const currentRecord =
          existingDailySessions[
            today
          ]

        if (!currentRecord) {
          setDutyMessage(
            "Today's duty record was not found. Please refresh and try again.",
          )

          return
        }

        const updatedDailyRecord: DailyDutyRecord =
          {
            ...currentRecord,

            date: today,

            branch:
              currentRecord.branch ||
              duty.branch ||
              selectedBranch,

            endTime: now,

            totalWorkedSeconds:
              newTotalWorkedSeconds,

            totalSessions:
              Number(
                currentRecord.totalSessions ||
                  duty.totalSessions ||
                  1,
              ),
          }

        const dailySessions = {
          ...existingDailySessions,
          [today]:
            updatedDailyRecord,
        }

        await setDoc(
          dutyRef,
          {
            status: 'Ended',

            dutyDate: today,

            branch:
              updatedDailyRecord.branch,

            currentSessionStartedAt:
              null,

            lastEndedAt: now,

            totalWorkedSeconds:
              newTotalWorkedSeconds,

            totalSessions:
              updatedDailyRecord.totalSessions,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        setDutyMessage(
          `Duty ended. Today's total worked time: ${formatDuration(
            newTotalWorkedSeconds,
          )}. You can resume today's duty if needed.`,
        )
      } catch (error) {
        console.error(
          'End duty failed:',
          error,
        )

        setDutyMessage(
          'Could not end duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================
   * RESUME DUTY
   * =========================================
   */

  const handleResumeDuty =
    async () => {
      if (
        dutyBusy ||
        duty.status !== 'Ended'
      ) {
        return
      }

      const today =
        getTodayDate()

      if (
        duty.dutyDate !== today
      ) {
        setDutyMessage(
          "Resume is only available for today's duty. Please start today's duty.",
        )

        return
      }

      const currentRecord =
        duty.dailySessions?.[
          today
        ]

      if (!currentRecord) {
        setDutyMessage(
          "Today's duty record was not found. Please refresh and try again.",
        )

        return
      }

      if (
        !currentRecord.branch &&
        !selectedBranch
      ) {
        setShowBranchDropdown(true)

        setDutyMessage(
          'Please select a branch before resuming duty.',
        )

        return
      }

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        const dailyRecord: DailyDutyRecord =
          {
            ...currentRecord,

            date: today,

            startTime:
              currentRecord.startTime,

            branch:
              currentRecord.branch ||
              selectedBranch,

            endTime: null,

            totalWorkedSeconds:
              Number(
                currentRecord.totalWorkedSeconds ||
                  duty.totalWorkedSeconds ||
                  0,
              ),

            totalSessions:
              Number(
                currentRecord.totalSessions ||
                  duty.totalSessions ||
                  0,
              ) + 1,
          }

        const dailySessions = {
          ...(duty.dailySessions ||
            {}),
          [today]:
            dailyRecord,
        }

        await setDoc(
          dutyRef,
          {
            status: 'Working',

            dutyDate: today,

            branch:
              dailyRecord.branch,

            currentSessionStartedAt:
              now,

            lastStartedAt: now,

            totalWorkedSeconds:
              dailyRecord.totalWorkedSeconds,

            totalSessions:
              dailyRecord.totalSessions,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        setDutyMessage(
          "Duty resumed. You're continuing today's duty.",
        )
      } catch (error) {
        console.error(
          'Resume duty failed:',
          error,
        )

        setDutyMessage(
          'Could not resume duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================
   * DUTY ACTIVE
   * =========================================
   */

  const dutyActive =
    duty.status === 'Working'

  /*
   * =========================================
   * ROLE CHECK
   * =========================================
   */

  const hasRole = (
    role: string,
  ) => {
    return user.roles.some(
      (userRole) =>
        userRole
          .trim()
          .toLowerCase() ===
        role
          .trim()
          .toLowerCase(),
    )
  }

  /*
   * =========================================
   * DEPARTMENT NAVIGATION
   * =========================================
   */

  const handleDepartmentClick =
    (role: string) => {
      if (!dutyActive) {
        setDutyMessage(
          'Start or resume your duty before opening department work.',
        )

        return
      }

      if (!hasRole(role)) {
        return
      }

      const path =
        departmentPaths[role]

      if (path) {
        navigate(path)
      }
    }

  /*
   * =========================================
   * SALES STATISTICS
   * =========================================
   */

  const handleSalesStatisticsClick =
    () => {
      if (!dutyActive) {
        setDutyMessage(
          'Start or resume your duty before opening department work.',
        )

        return
      }

      navigate(
        '/departments/sales-statistics',
      )
    }

  /*
   * =========================================
   * MY ATTENDANCE
   * =========================================
   */

  const handleMyAttendanceClick =
    () => {
      navigate('/my-attandance')
    }

  /*
   * =========================================
   * LOGOUT
   * =========================================
   */

  const handleLogout = () => {
    setShowUserMenu(false)

    window.location.href = '/'
  }

  /*
   * =========================================
   * DEPARTMENT ACTIVE
   * =========================================
   */

  const isDepartmentActive = (
    role: string,
  ) => {
    return (
      dutyActive &&
      hasRole(role)
    )
  }

  /*
   * =========================================
   * PAGE
   * =========================================
   */

  return (
    <div className="home-page">

      {/* HEADER */}

      <header className="home-header">

        <div>
          <h1>
            Work Manager
          </h1>

          <p>
            Welcome{' '}
            <strong>
              {user.name}
            </strong>
          </p>
        </div>

        {/* DUTY CONTROL */}

        <div
          className={`duty-control ${duty.status
            .toLowerCase()
            .replace(
              /\s+/g,
              '-',
            )}`}
        >
          <div className="duty-control-info">

            <span className="duty-label">
              Duty
            </span>

            <strong className="duty-status">
              {dutyLoading
                ? 'Checking...'
                : duty.status}
            </strong>

            {!dutyLoading && (
              <>
                <span className="duty-time">
                  Date{' '}
                  {duty.dutyDate ||
                    todayDate}
                </span>

                <span className="duty-time">
                  Branch{' '}
                  {duty.branch ||
                    '-'}
                </span>

                <span className="duty-time">
                  Worked{' '}
                  {formatDuration(
                    currentWorkedSeconds(),
                  )}
                </span>
              </>
            )}
          </div>

          <div className="duty-buttons">

            {duty.status ===
            'Working' ? (
              <button
                type="button"
                className="duty-button end-duty-button"
                onClick={
                  handleEndDuty
                }
                disabled={
                  dutyLoading ||
                  dutyBusy
                }
              >
                {dutyBusy
                  ? 'Updating...'
                  : 'End Duty'}
              </button>
            ) : duty.status ===
              'Not Started' ? (
              <>
                <button
                  type="button"
                  className="duty-button start-duty-button"
                  onClick={() => {
                    setShowBranchDropdown(
                      !showBranchDropdown,
                    )

                    setDutyMessage('')
                  }}
                  disabled={
                    dutyLoading ||
                    dutyBusy
                  }
                >
                  Start Duty
                </button>

                {showBranchDropdown && (
                  <div>
                    <label htmlFor="duty-branch">
                      Branch
                    </label>

                    <select
                      id="duty-branch"
                      value={
                        selectedBranch
                      }
                      onChange={(
                        event,
                      ) =>
                        setSelectedBranch(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        dutyBusy
                      }
                    >
                      <option value="">
                        Select Branch
                      </option>

                      {dutyBranches.map(
                        (branch) => (
                          <option
                            key={branch}
                            value={
                              branch
                            }
                          >
                            {branch}
                          </option>
                        ),
                      )}
                    </select>

                    <button
                      type="button"
                      className="duty-button not-started"
                      onClick={
                        handleStartDuty
                      }
                      disabled={
                        dutyLoading ||
                        dutyBusy ||
                        !selectedBranch
                      }
                    >
                      {dutyBusy
                        ? 'Updating...'
                        : 'Confirm Start'}
                    </button>
                  </div>
                )}
              </>
            ) : null}

            {/* RESUME */}

            <button
              type="button"
              className="duty-button resume-duty-button"
              onClick={
                handleResumeDuty
              }
              disabled={
                dutyLoading ||
                dutyBusy ||
                duty.status !==
                  'Ended' ||
                duty.dutyDate !==
                  getTodayDate()
              }
            >
              {dutyBusy &&
              duty.status ===
                'Ended'
                ? 'Updating...'
                : 'Resume Duty'}
            </button>

          </div>
        </div>

        {/* DUTY MESSAGE */}

        {dutyMessage && (
          <div
            className="duty-message"
            role="status"
          >
            {dutyMessage}
          </div>
        )}

        {/* USER MENU */}

        <div className="user-menu-container">

          <button
            type="button"
            className="user-info"
            onClick={() =>
              setShowUserMenu(
                !showUserMenu,
              )
            }
          >
            <span>
              {user.name}
            </span>

            <span className="user-arrow">
              {showUserMenu
                ? '▲'
                : '▼'}
            </span>
          </button>

          {showUserMenu && (
            <div className="user-dropdown">

              {/* MY ATTENDANCE */}

              <button
                type="button"
                className="my-attendance-button"
                onClick={
                  handleMyAttendanceClick
                }
              >
                My Attendance
              </button>

              {/* LOGOUT */}

              <button
                type="button"
                className="logout-button"
                onClick={
                  handleLogout
                }
              >
                <span className="logout-icon">
                  ↪
                </span>

                <span>
                  Logout
                </span>
              </button>

            </div>
          )}

        </div>

      </header>

      {/* MAIN CONTENT */}

      <main className="home-content">

        <div className="home-title">

          <h2>
            Departments
          </h2>

          <p>
            {dutyActive
              ? 'You are on duty. Select a department to continue.'
              : duty.status ===
                'Ended'
                ? 'Duty ended. Resume today’s duty to continue working, or start a new duty day.'
                : 'Start your duty to enable department work.'}
          </p>

        </div>

        {/* DUTY REQUIRED */}

        {!dutyActive &&
          !dutyLoading && (
            <div className="duty-required-banner">

              <strong>
                Duty required
              </strong>

              <span>
                {duty.status ===
                'Ended'
                  ? 'Your duty has ended. Click “Resume Duty” to continue today, or “Start Duty” for a new duty day.'
                  : 'Click “Start Duty” to begin a new duty day.'}
              </span>

            </div>
          )}

        {/* DEPARTMENT GRID */}

        <div className="department-grid">

          {/* SALES */}

          {(() => {
            const role = 'Sales'

            const isActive =
              isDepartmentActive(
                role,
              )

            return (
              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={
                  !isActive
                }
                onClick={() =>
                  handleDepartmentClick(
                    role,
                  )
                }
              >
                <div className="department-icon">
                  {role.charAt(0)}
                </div>

                <div className="department-name">
                  {role}
                </div>

                <div className="department-status">
                  {isActive
                    ? 'Available'
                    : hasRole(role)
                      ? 'Duty Required'
                      : 'No Access'}
                </div>
              </button>
            )
          })()}

          {/* SALES STATISTICS */}

          <button
            type="button"
            className={`department-card ${
              dutyActive
                ? 'active'
                : 'disabled'
            }`}
            disabled={
              !dutyActive
            }
            onClick={
              handleSalesStatisticsClick
            }
          >
            <div className="department-icon">
              S
            </div>

            <div className="department-name">
              Sales Statistics
            </div>

            <div className="department-status">
              {dutyActive
                ? 'Available'
                : 'Duty Required'}
            </div>
          </button>

          {/* LIVE PRODUCTION */}

          {(() => {
            const role =
              'Live Production'

            const isActive =
              isDepartmentActive(
                role,
              )

            return (
              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={
                  !isActive
                }
                onClick={() =>
                  handleDepartmentClick(
                    role,
                  )
                }
              >
                <div className="department-icon">
                  {role.charAt(0)}
                </div>

                <div className="department-name">
                  {role}
                </div>

                <div className="department-status">
                  {isActive
                    ? 'Available'
                    : hasRole(role)
                      ? 'Duty Required'
                      : 'No Access'}
                </div>
              </button>
            )
          })()}

          {/* OTHER DEPARTMENTS */}

          {availableRoles
            .filter(
              (role) =>
                role !== 'Sales',
              )
            .map((role) => {
              const isActive =
                isDepartmentActive(
                  role,
                )

              return (
                <button
                  key={role}
                  type="button"
                  className={`department-card ${
                    isActive
                      ? 'active'
                      : 'disabled'
                  }`}
                  disabled={
                    !isActive
                  }
                  onClick={() =>
                    handleDepartmentClick(
                      role,
                    )
                  }
                >
                  <div className="department-icon">
                    {role.charAt(0)}
                  </div>

                  <div className="department-name">
                    {role}
                  </div>

                  <div className="department-status">
                    {isActive
                      ? 'Available'
                      : hasRole(role)
                        ? 'Duty Required'
                        : 'No Access'}
                  </div>
                </button>
              )
            })}

        </div>

      </main>

    </div>
  )
}

export default HomePage