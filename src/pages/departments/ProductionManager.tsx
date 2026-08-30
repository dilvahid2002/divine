import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  getDocs,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface ProductionManagerProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type JobStatus =
  | 'Pending'
  | 'In Progress'
  | 'Finished'

type SourceType =
  | 'job_order'
  | 'measurement'

interface Item {
  slNo?: number
  name?: string
  width?: string
  height?: string
  qty?: string
  price?: string
  remarks?: string
  image?: string
  imageUrl?: string
}

interface Customer {
  name: string
  companyName: string
  phoneNumber: string
  whatsappNumber: string
  place: string
}

interface ProductionStaff {
  id: string
  name: string
  username: string
}

interface ProductionAssignment {
  userId: string
  name: string
  username: string
}

interface ProductionJob {
  id: string
  source: SourceType
  orderId: string
  date: string
  expectedDeliveryDate: string
  branch: string
  customer: Customer
  items: Item[]
  officeInfo: {
    designJob: boolean
    printJob: boolean
    productionJob: boolean
    cuttingJob: boolean

    designer?: string | null
    designerUsername?: string | null

    printer?: string | null
    printerUsername?: string | null
    printBranch?: string | null

    cuttingBranch?: string | null
    productionBranch?: string | null
    productionAssignedDate?: string | null
    productionStaff?: ProductionAssignment[]
    productionAssignedBy?: {
      name: string
      username: string
    } | null
  }
  customerAdviser: {
    name: string
    username: string
  }
  statuses: {
    design: JobStatus
    print: JobStatus
    cutting: JobStatus
    production: JobStatus
  }
  createdAt?: unknown
}

const BRANCHES = [
  'Kalpetta',
  'Kondotty',
  'Sulthan Bathery',
]

const getString = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return ''
}

const getBoolean = (value: unknown): boolean => {
  return value === true
}

const getStatus = (
  value: unknown,
  fallback: JobStatus = 'Pending',
): JobStatus => {
  if (
    value === 'Pending' ||
    value === 'In Progress' ||
    value === 'Finished'
  ) {
    return value
  }

  return fallback
}

const getDateValue = (value: unknown): string => {
  return getString(value)
}

const formatDate = (value: string): string => {
  if (!value) {
    return '-'
  }

  const parsed = new Date(value)

  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const formatDateTime = (value: unknown): string => {
  if (!value) {
    return '-'
  }

  let date: Date | null = null

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as any).toDate === 'function'
  ) {
    date = (value as any).toDate()
  } else if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = Number((value as any).seconds)

    if (!Number.isNaN(seconds)) {
      date = new Date(seconds * 1000)
    }
  } else if (value instanceof Date) {
    date = value
  }

  if (!date) {
    return '-'
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const normalizeProductionStaff = (
  value: unknown,
): ProductionAssignment[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry: any) => ({
      userId: getString(entry?.userId),
      name: getString(entry?.name),
      username: getString(entry?.username),
    }))
    .filter(
      (entry) =>
        !!entry.userId ||
        !!entry.username ||
        !!entry.name,
    )
}

