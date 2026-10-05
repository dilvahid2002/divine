  import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  where,
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
  measurementId?: string
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

  const [scheduleDate, setScheduleDate] =
    useState('')

  const [scheduleTime, setScheduleTime] =
    useState('')

  const [assignedTo, setAssignedTo] =
    useState('')

  const [scheduleRemarks, setScheduleRemarks] =
    useState('')

  const [savingSchedule, setSavingSchedule] =
    useState(false)

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

  useEffect(() => {
    if (!locationState.customerName) {
      return
    }

    setScheduleDate((current) =>
      current ||
      new Date().toISOString().split('T')[0],
    )
  }, [locationState.customerName])

  const handleCreateSchedule = async () => {
    if (!locationState.leadId) {
      setError('No lead was supplied for this measurement schedule.')
      return
    }

    if (!scheduleDate) {
      setError('Please select a measurement date.')
      return
    }

    setSavingSchedule(true)
    setError('')

    try {
      const existingQuery = query(
        collection(db, 'measurementSchedules'),
        where('leadId', '==', locationState.leadId),
      )

      const existingSnapshot = await getDocs(existingQuery)

      if (!existingSnapshot.empty) {
        setError('A measurement schedule already exists for this lead.')
        setSavingSchedule(false)
        return
      }

      await addDoc(
        collection(db, 'measurementSchedules'),
        {
          leadId: locationState.leadId,
          customerName: locationState.customerName || '',
          phoneNumber: locationState.phoneNumber || '',
          place: locationState.place || '',
          branch: locationState.branch || '',
          status: 'Scheduled',
          measurementDate: scheduleDate,
          measurementTime: scheduleTime,
          assignedTo: assignedTo.trim(),
          remarks: scheduleRemarks.trim(),
          createdAt: Timestamp.now(),
          createdBy: {
            name: user.name,
            username: user.username,
          },
        },
      )

      setScheduleRemarks('')
      setScheduleTime('')
      setAssignedTo('')
    } catch (scheduleError) {
      console.error(
        'Error creating measurement schedule:',
        scheduleError,
      )
      setError('Unable to create the measurement schedule.')
    } finally {
      setSavingSchedule(false)
    }
  }

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

  const takeMeasurement = (
    schedule: MeasurementScheduleRecord,
  ) => {
    if (schedule.measurementId) {
      return
    }

    navigate(
      '/departments/measurement',
      {
        state: {
          leadId:
            schedule.leadId,

          scheduleId:
            schedule.id,

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
                '/departments/LeadsView',
              )
            }
          >
            ← Go to Leads
          </button>
          <button
            type="button"
            className="measurement-go-home-button"
            onClick={() => navigate('/')}
          >
            ← Go to Home
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


        {/* SELECTED LEAD FROM LEADS VIEW */}
        {locationState.customerName && (
          <div
            style={{
              marginBottom: '20px',
              padding: '16px 18px',
              borderRadius: '12px',
              background: '#eff6ff',
              border: '1px solid #bfdbfe',
            }}
          >
            <strong>Selected Lead</strong>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: '12px',
                marginTop: '10px',
              }}
            >
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>Name</span>
                <strong>{locationState.customerName}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>Phone Number</span>
                <strong>{locationState.phoneNumber || '—'}</strong>
              </div>
              <div>
                <span style={{ display: 'block', fontSize: '12px', color: '#64748b' }}>Place</span>
                <strong>{locationState.place || '—'}</strong>
              </div>
            </div>
          </div>
        )}


        {/* PREFILLED SCHEDULE FORM FROM LEADS VIEW */}
        {locationState.customerName && (
          <section className="department-section" style={{ marginBottom: '20px' }}>
            <div className="section-heading-row">
              <div>
                <h2>Schedule Measurement</h2>
                <p>Lead information has been automatically filled from Leads View.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="input-group">
                <label>Name of Customer</label>
                <input
                  type="text"
                  value={locationState.customerName || ''}
                  readOnly
                />
              </div>

              <div className="input-group">
                <label>Phone Number</label>
                <input
                  type="tel"
                  value={locationState.phoneNumber || ''}
                  readOnly
                />
              </div>

              <div className="input-group">
                <label>Place</label>
                <input
                  type="text"
                  value={locationState.place || ''}
                  readOnly
                />
              </div>

              <div className="input-group">
                <label>Branch</label>
                <input
                  type="text"
                  value={locationState.branch || ''}
                  readOnly
                />
              </div>

              <div className="input-group">
                <label>Measurement Date</label>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(event) =>
                    setScheduleDate(event.target.value)
                  }
                />
              </div>

              <div className="input-group">
                <label>Measurement Time</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(event) =>
                    setScheduleTime(event.target.value)
                  }
                />
              </div>

              <div className="input-group">
                <label>Assigned To</label>
                <input
                  type="text"
                  value={assignedTo}
                  onChange={(event) =>
                    setAssignedTo(event.target.value)
                  }
                  placeholder="Measurement staff"
                />
              </div>

              <div className="input-group">
                <label>Remarks</label>
                <input
                  type="text"
                  value={scheduleRemarks}
                  onChange={(event) =>
                    setScheduleRemarks(event.target.value)
                  }
                  placeholder="Optional remarks"
                />
              </div>
            </div>

            <div className="form-actions">
              <button
                type="button"
                className="submit-job-button"
                onClick={handleCreateSchedule}
                disabled={savingSchedule}
              >
                {savingSchedule ? 'Saving...' : 'Save Measurement Schedule'}
              </button>
            </div>
          </section>
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


                        {schedule.measurementId ? (
                          <div
                            className="measurement-completed-badge"
                            title="Measurement saved"
                          >
                            Measurement {schedule.measurementId}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="measurement-open-lead-button"
                            onClick={() =>
                              takeMeasurement(
                                schedule,
                              )
                            }
                          >
                            Take Measurement
                            <span>
                              →
                            </span>
                          </button>
                        )}

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

