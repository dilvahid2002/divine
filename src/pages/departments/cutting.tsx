import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface CuttingProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type CuttingFilter = 'all' | 'pending' | 'today' | 'late'
type SourceType = 'job_order' | 'measurement'
type JobStatus = 'Pending' | 'In Progress' | 'Finished'
type ItemCuttingStatus = 'pending' | 'finished' | 'na'

interface CuttingItem {
  slNo?: number
  name?: string
  width?: string | number
  height?: string | number
  length?: string | number
  breadth?: string | number
  depth?: string | number
  qty?: string | number
  quantity?: string | number
  price?: string | number
  remarks?: string
  image?: string
  imageUrl?: string
  cuttingStatus?: ItemCuttingStatus
  measurement?: unknown
  measurements?: unknown
  dimensions?: unknown
  size?: unknown
  [key: string]: unknown
}

interface Customer {
  name: string
  companyName: string
  phoneNumber: string
  whatsappNumber: string
  place: string
}

interface CuttingJob {
  id: string
  source: SourceType
  orderId: string
  measurementId?: string
  date: string
  expectedDeliveryDate: string
  branch: string
  customer: Customer
  items: CuttingItem[]
  officeInfo: {
    designJob: boolean
    printJob: boolean
    cuttingJob: boolean
    productionJob: boolean
    designer?: string | null
    designerUsername?: string | null
    cutting?: string | null
    cuttingUsername?: string | null
    cuttingBranch?: string | null
    printer?: string | null
    printerUsername?: string | null
    printBranch?: string | null
    productionBranch?: string | null
  }
  customerAdviser: {
    name: string
    username: string
  }
  quotation?: {
    status?: 'Pending' | 'Confirmed'
  }
  statuses: {
    design: JobStatus
    print: JobStatus
    cutting: JobStatus
    production: JobStatus
  }
  delivered: boolean
  createdAt?: unknown
}

const getTodayString = () => {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const asString = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }
  return ''
}

const asBoolean = (value: unknown): boolean => value === true

const getStatus = (
  value: unknown,
  fallback: JobStatus = 'Pending',
): JobStatus => {
  if (value === 'Pending' || value === 'In Progress' || value === 'Finished') {
    return value
  }
  return fallback
}

const getSeconds = (value: unknown): number => {
  if (typeof value === 'object' && value !== null && 'seconds' in value) {
    const seconds = Number((value as { seconds?: unknown }).seconds)
    return Number.isFinite(seconds) ? seconds : 0
  }
  return 0
}

const formatDate = (value: string): string => {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined)
  }

  if (isObject(value)) {
    const result: Record<string, unknown> = {}
    Object.entries(value).forEach(([key, child]) => {
      if (child !== undefined) {
        result[key] = stripUndefined(child)
      }
    })
    return result
  }

  return value
}

const makeFirestoreItems = (items: CuttingItem[]) =>
  stripUndefined(items) as Record<string, unknown>[]

const normalizeItem = (item: any, index: number): CuttingItem => ({
  ...item,
  slNo: typeof item?.slNo === 'number' ? item.slNo : index + 1,
  name: asString(item?.name),
  width: item?.width ?? '',
  height: item?.height ?? '',
  length: item?.length ?? item?.measurement?.length,
  breadth: item?.breadth ?? item?.measurement?.breadth,
  depth: item?.depth ?? item?.measurement?.depth,
  qty: item?.qty ?? item?.quantity ?? '',
  quantity: item?.quantity ?? item?.qty ?? '',
  price: item?.price ?? '',
  remarks: asString(item?.remarks),
  image: asString(item?.image) || undefined,
  imageUrl: asString(item?.imageUrl) || undefined,
  cuttingStatus:
    item?.cuttingStatus === 'finished'
      ? 'finished'
      : item?.cuttingStatus === 'na'
        ? 'na'
        : 'pending',
})

