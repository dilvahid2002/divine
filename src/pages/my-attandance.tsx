import './my-attandance.css'
import { useEffect, useMemo, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  where,
} from 'firebase/firestore'
import { db } from '../firebase'

interface MyAttendanceProps {
  user: {
    name: string
    username: string
    roles?: string[]
  }
}

type AttendanceStatus =
  | 'full'
  | 'half'
  | 'absent'
  | 'future'

interface DailyDuty {
  date?: string
  branch?: string
  status?: 'Not Started' | 'Working' | 'Ended'

  startTime?: Timestamp | null
  endTime?: Timestamp | null

  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null

  totalWorkedSeconds?: number
  totalSessions?: number
}

interface DutyDocument {
  dailySessions?: Record<string, DailyDuty>

  // Backward-compatible fields
  dutyDate?: string
  branch?: string
  status?: 'Not Started' | 'Working' | 'Ended'

  startTime?: Timestamp | null
  endTime?: Timestamp | null

  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null

  totalWorkedSeconds?: number
  totalSessions?: number

  userName?: string
  username?: string
}

interface LeaveRequest {
  id: string
  username: string
  userName: string
  leaveDate: string
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected'
  requestedAt: Timestamp | null
}

const DUTY_COLLECTION = 'duty_sessions'
const LEAVE_COLLECTION = 'casual_leave_requests'

const FULL_DAY_SECONDS = 10 * 60 * 60
const HALF_DAY_SECONDS = 5 * 60 * 60

const pad = (value: number) =>
  String(value).padStart(2, '0')

/*
 * Convert Date -> YYYY-MM-DD
 *
 * Uses local date values so the attendance calendar
 * matches the employee's local calendar.
 */
