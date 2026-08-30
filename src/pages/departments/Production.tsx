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

interface ProductionProps {
  user: {
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

type ProductionItemStatus =
  | 'pending'
  | 'finished'

type ProductionFilter =
  | 'today'
  | 'pending'

interface Item {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string
  image?: string
  imageUrl?: string
  productionStatus?: ProductionItemStatus
}

interface Customer {
  name: string
  companyName: string
  phoneNumber: string
  whatsappNumber: string
  place: string
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

    designer?: string
    designerUsername?: string

    printer?: string
    printerUsername?: string

    printBranch?: string
    cuttingBranch?: string
    productionBranch?: string

    productionAssignedDate?: string
    productionStaff: ProductionAssignment[]
    productionAssignedBy?: {
      name: string
      username: string
    }
    productionCompletedBy?: {
      name: string
      username: string
    }
    productionCompletedAt?: unknown
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

/* =========================================================
   HELPERS
========================================================= */

const getString = (value: unknown): string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
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

const getTodayString = (): string => {
  const today = new Date()

  return [
    String(today.getFullYear()),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')
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

const getSeconds = (value: unknown): number => {
  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = Number((value as any).seconds)

    return Number.isNaN(seconds)
      ? 0
      : seconds
  }

  return 0
}

/* =========================================================
   SAFE ITEM NORMALIZATION

   Important:
   Never put undefined into a Firestore update.
========================================================= */

const normalizeItem = (
  raw: any,
  index: number,
): Item => {
  const item: Item = {
    slNo:
      typeof raw?.slNo === 'number'
        ? raw.slNo
        : index + 1,

    name:
      getString(raw?.name),

    width:
      getString(raw?.width),

    height:
      getString(raw?.height),

    qty:
      getString(raw?.qty),

    price:
      getString(raw?.price),

    remarks:
      getString(raw?.remarks),
  }

  const image = getString(raw?.image)
  const imageUrl = getString(raw?.imageUrl)

  if (image) {
    item.image = image
  }

  if (imageUrl) {
    item.imageUrl = imageUrl
  }

  if (
    raw?.productionStatus ===
    'finished'
  ) {
    item.productionStatus =
      'finished'
  } else {
    item.productionStatus =
      'pending'
  }

  return item
}

const normalizeItems = (
  rawItems: unknown,
): Item[] => {
  if (!Array.isArray(rawItems)) {
    return []
  }

  return rawItems.map(
    (item: any, index: number) =>
      normalizeItem(item, index),
  )
}

/*
 * Build a Firestore-safe array from scratch.
 * No object spread is used here, so stale undefined
 * properties cannot be carried into updateDoc().
 */
const makeFirestoreItems = (
  items: Item[],
): Record<string, unknown>[] => {
  return items.map((item, index) => {
    const clean: Record<string, unknown> = {
      slNo:
        typeof item.slNo === 'number'
          ? item.slNo
          : index + 1,

      name:
        typeof item.name === 'string'
          ? item.name
          : '',

      width:
        typeof item.width === 'string'
          ? item.width
          : '',

      height:
        typeof item.height === 'string'
          ? item.height
          : '',

      qty:
        typeof item.qty === 'string'
          ? item.qty
          : '',

      price:
        typeof item.price === 'string'
          ? item.price
          : '',

      remarks:
        typeof item.remarks === 'string'
          ? item.remarks
          : '',

      productionStatus:
        item.productionStatus ===
        'finished'
          ? 'finished'
          : 'pending',
    }

    if (
      typeof item.image === 'string' &&
      item.image.trim() !== ''
    ) {
      clean.image = item.image
    }

    if (
      typeof item.imageUrl === 'string' &&
      item.imageUrl.trim() !== ''
    ) {
      clean.imageUrl = item.imageUrl
    }

    return clean
  })
}

/* =========================================================
   NORMALIZE STAFF
========================================================= */

const normalizeProductionStaff = (
  value: unknown,
): ProductionAssignment[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry: any) => {
      const result: ProductionAssignment = {
        userId:
          getString(entry?.userId),

        name:
          getString(entry?.name),

        username:
          getString(entry?.username),
      }

      return result
    })
    .filter(
      (entry) =>
        entry.userId !== '' ||
        entry.name !== '' ||
        entry.username !== '',
    )
}

/* =========================================================
   CREATE JOB
========================================================= */

const createProductionJob = (
  documentId: string,
  data: any,
  source: SourceType,
): ProductionJob | null => {
  const officeInfo =
    data?.officeInfo || {}

  if (
    officeInfo.productionJob !== true
  ) {
    return null
  }

  const customer =
    data?.customer || {}

  const adviser =
    data?.customerAdviser || {}

  const rawItems =
    Array.isArray(data?.items)
      ? data.items
      : []

  const items = normalizeItems(rawItems)

  let orderId =
    getString(data?.orderId)

  if (
    !orderId &&
    source === 'measurement'
  ) {
    orderId =
      getString(
        data?.measurementId,
      ) ||
      `M-${documentId
        .slice(0, 6)
        .toUpperCase()}`
  }

  if (!orderId) {
    orderId = documentId
  }

  const cuttingJob =
    getBoolean(
      officeInfo.cuttingJob,
    )

  const assignedBy =
    officeInfo.productionAssignedBy

  const completedBy =
    officeInfo.productionCompletedBy

  return {
    id: documentId,
    source,
    orderId,

    date:
      getString(data?.date),

    expectedDeliveryDate:
      getString(
        data?.expectedDeliveryDate,
      ),

    branch:
      getString(data?.branch),

    customer: {
      name:
        getString(customer?.name),

      companyName:
        getString(
          customer?.companyName,
        ),

      phoneNumber:
        getString(
          customer?.phoneNumber,
        ),

      whatsappNumber:
        getString(
          customer?.whatsappNumber,
        ),

      place:
        getString(customer?.place),
    },

    items,

    officeInfo: {
      designJob:
        getBoolean(
          officeInfo.designJob,
        ),

      printJob:
        getBoolean(
          officeInfo.printJob,
        ),

      productionJob:
        getBoolean(
          officeInfo.productionJob,
        ),

      cuttingJob,

      designer:
        getString(
          officeInfo.designer,
        ) || undefined,

      designerUsername:
        getString(
          officeInfo.designerUsername,
        ) || undefined,

      printer:
        getString(
          officeInfo.printer,
        ) || undefined,

      printerUsername:
        getString(
          officeInfo.printerUsername,
        ) || undefined,

      printBranch:
        getString(
          officeInfo.printBranch,
        ) || undefined,

      cuttingBranch:
        getString(
          officeInfo.cuttingBranch,
        ) || undefined,

      productionBranch:
        getString(
          officeInfo.productionBranch,
        ) || undefined,

      productionAssignedDate:
        getString(
          officeInfo.productionAssignedDate,
        ) || undefined,

      productionStaff:
        normalizeProductionStaff(
          officeInfo.productionStaff,
        ),

      productionAssignedBy:
        assignedBy
          ? {
              name:
                getString(
                  assignedBy.name,
                ),
              username:
                getString(
                  assignedBy.username,
                ),
            }
          : undefined,

      productionCompletedBy:
        completedBy
          ? {
              name:
                getString(
                  completedBy.name,
                ),
              username:
                getString(
                  completedBy.username,
                ),
            }
          : undefined,

      productionCompletedAt:
        officeInfo.productionCompletedAt,
    },

    customerAdviser: {
      name:
        getString(adviser?.name),

      username:
        getString(adviser?.username),
    },

    statuses: {
      design:
        getStatus(
          data?.statuses?.design,
          officeInfo.designJob
            ? 'Pending'
            : 'Finished',
        ),

      print:
        getStatus(
          data?.statuses?.print,
          officeInfo.printJob
            ? 'Pending'
            : 'Finished',
        ),

      cutting:
        getStatus(
          data?.statuses?.cutting,
          cuttingJob
            ? 'Pending'
            : 'Finished',
        ),

      production:
        getStatus(
          data?.statuses?.production,
        ),
    },

    createdAt:
      data?.createdAt,
  }
}

/* =========================================================
   CURRENT USER ASSIGNMENT
========================================================= */

const isAssignedToUser = (
  job: ProductionJob,
  user: ProductionProps['user'],
): boolean => {
  const staff =
    job.officeInfo.productionStaff

  return staff.some(
    (member) => {
      if (
        member.username &&
        user.username
      ) {
        return (
          member.username.trim() ===
          user.username.trim()
        )
      }

      if (
        member.name &&
        user.name
      ) {
        return (
          member.name.trim() ===
          user.name.trim()
        )
      }

      return false
    },
  )
}

/* =========================================================
   ITEM STATUS
========================================================= */

const isItemFinished = (
  item: Item,
): boolean =>
  item.productionStatus ===
  'finished'

const areAllItemsFinished = (
  job: ProductionJob,
): boolean => {
  if (
    job.items.length === 0
  ) {
    return false
  }

  return job.items.every(
    (item) =>
      isItemFinished(item),
  )
}

/* =========================================================
   PRODUCTION COMPONENT
========================================================= */

function Production({
  user,
}: ProductionProps) {
  const [
    jobOrders,
    setJobOrders,
  ] = useState<ProductionJob[]>([])

  const [
    measurements,
    setMeasurements,
  ] = useState<ProductionJob[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    activeFilter,
    setActiveFilter,
  ] =
    useState<ProductionFilter>(
      'today',
    )

  const [
    searchText,
    setSearchText,
  ] = useState('')

  const [
    expandedJob,
    setExpandedJob,
  ] = useState<string | null>(null)

  const [
    savingItem,
    setSavingItem,
  ] = useState<string | null>(null)

  const [
    finishingJob,
    setFinishingJob,
  ] = useState<string | null>(null)

  /* =======================================================
     FETCH JOB ORDERS
  ======================================================== */

  useEffect(() => {
    const reference =
      collection(
        db,
        'job_orders',
      )

    const jobsQuery =
      query(
        reference,
        orderBy(
          'createdAt',
          'desc',
        ),
      )

    return onSnapshot(
      jobsQuery,
      (snapshot) => {
        const loaded =
          snapshot.docs
            .map(
              (document) =>
                createProductionJob(
                  document.id,
                  document.data(),
                  'job_order',
                ),
            )
            .filter(
              (
                job,
              ): job is ProductionJob =>
                job !== null,
            )

        setJobOrders(loaded)
        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Error loading job orders:',
          firebaseError,
        )

        setError(
          'Unable to load production job orders.',
        )

        setLoading(false)
      },
    )
  }, [])

  /* =======================================================
     FETCH MEASUREMENTS
  ======================================================== */

  useEffect(() => {
    const reference =
      collection(
        db,
        'measurements',
      )

    const jobsQuery =
      query(
        reference,
        orderBy(
          'createdAt',
          'desc',
        ),
      )

    return onSnapshot(
      jobsQuery,
      (snapshot) => {
        const loaded =
          snapshot.docs
            .map(
              (document) =>
                createProductionJob(
                  document.id,
                  document.data(),
                  'measurement',
                ),
            )
            .filter(
              (
                job,
              ): job is ProductionJob =>
                job !== null,
            )

        setMeasurements(loaded)
        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Error loading measurements:',
          firebaseError,
        )

        setError(
          'Unable to load measurement production jobs.',
        )

        setLoading(false)
      },
    )
  }, [])

