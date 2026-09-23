import './attandance.css'
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../firebase'

/*
=========================================================
 TYPES
=========================================================
*/

type DutyStatus = 'Not Started' | 'Working' | 'Ended'

interface DailyDutyRecord {
  date: string
  startTime: Timestamp | null
  endTime: Timestamp | null
  branch: string
  totalWorkedSeconds?: number
  totalSessions?: number
}

interface DutySession {
  status?: DutyStatus

  // Current-day operational fields.
  dutyDate?: string
  branch?: string
  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null
  totalWorkedSeconds?: number
  totalSessions?: number

  // Permanent date-wise history.
  // dailySessions[YYYY-MM-DD] = daily duty record.
  dailySessions?: Record<string, DailyDutyRecord>

  userName?: string
  username?: string
}

interface AttendanceRecord {
  name: string
  username: string
  date: string
  branch: string
  inTime: Timestamp | null
  outTime: Timestamp | null
  storedWorkedSeconds: number
  currentSessionStartedAt: Timestamp | null
  isWorking: boolean
}

/*
=========================================================
 CONSTANTS
=========================================================
*/

const DUTY_COLLECTION = 'duty_sessions'

const BRANCHES = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

/*
=========================================================
 DATE
=========================================================
*/

const getTodayDate = () => {
  const now = new Date()

  // Always calculate the application date in IST.
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(now)
}

/*
=========================================================
 FORMAT TIME
=========================================================

IMPORTANT:
Firestore Timestamp stores an absolute point in time.

We explicitly display it in Asia/Kolkata so that the
AM/PM value does not change based on the browser/device
timezone.
=========================================================
*/

const formatTime = (timestamp: Timestamp | null) => {
  if (!timestamp) {
    return '-'
  }

  return timestamp.toDate().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/*
=========================================================
 FORMAT DATE
=========================================================
*/

const formatDate = (dateString: string) => {
  if (!dateString) {
    return ''
  }

  const parts = dateString.split('-')

  if (parts.length !== 3) {
    return dateString
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

/*
=========================================================
 FORMAT HOURS
=========================================================
*/

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0))

  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainingSeconds = safeSeconds % 60

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(remainingSeconds).padStart(2, '0'),
  ].join(':')
}

/*
=========================================================
 TOTAL WORKING TIME
=========================================================

The daily record stores accumulated time from completed
sessions. If the employee is currently working today,
we add the currently running session to that stored time.
=========================================================
*/

const calculateWorkingSeconds = (
  record: AttendanceRecord,
  nowMillis: number,
) => {
  const storedSeconds = Math.max(
    0,
    Number(record.storedWorkedSeconds || 0),
  )

  if (!record.isWorking || !record.currentSessionStartedAt) {
    return storedSeconds
  }

  const currentSessionSeconds = Math.max(
    0,
    Math.floor(
      (nowMillis - record.currentSessionStartedAt.toMillis()) / 1000,
    ),
  )

  return storedSeconds + currentSessionSeconds
}

/*
=========================================================
 OT CALCULATION
=========================================================

Rules:

10 hours = full day
5 hours = half day
25-40 minutes above 10/5 hours = 0.5 OT
More than 40 minutes = 1 OT
Less than required time = 0 OT
=========================================================
*/

const calculateOT = (totalSeconds: number) => {
  const fullDaySeconds = 10 * 60 * 60
  const halfDaySeconds = 5 * 60 * 60
  const twentyFiveMinutes = 25 * 60
  const fortyMinutes = 40 * 60

  if (totalSeconds >= fullDaySeconds) {
    const overtime = totalSeconds - fullDaySeconds

    if (overtime > fortyMinutes) {
      return 1
    }

    if (overtime >= twentyFiveMinutes) {
      return 0.5
    }

    return 0
  }

  if (totalSeconds >= halfDaySeconds) {
    const overtime = totalSeconds - halfDaySeconds

    if (overtime > fortyMinutes) {
      return 1
    }

    if (overtime >= twentyFiveMinutes) {
      return 0.5
    }

    return 0
  }

  return 0
}

/*
=========================================================
 MAIN PAGE
=========================================================
*/

