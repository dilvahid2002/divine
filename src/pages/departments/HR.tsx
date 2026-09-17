import './Department.css'

import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  collection,
  onSnapshot,
  Timestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'

import { db } from '../../firebase'

interface LeaveRequest {
  id: string
  username: string
  userName: string
  leaveDate: string
  reason: string
  status: 'Pending' | 'Approved' | 'Rejected'
  requestedAt: Timestamp | null
}

interface WeekOption {
  start: Date
  end: Date
  key: string
  label: string
}

const LEAVE_COLLECTION = 'casual_leave_requests'

const pad = (value: number) =>
  String(value).padStart(2, '0')

/*
 * =========================================================
 * DATE HELPERS
 * =========================================================
 */

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(date.getDate())}`

const parseDateKey = (dateKey: string) => {
  const [year, month, day] =
    dateKey.split('-').map(Number)

  return new Date(
    year,
    month - 1,
    day,
  )
}

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

const saturdayOfWeek = (
  monday: Date,
) =>
  addDays(monday, 5)

const formatDate = (
  dateKey: string,
) =>
  parseDateKey(
    dateKey,
  ).toLocaleDateString(
    [],
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )

const formatLongDate = (
  date: Date,
) =>
  date.toLocaleDateString(
    [],
    {
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    },
  )

const formatShortWeekDate = (
  date: Date,
) =>
  date.toLocaleDateString(
    [],
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    },
  )

/*
 * =========================================================
 * TIMESTAMP HELPERS
 * =========================================================
 */

const getTimestampMillis = (
  timestamp: Timestamp | null,
) => {
  if (!timestamp) return 0

  try {
    return timestamp.toMillis()
  } catch {
    return 0
  }
}

const formatRequestedAt = (
  timestamp: Timestamp | null,
) => {
  if (!timestamp) return '-'

  try {
    return timestamp
      .toDate()
      .toLocaleString(
        [],
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        },
      )
  } catch {
    return '-'
  }
}

/*
 * =========================================================
 * BUILD WEEK OPTIONS
 *
 * Shows:
 * - previous weeks
 * - current week
 * - upcoming weeks
 *
 * Every period is Monday -> Saturday.
 * =========================================================
 */

const buildWeekOptions = (): WeekOption[] => {
  const currentMonday =
    startOfWeekMonday(
      new Date(),
    )

  const weeks: WeekOption[] = []

  for (
    let offset = -4;
    offset <= 12;
    offset += 1
  ) {
    const start = addDays(
      currentMonday,
      offset * 7,
    )

    const end =
      saturdayOfWeek(start)

    weeks.push({
      start,
      end,
      key: toDateKey(start),
      label: `${formatShortWeekDate(
        start,
      )} – ${formatShortWeekDate(
        end,
      )}`,
    })
  }

  return weeks
}

/*
 * =========================================================
 * COMPONENT
 * =========================================================
 */

function HR() {
  const [leaveRequests, setLeaveRequests] =
    useState<LeaveRequest[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [selectedWeekKey, setSelectedWeekKey] =
    useState('')

  const [updatingId, setUpdatingId] =
    useState('')

  const [updateError, setUpdateError] =
    useState('')

  const [successMessage, setSuccessMessage] =
    useState('')

  /*
   * =========================================================
   * WEEK OPTIONS
   * =========================================================
   */

  const weekOptions = useMemo(
    () => buildWeekOptions(),
    [],
  )

  /*
   * Select current Monday by default.
   */

  useEffect(() => {
    if (
      !selectedWeekKey &&
      weekOptions.length > 0
    ) {
      const currentMonday =
        toDateKey(
          startOfWeekMonday(
            new Date(),
          ),
        )

      const exists =
        weekOptions.some(
          (week) =>
            week.key ===
            currentMonday,
        )

      if (exists) {
        setSelectedWeekKey(
          currentMonday,
        )
      } else {
        setSelectedWeekKey(
          weekOptions[
            weekOptions.length - 1
          ].key,
        )
      }
    }
  }, [
    selectedWeekKey,
    weekOptions,
  ])

  /*
   * =========================================================
   * LOAD ALL CASUAL LEAVE REQUESTS
   *
   * IMPORTANT:
   * We deliberately do NOT use:
   *
   *   query(...)
   *   where(...)
   *   orderBy(...)
   *
   * This avoids Firestore composite-index problems.
   *
   * We fetch the collection and perform sorting/filtering
   * locally.
   * =========================================================
   */

  useEffect(() => {
    setLoading(true)
    setError('')

    const leaveCollection =
      collection(
        db,
        LEAVE_COLLECTION,
      )

    const unsubscribe =
      onSnapshot(
        leaveCollection,
        (snapshot) => {
          try {
            const requests: LeaveRequest[] =
              []

            snapshot.forEach(
              (item) => {
                const data =
                  item.data()

                let status:
                  | 'Pending'
                  | 'Approved'
                  | 'Rejected' =
                  'Pending'

                if (
                  data.status ===
                  'Approved'
                ) {
                  status =
                    'Approved'
                } else if (
                  data.status ===
                  'Rejected'
                ) {
                  status =
                    'Rejected'
                }

                let requestedAt:
                  | Timestamp
                  | null =
                  null

                /*
                 * Firestore Timestamp
                 */

                if (
                  data.requestedAt instanceof
                  Timestamp
                ) {
                  requestedAt =
                    data.requestedAt
                }

                /*
                 * Some existing records may contain
                 * a Timestamp-like object.
                 */

                else if (
                  data.requestedAt &&
                  typeof data.requestedAt.toDate ===
                    'function'
                ) {
                  requestedAt =
                    data.requestedAt as Timestamp
                }

                requests.push({
                  id: item.id,

                  username:
                    String(
                      data.username ||
                        '',
                    ),

                  userName:
                    String(
                      data.userName ||
                        data.username ||
                        'Unknown Employee',
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

                  requestedAt,
                })
              },
            )

            /*
             * Sort by requestedAt.
             *
             * Oldest / first applied request appears first.
             */

            requests.sort(
              (a, b) =>
                getTimestampMillis(
                  a.requestedAt,
                ) -
                getTimestampMillis(
                  b.requestedAt,
                ),
            )

            setLeaveRequests(
              requests,
            )

            setLoading(false)
          } catch (loadError) {
            console.error(
              'Error processing casual leave requests:',
              loadError,
            )

            setError(
              'Unable to process casual leave requests.',
            )

            setLoading(false)
          }
        },
        (snapshotError) => {
          console.error(
            'Casual leave Firestore error:',
            snapshotError,
          )

          setLeaveRequests([])

          setError(
            `Unable to load casual leave requests. ${
              snapshotError.message ||
              ''
            }`,
          )

          setLoading(false)
        },
      )

    return () =>
      unsubscribe()
  }, [])

  /*
   * =========================================================
   * SELECTED WEEK
   * =========================================================
   */

  const selectedWeek = useMemo(
    () =>
      weekOptions.find(
        (week) =>
          week.key ===
          selectedWeekKey,
      ) ||
      null,
    [
      selectedWeekKey,
      weekOptions,
    ],
  )

  /*
   * =========================================================
   * SELECTED WEEK DATE RANGE
   * =========================================================
   */

  const selectedStartKey =
    selectedWeek
      ? toDateKey(
          selectedWeek.start,
        )
      : ''

  const selectedEndKey =
    selectedWeek
      ? toDateKey(
          selectedWeek.end,
        )
      : ''

  /*
   * =========================================================
   * FILTER REQUESTS FOR SELECTED MONDAY-SATURDAY
   * =========================================================
   */

  const selectedWeekRequests =
    useMemo(() => {
      if (
        !selectedStartKey ||
        !selectedEndKey
      ) {
        return []
      }

      return leaveRequests
        .filter((request) => {
          if (!request.leaveDate) {
            return false
          }

          return (
            request.leaveDate >=
              selectedStartKey &&
            request.leaveDate <=
              selectedEndKey
          )
        })
        /*
         * First applied remains at top.
         */
        .sort(
          (a, b) =>
            getTimestampMillis(
              a.requestedAt,
            ) -
            getTimestampMillis(
              b.requestedAt,
            ),
        )
    }, [
      leaveRequests,
      selectedStartKey,
      selectedEndKey,
    ])

  /*
   * =========================================================
   * PENDING REQUESTS
   * =========================================================
   */

  const pendingRequests =
    useMemo(
      () =>
        selectedWeekRequests.filter(
          (request) =>
            request.status ===
            'Pending',
        ),
      [selectedWeekRequests],
    )

  /*
   * =========================================================
   * APPROVED REQUESTS
   * =========================================================
   */

  const approvedRequests =
    useMemo(
      () =>
        selectedWeekRequests
          .filter(
            (request) =>
              request.status ===
              'Approved',
          )
          .sort(
            (a, b) => {
              const dateCompare =
                a.leaveDate.localeCompare(
                  b.leaveDate,
                )

              if (
                dateCompare !== 0
              ) {
                return dateCompare
              }

              return (
                getTimestampMillis(
                  a.requestedAt,
                ) -
                getTimestampMillis(
                  b.requestedAt,
                )
              )
            },
          ),
      [selectedWeekRequests],
    )

  /*
   * =========================================================
   * REJECTED REQUESTS
   * =========================================================
   */

  const rejectedRequests =
    useMemo(
      () =>
        selectedWeekRequests
          .filter(
            (request) =>
              request.status ===
              'Rejected',
          )
          .sort(
            (a, b) => {
              const dateCompare =
                a.leaveDate.localeCompare(
                  b.leaveDate,
                )

              if (
                dateCompare !== 0
              ) {
                return dateCompare
              }

              return (
                getTimestampMillis(
                  a.requestedAt,
                ) -
                getTimestampMillis(
                  b.requestedAt,
                )
              )
            },
          ),
      [selectedWeekRequests],
    )

  /*
   * =========================================================
   * APPROVED REQUESTS GROUPED BY DATE
   *
   * Used for rowspan in the approved table.
   * =========================================================
   */

  const approvedGroups =
    useMemo(() => {
      const groups =
        new Map<
          string,
          LeaveRequest[]
        >()

      approvedRequests.forEach(
        (request) => {
          const existing =
            groups.get(
              request.leaveDate,
            ) || []

          existing.push(request)

          groups.set(
            request.leaveDate,
            existing,
          )
        },
      )

      return Array.from(
        groups.entries(),
      )
    }, [approvedRequests])

  /*
   * =========================================================
   * APPROVE / REJECT
   * =========================================================
   */

  const changeLeaveStatus = async (
    requestId: string,
    newStatus:
      | 'Approved'
      | 'Rejected',
  ) => {
    setUpdateError('')
    setSuccessMessage('')

    setUpdatingId(
      requestId,
    )

    try {
      await updateDoc(
        doc(
          db,
          LEAVE_COLLECTION,
          requestId,
        ),
        {
          status: newStatus,
        },
      )

      setSuccessMessage(
        `Leave request ${
          newStatus ===
          'Approved'
            ? 'approved'
            : 'rejected'
        } successfully.`,
      )

      /*
       * onSnapshot automatically updates all tables.
       */
    } catch (updateErrorValue) {
      console.error(
        'Leave status update error:',
        updateErrorValue,
      )

      setUpdateError(
        `Could not ${newStatus.toLowerCase()} the leave request. Please try again.`,
      )
    } finally {
      setUpdatingId('')
    }
  }

  /*
   * =========================================================
   * PRINT APPROVED LEAVE
   * =========================================================
   */

  const printApprovedLeave = () => {
    if (!selectedWeek) {
      return
    }

    /*
     * Build a dedicated print window.
     *
     * This means the normal HR page is not printed.
     */

    const printWindow =
      window.open(
        '',
        '_blank',
        'width=1200,height=800',
      )

    if (!printWindow) {
      setUpdateError(
        'Unable to open print window. Please allow pop-ups for this site.',
      )
      return
    }

    const periodHeading =
      `Casual Leave From ${formatLongDate(
        selectedWeek.start,
      )} to ${formatLongDate(
        selectedWeek.end,
      )}`

    const rows =
      approvedGroups
        .map(
          ([
            dateKey,
            requests,
          ]) => {
            return requests
              .map(
                (
                  request,
                  index,
                ) => `
                  <tr>
                    ${
                      index === 0
                        ? `
                          <td rowspan="${requests.length}">
                            <strong>${formatDate(
                              dateKey,
                            )}</strong>
                          </td>
                        `
                        : ''
                    }
                    <td>${escapeHtml(
                      request.userName,
                    )}</td>
                    <td>${escapeHtml(
                      request.username,
                    )}</td>
                    <td>${escapeHtml(
                      request.reason,
                    )}</td>
                    <td>${escapeHtml(
                      formatRequestedAt(
                        request.requestedAt,
                      ),
                    )}</td>
                  </tr>
                `,
              )
              .join('')
          },
        )
        .join('')

    const emptyRow =
      `
        <tr>
          <td colspan="5" class="empty">
            No approved casual leave for this period.
          </td>
        </tr>
      `

    printWindow.document.open()

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Casual Leave Report</title>

          <meta
            name="viewport"
            content="width=device-width, initial-scale=1.0"
          />

          <style>
            * {
              box-sizing: border-box;
            }

            body {
              margin: 0;
              padding: 35px;
              font-family:
                Arial,
                Helvetica,
                sans-serif;
              color: #102a43;
              background: #ffffff;
            }

            .print-header {
              text-align: center;
              margin-bottom: 28px;
            }

            .print-header h1 {
              margin: 0 0 10px;
              font-size: 25px;
              color: #0b2545;
            }

            .print-header p {
              margin: 0;
              font-size: 14px;
              color: #52667a;
            }

            .summary {
              display: flex;
              justify-content: space-between;
              margin-bottom: 18px;
              font-size: 14px;
            }

            table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #cbd5e1;
            }

            th {
              background: #0b2545;
              color: #ffffff;
              padding: 11px 12px;
              text-align: left;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: .05em;
              border: 1px solid #0b2545;
            }

            td {
              padding: 11px 12px;
              border: 1px solid #d9e2ec;
              font-size: 13px;
              vertical-align: top;
            }

            td strong {
              color: #0b2545;
            }

            .empty {
              text-align: center;
              padding: 25px;
              color: #627d98;
            }

            .print-footer {
              margin-top: 35px;
              padding-top: 12px;
              border-top: 1px solid #d9e2ec;
              display: flex;
              justify-content: space-between;
              font-size: 11px;
              color: #627d98;
            }

            @media print {
              body {
                padding: 15px;
              }

              @page {
                size: A4 landscape;
                margin: 12mm;
              }
            }
          </style>
        </head>

        <body>
          <div class="print-header">
            <h1>
              Casual Leave
            </h1>

            <p>
              ${escapeHtml(
                periodHeading,
              )}
            </p>
          </div>

          <div class="summary">
            <strong>
              Approved Employees:
              ${approvedRequests.length}
            </strong>

            <span>
              Printed:
              ${escapeHtml(
                new Date().toLocaleString(),
              )}
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th>Leave Date</th>
                <th>Employee</th>
                <th>Username</th>
                <th>Reason</th>
                <th>Requested On</th>
              </tr>
            </thead>

            <tbody>
              ${
                rows ||
                emptyRow
              }
            </tbody>
          </table>

          <div class="print-footer">
            <span>
              Casual Leave Register
            </span>

            <span>
              HR
            </span>
          </div>
        </body>
      </html>
    `)

    printWindow.document.close()

    /*
     * Wait until the print document is rendered.
     */

    printWindow.focus()

    setTimeout(() => {
      printWindow.print()
    }, 300)
  }

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <div className="hr-page">
      <div className="hr-container">

        {/* =================================================
            HEADER
        ================================================= */}

        <header className="hr-header">
          <div>
            <p className="hr-eyebrow">
              Human Resources
            </p>

            <h1>
              Casual Leave Management
            </h1>

            <p className="hr-subtitle">
              Review employee casual leave
              requests and manage approvals.
            </p>
          </div>

          <button
            type="button"
            className="hr-print-button"
            onClick={
              printApprovedLeave
            }
            disabled={
              !selectedWeek
            }
          >
            <span className="print-icon">
              🖨
            </span>

            Print Approved Leave
          </button>
        </header>

        {/* =================================================
            DATE FILTER
        ================================================= */}

        <section className="hr-filter-card">
          <div className="filter-heading">
            <div>
              <p className="section-eyebrow">
                Leave Period
              </p>

              <h2>
                Select Monday – Saturday
              </h2>
            </div>
          </div>

          <div className="filter-row">

            <div className="filter-field">
              <label htmlFor="leave-week">
                Leave week
              </label>

              <select
                id="leave-week"
                value={
                  selectedWeekKey
                }
                onChange={(
                  event,
                ) =>
                  setSelectedWeekKey(
                    event.target
                      .value,
                  )
                }
              >
                {weekOptions.map(
                  (week) => (
                    <option
                      key={
                        week.key
                      }
                      value={
                        week.key
                      }
                    >
                      {week.label}
                    </option>
                  ),
                )}
              </select>
            </div>

            {selectedWeek && (
              <div className="selected-period">
                <span>
                  Selected period
                </span>

                <strong>
                  {formatLongDate(
                    selectedWeek.start,
                  )}{' '}
                  →{' '}
                  {formatLongDate(
                    selectedWeek.end,
                  )}
                </strong>
              </div>
            )}

          </div>
        </section>

        {/* =================================================
            MESSAGES
        ================================================= */}

        {error && (
          <div className="hr-error">
            <strong>
              Firestore Error
            </strong>

            <span>
              {error}
            </span>
          </div>
        )}

        {updateError && (
          <div className="hr-error">
            {updateError}
          </div>
        )}

        {successMessage && (
          <div className="hr-success">
            {successMessage}
          </div>
        )}

        {/* =================================================
            PENDING REQUESTS
        ================================================= */}

        <section className="hr-card">
          <div className="card-heading">
            <div>
              <p className="section-eyebrow">
                Pending
              </p>

              <h2>
                Casual Leave Requests
              </h2>

              <p>
                Requests are sorted by
                application time. The
                first employee to apply
                appears first.
              </p>
            </div>

            <span className="count-badge pending-count">
              {pendingRequests.length}{' '}
              Pending
            </span>
          </div>

          <div className="hr-table-wrapper">
            <table className="hr-table">
              <thead>
                <tr>
                  <th>
                    Leave Date
                  </th>

                  <th>
                    Employee
                  </th>

                  <th>
                    Username
                  </th>

                  <th>
                    Reason
                  </th>

                  <th>
                    Requested On
                  </th>

                  <th className="action-column">
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-row"
                    >
                      Loading leave
                      requests...
                    </td>
                  </tr>
                ) : pendingRequests.length ===
                  0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-row"
                    >
                      No pending leave
                      requests for the
                      selected period.
                    </td>
                  </tr>
                ) : (
                  pendingRequests.map(
                    (request) => (
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
                          <strong>
                            {
                              request.userName
                            }
                          </strong>
                        </td>

                        <td>
                          <span className="username">
                            {
                              request.username
                            }
                          </span>
                        </td>

                        <td>
                          {
                            request.reason
                          }
                        </td>

                        <td className="requested-time">
                          {formatRequestedAt(
                            request.requestedAt,
                          )}
                        </td>

                        <td>
                          <div className="request-actions">

                            <button
                              type="button"
                              className="approve-button"
                              disabled={
                                updatingId ===
                                request.id
                              }
                              onClick={() =>
                                changeLeaveStatus(
                                  request.id,
                                  'Approved',
                                )
                              }
                            >
                              {updatingId ===
                              request.id
                                ? '...'
                                : 'Approve'}
                            </button>

                            <button
                              type="button"
                              className="reject-button"
                              disabled={
                                updatingId ===
                                request.id
                              }
                              onClick={() =>
                                changeLeaveStatus(
                                  request.id,
                                  'Rejected',
                                )
                              }
                            >
                              {updatingId ===
                              request.id
                                ? '...'
                                : 'Reject'}
                            </button>

                          </div>
                        </td>
                      </tr>
                    ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* =================================================
            APPROVED LEAVE
        ================================================= */}

        <section className="hr-card approved-card">

          <div className="card-heading">
            <div>
              <p className="section-eyebrow">
                Approved
              </p>

              <h2>
                Approved Leave
              </h2>

              <p>
                Employees approved for
                casual leave during the
                selected Monday–Saturday
                period.
              </p>
            </div>

            <span className="count-badge approved-count">
              {approvedRequests.length}{' '}
              Approved
            </span>
          </div>

          <div className="hr-table-wrapper">
            <table className="hr-table approved-table">
              <thead>
                <tr>
                  <th>
                    Leave Date
                  </th>

                  <th>
                    Employee
                  </th>

                  <th>
                    Username
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
                {approvedGroups.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-row"
                    >
                      No approved leave
                      for this period.
                    </td>
                  </tr>
                ) : (
                  approvedGroups.map(
                    ([
                      dateKey,
                      requests,
                    ]) =>
                      requests.map(
                        (
                          request,
                          index,
                        ) => (
                          <tr
                            key={
                              request.id
                            }
                          >
                            {index ===
                              0 && (
                              <td
                                rowSpan={
                                  requests.length
                                }
                                className="date-group-cell"
                              >
                                <strong>
                                  {formatDate(
                                    dateKey,
                                  )}
                                </strong>
                              </td>
                            )}

                            <td>
                              <strong>
                                {
                                  request.userName
                                }
                              </strong>
                            </td>

                            <td>
                              <span className="username">
                                {
                                  request.username
                                }
                              </span>
                            </td>

                            <td>
                              {
                                request.reason
                              }
                            </td>

                            <td className="requested-time">
                              {formatRequestedAt(
                                request.requestedAt,
                              )}
                            </td>

                            <td>
                              <span className="status-pill status-approved">
                                Approved
                              </span>
                            </td>
                          </tr>
                        ),
                      ),
                  )
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* =================================================
            REJECTED LEAVE
        ================================================= */}

        <section className="hr-card rejected-card">

          <div className="card-heading">
            <div>
              <p className="section-eyebrow">
                Rejected
              </p>

              <h2>
                Rejected Leave
              </h2>

              <p>
                Leave requests rejected
                during the selected
                Monday–Saturday period.
              </p>
            </div>

            <span className="count-badge rejected-count">
              {rejectedRequests.length}{' '}
              Rejected
            </span>
          </div>

          <div className="hr-table-wrapper">
            <table className="hr-table rejected-table">
              <thead>
                <tr>
                  <th>
                    Leave Date
                  </th>

                  <th>
                    Employee
                  </th>

                  <th>
                    Username
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
                {rejectedRequests.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={6}
                      className="empty-row"
                    >
                      No rejected leave
                      for this period.
                    </td>
                  </tr>
                ) : (
                  rejectedRequests.map(
                    (request) => (
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
                          <strong>
                            {
                              request.userName
                            }
                          </strong>
                        </td>

                        <td>
                          <span className="username">
                            {
                              request.username
                            }
                          </span>
                        </td>

                        <td>
                          {
                            request.reason
                          }
                        </td>

                        <td className="requested-time">
                          {formatRequestedAt(
                            request.requestedAt,
                          )}
                        </td>

                        <td>
                          <span className="status-pill status-rejected">
                            Rejected
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

        {/* =================================================
            FOOTER
        ================================================= */}

        <div className="hr-note">
          Leave requests are retained in
          Firestore. Approving or rejecting a
          request only changes its status.
        </div>

      </div>
    </div>
  )
}

/*
 * =========================================================
 * HTML ESCAPING FOR PRINT WINDOW
 * =========================================================
 */

const escapeHtml = (
  value: string,
) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll(
      "'",
      '&#039;',
    )

export default HR