  /* =======================================================
     ASSIGNED JOBS
  ======================================================== */

  const assignedJobs =
    useMemo(() => {
      return [
        ...jobOrders,
        ...measurements,
      ]
        .filter(
          (job) =>
            isAssignedToUser(
              job,
              user,
            ),
        )
        .sort(
          (a, b) =>
            getSeconds(
              b.createdAt,
            ) -
            getSeconds(
              a.createdAt,
            ),
        )
    }, [
      jobOrders,
      measurements,
      user.name,
      user.username,
    ])

  /* =======================================================
     FILTERED JOBS
  ======================================================== */

  const filteredJobs =
    useMemo(() => {
      const today =
        getTodayString()

      const search =
        searchText
          .trim()
          .toLowerCase()

      return assignedJobs.filter(
        (job) => {
          if (search) {
            const searchable = [
              job.orderId,
              job.date,
              job.expectedDeliveryDate,
              job.branch,
              job.officeInfo
                .productionAssignedDate ||
                '',
              job.customer.name,
              job.customer.companyName,
              job.customer.phoneNumber,
              job.customer.whatsappNumber,
              job.customer.place,
              ...job.items.flatMap(
                (item) => [
                  item.name,
                  item.width,
                  item.height,
                  item.qty,
                  item.price,
                  item.remarks,
                ],
              ),
            ]
              .join(' ')
              .toLowerCase()

            if (
              !searchable.includes(
                search,
              )
            ) {
              return false
            }
          }

          if (
            activeFilter ===
            'today'
          ) {
            if (
              job.officeInfo
                .productionAssignedDate !==
              today
            ) {
              return false
            }

            if (
              job.statuses.production ===
              'Finished'
            ) {
              return false
            }
          }

          if (
            activeFilter ===
            'pending'
          ) {
            if (
              job.statuses.production ===
              'Finished'
            ) {
              return false
            }
          }

          return true
        },
      )
    }, [
      assignedJobs,
      activeFilter,
      searchText,
    ])

