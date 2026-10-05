  import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore'
import {
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { db } from '../../firebase'
import './Department.css'

interface MeasurementScheduleProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

interface MeasurementScheduleRecord {
  id: string

  leadId?: string
  leadDocumentId?: string

  customerName?: string
  phoneNumber?: string
  place?: string
  branch?: string
  source?: string
  leadDate?: string

  createdAt?: Timestamp

  createdBy?: {
    name?: string
    username?: string
  }

  status?: string

  measurementDate?: string
  measurementTime?: string
  assignedTo?: string
  remarks?: string
}

interface LocationState {
  leadId?: string
  customerName?: string
  phoneNumber?: string
  place?: string
  branch?: string
  scheduleId?: string
}

const formatDate = (date: string) => {
  if (!date) return '—'

  const parsed = new Date(
    `${date}T00:00:00`,
  )

  if (Number.isNaN(parsed.getTime())) {
    return date
  }

  return parsed.toLocaleDateString()
}

const formatTimestamp = (
  timestamp?: Timestamp,
) => {
  if (
    !timestamp ||
    !timestamp.toDate
  ) {
    return '—'
  }

  return timestamp
    .toDate()
    .toLocaleString()
}

function MeasurementSchedule({
  user,
}: MeasurementScheduleProps) {

  const navigate = useNavigate()
  const location = useLocation()

  const locationState =
    (location.state ?? {}) as LocationState

  const [schedules, setSchedules] =
    useState<MeasurementScheduleRecord[]>([])

  const [loading, setLoading] =
    useState(true)

  const [search, setSearch] =
    useState('')

  const [error, setError] =
    useState('')

  useEffect(() => {
    setLoading(true)
    setError('')

    const schedulesQuery = query(
      collection(
        db,
        'measurementSchedules',
      ),
      orderBy(
        'createdAt',
        'desc',
      ),
    )

    const unsubscribe = onSnapshot(
      schedulesQuery,

      snapshot => {
        const records =
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data(),
          })) as MeasurementScheduleRecord[]

        setSchedules(records)
        setLoading(false)
      },

      snapshotError => {
        console.error(
          'Error loading measurement schedules:',
          snapshotError,
        )

        setError(
          'Unable to load measurement schedules.',
        )

        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const filteredSchedules =
    useMemo(() => {
      const term =
        search.trim().toLowerCase()

      if (!term) {
        return schedules
      }

      return schedules.filter(schedule => {
        const values = [
          schedule.leadId,
          schedule.leadDocumentId,
          schedule.customerName,
          schedule.phoneNumber,
          schedule.place,
          schedule.branch,
          schedule.source,
          schedule.leadDate,
          schedule.assignedTo,
          schedule.status,
          schedule.measurementDate,
        ]

        return values.some(value =>
          String(value ?? '')
            .toLowerCase()
            .includes(term),
        )
      })
    }, [schedules, search])

  const openLead = (
    schedule: MeasurementScheduleRecord,
  ) => {
    navigate(
      '/departments/leads-view',
      {
        state: {
          leadId:
            schedule.leadId,

          customerName:
            schedule.customerName,

          phoneNumber:
            schedule.phoneNumber,

          place:
            schedule.place,

          branch:
            schedule.branch,
        },
      },
    )
  }

  return (
    <div className="department-page">

      <div className="department-container measurement-schedule-page">

        {/* HEADER */}
        <div className="department-header measurement-schedule-header">

          <div>
            <h1>
              Measurement Schedule
            </h1>

            <p>
              Manage customer leads
              scheduled for measurement.
              Welcome, {user.name}.
            </p>
          </div>

          <button
            type="button"
            className="measurement-schedule-back-button"
            onClick={() =>
              navigate(
                '/departments/leads-view',
              )
            }
          >
            ← Go to Leads
          </button>

        </div>


        {/* SUCCESS MESSAGE */}
        {locationState.scheduleId && (
          <div className="measurement-schedule-success">
            <div className="measurement-schedule-success-icon">
              ✓
            </div>

            <div>
              <strong>
                Measurement schedule created
              </strong>

              <span>
                The lead has been successfully
                added to the measurement schedule.
              </span>
            </div>
          </div>
        )}


        {/* ERROR */}
        {error && (
          <div className="form-message">
            {error}
          </div>
        )}


        {/* SEARCH */}
        <div className="measurement-schedule-toolbar">

          <div className="measurement-schedule-search">

            <label htmlFor="measurement-schedule-search">
              Search scheduled leads
            </label>

            <div className="measurement-schedule-search-input">

              <span>
                🔍
              </span>

              <input
                id="measurement-schedule-search"
                type="text"
                value={search}
                onChange={event =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder="Search customer, phone, place, branch or lead ID..."
              />

            </div>

          </div>

          <div className="measurement-schedule-count">

            <span>
              Total Schedules
            </span>

            <strong>
              {filteredSchedules.length}
            </strong>

          </div>

        </div>


        {/* SECTION */}
        <div className="measurement-schedule-section">

          <div className="measurement-schedule-section-header">

            <div>
              <h2>
                Scheduled Leads
              </h2>

              <p>
                Customers currently waiting
                for measurement.
              </p>
            </div>

            <div className="measurement-schedule-total">
              {filteredSchedules.length}{' '}
              {filteredSchedules.length === 1
                ? 'Schedule'
                : 'Schedules'}
            </div>

          </div>


          {/* LOADING */}
          {loading && (
            <div className="measurement-schedule-empty">
              <div className="measurement-schedule-loading-spinner" />

              <strong>
                Loading schedules...
              </strong>

              <span>
                Please wait while the latest
                measurement schedules are loaded.
              </span>
            </div>
          )}


          {/* EMPTY */}
          {!loading &&
            filteredSchedules.length ===
              0 && (
              <div className="measurement-schedule-empty">

                <div className="measurement-schedule-empty-icon">
                  📅
                </div>

                <strong>
                  No Measurement Schedules
                </strong>

                <span>
                  No customers are currently
                  scheduled for measurement.
                </span>

              </div>
            )}


          {/* LIST */}
          {!loading &&
            filteredSchedules.length >
              0 && (

              <div className="measurement-schedule-list">

                {filteredSchedules.map(
                  schedule => (

                    <div
                      key={schedule.id}
                      className="measurement-schedule-card"
                    >

                      {/* CARD TOP */}
                      <div className="measurement-schedule-card-top">

                        <div className="measurement-customer">

                          <div className="measurement-customer-avatar">
                            {(
                              schedule.customerName ||
                              'C'
                            )
                              .charAt(0)
                              .toUpperCase()}
                          </div>

                          <div>

                            <h3>
                              {schedule.customerName ||
                                'Unnamed Customer'}
                            </h3>

                            <p>
                              Lead ID:{' '}
                              <strong>
                                {schedule.leadId ||
                                  schedule.leadDocumentId ||
                                  '—'}
                              </strong>
                            </p>

                          </div>

                        </div>


                        <span className="measurement-status-badge">
                          <span className="measurement-status-dot" />
                          {schedule.status ||
                            'Scheduled'}
                        </span>

                      </div>


                      {/* CUSTOMER INFORMATION */}
                      <div className="measurement-info-section">

                        <div className="measurement-info-section-title">
                          Customer Information
                        </div>

                        <div className="measurement-info-grid">

                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Phone Number
                            </span>

                            <strong>
                              {schedule.phoneNumber ||
                                '—'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Place
                            </span>

                            <strong>
                              {schedule.place ||
                                '—'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Branch
                            </span>

                            <strong>
                              {schedule.branch ||
                                '—'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Lead Source
                            </span>

                            <strong>
                              {schedule.source ||
                                '—'}
                            </strong>

                          </div>

                        </div>

                      </div>


                      {/* SCHEDULE INFORMATION */}
                      <div className="measurement-info-section">

                        <div className="measurement-info-section-title">
                          Measurement Details
                        </div>

                        <div className="measurement-info-grid">

                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Measurement Date
                            </span>

                            <strong>
                              {schedule.measurementDate
                                ? formatDate(
                                    schedule.measurementDate,
                                  )
                                : 'Not assigned'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Measurement Time
                            </span>

                            <strong>
                              {schedule.measurementTime ||
                                'Not assigned'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Assigned To
                            </span>

                            <strong>
                              {schedule.assignedTo ||
                                'Not assigned'}
                            </strong>

                          </div>


                          <div className="measurement-info-item">

                            <span className="measurement-info-label">
                              Lead Date
                            </span>

                            <strong>
                              {formatDate(
                                schedule.leadDate ||
                                  '',
                              )}
                            </strong>

                          </div>

                        </div>

                      </div>


                      {/* CREATION INFORMATION */}
                      <div className="measurement-card-footer">

                        <div className="measurement-created-info">

                          <span>
                            Created by
                          </span>

                          <strong>
                            {schedule.createdBy
                              ?.name ||
                              '—'}
                          </strong>

                          <small>
                            {formatTimestamp(
                              schedule.createdAt,
                            )}
                          </small>

                        </div>


                        <button
                          type="button"
                          className="measurement-open-lead-button"
                          onClick={() =>
                            openLead(
                              schedule,
                            )
                          }
                        >
                          Open Lead
                          <span>
                            →
                          </span>
                        </button>

                      </div>


                      {/* REMARKS */}
                      {schedule.remarks && (
                        <div className="measurement-remarks">

                          <span>
                            Remarks
                          </span>

                          <p>
                            {schedule.remarks}
                          </p>

                        </div>
                      )}

                    </div>
                  ),
                )}

              </div>
            )}

        </div>

      </div>
    </div>
  )
}

export default MeasurementSchedule