const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(date.getDate())}`

/*
 * Convert YYYY-MM-DD -> local Date
 */
const parseDateKey = (dateKey: string) => {
  const [year, month, day] =
    dateKey.split('-').map(Number)

  return new Date(
    year,
    month - 1,
    day,
  )
}

const getTodayKey = () =>
  toDateKey(new Date())

const addDays = (
  date: Date,
  days: number,
) => {
  const result = new Date(date)

  result.setDate(
    result.getDate() + days,
  )

  return result
}

const startOfWeekMonday = (
  date: Date,
) => {
  const result = new Date(date)

  const day = result.getDay()

  const distanceFromMonday =
    day === 0 ? 6 : day - 1

  result.setDate(
    result.getDate() -
      distanceFromMonday,
  )

  result.setHours(
    0,
    0,
    0,
    0,
  )

  return result
}

const endOfWeekSunday = (
  date: Date,
) =>
  addDays(
    startOfWeekMonday(date),
    6,
  )

/*
 * Leave requests:
 *
 * Monday-Friday:
 * employee can submit for next Monday-Saturday.
 */
const getNextWeekLeaveWindow = () => {
  const nextMonday = addDays(
    startOfWeekMonday(
      new Date(),
    ),
    7,
  )

  const nextSaturday = addDays(
    nextMonday,
    5,
  )

  return {
    start: nextMonday,
    end: nextSaturday,
  }
}

const formatDate = (
  dateKey: string,
) =>
  parseDateKey(
    dateKey,
  ).toLocaleDateString([], {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })

const formatTime = (
  timestamp?: Timestamp | null,
) => {
  if (!timestamp) return '-'

  return timestamp
    .toDate()
    .toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
}

const formatRequestedAt = (
  timestamp: Timestamp | null,
) => {
  if (!timestamp) return '-'

  return timestamp
    .toDate()
    .toLocaleDateString([], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
}

const formatDuration = (
  seconds: number,
) => {
  const safe = Math.max(
    0,
    Math.floor(seconds || 0),
  )

  const hours = Math.floor(
    safe / 3600,
  )

  const minutes = Math.floor(
    (safe % 3600) / 60,
  )

  const remainingSeconds =
    safe % 60

  return `${pad(hours)}:${pad(
    minutes,
  )}:${pad(remainingSeconds)}`
}

/*
 * Safely read a Firestore Timestamp.
 */
const getTimestamp = (
  value: unknown,
): Timestamp | null => {
  if (value instanceof Timestamp) {
    return value
  }

  return null
}

/*
 * Calculate worked seconds.
 *
 * totalWorkedSeconds = completed sessions
 *
 * If employee is currently Working,
 * add the current running session.
 */
const getWorkedSeconds = (
  duty: DailyDuty,
) => {
  const stored = Number(
    duty.totalWorkedSeconds || 0,
  )

  if (
    duty.status === 'Working' &&
    duty.currentSessionStartedAt
  ) {
    const running = Math.max(
      0,
      Math.floor(
        (Date.now() -
          duty.currentSessionStartedAt.toMillis()) /
          1000,
      ),
    )

    return stored + running
  }

  return stored
}

/*
 * Determine calendar status.
 */
const getAttendanceStatus = (
  duty: DailyDuty | undefined,
  dateKey: string,
): AttendanceStatus => {
  const today = getTodayKey()

  if (dateKey > today) {
    return 'future'
  }

  if (!duty) {
    return 'absent'
  }

  const seconds =
    getWorkedSeconds(duty)

  if (
    seconds >=
    FULL_DAY_SECONDS
  ) {
    return 'full'
  }

  if (
    seconds >=
    HALF_DAY_SECONDS
  ) {
    return 'half'
  }

  return 'absent'
}

/*
 * Normalize the preferred duty structure:
 *
 * duty_sessions/{username}
 *
 * {
 *   dailySessions: {
 *     "2026-09-17": {
 *       status: "Working",
 *       totalWorkedSeconds: ...
 *     }
 *   }
 * }
 *
 * Also supports the old structure.
 */
const normalizeDailySessions = (
  data: DutyDocument,
): Record<string, DailyDuty> => {
  if (
    data.dailySessions &&
    typeof data.dailySessions ===
      'object'
  ) {
    return data.dailySessions
  }

  /*
   * Old single-day structure.
   */
  if (data.dutyDate) {
    return {
      [data.dutyDate]: {
        date: data.dutyDate,
        branch: data.branch,
        status: data.status,

        startTime:
          getTimestamp(
            data.startTime,
          ),

        endTime:
          getTimestamp(
            data.endTime,
          ),

        currentSessionStartedAt:
          getTimestamp(
            data.currentSessionStartedAt,
          ),

        lastStartedAt:
          getTimestamp(
            data.lastStartedAt,
          ),

        lastEndedAt:
          getTimestamp(
            data.lastEndedAt,
          ),

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
      },
    }
  }

  return {}
}

function MyAttendance({
  user,
}: MyAttendanceProps) {
  /*
   * Always normalize username because the Firestore
   * documents use lowercase usernames.
   */
  const username = user.username
    .trim()
    .toLowerCase()

  /*
   * =========================================================
   * STATE
   * =========================================================
   */

  const [
    dailySessions,
    setDailySessions,
  ] = useState<
    Record<string, DailyDuty>
  >({})

  const [
    loadingAttendance,
    setLoadingAttendance,
  ] = useState(true)

  const [
    attendanceError,
    setAttendanceError,
  ] = useState('')

  const [
    calendarMonth,
    setCalendarMonth,
  ] = useState(() => {
    const today = new Date()

    return new Date(
      today.getFullYear(),
      today.getMonth(),
      1,
    )
  })

  const [
    selectedLeaveDate,
    setSelectedLeaveDate,
  ] = useState('')

  const [
    leaveReason,
    setLeaveReason,
  ] = useState('')

  const [
    leaveRequests,
    setLeaveRequests,
  ] = useState<LeaveRequest[]>(
    [],
  )

  const [
    loadingLeaves,
    setLoadingLeaves,
  ] = useState(true)

  const [
    submittingLeave,
    setSubmittingLeave,
  ] = useState(false)

  const [
    leaveMessage,
    setLeaveMessage,
  ] = useState('')

  const [
    leaveError,
    setLeaveError,
  ] = useState('')

  /*
   * =========================================================
   * LOAD ATTENDANCE
   *
   * Firestore:
   *
   * duty_sessions
   *      |
   *      +-- {username}
   *             |
   *             +-- dailySessions
   *                    |
   *                    +-- 2026-09-17
   *                    +-- 2026-09-16
   *                    +-- ...
   *
   * Real-time listener is used so attendance updates
   * without refreshing the page.
   * =========================================================
   */
  useEffect(() => {
    if (!username) {
      setDailySessions({})
      setLoadingAttendance(false)
      setAttendanceError(
        'Unable to identify the employee.',
      )

      return
    }

    setLoadingAttendance(true)
    setAttendanceError('')

    const dutyRef = doc(
      db,
      DUTY_COLLECTION,
      username,
    )

    const unsubscribe = onSnapshot(
      dutyRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          console.warn(
            `No duty document found at ${DUTY_COLLECTION}/${username}`,
          )

          setDailySessions({})
          setAttendanceError('')
          setLoadingAttendance(false)

          return
        }

        try {
          const data =
            snapshot.data() as DutyDocument

          const normalized =
            normalizeDailySessions(
              data,
            )

          setDailySessions(
            normalized,
          )

          setAttendanceError('')
          setLoadingAttendance(false)
        } catch (error) {
          console.error(
            'Attendance data parsing error:',
            error,
          )

          setDailySessions({})

          setAttendanceError(
            'Unable to read your attendance data.',
          )

          setLoadingAttendance(false)
        }
      },
      (error) => {
        console.error(
          'My attendance Firestore error:',
          error,
        )

        setDailySessions({})

        setAttendanceError(
          'Unable to load your attendance. Please try again.',
        )

        setLoadingAttendance(false)
      },
    )

    return () => {
      unsubscribe()
    }
  }, [username])

  /*
   * =========================================================
   * REFRESH CURRENT WORKING DAY
   *
   * This updates the displayed HH:MM:SS every second
   * while the employee is currently working.
   * =========================================================
   */
  useEffect(() => {
    const timer =
      window.setInterval(() => {
        setDailySessions(
          (current) => {
            const today =
              getTodayKey()

            const todayDuty =
              current[today]

            if (
              !todayDuty ||
              todayDuty.status !==
                'Working'
            ) {
              return current
            }

            return {
              ...current,
            }
          },
        )
      }, 1000)

    return () => {
      window.clearInterval(
        timer,
      )
    }
  }, [])

  /*
   * =========================================================
   * LOAD LEAVE REQUESTS
   *
   * IMPORTANT:
   *
   * We intentionally DO NOT use:
   *
   * orderBy('leaveDate', 'asc')
   *
   * together with where().
   *
   * That can require a Firestore composite index.
   *
   * Instead:
   * 1. Firestore filters by username.
   * 2. React sorts the records locally.
   *
   * This matches your Firestore structure:
   *
   * casual_leave_requests/{documentId}
   *
   * username: "dilvahid"
   * userName: "Dil Vahid"
   * leaveDate: "2026-09-21"
   * reason: "Marriage"
   * status: "Pending"
   * =========================================================
   */
  useEffect(() => {
    if (!username) {
      setLeaveRequests([])
      setLoadingLeaves(false)
      setLeaveError(
        'Unable to identify the employee.',
      )

      return
    }

    setLoadingLeaves(true)
    setLeaveError('')

    const leaveQuery = query(
      collection(
        db,
        LEAVE_COLLECTION,
      ),
      where(
        'username',
        '==',
        username,
      ),
    )

    const unsubscribe = onSnapshot(
      leaveQuery,
      (snapshot) => {
        const requests: LeaveRequest[] =
          []

        snapshot.forEach(
          (item) => {
            const data =
              item.data()

            const status =
              data.status ===
                'Approved' ||
              data.status ===
                'Rejected'
                ? data.status
                : 'Pending'

            requests.push({
              id: item.id,

              username:
                String(
                  data.username ||
                    username,
                ),

              userName:
                String(
                  data.userName ||
                    user.name ||
                    username,
                ),

              leaveDate:
                String(
                  data.leaveDate ||
                    '',
                ),

              reason:
                String(
                  data.reason ||
                    '',
                ),

              status,

              requestedAt:
                data.requestedAt instanceof
                Timestamp
                  ? data.requestedAt
                  : null,
            })
          },
        )

        /*
         * Sort locally.
         *
         * YYYY-MM-DD strings sort correctly.
         */
        requests.sort(
          (a, b) =>
            a.leaveDate.localeCompare(
              b.leaveDate,
            ),
        )

        setLeaveRequests(
          requests,
        )

        setLeaveError('')
        setLoadingLeaves(false)
      },
      (error) => {
        console.error(
          'Casual leave loading error:',
          error,
        )

        setLeaveRequests([])

        setLeaveError(
          'Unable to load leave requests.',
        )

        setLoadingLeaves(false)
      },
    )

    return () => {
      unsubscribe()
    }
  }, [username, user.name])

  /*
   * =========================================================
   * CALENDAR CELLS
   * =========================================================
   */
  const calendarCells =
    useMemo(() => {
      const year =
        calendarMonth.getFullYear()

      const month =
        calendarMonth.getMonth()

      const firstDay = new Date(
        year,
        month,
        1,
      )

      const daysInMonth =
        new Date(
          year,
          month + 1,
          0,
        ).getDate()

      /*
       * Monday = 0
       * Sunday = 6
       */
      const mondayBasedFirstDay =
        firstDay.getDay() === 0
          ? 6
          : firstDay.getDay() - 1

      const cells: Array<
        | {
            type: 'empty'
            key: string
          }
        | {
            type: 'day'
            key: string
            date: Date
            dateKey: string
            status: AttendanceStatus
          }
      > = []

      /*
       * Empty cells before first day.
       */
      for (
        let index = 0;
        index <
        mondayBasedFirstDay;
        index += 1
      ) {
        cells.push({
          type: 'empty',
          key: `empty-${year}-${month}-${index}`,
        })
      }

      /*
       * Actual calendar days.
       */
      for (
        let day = 1;
        day <= daysInMonth;
        day += 1
      ) {
        const date = new Date(
          year,
          month,
          day,
        )

        const dateKey =
          toDateKey(date)

        cells.push({
          type: 'day',
          key: dateKey,
          date,
          dateKey,
          status:
            getAttendanceStatus(
              dailySessions[
                dateKey
              ],
              dateKey,
            ),
        })
      }

      return cells
    }, [
      calendarMonth,
      dailySessions,
    ])

  /*
   * =========================================================
   * CALENDAR NAVIGATION
   * =========================================================
   */
  const previousMonth = () => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() - 1,
          1,
        ),
    )
  }

  const nextMonth = () => {
    setCalendarMonth(
      (current) =>
        new Date(
          current.getFullYear(),
          current.getMonth() + 1,
          1,
        ),
    )
  }

  const goToCurrentMonth = () => {
    const today = new Date()

    setCalendarMonth(
      new Date(
        today.getFullYear(),
        today.getMonth(),
        1,
      ),
    )
  }

  /*
   * =========================================================
   * LEAVE WINDOW
   * =========================================================
   */
  const leaveWindow =
    useMemo(
      () =>
        getNextWeekLeaveWindow(),
      [],
    )

  /*
   * Monday-Friday only.
   */
  const canSubmitLeaveToday =
    (() => {
      const day =
        new Date().getDay()

      return (
        day >= 1 &&
        day <= 5
      )
    })()

  /*
   * Build:
   *
   * next Monday
   * next Tuesday
   * ...
   * next Saturday
   */
  const leaveDateOptions =
    useMemo(() => {
      const options: string[] =
        []

      for (
        let date =
          new Date(
            leaveWindow.start,
          );
        date <=
        leaveWindow.end;
        date = addDays(
          date,
          1,
        )
      ) {
        options.push(
          toDateKey(date),
        )
      }

      return options
    }, [leaveWindow])

  /*
   * Existing requested dates.
   */
  const existingLeaveDates =
    useMemo(
      () =>
        new Set(
          leaveRequests.map(
            (request) =>
              request.leaveDate,
          ),
        ),
      [leaveRequests],
    )

  /*
   * =========================================================
   * VISIBLE LEAVE REQUESTS
   *
   * Current week + next week's Saturday.
   *
   * Nothing is deleted from Firestore.
   * =========================================================
   */
  const visibleLeaveRequests =
    useMemo(() => {
      const today = new Date()

      const weekStart =
        startOfWeekMonday(
          today,
        )

      const weekEnd =
        endOfWeekSunday(
          today,
        )

      const nextWeekEnd =
        addDays(
          weekEnd,
          6,
        )

      return leaveRequests
        .filter(
          (request) => {
            if (
              !request.leaveDate
            ) {
              return false
            }

            const leaveDate =
              parseDateKey(
                request.leaveDate,
              )

            return (
              leaveDate >=
                weekStart &&
              leaveDate <=
                nextWeekEnd
            )
          },
        )
        .sort(
          (a, b) =>
            a.leaveDate.localeCompare(
              b.leaveDate,
            ),
        )
    }, [leaveRequests])

  /*
   * =========================================================
   * SUBMIT CASUAL LEAVE
   * =========================================================
   */
  const submitLeaveRequest =
    async () => {
      setLeaveMessage('')
      setLeaveError('')

      if (
        !canSubmitLeaveToday
      ) {
        setLeaveError(
          'Casual leave requests can only be submitted Monday to Friday.',
        )

        return
      }

      if (!selectedLeaveDate) {
        setLeaveError(
          'Please select a leave date.',
        )

        return
      }

      if (
        !leaveDateOptions.includes(
          selectedLeaveDate,
        )
      ) {
        setLeaveError(
          'Leave can only be requested for next Monday through next Saturday.',
        )

        return
      }

      if (
        existingLeaveDates.has(
          selectedLeaveDate,
        )
      ) {
        setLeaveError(
          'A leave request already exists for this date.',
        )

        return
      }

      const reason =
        leaveReason.trim()

      if (!reason) {
        setLeaveError(
          'Please enter a reason for the casual leave.',
        )

        return
      }

      setSubmittingLeave(true)

      try {
        await addDoc(
          collection(
            db,
            LEAVE_COLLECTION,
          ),
          {
            username,
            userName:
              user.name,
            leaveDate:
              selectedLeaveDate,
            reason,
            status:
              'Pending',
            requestedAt:
              Timestamp.now(),
          },
        )

        /*
         * onSnapshot() will automatically
         * receive the new document.
         */
        setSelectedLeaveDate(
          '',
        )

        setLeaveReason('')

        setLeaveMessage(
          'Casual leave request submitted successfully.',
        )
      } catch (error) {
        console.error(
          'Casual leave submission error:',
          error,
        )

        setLeaveError(
          'Could not submit the leave request. Please try again.',
        )
      } finally {
        setSubmittingLeave(false)
      }
    }

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */
  return (
    <div className="my-attendance-page">
      <div className="my-attendance-container">

        {/* =================================================
            HEADER
        ================================================= */}
        <header className="my-attendance-header">
          <div>
            <p className="eyebrow">
              Employee Portal
            </p>

            <h1>
              My Attendance
            </h1>

            <p className="page-subtitle">
              {user.name} ·{' '}
              {user.username}
            </p>
          </div>
        </header>

        {/* =================================================
            ATTENDANCE CALENDAR
        ================================================= */}
        <section className="attendance-card">
          <div className="card-heading">
            <div>
              <h2>
                Attendance Calendar
              </h2>

              <p>
                Green = Full Day ·
                Orange = Half Day ·
                Red = Absent
              </p>
            </div>

            <div className="calendar-actions">
              <button
                type="button"
                onClick={
                  previousMonth
                }
                aria-label="Previous month"
              >
                ‹
              </button>

              <button
                type="button"
                className="today-button"
                onClick={
                  goToCurrentMonth
                }
              >
                Today
              </button>

              <button
                type="button"
                onClick={
                  nextMonth
                }
                aria-label="Next month"
              >
                ›
              </button>
            </div>
          </div>

          {attendanceError && (
            <div className="error-banner">
              {attendanceError}
            </div>
          )}

          <div className="calendar-title">
            {calendarMonth.toLocaleDateString(
              [],
              {
                month:
                  'long',
                year:
                  'numeric',
              },
            )}
          </div>

          <div className="calendar-weekdays">
            {[
              'Mon',
              'Tue',
              'Wed',
              'Thu',
              'Fri',
              'Sat',
              'Sun',
            ].map(
              (day) => (
                <div
                  key={day}
                  className="calendar-weekday"
                >
                  {day}
                </div>
              ),
            )}
          </div>

          <div className="calendar-grid">
            {calendarCells.map(
              (cell) => {
                if (
                  cell.type ===
                  'empty'
                ) {
                  return (
                    <div
                      key={
                        cell.key
                      }
                      className="calendar-cell calendar-empty"
                    />
                  )
                }

                const isToday =
                  cell.dateKey ===
                  getTodayKey()

                const duty =
                  dailySessions[
                    cell.dateKey
                  ]

                return (
                  <div
                    key={
                      cell.key
                    }
                    className={`calendar-cell ${
                      isToday
                        ? 'calendar-today'
                        : ''
                    }`}
                    title={
                      cell.status ===
                      'full'
                        ? 'Full day'
                        : cell.status ===
                            'half'
                          ? 'Half day'
                          : cell.status ===
                              'absent'
                            ? 'Absent'
                            : 'Future'
                    }
                  >
                    <span className="calendar-day-number">
                      {cell.date.getDate()}
                    </span>

                    {cell.status !==
                      'future' && (
                      <span
                        className={`attendance-dot attendance-dot-${cell.status}`}
                      />
                    )}

                    {duty &&
                      cell.status !==
                        'absent' && (
                        <span className="calendar-day-hours">
                          {formatDuration(
                            getWorkedSeconds(
                              duty,
                            ),
                          )}
                        </span>
                      )}
                  </div>
                )
              },
            )}
          </div>

          <div className="attendance-legend">
            <span>
              <i className="legend-dot legend-full" />
              Full Day (10h+)
            </span>

            <span>
              <i className="legend-dot legend-half" />
              Half Day (5h+)
            </span>

            <span>
              <i className="legend-dot legend-absent" />
              Absent
            </span>
          </div>

          {loadingAttendance && (
            <div className="loading-text">
              Loading attendance...
            </div>
          )}
        </section>

        {/* =================================================
            CASUAL LEAVE FORM
        ================================================= */}
        <section className="attendance-card leave-card">
          <div className="card-heading">
            <div>
              <h2>
                Casual Leave Request
              </h2>

              <p>
                Requests are accepted
                Monday-Friday for
                next Monday-Saturday.
              </p>
            </div>
          </div>

          <div className="leave-window">
            <strong>
              Available leave dates
            </strong>

            <span>
              {formatDate(
                toDateKey(
                  leaveWindow.start,
                ),
              )}{' '}
              –{' '}
              {formatDate(
                toDateKey(
                  leaveWindow.end,
                ),
              )}
            </span>
          </div>

          {!canSubmitLeaveToday && (
            <div className="notice-banner">
              Leave requests are
              closed today. You can
              submit a casual leave
              request Monday to Friday.
            </div>
          )}

          <div className="leave-form">
            <div className="form-field">
              <label htmlFor="casual-leave-date">
                Leave Date
              </label>

              <select
                id="casual-leave-date"
                value={
                  selectedLeaveDate
                }
                onChange={(
                  event,
                ) =>
                  setSelectedLeaveDate(
                    event.target
                      .value,
                  )
                }
                disabled={
                  !canSubmitLeaveToday ||
                  submittingLeave
                }
              >
                <option value="">
                  Select next week's date
                </option>

                {leaveDateOptions.map(
                  (dateKey) => (
                    <option
                      key={
                        dateKey
                      }
                      value={
                        dateKey
                      }
                      disabled={existingLeaveDates.has(
                        dateKey,
                      )}
                    >
                      {formatDate(
                        dateKey,
                      )}

                      {existingLeaveDates.has(
                        dateKey,
                      )
                        ? ' — Already Requested'
                        : ''}
                    </option>
                  ),
                )}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="casual-leave-reason">
                Reason
              </label>

              <input
                id="casual-leave-reason"
                type="text"
                value={
                  leaveReason
                }
                onChange={(
                  event,
                ) =>
                  setLeaveReason(
                    event.target
                      .value,
                  )
                }
                placeholder="Enter reason for leave"
                disabled={
                  !canSubmitLeaveToday ||
                  submittingLeave
                }
              />
            </div>

            <button
              type="button"
              className="submit-leave-button"
              onClick={
                submitLeaveRequest
              }
              disabled={
                !canSubmitLeaveToday ||
                submittingLeave
              }
            >
              {submittingLeave
                ? 'Submitting...'
                : 'Request Casual Leave'}
            </button>
          </div>

          {leaveError && (
            <div className="error-banner">
              {leaveError}
            </div>
          )}

          {leaveMessage && (
            <div className="success-banner">
              {leaveMessage}
            </div>
          )}
        </section>

        {/* =================================================
            REQUEST HISTORY
        ================================================= */}
        <section className="attendance-card">
          <div className="card-heading">
            <div>
              <h2>
                Requested Leave Dates
              </h2>

              <p>
                Recent requests are
                shown here. Older
                records remain stored
                in Firestore for Sales
                Manager/HR.
              </p>
            </div>

            <span className="record-count">
              {
                visibleLeaveRequests.length
              }{' '}
              {visibleLeaveRequests.length ===
              1
                ? 'Request'
                : 'Requests'}
            </span>
          </div>

          <div className="leave-table-wrapper">
            <table className="leave-table">
              <thead>
                <tr>
                  <th>
                    Leave Date
                  </th>

                  <th>
                    Reason
                  </th>

                  <th>
                    Requested On
                  </th>

                  <th>
                    Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {loadingLeaves ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="empty-row"
                    >
                      Loading leave
                      requests...
                    </td>
                  </tr>
                ) : leaveError ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="empty-row table-error-row"
                    >
                      {leaveError}
                    </td>
                  </tr>
                ) : visibleLeaveRequests.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="empty-row"
                    >
                      No leave requests
                      for the current
                      week.
                    </td>
                  </tr>
                ) : (
                  visibleLeaveRequests.map(
                    (
                      request,
                    ) => (
                      <tr
                        key={
                          request.id
                        }
                      >
                        <td>
                          <strong>
                            {formatDate(
                              request.leaveDate,
                            )}
                          </strong>
                        </td>

                        <td>
                          {request.reason ||
                            '-'}
                        </td>

                        <td>
                          {formatRequestedAt(
                            request.requestedAt,
                          )}
                        </td>

                        <td>
                          <span
                            className={`leave-status leave-status-${request.status.toLowerCase()}`}
                          >
                            {
                              request.status
                            }
                          </span>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="my-attendance-note">
          Attendance history and leave
          requests are not deleted from
          the database by this page.
        </div>
      </div>
    </div>
  )
}

export default MyAttendance