  const todayCount =
    useMemo(() => {
      const today =
        getTodayString()

      return assignedJobs.filter(
        (job) =>
          job.officeInfo
            .productionAssignedDate ===
            today &&
          job.statuses.production !==
            'Finished',
      ).length
    }, [assignedJobs])

  const pendingCount =
    useMemo(
      () =>
        assignedJobs.filter(
          (job) =>
            job.statuses.production !==
            'Finished',
        ).length,
      [assignedJobs],
    )

  /* =======================================================
     FILTER BUTTONS
  ======================================================== */

  const handleFilterChange = (
    filter: ProductionFilter,
  ) => {
    setActiveFilter(
      filter,
    )

    setExpandedJob(null)
    setError('')
    setMessage('')
  }

  /* =======================================================
     MARK ONE ITEM FINISHED
     Based on the same pattern as Designer:
     update items + set overall status to In Progress.
  ======================================================== */

  const handleFinishItem = async (
    job: ProductionJob,
    itemIndex: number,
  ) => {
    const itemKey =
      `${job.source}-${job.id}-${itemIndex}`

    if (
      savingItem === itemKey ||
      job.statuses.production ===
        'Finished'
    ) {
      return
    }

    if (
      !isAssignedToUser(
        job,
        user,
      )
    ) {
      setError(
        'You are not assigned to this production job.',
      )
      return
    }

    const currentItem =
      job.items[itemIndex]

    if (!currentItem) {
      return
    }

    if (
      isItemFinished(
        currentItem,
      )
    ) {
      return
    }

    /*
     * IMPORTANT:
     * Rebuild every item as a clean object.
     * This prevents undefined values from being
     * passed to Firestore.
     */
    const updatedItems =
      job.items.map(
        (item, index) => {
          const copy =
            normalizeItem(
              {
                slNo:
                  item.slNo,
                name:
                  item.name,
                width:
                  item.width,
                height:
                  item.height,
                qty:
                  item.qty,
                price:
                  item.price,
                remarks:
                  item.remarks,
                image:
                  item.image,
                imageUrl:
                  item.imageUrl,
                productionStatus:
                  item.productionStatus,
              },
              index,
            )

          if (
            index === itemIndex
          ) {
            copy.productionStatus =
              'finished'
          }

          return copy
        },
      )

    const firestoreItems =
      makeFirestoreItems(
        updatedItems,
      )

    setSavingItem(
      itemKey,
    )

    setError('')
    setMessage('')

    try {
      const collectionName =
        job.source ===
        'measurement'
          ? 'measurements'
          : 'job_orders'

      const jobReference =
        doc(
          db,
          collectionName,
          job.id,
        )

      /*
       * Exactly like the Designer page:
       *
       * - save updated items
       * - mark overall work In Progress
       *
       * Do NOT mark the whole job Finished here.
       */
      await updateDoc(
        jobReference,
        {
          items:
            firestoreItems,

          'statuses.production':
            job.statuses.production ===
            'Pending'
              ? 'In Progress'
              : job.statuses.production,
        },
      )

      const allDone =
        updatedItems.length > 0 &&
        updatedItems.every(
          (item) =>
            item.productionStatus ===
            'finished',
        )

      setMessage(
        allDone
          ? `${job.orderId}: all items are finished. You can now complete the production job.`
          : `${job.orderId}: item ${itemIndex + 1} marked Finished.`,
      )
    } catch (
      firebaseError
    ) {
      console.error(
        'Error updating production item:',
        firebaseError,
      )

      setError(
        firebaseError instanceof
        Error
          ? `Unable to update production: ${firebaseError.message}`
          : 'Unable to update production item.',
      )
    } finally {
      setSavingItem(
        null,
      )
    }
  }