const createProductionJob = (
  documentId: string,
  data: any,
  source: SourceType,
): ProductionJob | null => {
  const officeInfo = data?.officeInfo || {}

  if (officeInfo.productionJob !== true) {
    return null
  }

  const customer = data?.customer || {}
  const adviser = data?.customerAdviser || {}

  const rawItems = Array.isArray(data?.items)
    ? data.items
    : []

  const items: Item[] = rawItems.map(
    (item: any, index: number) => ({
      slNo:
        typeof item?.slNo === 'number'
          ? item.slNo
          : index + 1,
      name: getString(item?.name),
      width: getString(item?.width),
      height: getString(item?.height),
      qty: getString(item?.qty),
      price: getString(item?.price),
      remarks: getString(item?.remarks),
      image: getString(item?.image) || undefined,
      imageUrl: getString(item?.imageUrl) || undefined,
    }),
  )

  let orderId = getString(data?.orderId)

  if (!orderId && source === 'measurement') {
    orderId =
      getString(data?.measurementId) ||
      `M-${documentId.slice(0, 6).toUpperCase()}`
  }

  if (!orderId) {
    orderId = documentId
  }

  const productionStaff = normalizeProductionStaff(
    officeInfo.productionStaff,
  )

  const assignedBy = officeInfo.productionAssignedBy
    ? {
        name: getString(
          officeInfo.productionAssignedBy.name,
        ),
        username: getString(
          officeInfo.productionAssignedBy.username,
        ),
      }
    : null

  return {
    id: documentId,
    source,
    orderId,
    date: getString(data?.date),
    expectedDeliveryDate: getString(
      data?.expectedDeliveryDate,
    ),
    branch: getString(data?.branch),
    customer: {
      name: getString(customer?.name),
      companyName: getString(customer?.companyName),
      phoneNumber: getString(customer?.phoneNumber),
      whatsappNumber: getString(
        customer?.whatsappNumber,
      ),
      place: getString(customer?.place),
    },
    items,
    officeInfo: {
      designJob: getBoolean(officeInfo?.designJob),
      printJob: getBoolean(officeInfo?.printJob),
      productionJob: getBoolean(
        officeInfo?.productionJob,
      ),
      cuttingJob: getBoolean(officeInfo?.cuttingJob),
      designer: officeInfo?.designer || null,
      designerUsername:
        officeInfo?.designerUsername || null,
      printer: officeInfo?.printer || null,
      printerUsername:
        officeInfo?.printerUsername || null,
      printBranch: officeInfo?.printBranch || null,
      cuttingBranch:
        officeInfo?.cuttingBranch || null,
      productionBranch:
        officeInfo?.productionBranch || null,
      productionAssignedDate:
        officeInfo?.productionAssignedDate || null,
      productionStaff,
      productionAssignedBy: assignedBy,
    },
    customerAdviser: {
      name: getString(adviser?.name),
      username: getString(adviser?.username),
    },
    statuses: {
      design: getStatus(data?.statuses?.design),
      print: getStatus(data?.statuses?.print),
      cutting: getStatus(
        data?.statuses?.cutting,
        officeInfo.cuttingJob ? 'Pending' : 'Finished',
      ),
      production: getStatus(
        data?.statuses?.production,
        'Pending',
      ),
    },
    createdAt: data?.createdAt,
  }
}

const getSeconds = (value: unknown): number => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = Number((value as any).seconds)

    if (!Number.isNaN(seconds)) {
      return seconds
    }
  }

  return 0
}

const isPreviousWorkflowComplete = (
  job: ProductionJob,
): boolean => {
  if (
    job.officeInfo.designJob &&
    job.statuses.design !== 'Finished'
  ) {
    return false
  }

  if (
    job.officeInfo.printJob &&
    job.statuses.print !== 'Finished'
  ) {
    return false
  }

  if (
    job.officeInfo.cuttingJob &&
    job.statuses.cutting !== 'Finished'
  ) {
    return false
  }

  return true
}