const createJob = (
  documentId: string,
  data: any,
  source: SourceType,
): CuttingJob | null => {
  const office = data?.officeInfo ?? {}

  if (office.cuttingJob !== true) {
    return null
  }

  const customer = data?.customer ?? {}
  const adviser = data?.customerAdviser ?? {}
  const rawItems = Array.isArray(data?.items) ? data.items : []

  const items = rawItems.map((item: any, index: number) =>
    normalizeItem(item, index),
  )

  const measurementId = asString(data?.measurementId)

  let orderId = asString(data?.orderId) || asString(data?.orderNumber)

  if (!orderId && source === 'measurement') {
    orderId = measurementId || `M-${documentId.slice(0, 6).toUpperCase()}`
  }

  if (!orderId) {
    orderId = documentId
  }

  const designJob = asBoolean(office.designJob)
  const printJob = asBoolean(office.printJob)
  const cuttingJob = asBoolean(office.cuttingJob)
  const productionJob = asBoolean(office.productionJob)

  return {
    id: documentId,
    source,
    orderId,
    measurementId: measurementId || undefined,
    date: asString(data?.date),
    expectedDeliveryDate: asString(
      data?.expectedDeliveryDate ?? data?.deliveryDate,
    ),
    branch: asString(data?.branch ?? data?.selectedBranch),
    customer: {
      name: asString(customer.name),
      companyName: asString(customer.companyName),
      phoneNumber: asString(customer.phoneNumber),
      whatsappNumber: asString(customer.whatsappNumber),
      place: asString(customer.place),
    },
    items,
    officeInfo: {
      designJob,
      printJob,
      cuttingJob,
      productionJob,
      designer: asString(office.designer) || null,
      designerUsername: asString(office.designerUsername) || null,
      cutting: asString(office.cutting) || null,
      cuttingUsername: asString(office.cuttingUsername) || null,
      cuttingBranch: asString(office.cuttingBranch) || null,
      printer: asString(office.printer) || null,
      printerUsername: asString(office.printerUsername) || null,
      printBranch: asString(office.printBranch) || null,
      productionBranch: asString(office.productionBranch) || null,
    },
    customerAdviser: {
      name: asString(adviser.name),
      username: asString(adviser.username),
    },
    quotation:
      source === 'measurement'
        ? {
            status:
              data?.quotation?.status === 'Confirmed'
                ? 'Confirmed'
                : 'Pending',
          }
        : undefined,
    statuses: {
      design: getStatus(
        data?.statuses?.design,
        designJob ? 'Pending' : 'Finished',
      ),
      print: getStatus(
        data?.statuses?.print,
        printJob ? 'Pending' : 'Finished',
      ),
      cutting: getStatus(
        data?.statuses?.cutting,
        cuttingJob ? 'Pending' : 'Finished',
      ),
      production: getStatus(
        data?.statuses?.production,
        productionJob ? 'Pending' : 'Finished',
      ),
    },
    delivered: data?.delivered === true,
    createdAt: data?.createdAt,
  }
}

const isCuttingAvailable = (job: CuttingJob): boolean => {
  if (!job.officeInfo.cuttingJob) return false

  // Measurement work starts only after quotation confirmation.
  if (
    job.source === 'measurement' &&
    job.quotation?.status !== 'Confirmed'
  ) {
    return false
  }

  // Design is the only upstream stage that blocks cutting.
  // Printing does NOT block cutting; both can run together after design.
  if (
    job.officeInfo.designJob &&
    job.statuses.design !== 'Finished'
  ) {
    return false
  }

  return true
}

const isAssignedToUser = (
  job: CuttingJob,
  user: { name: string; username: string },
): boolean => {
  if (job.officeInfo.cuttingUsername && user.username) {
    return job.officeInfo.cuttingUsername === user.username
  }

  return Boolean(job.officeInfo.cutting) && job.officeInfo.cutting === user.name
}

const hasStartedCuttingWork = (job: CuttingJob): boolean =>
  job.items.some(
    (item) =>
      item.cuttingStatus === 'finished' ||
      item.cuttingStatus === 'na',
  )

const areAllItemsFinished = (job: CuttingJob): boolean => {
  if (job.items.length === 0) return false
  return job.items.every(
    (item) =>
      item.cuttingStatus === 'finished' ||
      item.cuttingStatus === 'na',
  )
}

const getJobKey = (job: CuttingJob) => `${job.source}-${job.id}`