  /* =======================================================
     FINISH WHOLE JOB
  ======================================================== */

  const handleFinishProduction =
    async (
      job: ProductionJob,
    ) => {
      const jobKey =
        `${job.source}-${job.id}`

      if (
        finishingJob ===
        jobKey
      ) {
        return
      }

      if (
        !isAssignedToUser(
          job,
          user,
        )
      ) {
        setError(
          'You are not assigned to this production job.',
        )
        return
      }

      if (
        !areAllItemsFinished(
          job,
        )
      ) {
        alert(
          'Please mark every item Finished before completing the production job.',
        )
        return
      }

      if (
        job.statuses.production ===
        'Finished'
      ) {
        return
      }

      /*
       * Use the same safe item rebuild again.
       */
      const firestoreItems =
        makeFirestoreItems(
          job.items.map(
            (item, index) =>
              normalizeItem(
                {
                  slNo:
                    item.slNo,
                  name:
                    item.name,
                  width:
                    item.width,
                  height:
                    item.height,
                  qty:
                    item.qty,
                  price:
                    item.price,
                  remarks:
                    item.remarks,
                  image:
                    item.image,
                  imageUrl:
                    item.imageUrl,
                  productionStatus:
                    'finished',
                },
                index,
              ),
          ),
        )

      setFinishingJob(
        jobKey,
      )

      setError('')
      setMessage('')

      try {
        const collectionName =
          job.source ===
          'measurement'
            ? 'measurements'
            : 'job_orders'

        const jobReference =
          doc(
            db,
            collectionName,
            job.id,
          )

        /*
         * Final completion:
         *
         * items = all finished
         * statuses.production = Finished
         *
         * Store completion user as well.
         */
        await updateDoc(
          jobReference,
          {
            items:
              firestoreItems,

            'statuses.production':
              'Finished',

            'officeInfo.productionCompletedBy':
              {
                name:
                  user.name,

                username:
                  user.username,
              },

            'officeInfo.productionCompletedAt':
              Timestamp.now(),
          },
        )

        setMessage(
          `${job.orderId}: Production Finished successfully.`,
        )

        setExpandedJob(
          null,
        )
      } catch (
        firebaseError
      ) {
        console.error(
          'Error finishing production:',
          firebaseError,
        )

        setError(
          firebaseError instanceof
          Error
            ? `Unable to finish production: ${firebaseError.message}`
            : 'Unable to finish production.',
        )
      } finally {
        setFinishingJob(
          null,
        )
      }
    }