function ProductionManager({
  user,
}: ProductionManagerProps) {
  const currentUser = user ?? {
    name: 'Production Manager',
    username: '',
    roles: [],
  }

  const [jobOrders, setJobOrders] = useState<ProductionJob[]>([])
  const [measurements, setMeasurements] = useState<ProductionJob[]>([])

  const [productionStaff, setProductionStaff] =
    useState<ProductionStaff[]>([])

  const [loading, setLoading] = useState(true)
  const [loadingStaff, setLoadingStaff] = useState(true)
  const [savingJob, setSavingJob] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [searchText, setSearchText] = useState('')
  const [reportDate, setReportDate] = useState(
    new Date().toISOString().split('T')[0],
  )
  const [expandedJob, setExpandedJob] = useState<string | null>(null)
  const [addingStaffJob, setAddingStaffJob] = useState<string | null>(null)

  const [assignmentDates, setAssignmentDates] =
    useState<Record<string, string>>({})

  const [selectedStaff, setSelectedStaff] =
    useState<Record<string, string[]>>({})

  /* =====================================================
     LOAD JOB ORDERS
  ====================================================== */

  useEffect(() => {
    const reference = collection(db, 'job_orders')

    const jobsQuery = query(
      reference,
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const loadedJobs = snapshot.docs
          .map((document) =>
            createProductionJob(
              document.id,
              document.data(),
              'job_order',
            ),
          )
          .filter(
            (job): job is ProductionJob =>
              job !== null,
          )

        setJobOrders(loadedJobs)
        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Error loading job orders:',
          firebaseError,
        )

        setError(
          'Unable to load job orders.',
        )

        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  /* =====================================================
     LOAD MEASUREMENTS
  ====================================================== */

  useEffect(() => {
    const reference = collection(db, 'measurements')

    const jobsQuery = query(
      reference,
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      jobsQuery,
      (snapshot) => {
        const loadedJobs = snapshot.docs
          .map((document) =>
            createProductionJob(
              document.id,
              document.data(),
              'measurement',
            ),
          )
          .filter(
            (job): job is ProductionJob =>
              job !== null,
          )

        setMeasurements(loadedJobs)
        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Error loading measurements:',
          firebaseError,
        )

        setError(
          'Unable to load measurements.',
        )

        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  /* =====================================================
     LOAD PRODUCTION STAFF
  ====================================================== */

  useEffect(() => {
    let cancelled = false

    const fetchProductionStaff = async () => {
      setLoadingStaff(true)

      try {
        const usersRef = collection(db, 'users')

        let snapshot = await getDocs(
          query(
            usersRef,
            where(
              'roles',
              'array-contains',
              'production',
            ),
          ),
        )

        /*
         * Backward compatibility for records that use
         * "Production" instead of "production".
         */
        if (snapshot.empty) {
          snapshot = await getDocs(
            query(
              usersRef,
              where(
                'roles',
                'array-contains',
                'Production',
              ),
            ),
          )
        }

        const staff = snapshot.docs
          .map((document) => {
            const data = document.data()

            return {
              id: document.id,
              name: getString(data?.name),
              username: getString(
                data?.username,
              ),
            }
          })
          .filter(
            (staffMember) =>
              !!staffMember.name ||
              !!staffMember.username,
          )
          .sort((a, b) =>
            a.name.localeCompare(b.name),
          )

        if (!cancelled) {
          setProductionStaff(staff)
          setError('')
        }
      } catch (firebaseError) {
        console.error(
          'Error loading production staff:',
          firebaseError,
        )

        if (!cancelled) {
          setError(
            'Unable to load production staff from Firebase.',
          )
        }
      } finally {
        if (!cancelled) {
          setLoadingStaff(false)
        }
      }
    }

    fetchProductionStaff()

    return () => {
      cancelled = true
    }
  }, [])

  /* =====================================================
     COMBINE AVAILABLE PRODUCTION JOBS
  ====================================================== */

  const jobs = useMemo(() => {
    return [
      ...jobOrders,
      ...measurements,
    ]
      .filter(isPreviousWorkflowComplete)
      .sort(
        (a, b) =>
          getSeconds(b.createdAt) -
          getSeconds(a.createdAt),
      )
  }, [jobOrders, measurements])

  /* =====================================================
     SEARCH
  ====================================================== */

  const filteredJobs = useMemo(() => {
    const search = searchText.trim().toLowerCase()

    if (!search) {
      return jobs
    }

    return jobs.filter((job) => {
      const searchable = [
        job.orderId,
        job.date,
        job.expectedDeliveryDate,
        job.branch,
        job.customer.name,
        job.customer.companyName,
        job.customer.phoneNumber,
        job.customer.whatsappNumber,
        job.customer.place,
        job.customerAdviser.name,
        job.customerAdviser.username,
        job.officeInfo.designer || '',
        job.officeInfo.printBranch || '',
        job.officeInfo.cuttingBranch || '',
        job.officeInfo.productionBranch || '',
        job.officeInfo.productionStaff
          ?.map(
            (staff) =>
              `${staff.name} ${staff.username}`,
          )
          .join(' ') || '',
        ...job.items.flatMap((item) => [
          item.name || '',
          item.width || '',
          item.height || '',
          item.qty || '',
          item.remarks || '',
        ]),
      ]
        .join(' ')
        .toLowerCase()

      return searchable.includes(search)
    })
  }, [jobs, searchText])

  /* =====================================================
     PRINT REPORT
  ====================================================== */

  const reportJobs = useMemo(() => {
    if (!reportDate) {
      return []
    }

    return jobs
      .filter(
        (job) =>
          job.officeInfo.productionAssignedDate === reportDate,
      )
      .sort((a, b) => {
        const aId = a.orderId || ''
        const bId = b.orderId || ''
        return aId.localeCompare(bId, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      })
  }, [jobs, reportDate])

  const getWorkNames = (job: ProductionJob) => {
    const names = job.items
      .map((item) => item.name?.trim())
      .filter((name): name is string => !!name)

    return names.length > 0 ? names.join(', ') : '-'
  }

  const getAssignedStaffNames = (job: ProductionJob) => {
    const names =
      job.officeInfo.productionStaff
        ?.map((staff) => staff.name || staff.username)
        .filter(Boolean) || []

    return names.length > 0 ? names.join(', ') : 'Not assigned'
  }

  const handlePrintReport = () => {
    if (!reportDate) {
      setError('Please select a date before printing.')
      return
    }

    setError('')
    setTimeout(() => window.print(), 50)
  }

  /* =====================================================
     ASSIGNMENT HELPERS
  ====================================================== */

  const getJobKey = (job: ProductionJob) =>
    `${job.source}-${job.id}`

  const getInitialDate = (job: ProductionJob) => {
    const existingDate =
      job.officeInfo.productionAssignedDate

    if (existingDate) {
      return existingDate
    }

    const today = new Date()

    return today.toISOString().split('T')[0]
  }

  const getSelectedStaffIds = (job: ProductionJob) => {
    const jobKey = getJobKey(job)

    if (selectedStaff[jobKey]) {
      return selectedStaff[jobKey]
    }

    return (
      job.officeInfo.productionStaff?.map(
        (staff) => staff.userId,
      ) || []
    )
  }

  const initializeAssignmentState = (
    job: ProductionJob,
  ) => {
    const jobKey = getJobKey(job)

    setAssignmentDates((previous) => ({
      ...previous,
      [jobKey]:
        previous[jobKey] ||
        getInitialDate(job),
    }))

    setSelectedStaff((previous) => ({
      ...previous,
      [jobKey]:
        previous[jobKey] ||
        getSelectedStaffIds(job),
    }))
  }

  const toggleStaff = (
    job: ProductionJob,
    staffId: string,
  ) => {
    const jobKey = getJobKey(job)
    const current = getSelectedStaffIds(job)

    const updated = current.includes(staffId)
      ? current.filter((id) => id !== staffId)
      : [...current, staffId]

    setSelectedStaff((previous) => ({
      ...previous,
      [jobKey]: updated,
    }))
  }

  const removeStaff = (
    job: ProductionJob,
    staffId: string,
  ) => {
    const jobKey = getJobKey(job)
    const current = getSelectedStaffIds(job)

    setSelectedStaff((previous) => ({
      ...previous,
      [jobKey]: current.filter(
        (id) => id !== staffId,
      ),
    }))
  }

  /* =====================================================
     SAVE ASSIGNMENT
  ====================================================== */

  const handleSaveAssignment = async (
    job: ProductionJob,
  ) => {
    const jobKey = getJobKey(job)
    const selectedIds = getSelectedStaffIds(job)
    const assignmentDate =
      assignmentDates[jobKey] ||
      getInitialDate(job)

    if (!assignmentDate) {
      setError(
        'Please select an assignment date.',
      )
      return
    }

    if (selectedIds.length === 0) {
      setError(
        'Please select at least one production staff member.',
      )
      return
    }

    const selectedAssignments: ProductionAssignment[] =
      productionStaff
        .filter((staff) =>
          selectedIds.includes(staff.id),
        )
        .map((staff) => ({
          userId: staff.id,
          name: staff.name,
          username: staff.username,
        }))

    if (selectedAssignments.length === 0) {
      setError(
        'The selected production staff could not be found. Please select again.',
      )
      return
    }

    setSavingJob(jobKey)
    setError('')
    setMessage('')

    try {
      const collectionName =
        job.source === 'measurement'
          ? 'measurements'
          : 'job_orders'

      const jobReference = doc(
        db,
        collectionName,
        job.id,
      )

      await updateDoc(jobReference, {
        'officeInfo.productionAssignedDate':
          assignmentDate,

        'officeInfo.productionStaff':
          selectedAssignments,

        'officeInfo.productionAssignedBy': {
          name: currentUser.name,
          username: currentUser.username,
        },

        'officeInfo.productionAssignmentUpdatedAt':
          Timestamp.now(),
      })

      setMessage(
        `${job.orderId} assigned successfully to ${selectedAssignments.length} production staff member${selectedAssignments.length !== 1 ? 's' : ''}.`,
      )
    } catch (firebaseError) {
      console.error(
        'Error assigning production job:',
        firebaseError,
      )

      setError(
        'Unable to save the production assignment.',
      )
    } finally {
      setSavingJob(null)
    }
  }

  /* =====================================================
     RENDER
  ====================================================== */

  if (loading) {
    return (
      <div className="department-page">
        <div className="department-container">
          <div className="department-header">
            <div>
              <h1>Production Manager</h1>
              <p>
                Loading production jobs...
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="department-page">
      <style>{`
        .production-print-report {
          display: none;
        }

        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm;
          }

          html,
          body {
            background: #fff !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          body * {
            visibility: hidden !important;
          }

          .production-print-report,
          .production-print-report * {
            visibility: visible !important;
          }

          .production-print-report {
            display: block !important;
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: #fff;
            color: #000;
            font-family: Arial, Helvetica, sans-serif;
          }

          .production-print-title {
            text-align: center;
            margin-bottom: 4px;
            font-size: 18px;
            font-weight: 700;
          }

          .production-print-date {
            text-align: center;
            margin-bottom: 12px;
            font-size: 12px;
          }

          .production-print-table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
            font-size: 10px;
          }

          .production-print-table th,
          .production-print-table td {
            border: 1px solid #000;
            padding: 6px 5px;
            vertical-align: top;
            word-break: break-word;
          }

          .production-print-table th {
            font-weight: 700;
            text-align: center;
          }

          .production-print-table th:nth-child(1) {
            width: 17%;
          }

          .production-print-table th:nth-child(2) {
            width: 19%;
          }

          .production-print-table th:nth-child(3) {
            width: 16%;
          }

          .production-print-table th:nth-child(4) {
            width: 28%;
          }

          .production-print-table th:nth-child(5) {
            width: 20%;
          }

          .production-print-table tr {
            page-break-inside: avoid;
          }

          .production-print-empty {
            text-align: center;
            padding: 20px;
          }
        }
      `}</style>

      <div className="production-print-report">
        <div className="production-print-title">
          Production Work Report
        </div>

        <div className="production-print-date">
          Date: {reportDate ? formatDate(reportDate) : '-'}
        </div>

        <table className="production-print-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Phone Number</th>
              <th>Name of Works</th>
              <th>Assigned To</th>
            </tr>
          </thead>

          <tbody>
            {reportJobs.length === 0 ? (
              <tr>
                <td
                  className="production-print-empty"
                  colSpan={5}
                >
                  No production work assigned for this date.
                </td>
              </tr>
            ) : (
              reportJobs.map((job) => (
                <tr key={getJobKey(job)}>
                  <td>{job.orderId || '-'}</td>
                  <td>{job.customer.name || '-'}</td>
                  <td>{job.customer.phoneNumber || '-'}</td>
                  <td>{getWorkNames(job)}</td>
                  <td>{getAssignedStaffNames(job)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="department-container">
        <div className="department-header">
          <div>
            <h1>Production Manager</h1>
            <p>
              Assign completed upstream jobs to production staff.
            </p>
          </div>
        </div>

        {/* =====================================================
            DATE FILTER + PRINT REPORT
        ====================================================== */}
        <section
          className="department-section"
          style={{
            marginBottom: '18px',
            border: '1px solid #dbe4ef',
            borderRadius: '12px',
            background: '#f8fafc',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div className="input-group" style={{ minWidth: '220px' }}>
              <label htmlFor="production-report-date">
                Select Date
              </label>
              <input
                id="production-report-date"
                type="date"
                value={reportDate}
                onChange={(event) =>
                  setReportDate(event.target.value)
                }
              />
              <small>
                Print the production work assigned on this date.
              </small>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  background: '#fff',
                  fontWeight: 700,
                }}
              >
                {reportJobs.length} work
                {reportJobs.length !== 1 ? 's' : ''} found
              </div>

              <button
                type="button"
                className="submit-job-button"
                onClick={handlePrintReport}
                disabled={!reportDate}
              >
                Print A4 Report
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div
            className="form-message"
            style={{ marginBottom: '15px' }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            className="form-message"
            style={{
              marginBottom: '15px',
              background: '#dcfce7',
              color: '#166534',
            }}
          >
            {message}
          </div>
        )}

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>Production Assignments</h2>
              <p>
                Only jobs whose selected Design, Printing, and Cutting stages are finished are available here.
              </p>
            </div>
          </div>

          <div className="sales-filters">
            <div className="filter-group">
              <label htmlFor="production-manager-search">
                Search
              </label>
              <input
                id="production-manager-search"
                type="text"
                placeholder="Search order, customer, phone, item..."
                value={searchText}
                onChange={(event) =>
                  setSearchText(event.target.value)
                }
              />
            </div>

            <div className="filter-group">
              <label>
                Production Staff Available
              </label>
              <div
                style={{
                  padding: '10px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  background: '#f8fafc',
                  fontWeight: 700,
                }}
              >
                {loadingStaff
                  ? 'Loading...'
                  : productionStaff.length}
              </div>
            </div>
          </div>
        </section>

        {filteredJobs.length === 0 && (
          <section className="department-section">
            <div className="empty-items">
              <h3>
                No Production Jobs Available
              </h3>
              <p>
                A job appears here only when Production is selected and every other selected workflow stage is finished.
              </p>
            </div>
          </section>
        )}

        <div className="statistics-orders-list">
          {filteredJobs.map((job) => {
            const jobKey = getJobKey(job)
            const isExpanded =
              expandedJob === jobKey

            const selectedIds =
              getSelectedStaffIds(job)

            const assignmentDate =
              assignmentDates[jobKey] ||
              getInitialDate(job)

            const selectedStaffObjects =
              productionStaff.filter((staff) =>
                selectedIds.includes(staff.id),
              )

            return (
              <section
                className="statistics-order-card"
                key={jobKey}
              >
                <div className="statistics-order-header">
                  <div>
                    <div className="job-order-id">
                      {job.source === 'measurement'
                        ? 'Measurement ID'
                        : 'Order ID'}
                      : {job.orderId}
                    </div>

                    <h3>
                      {job.customer.name ||
                        'Unnamed Customer'}
                    </h3>

                    <p>
                      {job.customer.companyName ||
                        'No company name'}
                    </p>
                  </div>

                  <div className="statistics-order-meta">
                    <span>
                      Source:{' '}
                      {job.source === 'measurement'
                        ? 'Measurement'
                        : 'Job Order'}
                    </span>

                    <span>
                      Entry Date:{' '}
                      {formatDate(job.date)}
                    </span>

                    <span>
                      Expected Delivery:{' '}
                      {formatDate(
                        job.expectedDeliveryDate,
                      )}
                    </span>
                  </div>
                </div>

                <div className="statistics-order-summary">
                  <div>
                    <strong>Adviser</strong>
                    <span>
                      {job.customerAdviser.name ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>Design</strong>
                    <span>
                      {job.officeInfo.designJob
                        ? job.statuses.design
                        : 'Not Required'}
                    </span>
                  </div>

                  <div>
                    <strong>Printing</strong>
                    <span>
                      {job.officeInfo.printJob
                        ? job.statuses.print
                        : 'Not Required'}
                    </span>
                  </div>

                  <div>
                    <strong>Cutting</strong>
                    <span>
                      {job.officeInfo.cuttingJob
                        ? job.statuses.cutting
                        : 'Not Required'}
                    </span>
                  </div>

                  <div>
                    <strong>Production</strong>
                    <span>
                      {job.statuses.production}
                    </span>
                  </div>
                </div>

                <div className="statistics-order-actions">
                  <button
                    type="button"
                    className="view-button"
                    onClick={() => {
                      const nextExpanded =
                        isExpanded
                          ? null
                          : jobKey

                      setExpandedJob(
                        nextExpanded,
                      )

                      if (!isExpanded) {
                        initializeAssignmentState(
                          job,
                        )
                      }
                    }}
                  >
                    {isExpanded
                      ? 'Hide Details'
                      : 'View Details'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="statistics-order-details">
                    {/* =============================
                        TOP INFORMATION
                    ============================== */}
                    <h4>Job Information</h4>

                    <div className="details-grid">
                      <div>
                        <strong>
                          Order / Measurement ID
                        </strong>
                        <span>{job.orderId}</span>
                      </div>

                      <div>
                        <strong>Customer</strong>
                        <span>
                          {job.customer.name || '-'}
                        </span>
                      </div>

                      <div>
                        <strong>Company</strong>
                        <span>
                          {job.customer.companyName ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>Phone</strong>
                        <span>
                          {job.customer.phoneNumber ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>WhatsApp</strong>
                        <span>
                          {job.customer.whatsappNumber ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>Place</strong>
                        <span>
                          {job.customer.place || '-'}
                        </span>
                      </div>

                      <div>
                        <strong>Entry Date</strong>
                        <span>{formatDate(job.date)}</span>
                      </div>

                      <div>
                        <strong>Expected Delivery</strong>
                        <span>
                          {formatDate(
                            job.expectedDeliveryDate,
                          )}
                        </span>
                      </div>
                    </div>

                    {/* =============================
                        ITEMS
                    ============================== */}
                    <h4 style={{ marginTop: '25px' }}>
                      Items
                    </h4>

                    {job.items.length === 0 ? (
                      <div className="empty-items">
                        No items available.
                      </div>
                    ) : (
                      <div className="items-table-wrapper">
                        <table className="items-table">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Item</th>
                              <th>Width</th>
                              <th>Height</th>
                              <th>Qty</th>
                              <th>Price</th>
                              <th>Remarks</th>
                              <th>Image</th>
                            </tr>
                          </thead>

                          <tbody>
                            {job.items.map(
                              (item, index) => {
                                const image =
                                  item.imageUrl ||
                                  item.image

                                return (
                                  <tr
                                    key={`${jobKey}-item-${index}`}
                                  >
                                    <td className="sl-number">
                                      {item.slNo ??
                                        index + 1}
                                    </td>
                                    <td>
                                      {item.name || '-'}
                                    </td>
                                    <td>
                                      {item.width || '-'}
                                    </td>
                                    <td>
                                      {item.height || '-'}
                                    </td>
                                    <td>
                                      {item.qty || '-'}
                                    </td>
                                    <td>
                                      {item.price || '-'}
                                    </td>
                                    <td>
                                      {item.remarks || '-'}
                                    </td>
                                    <td>
                                      {image ? (
                                        <a
                                          href={image}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <img
                                            src={image}
                                            alt={
                                              item.name ||
                                              'Item'
                                            }
                                            style={{
                                              width: '70px',
                                              height: '70px',
                                              objectFit: 'cover',
                                              borderRadius: '8px',
                                              border:
                                                '1px solid #ddd',
                                            }}
                                          />
                                        </a>
                                      ) : (
                                        <span>No image</span>
                                      )}
                                    </td>
                                  </tr>
                                )
                              },
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* =============================
                        WORKFLOW STATUS
                    ============================== */}
                    <h4 style={{ marginTop: '25px' }}>
                      Workflow Status
                    </h4>

                    <div className="job-status-section">
                      <div className="status-box">
                        <label>Design</label>
                        <div className="status-value">
                          {job.officeInfo.designJob
                            ? job.statuses.design
                            : 'Not Required'}
                        </div>
                      </div>

                      <div className="status-box">
                        <label>Printing</label>
                        <div className="status-value">
                          {job.officeInfo.printJob
                            ? job.statuses.print
                            : 'Not Required'}
                        </div>
                      </div>

                      <div className="status-box">
                        <label>Cutting</label>
                        <div className="status-value">
                          {job.officeInfo.cuttingJob
                            ? job.statuses.cutting
                            : 'Not Required'}
                        </div>
                      </div>

                      <div className="status-box">
                        <label>Production</label>
                        <div className="status-value">
                          {job.statuses.production}
                        </div>
                      </div>
                    </div>

                    {/* =============================
                        ASSIGN PRODUCTION STAFF
                    ============================== */}
                    <h4 style={{ marginTop: '25px' }}>
                      Production Assignment
                    </h4>

                    <div
                      style={{
                        padding: '18px',
                        border: '1px solid #dbe4ef',
                        borderRadius: '10px',
                        background: '#f8fafc',
                      }}
                    >
                      <div className="form-grid">
                        <div className="input-group">
                          <label
                            htmlFor={`assignment-date-${jobKey}`}
                          >
                            Assign Date
                          </label>

                          <input
                            id={`assignment-date-${jobKey}`}
                            type="date"
                            value={assignmentDate}
                            onChange={(event) =>
                              setAssignmentDates(
                                (previous) => ({
                                  ...previous,
                                  [jobKey]:
                                    event.target.value,
                                }),
                              )
                            }
                          />

                          <small>
                            Date on which the production staff should do the job.
                          </small>
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: '18px',
                        }}
                      >
                        <label
                          style={{
                            display: 'block',
                            marginBottom: '8px',
                            fontWeight: 700,
                          }}
                        >
                          Assign To
                        </label>

                        {loadingStaff ? (
                          <div className="empty-items">
                            Loading production staff...
                          </div>
                        ) : productionStaff.length === 0 ? (
                          <div
                            className="empty-items"
                            style={{ marginBottom: '12px' }}
                          >
                            No users with the Production role were found.
                          </div>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="add-item-button"
                              onClick={() =>
                                setAddingStaffJob((current) =>
                                  current === jobKey
                                    ? null
                                    : jobKey,
                                )
                              }
                            >
                              {addingStaffJob === jobKey
                                ? 'Close Staff List'
                                : '+ Add Production Staff'}
                            </button>

                            {addingStaffJob === jobKey && (
                              <div
                                style={{
                                  marginTop: '12px',
                                  display: 'grid',
                                  gridTemplateColumns:
                                    'repeat(auto-fit, minmax(240px, 1fr))',
                                  gap: '10px',
                                }}
                              >
                                {productionStaff
                                  .filter(
                                    (staff) =>
                                      !selectedIds.includes(
                                        staff.id,
                                      ),
                                  )
                                  .map((staff) => (
                                    <button
                                      key={staff.id}
                                      type="button"
                                      onClick={() =>
                                        toggleStaff(
                                          job,
                                          staff.id,
                                        )
                                      }
                                      style={{
                                        textAlign: 'left',
                                        padding: '12px 14px',
                                        border:
                                          '1px solid #cbd5e1',
                                        borderRadius: '9px',
                                        background: 'white',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      <strong>
                                        {staff.name ||
                                          staff.username}
                                      </strong>

                                      <small
                                        style={{
                                          display: 'block',
                                          color: '#64748b',
                                          marginTop: '3px',
                                        }}
                                      >
                                        {staff.username}
                                      </small>
                                    </button>
                                  ))}

                                {productionStaff.filter(
                                  (staff) =>
                                    !selectedIds.includes(
                                      staff.id,
                                    ),
                                ).length === 0 && (
                                  <div
                                    className="empty-items"
                                    style={{ gridColumn: '1 / -1' }}
                                  >
                                    All available production staff are already selected.
                                  </div>
                                )}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {/* SELECTED STAFF */}
                      <div
                        style={{
                          marginTop: '18px',
                        }}
                      >
                        <strong>
                          Selected Production Staff
                        </strong>

                        {selectedStaffObjects.length ===
                        0 ? (
                          <div
                            style={{
                              marginTop: '8px',
                              color: '#64748b',
                            }}
                          >
                            No staff selected.
                          </div>
                        ) : (
                          <div
                            style={{
                              display: 'flex',
                              gap: '8px',
                              flexWrap: 'wrap',
                              marginTop: '10px',
                            }}
                          >
                            {selectedStaffObjects.map(
                              (staff) => (
                                <div
                                  key={staff.id}
                                  style={{
                                    display: 'flex',
                                    alignItems:
                                      'center',
                                    gap: '8px',
                                    padding:
                                      '8px 10px',
                                    borderRadius:
                                      '8px',
                                    background:
                                      '#dbeafe',
                                    color:
                                      '#1e3a8a',
                                    fontWeight: 600,
                                  }}
                                >
                                  <span>
                                    {staff.name ||
                                      staff.username}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeStaff(
                                        job,
                                        staff.id,
                                      )
                                    }
                                    style={{
                                      border: 'none',
                                      background: 'transparent',
                                      color: '#1e40af',
                                      cursor: 'pointer',
                                      fontWeight: 800,
                                      padding: '0 3px',
                                    }}
                                    aria-label={`Remove ${staff.name}`}
                                  >
                                    ×
                                  </button>
                                </div>
                              ),
                            )}
                          </div>
                        )}
                      </div>

                      {/* EXISTING ASSIGNMENT INFO */}
                      {job.officeInfo.productionStaff &&
                        job.officeInfo.productionStaff
                          .length > 0 && (
                          <div
                            style={{
                              marginTop: '18px',
                              padding: '12px 14px',
                              borderRadius: '8px',
                              background: '#ecfdf5',
                              border:
                                '1px solid #bbf7d0',
                            }}
                          >
                            <strong>
                              Current Assignment
                            </strong>

                            <p
                              style={{
                                margin:
                                  '6px 0 0',
                                color: '#166534',
                              }}
                            >
                              {formatDate(
                                job.officeInfo
                                  .productionAssignedDate ||
                                  '',
                              )}{' '}
                              •{' '}
                              {job.officeInfo.productionStaff
                                .map(
                                  (staff) =>
                                    staff.name ||
                                    staff.username,
                                )
                                .join(', ')}
                            </p>

                            {job.officeInfo
                              .productionAssignedBy && (
                              <small
  style={{
    color: '#166534',
  }}
>
  Assigned by:{' '}
  {
    job.officeInfo
      .productionAssignedBy
      ?.username ||
    job.officeInfo
      .productionAssignedBy
      ?.name ||
    '-'
  }
</small>
                            )}
                          </div>
                        )}

                      <div
                        className="form-actions"
                        style={{
                          marginTop: '20px',
                        }}
                      >
                        <button
                          type="button"
                          className="submit-job-button"
                          disabled={
                            savingJob === jobKey ||
                            loadingStaff
                          }
                          onClick={() =>
                            handleSaveAssignment(job)
                          }
                        >
                          {savingJob === jobKey
                            ? 'Saving...'
                            : job.officeInfo
                                .productionStaff
                                ?.length
                              ? 'Update Assignment'
                              : 'Submit Assignment'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default ProductionManager