function Attendance() {
  const [selectedDate, setSelectedDate] = useState(getTodayDate())
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState('ALL')
  const [nowMillis, setNowMillis] = useState(Date.now())

  /*
  =======================================================
  LIVE CLOCK
  =======================================================

  This makes the total working time update while an employee
  is currently working, without requiring another Firestore write.
  */

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNowMillis(Date.now())
    }, 1000)

    return () => window.clearInterval(interval)
  }, [])

  /*
  =======================================================
  REFRESH SELECTED DATE AT MIDNIGHT
  =======================================================

  If this page stays open across midnight, automatically move
  the date filter to the new calendar day.
  */

  useEffect(() => {
    const interval = window.setInterval(() => {
      const today = getTodayDate()

      setSelectedDate((currentDate) =>
        currentDate === getTodayDate() ? today : currentDate,
      )
    }, 60 * 1000)

    return () => window.clearInterval(interval)
  }, [])

  /*
  =======================================================
  LOAD DAILY ATTENDANCE
  =======================================================

  Collection:
    duty_sessions

  Document:
    <username>

  Daily data:
    dailySessions.<YYYY-MM-DD>
  */

  useEffect(() => {
    setLoading(true)

    const attendanceCollection = collection(
      db,
      DUTY_COLLECTION,
    )

    const unsubscribe = onSnapshot(
      attendanceCollection,
      (snapshot) => {
        const data: AttendanceRecord[] = []
        const today = getTodayDate()

        snapshot.forEach((document) => {
          const duty = document.data() as DutySession
          const dailySessions = duty.dailySessions

          let dailyRecord = dailySessions?.[selectedDate]

          /*
          Backward compatibility:
          Older documents may still contain one top-level duty record.
          Use it only when it belongs to the selected date and there
          is no new dailySessions record for that date.
          */

          if (!dailyRecord && duty.dutyDate === selectedDate) {
            dailyRecord = {
              date: selectedDate,
              startTime: duty.lastStartedAt || null,
              endTime: duty.lastEndedAt || null,
              branch: duty.branch || '',
              totalWorkedSeconds: Number(
                duty.totalWorkedSeconds || 0,
              ),
              totalSessions: Number(
                duty.totalSessions || 0,
              ),
            }
          }

          /*
          No record for the selected day means the employee did not
          start duty on that day. Do not display another day's duty.
          */

          if (!dailyRecord) {
            return
          }

          const isWorking =
            selectedDate === today &&
            duty.dutyDate === selectedDate &&
            duty.status === 'Working' &&
            !!duty.currentSessionStartedAt

          data.push({
            name:
              duty.userName ||
              duty.username ||
              document.id,

            username:
              duty.username ||
              document.id,

            date:
              dailyRecord.date ||
              selectedDate,

            branch:
              dailyRecord.branch ||
              duty.branch ||
              'Not Assigned',

            inTime:
              dailyRecord.startTime ||
              null,

            outTime:
              dailyRecord.endTime ||
              null,

            storedWorkedSeconds: Number(
              dailyRecord.totalWorkedSeconds || 0,
            ),

            currentSessionStartedAt:
              isWorking
                ? duty.currentSessionStartedAt || null
                : null,

            isWorking,
          })
        })

        data.sort((a, b) =>
          a.name.localeCompare(b.name),
        )

        setRecords(data)
        setLoading(false)
      },
      (error) => {
        console.error(
          'Attendance loading error:',
          error,
        )

        setRecords([])
        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [selectedDate])

  /*
  =======================================================
  DISPLAY RECORDS WITH LIVE WORKING TIME
  =======================================================
  */

  const displayRecords = useMemo(() => {
    return records.map((record) => ({
      ...record,
      totalWorkedSeconds: calculateWorkingSeconds(
        record,
        nowMillis,
      ),
    }))
  }, [records, nowMillis])

  /*
  =======================================================
  EMPLOYEE LIST
  =======================================================
  */

  const employeeList = useMemo(() => {
    const names = displayRecords
      .map((record) => record.name)
      .filter(Boolean)

    return [...new Set(names)].sort()
  }, [displayRecords])

  /*
  =======================================================
  FILTERED OT RECORDS
  =======================================================
  */

  const overtimeRecords = useMemo(() => {
    return displayRecords
      .filter((record) => {
        if (selectedEmployee !== 'ALL') {
          return record.name === selectedEmployee
        }

        return true
      })
      .filter(
        (record) =>
          record.totalWorkedSeconds >
          10 * 60 * 60 + 40 * 60,
      )
      .sort(
        (a, b) =>
          b.totalWorkedSeconds -
          a.totalWorkedSeconds,
      )
  }, [displayRecords, selectedEmployee])

  /*
  =======================================================
  BRANCH MEMBERS
  =======================================================
  */

  const branchMembers = useMemo(() => {
    const result: Record<string, string[]> = {}

    BRANCHES.forEach((branch) => {
      result[branch] = []
    })

    displayRecords.forEach((record) => {
      const branch = record.branch || 'Not Assigned'

      if (!result[branch]) {
        result[branch] = []
      }

      if (!result[branch].includes(record.name)) {
        result[branch].push(record.name)
      }
    })

    Object.keys(result).forEach((branch) => {
      result[branch].sort()
    })

    return result
  }, [displayRecords])

  /*
  =======================================================
  PAGE
  =======================================================
  */

  return (
    <div className="attendance-page">

      {/* ===============================================
          HEADER
      =============================================== */}

      <div className="attendance-header">
        <div>
          <h1>Attendance</h1>

          <p>
            Employee duty and overtime report
          </p>
        </div>

        <div className="date-filter">
          <label>Select Date</label>

          <input
            type="date"
            value={selectedDate}
            onChange={(event) =>
              setSelectedDate(event.target.value)
            }
          />
        </div>
      </div>

      {/* ===============================================
          TABLE 1
          DAILY ATTENDANCE
      =============================================== */}

      <section className="attendance-section">
        <div className="section-heading">
          <div>
            <h2>Daily Attendance</h2>

            <span>
              {formatDate(selectedDate)}
            </span>
          </div>

          <div className="record-count">
            {displayRecords.length} Employees
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Branch</th>
                <th>In Time</th>
                <th>Out Time</th>
                <th>Total Hours Working</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-row"
                  >
                    Loading attendance...
                  </td>
                </tr>
              ) : displayRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-row"
                  >
                    No attendance records found for this date.
                  </td>
                </tr>
              ) : (
                displayRecords.map((record) => (
                  <tr
                    key={`${record.username}-${record.date}`}
                  >
                    <td>
                      <strong>{record.name}</strong>
                    </td>

                    <td>
                      {formatDate(record.date)}
                    </td>

                    <td>
                      {record.branch}
                    </td>

                    <td>
                      {formatTime(record.inTime)}
                    </td>

                    <td>
                      {formatTime(record.outTime)}
                    </td>

                    <td>
                      <strong>
                        {formatDuration(
                          record.totalWorkedSeconds,
                        )}
                      </strong>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===============================================
          TABLE 2
          BRANCH MEMBERS
      =============================================== */}

      <section className="attendance-section">
        <div className="section-heading">
          <div>
            <h2>Branch Members</h2>

            <span>
              Active members for {formatDate(selectedDate)}
            </span>
          </div>
        </div>

        <div className="branch-table-wrapper">
          <table className="branch-table">
            <thead>
              <tr>
                {Object.keys(branchMembers).map(
                  (branch) => (
                    <th key={branch}>
                      {branch}
                    </th>
                  ),
                )}
              </tr>
            </thead>

            <tbody>
              <tr>
                {Object.keys(branchMembers).map(
                  (branch) => (
                    <td key={branch}>
                      {branchMembers[branch].length === 0 ? (
                        <span className="no-member">
                          No active members
                        </span>
                      ) : (
                        <div className="member-list">
                          {branchMembers[branch].map(
                            (member, index) => (
                              <div
                                className="member-item"
                                key={member}
                              >
                                <span className="member-number">
                                  {index + 1}
                                </span>

                                <span>
                                  {member}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      )}
                    </td>
                  ),
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* ===============================================
          TABLE 3
          OVERTIME
      =============================================== */}

      <section className="attendance-section">
        <div className="section-heading">
          <div>
            <h2>Overtime Works</h2>

            <span>
              Employees working more than 10:40:00
            </span>
          </div>

          <div className="employee-filter">
            <label>Employee</label>

            <select
              value={selectedEmployee}
              onChange={(event) =>
                setSelectedEmployee(event.target.value)
              }
            >
              <option value="ALL">
                All Employees
              </option>

              {employeeList.map((name) => (
                <option
                  key={name}
                  value={name}
                >
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Date</th>
                <th>Branch</th>
                <th>In Time</th>
                <th>Out Time</th>
                <th>Total Time</th>
                <th>OT</th>
              </tr>
            </thead>

            <tbody>
              {overtimeRecords.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="empty-row"
                  >
                    No overtime work found.
                  </td>
                </tr>
              ) : (
                overtimeRecords.map((record) => {
                  const overtime = calculateOT(
                    record.totalWorkedSeconds,
                  )

                  const otClass =
                    overtime === 1
                      ? 'ot-badge ot-full'
                      : 'ot-badge ot-half'

                  const otLabel =
                    overtime === 1
                      ? '1 OT'
                      : overtime === 0.5
                        ? '0.5 OT'
                        : '0 OT'

                  return (
                    <tr key={record.username}>
                      <td>
                        <strong>
                          {record.name}
                        </strong>
                      </td>

                      <td>
                        {formatDate(record.date)}
                      </td>

                      <td>
                        {record.branch}
                      </td>

                      <td>
                        {formatTime(record.inTime)}
                      </td>

                      <td>
                        {formatTime(record.outTime)}
                      </td>

                      <td>
                        <strong>
                          {formatDuration(
                            record.totalWorkedSeconds,
                          )}
                        </strong>
                      </td>

                      <td>
                        <span className={otClass}>
                          {otLabel}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="ot-rule-box">
          <strong>Overtime Calculation</strong>

          <div className="ot-rules">
            <span>
              10:00:00 = Full Day
            </span>

            <span>
              05:00:00 = Half Day
            </span>

            <span>
              +25 to 40 min = 0.5 OT
            </span>

            <span>
              More than +40 min = 1 OT
            </span>

            <span>
              Less than required = 0 OT
            </span>
          </div>
        </div>
      </section>

    </div>
  )
}

export default Attendance