  /* =======================================================
     LOADING
  ======================================================== */

  if (loading) {
    return (
      <div className="department-page">
        <div className="department-container">
          <div className="department-header">
            <div>
              <h1>
                Production
              </h1>

              <p>
                Loading your production work...
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* =======================================================
     PAGE
  ======================================================== */

  return (
    <div className="department-page">
      <div className="department-container">

        <div className="department-header">
          <div>
            <h1>
              Production
            </h1>

            <p>
              Jobs assigned to {user.name}
              {user.username
                ? ` (${user.username})`
                : ''}
            </p>
          </div>
        </div>

        {error && (
          <div
            className="form-message"
            style={{
              marginBottom:
                '15px',
            }}
          >
            {error}
          </div>
        )}

        {message && (
          <div
            className="form-message"
            style={{
              marginBottom:
                '15px',
              background:
                '#dcfce7',
              color:
                '#166534',
            }}
          >
            {message}
          </div>
        )}

        {/* FILTERS */}

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                My Production Work
              </h2>

              <p>
                Only jobs assigned to you
                are shown here.
              </p>
            </div>
          </div>

          <div
            style={{
              display:
                'flex',
              gap:
                '10px',
              flexWrap:
                'wrap',
              marginTop:
                '15px',
            }}
          >
            <button
              type="button"
              className={
                activeFilter ===
                'today'
                  ? 'add-item-button'
                  : 'view-button'
              }
              onClick={() =>
                handleFilterChange(
                  'today',
                )
              }
            >
              Today ({todayCount})
            </button>

            <button
              type="button"
              className={
                activeFilter ===
                'pending'
                  ? 'add-item-button'
                  : 'view-button'
              }
              onClick={() =>
                handleFilterChange(
                  'pending',
                )
              }
            >
              All Pending ({pendingCount})
            </button>
          </div>

          <div
            className="sales-filters"
            style={{
              marginTop:
                '15px',
            }}
          >
            <div className="filter-group">
              <label htmlFor="production-search">
                Search
              </label>

              <input
                id="production-search"
                type="text"
                placeholder="Search order, customer, item..."
                value={
                  searchText
                }
                onChange={(event) =>
                  setSearchText(
                    event.target.value,
                  )
                }
              />
            </div>
          </div>
        </section>

        {/* EMPTY */}

        {filteredJobs.length ===
          0 && (
          <section className="department-section">
            <div className="empty-items">
              {assignedJobs.length ===
              0
                ? 'No production jobs have been assigned to you.'
                : activeFilter ===
                    'today'
                  ? 'No pending production jobs are assigned for today.'
                  : 'No pending production jobs found.'}
            </div>
          </section>
        )}

        {/* JOBS */}

        <div className="statistics-orders-list">
          {filteredJobs.map(
            (job) => {
              const jobKey =
                `${job.source}-${job.id}`

              const isExpanded =
                expandedJob ===
                jobKey

              const productionFinished =
                job.statuses.production ===
                'Finished'

              const allItemsFinished =
                areAllItemsFinished(
                  job,
                )

              const finishedCount =
                job.items.filter(
                  (item) =>
                    isItemFinished(
                      item,
                    ),
                ).length

              const assignedStaff =
                job.officeInfo
                  .productionStaff

              return (
                <section
                  key={jobKey}
                  className={
                    productionFinished
                      ? 'statistics-order-card delivered'
                      : 'statistics-order-card'
                  }
                >

                  {/* JOB HEADER */}

                  <div className="statistics-order-header">
                    <div>
                      <div className="job-order-id">
                        {job.source ===
                        'measurement'
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
                        Assigned:{' '}
                        {formatDate(
                          job.officeInfo
                            .productionAssignedDate ||
                            '',
                        )}
                      </span>

                      <span>
                        Delivery:{' '}
                        {formatDate(
                          job.expectedDeliveryDate,
                        )}
                      </span>

                      <span>
                        Staff:{' '}
                        {assignedStaff
                          .map(
                            (staff) =>
                              staff.name ||
                              staff.username,
                          )
                          .join(', ') ||
                        '-'}
                      </span>
                    </div>
                  </div>

                  {/* SUMMARY */}

                  <div className="statistics-order-summary">

                    <div>
                      <strong>
                        Customer
                      </strong>

                      <span>
                        {job.customer.name ||
                          '-'}
                      </span>
                    </div>

                    <div>
                      <strong>
                        Production Status
                      </strong>

                      <span>
                        {job.statuses.production}
                      </span>
                    </div>

                    <div>
                      <strong>
                        Items
                      </strong>

                      <span>
                        {finishedCount} /{' '}
                        {job.items.length}
                      </span>
                    </div>

                    <div>
                      <strong>
                        Assigned By
                      </strong>

                      <span>
                        {job.officeInfo
                          .productionAssignedBy
                          ?.username ||
                          job.officeInfo
                            .productionAssignedBy
                            ?.name ||
                          '-'}
                      </span>
                    </div>

                  </div>

                  {/* ACTIONS */}

                  <div className="statistics-order-actions">

                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        setExpandedJob(
                          isExpanded
                            ? null
                            : jobKey,
                        )
                      }
                    >
                      {isExpanded
                        ? 'Hide Details'
                        : 'View Details'}
                    </button>

                    {!productionFinished &&
                      allItemsFinished && (
                      <button
                        type="button"
                        className="submit-job-button"
                        disabled={
                          finishingJob ===
                          jobKey
                        }
                        onClick={() =>
                          handleFinishProduction(
                            job,
                          )
                        }
                      >
                        {finishingJob ===
                        jobKey
                          ? 'Finishing...'
                          : 'Finish Production'}
                      </button>
                    )}

                    {!productionFinished &&
                      !allItemsFinished && (
                      <button
                        type="button"
                        className="cancel-button"
                        disabled
                      >
                        Complete All Items
                      </button>
                    )}

                    {productionFinished && (
                      <span
                        style={{
                          display:
                            'inline-block',
                          padding:
                            '10px 14px',
                          borderRadius:
                            '8px',
                          background:
                            '#dcfce7',
                          color:
                            '#166534',
                          fontWeight:
                            700,
                        }}
                      >
                        ✓ Production Finished
                      </span>
                    )}

                  </div>

                  {/* DETAILS */}

                  {isExpanded && (
                    <div className="statistics-order-details">

                      <h4>
                        Customer Details
                      </h4>

                      <div className="details-grid">

                        <div>
                          <strong>
                            Customer
                          </strong>

                          <span>
                            {job.customer.name ||
                              '-'}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Company
                          </strong>

                          <span>
                            {job.customer
                              .companyName ||
                              '-'}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Phone
                          </strong>

                          <span>
                            {job.customer
                              .phoneNumber ||
                              '-'}
                          </span>
                        </div>

                        <div>
                          <strong>
                            WhatsApp
                          </strong>

                          <span>
                            {job.customer
                              .whatsappNumber ||
                              '-'}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Place
                          </strong>

                          <span>
                            {job.customer.place ||
                              '-'}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Entry Date
                          </strong>

                          <span>
                            {formatDate(
                              job.date,
                            )}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Expected Delivery
                          </strong>

                          <span>
                            {formatDate(
                              job.expectedDeliveryDate,
                            )}
                          </span>
                        </div>

                        <div>
                          <strong>
                            Assigned By
                          </strong>

                          <span>
                            {job.officeInfo
                              .productionAssignedBy
                              ?.username ||
                              job.officeInfo
                                .productionAssignedBy
                                ?.name ||
                              '-'}
                          </span>
                        </div>

                      </div>

                      <h4
                        style={{
                          marginTop:
                            '25px',
                        }}
                      >
                        Production Assignment
                      </h4>

                      <div className="job-status-section">

                        <div className="status-box">
                          <label>
                            Assigned Date
                          </label>

                          <div className="status-value">
                            {formatDate(
                              job.officeInfo
                                .productionAssignedDate ||
                                '',
                            )}
                          </div>
                        </div>

                        <div className="status-box">
                          <label>
                            Assigned Staff
                          </label>

                          <div className="status-value">
                            {assignedStaff
                              .map(
                                (staff) =>
                                  staff.name ||
                                  staff.username,
                              )
                              .join(', ') ||
                              '-'}
                          </div>
                        </div>

                        <div className="status-box">
                          <label>
                            Production Status
                          </label>

                          <div className="status-value">
                            {job.statuses.production}
                          </div>
                        </div>

                      </div>

                      <h4
                        style={{
                          marginTop:
                            '25px',
                        }}
                      >
                        Production Items
                      </h4>

                      {job.items.length ===
                      0 ? (
                        <div className="empty-items">
                          No items available.
                        </div>
                      ) : (
                        <div className="items-table-wrapper">
                          <table className="items-table">
                            <thead>
                              <tr>
                                <th>
                                  #
                                </th>

                                <th>
                                  Item
                                </th>

                                <th>
                                  Width
                                </th>

                                <th>
                                  Height
                                </th>

                                <th>
                                  Qty
                                </th>

                                <th>
                                  Price
                                </th>

                                <th>
                                  Remarks
                                </th>

                                <th>
                                  Image
                                </th>

                                <th>
                                  Production
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {job.items.map(
                                (
                                  item,
                                  index,
                                ) => {
                                  const itemKey =
                                    `${jobKey}-${index}`

                                  const finished =
                                    isItemFinished(
                                      item,
                                    )

                                  const image =
                                    item.imageUrl ||
                                    item.image

                                  return (
                                    <tr
                                      key={
                                        itemKey
                                      }
                                    >
                                      <td className="sl-number">
                                        {item.slNo}
                                      </td>

                                      <td>
                                        <strong>
                                          {item.name ||
                                            '-'}
                                        </strong>
                                      </td>

                                      <td>
                                        {item.width ||
                                          '-'}
                                      </td>

                                      <td>
                                        {item.height ||
                                          '-'}
                                      </td>

                                      <td>
                                        {item.qty ||
                                          '-'}
                                      </td>

                                      <td>
                                        {item.price ||
                                          '-'}
                                      </td>

                                      <td>
                                        {item.remarks ||
                                          '-'}
                                      </td>

                                      <td>
                                        {image ? (
                                          <a
                                            href={
                                              image
                                            }
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            <img
                                              src={
                                                image
                                              }
                                              alt={
                                                item.name ||
                                                'Item'
                                              }
                                              style={{
                                                width:
                                                  '70px',
                                                height:
                                                  '70px',
                                                objectFit:
                                                  'cover',
                                                borderRadius:
                                                  '8px',
                                                border:
                                                  '1px solid #ddd',
                                              }}
                                            />
                                          </a>
                                        ) : (
                                          <span>
                                            No image
                                          </span>
                                        )}
                                      </td>

                                      <td>
                                        {finished ? (
                                          <div>
                                            <span
                                              style={{
                                                display:
                                                  'inline-block',
                                                padding:
                                                  '7px 10px',
                                                borderRadius:
                                                  '7px',
                                                background:
                                                  '#dcfce7',
                                                color:
                                                  '#166534',
                                                fontWeight:
                                                  700,
                                              }}
                                            >
                                              ✓ Finished
                                            </span>

                                            <div
                                              style={{
                                                marginTop:
                                                  '6px',
                                                fontSize:
                                                  '12px',
                                                color:
                                                  '#15803d',
                                                fontWeight:
                                                  600,
                                              }}
                                            >
                                              Production item
                                              finished
                                            </div>
                                          </div>
                                        ) : (
                                          <div>
                                            <button
                                              type="button"
                                              className="submit-job-button"
                                              disabled={
                                                productionFinished ||
                                                savingItem ===
                                                  itemKey
                                              }
                                              onClick={() =>
                                                handleFinishItem(
                                                  job,
                                                  index,
                                                )
                                              }
                                            >
                                              {savingItem ===
                                              itemKey
                                                ? 'Saving...'
                                                : '✓ Finished'}
                                            </button>

                                            <div
                                              style={{
                                                marginTop:
                                                  '6px',
                                                fontSize:
                                                  '12px',
                                                color:
                                                  '#f59e0b',
                                                fontWeight:
                                                  600,
                                              }}
                                            >
                                              Pending
                                            </div>
                                          </div>
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

                      <div
                        style={{
                          marginTop:
                            '20px',
                          padding:
                            '15px',
                          borderRadius:
                            '10px',
                          background:
                            allItemsFinished
                              ? '#dcfce7'
                              : '#f8fafc',
                          border:
                            '1px solid #e2e8f0',
                        }}
                      >
                        <strong>
                          Production Progress
                        </strong>

                        <p
                          style={{
                            margin:
                              '6px 0 0',
                            color:
                              '#64748b',
                          }}
                        >
                          {allItemsFinished
                            ? 'All items are finished. Use "Finish Production" above to complete the entire production job.'
                            : 'Mark each item with ✓ Finished. The overall Finish Production button appears after every item is completed.'}
                        </p>
                      </div>

                    </div>
                  )}

                </section>
              )
            },
          )}
        </div>

      </div>
    </div>
  )
}

export default Production