function Cutting({ user }: CuttingProps) {
  const currentUser = user ?? {
    name: '',
    username: '',
    roles: [],
  }

  const [jobOrders, setJobOrders] = useState<CuttingJob[]>([])
  const [measurements, setMeasurements] = useState<CuttingJob[]>([])
  const [loadingJobOrders, setLoadingJobOrders] = useState(true)
  const [loadingMeasurements, setLoadingMeasurements] = useState(true)
  const [error, setError] = useState('')
  const [showAllWork, setShowAllWork] = useState(false)
  const [activeFilter, setActiveFilter] = useState<CuttingFilter>('pending')
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null)
  const [acceptingOrder, setAcceptingOrder] = useState<string | null>(null)
  const [savingItem, setSavingItem] = useState<string | null>(null)
  const [finishingOrder, setFinishingOrder] = useState<string | null>(null)

  /* =========================================================
     FETCH JOB ORDERS
  ========================================================== */
  useEffect(() => {
    const reference = collection(db, 'job_orders')
    const jobsQuery = query(reference, orderBy('createdAt', 'desc'))

    return onSnapshot(
      jobsQuery,
      (snapshot) => {
        const jobs = snapshot.docs
          .map((document) =>
            createJob(document.id, document.data(), 'job_order'),
          )
          .filter((job): job is CuttingJob => job !== null)

        setJobOrders(jobs)
        setLoadingJobOrders(false)
      },
      (firebaseError) => {
        console.error('Error loading job orders:', firebaseError)
        setError('Unable to load job-order cutting work.')
        setLoadingJobOrders(false)
      },
    )
  }, [])

  /* =========================================================
     FETCH MEASUREMENTS
  ========================================================== */
  useEffect(() => {
    const reference = collection(db, 'measurements')
    const jobsQuery = query(reference, orderBy('createdAt', 'desc'))

    return onSnapshot(
      jobsQuery,
      (snapshot) => {
        const jobs = snapshot.docs
          .map((document) =>
            createJob(document.id, document.data(), 'measurement'),
          )
          .filter((job): job is CuttingJob => job !== null)

        setMeasurements(jobs)
        setLoadingMeasurements(false)
      },
      (firebaseError) => {
        console.error('Error loading measurements:', firebaseError)
        setError('Unable to load measurement cutting work.')
        setLoadingMeasurements(false)
      },
    )
  }, [])

  const loading = loadingJobOrders || loadingMeasurements

  /* =========================================================
     COMBINE BOTH SOURCES
  ========================================================== */
  const allCuttingJobs = useMemo(() => {
    return [...jobOrders, ...measurements]
      .filter(isCuttingAvailable)
      .filter((job) => job.statuses.cutting !== 'Finished')
      .sort((a, b) => getSeconds(b.createdAt) - getSeconds(a.createdAt))
  }, [jobOrders, measurements])

  /* =========================================================
     MY WORK / ALL WORK
  ========================================================== */
  const visibleOrders = useMemo(() => {
    if (showAllWork) return allCuttingJobs

    return allCuttingJobs.filter((job) =>
      isAssignedToUser(job, currentUser),
    )
  }, [allCuttingJobs, showAllWork, currentUser.name, currentUser.username])

  /* =========================================================
     COUNTS
  ========================================================== */
  const pendingCount = useMemo(
    () =>
      visibleOrders.filter((job) => !areAllItemsFinished(job)).length,
    [visibleOrders],
  )

  const todayCount = useMemo(() => {
    const today = getTodayString()
    return visibleOrders.filter(
      (job) =>
        job.expectedDeliveryDate === today &&
        !areAllItemsFinished(job),
    ).length
  }, [visibleOrders])

  const lateCount = useMemo(() => {
    const today = getTodayString()
    return visibleOrders.filter(
      (job) =>
        Boolean(job.expectedDeliveryDate) &&
        job.expectedDeliveryDate < today &&
        !areAllItemsFinished(job),
    ).length
  }, [visibleOrders])

  /* =========================================================
     FILTER
  ========================================================== */
  const filteredOrders = useMemo(() => {
    const today = getTodayString()

    switch (activeFilter) {
      case 'today':
        return visibleOrders.filter(
          (job) =>
            job.expectedDeliveryDate === today &&
            !areAllItemsFinished(job),
        )
      case 'late':
        return visibleOrders.filter(
          (job) =>
            Boolean(job.expectedDeliveryDate) &&
            job.expectedDeliveryDate < today &&
            !areAllItemsFinished(job),
        )
      case 'pending':
        return visibleOrders.filter((job) => !areAllItemsFinished(job))
      case 'all':
      default:
        return visibleOrders
    }
  }, [visibleOrders, activeFilter])

  const handleFilterClick = (filter: CuttingFilter) => {
    setActiveFilter(filter)
    setExpandedOrder(null)
    setError('')
  }

  /* =========================================================
     ACCEPT WORK
  ========================================================== */
  const handleAcceptWork = async (job: CuttingJob) => {
    const jobKey = getJobKey(job)

    if (acceptingOrder === jobKey) return

    if (!isCuttingAvailable(job)) {
      alert(
        'This cutting job is not ready yet. Design must be finished first, while Printing can run at the same time.',
      )
      return
    }

    if (
      job.officeInfo.cuttingUsername &&
      !isAssignedToUser(job, currentUser)
    ) {
      alert('This cutting job is already assigned to another worker.')
      return
    }

    if (
      hasStartedCuttingWork(job) &&
      !isAssignedToUser(job, currentUser)
    ) {
      alert('This cutting work has already started.')
      return
    }

    setAcceptingOrder(jobKey)
    setError('')

    try {
      const collectionName =
        job.source === 'measurement' ? 'measurements' : 'job_orders'

      await updateDoc(doc(db, collectionName, job.id), {
        'officeInfo.cutting': currentUser.name,
        'officeInfo.cuttingUsername': currentUser.username,
        'statuses.cutting': 'In Progress',
      })
    } catch (firebaseError) {
      console.error('Error accepting cutting work:', firebaseError)
      setError(
        firebaseError instanceof Error
          ? `Unable to accept this work: ${firebaseError.message}`
          : 'Unable to accept this work.',
      )
    } finally {
      setAcceptingOrder(null)
    }
  }

  /* =========================================================
     UPDATE INDIVIDUAL ITEM
  ========================================================== */
  const handleItemStatus = async (
    job: CuttingJob,
    itemIndex: number,
    status: 'finished' | 'na',
  ) => {
    const itemKey = `${getJobKey(job)}-${itemIndex}`

    if (savingItem === itemKey) return

    if (!isAssignedToUser(job, currentUser)) {
      alert('Accept this work before updating the cutting items.')
      return
    }

    if (job.statuses.cutting === 'Finished') return

    if (!isCuttingAvailable(job)) {
      alert('This cutting work is not ready yet.')
      return
    }

    const currentItem = job.items[itemIndex]
    if (!currentItem) return

    if (
      currentItem.cuttingStatus === 'finished' ||
      currentItem.cuttingStatus === 'na'
    ) {
      return
    }

    const updatedItems = job.items.map((item, index) => {
      const normalized = normalizeItem(item, index)
      if (index === itemIndex) {
        normalized.cuttingStatus = status
      }
      return normalized
    })

    setSavingItem(itemKey)
    setError('')

    try {
      const collectionName =
        job.source === 'measurement' ? 'measurements' : 'job_orders'

      await updateDoc(doc(db, collectionName, job.id), {
        items: makeFirestoreItems(updatedItems),
        'statuses.cutting': 'In Progress',
        'officeInfo.cutting': currentUser.name,
        'officeInfo.cuttingUsername': currentUser.username,
      })
    } catch (firebaseError) {
      console.error('Error updating cutting item:', firebaseError)
      setError(
        firebaseError instanceof Error
          ? `Unable to update item status: ${firebaseError.message}`
          : 'Unable to update item status.',
      )
    } finally {
      setSavingItem(null)
    }
  }

  /* =========================================================
     FINISH ENTIRE CUTTING JOB
  ========================================================== */
  const handleFinishCutting = async (job: CuttingJob) => {
    const jobKey = getJobKey(job)

    if (!isAssignedToUser(job, currentUser)) {
      alert('Only the assigned cutting worker can finish this work.')
      return
    }

    if (!areAllItemsFinished(job)) {
      alert('Complete every item with ✓ Finished or NA before finishing the cutting job.')
      return
    }

    if (finishingOrder === jobKey) return

    setFinishingOrder(jobKey)
    setError('')

    try {
      const collectionName =
        job.source === 'measurement' ? 'measurements' : 'job_orders'

      const finalItems = job.items.map((item, index) =>
        normalizeItem(item, index),
      )

      await updateDoc(doc(db, collectionName, job.id), {
        items: makeFirestoreItems(finalItems),
        'statuses.cutting': 'Finished',
        'officeInfo.cutting': currentUser.name,
        'officeInfo.cuttingUsername': currentUser.username,
      })

      setExpandedOrder(null)
    } catch (firebaseError) {
      console.error('Error finishing cutting:', firebaseError)
      setError(
        firebaseError instanceof Error
          ? `Unable to finish cutting work: ${firebaseError.message}`
          : 'Unable to finish cutting work.',
      )
    } finally {
      setFinishingOrder(null)
    }
  }

  if (loading) {
    return (
      <div className="department-page">
        <div className="department-container">
          <div className="department-header">
            <div>
              <h1>Cutting Dashboard</h1>
              <p>Loading Job Orders and Measurements...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="department-page">
      <div className="department-container">
        <div className="department-header">
          <div>
            <h1>Cutting Dashboard</h1>
            <p>Cutting work • Design → Printing and Cutting simultaneously</p>
          </div>

          <button
            type="button"
            className={showAllWork ? 'add-item-button' : 'view-button'}
            onClick={() => {
              setShowAllWork((value) => !value)
              setExpandedOrder(null)
            }}
          >
            {showAllWork ? 'My Work' : 'Show All Work'}
          </button>
        </div>

        {error && <div className="form-message">{error}</div>}

        <div className="statistics-dashboard">
          <button
            type="button"
            className={activeFilter === 'all' ? 'statistics-card selected' : 'statistics-card'}
            onClick={() => handleFilterClick('all')}
          >
            <div className="statistics-card-label">All Work</div>
            <div className="statistics-card-value">{visibleOrders.length}</div>
            <div className="statistics-card-help">All active cutting jobs</div>
          </button>

          <button
            type="button"
            className={activeFilter === 'pending' ? 'statistics-card selected' : 'statistics-card'}
            onClick={() => handleFilterClick('pending')}
          >
            <div className="statistics-card-label">Pending</div>
            <div className="statistics-card-value">{pendingCount}</div>
            <div className="statistics-card-help">Cutting work pending</div>
          </button>

          <button
            type="button"
            className={activeFilter === 'today' ? 'statistics-card selected' : 'statistics-card'}
            onClick={() => handleFilterClick('today')}
          >
            <div className="statistics-card-label">Must Finish Today</div>
            <div className="statistics-card-value">{todayCount}</div>
            <div className="statistics-card-help">Expected today</div>
          </button>

          <button
            type="button"
            className={activeFilter === 'late' ? 'statistics-card selected' : 'statistics-card'}
            onClick={() => handleFilterClick('late')}
          >
            <div className="statistics-card-label">Late</div>
            <div className="statistics-card-value">{lateCount}</div>
            <div className="statistics-card-help">Past expected date</div>
          </button>
        </div>

        <div className="statistics-filter-bar">
          <div>
            <strong>Viewing:</strong>
            <span>
              {showAllWork ? ' All Cutting Workers' : ` ${currentUser.name}'s Work`}
            </span>
          </div>
          <div>
            <strong>Filter:</strong>
            <span>
              {activeFilter === 'pending'
                ? ' Pending'
                : activeFilter === 'today'
                  ? ' Must Finish Today'
                  : activeFilter === 'late'
                    ? ' Late'
                    : ' All Work'}
            </span>
          </div>
        </div>

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>Cutting Work</h2>
              <p>{filteredOrders.length} job{filteredOrders.length === 1 ? '' : 's'} found</p>
            </div>
          </div>

          {filteredOrders.length === 0 && (
            <div className="empty-items">
              <h3>No Cutting Work Found</h3>
              <p>
                This page reads both Job Orders and Measurements. When Design is selected, Design must be
                finished first. After that, Printing and Cutting can run at the same time.
              </p>
            </div>
          )}

          {filteredOrders.length > 0 && (
            <div className="statistics-orders-list">
              {filteredOrders.map((job) => {
                const jobKey = getJobKey(job)
                const isExpanded = expandedOrder === jobKey
                const assignedToMe = isAssignedToUser(job, currentUser)
                const workStarted = hasStartedCuttingWork(job)
                const allItemsDone = areAllItemsFinished(job)
                const cuttingFinished = job.statuses.cutting === 'Finished'

                return (
                  <div key={jobKey} className="statistics-order-card">
                    <div className="statistics-order-header">
                      <div>
                        <div className="job-order-id">
                          {job.source === 'measurement' ? 'Measurement ID' : 'Order ID'}: {job.orderId}
                        </div>
                        <h3>{job.customer.name || 'Unnamed Customer'}</h3>
                        <p>{job.customer.companyName || 'No company name'}</p>
                      </div>

                      <div className="statistics-order-meta">
                        <span>Source: {job.source === 'measurement' ? 'Measurement' : 'Job Order'}</span>
                        <span>Branch: {job.branch || '-'}</span>
                        <span>Delivery: {job.expectedDeliveryDate || '-'}</span>
                        <span>Cutting: {job.officeInfo.cutting || 'Unassigned'}</span>
                      </div>
                    </div>

                    <div className="statistics-order-summary">
                      <div>
                        <strong>Adviser</strong>
                        <span>{job.customerAdviser.name || '-'}</span>
                      </div>
                      <div>
                        <strong>Design</strong>
                        <span>{job.officeInfo.designJob ? job.statuses.design : 'Not Required'}</span>
                      </div>
                      <div>
                        <strong>Printing</strong>
                        <span>{job.officeInfo.printJob ? job.statuses.print : 'Not Required'}</span>
                      </div>
                      <div>
                        <strong>Cutting Status</strong>
                        <span>{job.statuses.cutting}</span>
                      </div>
                      <div>
                        <strong>Items</strong>
                        <span>{job.items.length}</span>
                      </div>
                    </div>

                    <div className="statistics-order-actions">
                      {showAllWork && !assignedToMe && !workStarted && !job.officeInfo.cuttingUsername && (
                        <button
                          type="button"
                          className="add-item-button"
                          disabled={acceptingOrder === jobKey}
                          onClick={() => handleAcceptWork(job)}
                        >
                          {acceptingOrder === jobKey ? 'Accepting...' : 'Accept Work'}
                        </button>
                      )}

                      {showAllWork && !assignedToMe && (workStarted || !!job.officeInfo.cuttingUsername) && (
                        <span
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: '#f1f5f9',
                            color: '#64748b',
                            fontSize: '13px',
                            fontWeight: 600,
                          }}
                        >
                          Already Assigned / Started
                        </span>
                      )}

                      {assignedToMe && !cuttingFinished && (
                        <span
                          style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            background: '#dbeafe',
                            color: '#1d4ed8',
                            fontSize: '13px',
                            fontWeight: 600,
                          }}
                        >
                          Assigned to You
                        </span>
                      )}

                      <button
                        type="button"
                        className="view-button"
                        onClick={() => setExpandedOrder(isExpanded ? null : jobKey)}
                      >
                        {isExpanded ? 'Hide Details' : 'View Details'}
                      </button>

                      {assignedToMe && !cuttingFinished && (
                        <button
                          type="button"
                          className={allItemsDone ? 'submit-job-button' : 'cancel-button'}
                          disabled={!allItemsDone || finishingOrder === jobKey}
                          onClick={() => handleFinishCutting(job)}
                        >
                          {finishingOrder === jobKey
                            ? 'Finishing...'
                            : allItemsDone
                              ? 'Finish Cutting'
                              : 'Complete All Items'}
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div className="statistics-order-details">
                        <h4>Customer Details</h4>
                        <div className="details-grid">
                          <div><strong>Customer</strong><span>{job.customer.name || '-'}</span></div>
                          <div><strong>Company</strong><span>{job.customer.companyName || '-'}</span></div>
                          <div><strong>Phone</strong><span>{job.customer.phoneNumber || '-'}</span></div>
                          <div><strong>WhatsApp</strong><span>{job.customer.whatsappNumber || '-'}</span></div>
                          <div><strong>Place</strong><span>{job.customer.place || '-'}</span></div>
                          <div><strong>Source</strong><span>{job.source === 'measurement' ? 'Measurement' : 'Job Order'}</span></div>
                          <div><strong>Cutting Worker</strong><span>{job.officeInfo.cutting || 'Not assigned'}</span></div>
                        </div>

                        <h4>Workflow</h4>
                        <div className="job-status-section">
                          <div className="status-box">
                            <label>Design</label>
                            <div className="status-value">{job.officeInfo.designJob ? job.statuses.design : 'Not Required'}</div>
                          </div>
                          <div className="status-box">
                            <label>Printing</label>
                            <div className="status-value">{job.officeInfo.printJob ? job.statuses.print : 'Not Required'}</div>
                          </div>
                          <div className="status-box">
                            <label>Cutting</label>
                            <div className="status-value">{job.statuses.cutting}</div>
                          </div>
                          <div className="status-box">
                            <label>Production</label>
                            <div className="status-value">{job.officeInfo.productionJob ? job.statuses.production : 'Not Required'}</div>
                          </div>
                        </div>

                        <h4>Items for Cutting</h4>
                        <div className="items-table-wrapper">
                          <table className="items-table">
                            <thead>
                              <tr>
                                <th>#</th>
                                <th>Item</th>
                                <th>Width</th>
                                <th>Height</th>
                                <th>Qty</th>
                                <th>Remarks</th>
                                <th>Image</th>
                                <th>Cutting</th>
                              </tr>
                            </thead>
                            <tbody>
                              {job.items.map((item, itemIndex) => {
                                const itemKey = `${jobKey}-${itemIndex}`
                                const itemDone = item.cuttingStatus === 'finished'
                                const itemNA = item.cuttingStatus === 'na'
                                const image = item.imageUrl || item.image || ''

                                return (
                                  <tr key={itemKey}>
                                    <td className="sl-number">{item.slNo ?? itemIndex + 1}</td>
                                    <td><strong>{item.name || '-'}</strong></td>
                                    <td>{item.width !== undefined && item.width !== '' ? String(item.width) : '-'}</td>
                                    <td>{item.height !== undefined && item.height !== '' ? String(item.height) : '-'}</td>
                                    <td>{item.qty !== undefined && item.qty !== '' ? String(item.qty) : String(item.quantity ?? '-')}</td>
                                    <td>{item.remarks || '-'}</td>
                                    <td>
                                      {image ? (
                                        <a href={image} target="_blank" rel="noreferrer">
                                          <img
                                            src={image}
                                            alt={item.name || 'Item'}
                                            style={{
                                              width: '70px',
                                              height: '70px',
                                              objectFit: 'cover',
                                              borderRadius: '8px',
                                              border: '1px solid #ddd',
                                            }}
                                          />
                                        </a>
                                      ) : (
                                        <span>No image</span>
                                      )}
                                    </td>
                                    <td>
                                      <div
                                        style={{
                                          display: 'flex',
                                          gap: '6px',
                                          flexWrap: 'wrap',
                                        }}
                                      >
                                        <button
                                          type="button"
                                          disabled={
                                            !assignedToMe ||
                                            savingItem === itemKey ||
                                            itemDone ||
                                            itemNA ||
                                            cuttingFinished
                                          }
                                          onClick={() => handleItemStatus(job, itemIndex, 'na')}
                                          style={{
                                            border: '1px solid #cbd5e1',
                                            borderRadius: '7px',
                                            padding: '7px 10px',
                                            background: itemNA ? '#e2e8f0' : 'white',
                                            color: '#475569',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          NA
                                        </button>

                                        <button
                                          type="button"
                                          disabled={
                                            !assignedToMe ||
                                            savingItem === itemKey ||
                                            itemDone ||
                                            itemNA ||
                                            cuttingFinished
                                          }
                                          onClick={() => handleItemStatus(job, itemIndex, 'finished')}
                                          style={{
                                            border: '1px solid #86efac',
                                            borderRadius: '7px',
                                            padding: '7px 10px',
                                            background: itemDone ? '#dcfce7' : 'white',
                                            color: '#166534',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                          }}
                                        >
                                          ✓
                                        </button>
                                      </div>

                                      <div
                                        style={{
                                          marginTop: '6px',
                                          fontSize: '12px',
                                          color: itemDone
                                            ? '#15803d'
                                            : itemNA
                                              ? '#64748b'
                                              : '#f59e0b',
                                          fontWeight: 600,
                                        }}
                                      >
                                        {itemDone
                                          ? 'Cutting Finished'
                                          : itemNA
                                            ? 'Cutting NA'
                                            : 'Pending'}
                                      </div>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>

                        <div
                          style={{
                            marginTop: '20px',
                            padding: '15px',
                            borderRadius: '10px',
                            background: allItemsDone ? '#dcfce7' : '#f8fafc',
                            border: '1px solid #e2e8f0',
                          }}
                        >
                          <strong>Cutting Progress</strong>
                          <p style={{ margin: '6px 0 0', color: '#64748b' }}>
                            {allItemsDone
                              ? 'All items are completed. Finish Cutting is now enabled.'
                              : 'Each item has its own NA and ✓ controls. Complete every item before finishing the cutting job.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default Cutting
