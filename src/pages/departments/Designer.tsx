import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  doc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface DesignerProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type DesignerFilter =
  | 'all'
  | 'pending'
  | 'today'
  | 'late'

type JobStatus =
  | 'Pending'
  | 'In Progress'
  | 'Finished'

type JobSource =
  | 'job_orders'
  | 'measurements'

interface DesignItem {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string

  designStatus?: 'pending' | 'finished' | 'na'
}

interface Customer {
  name: string
  companyName: string
  phoneNumber: string
  whatsappNumber: string
  place: string
}

interface DesignerOfficeInfo {
  designJob: boolean
  printJob: boolean
  productionJob: boolean
  cuttingJob?: boolean

  designer?: string | null
  designerUsername?: string | null

  printBranch?: string | null
}

interface DepartmentStatuses {
  design: JobStatus
  print: JobStatus
  production: JobStatus
  cutting?: JobStatus
}

interface CustomerAdviser {
  name: string
  username: string
}

interface UnifiedDesignJob {
  id: string

  source: JobSource

  orderId: number | string

  date: string

  expectedDeliveryDate: string

  branch: string

  customer: Customer

  items: DesignItem[]

  officeInfo: DesignerOfficeInfo

  customerAdviser: CustomerAdviser

  statuses: DepartmentStatuses

  designCharge?: number

  delivered?: boolean

  createdAt?: Timestamp

  quotationStatus?: 'Pending' | 'Confirmed'

  quotationGeneratedBy?: {
    name: string
    username: string
  }
}

/*
 * =========================================
 * HELPERS
 * =========================================
 */

const getTodayString = () => {
  const today = new Date()

  const year = today.getFullYear()

  const month = String(
    today.getMonth() + 1,
  ).padStart(2, '0')

  const day = String(
    today.getDate(),
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

const getString = (
  value: unknown,
): string => {
  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    return String(value)
  }

  return ''
}

const getBoolean = (
  value: unknown,
): boolean => {
  return value === true
}

const getJobStatus = (
  value: unknown,
): JobStatus => {
  if (
    value === 'In Progress' ||
    value === 'Finished'
  ) {
    return value
  }

  return 'Pending'
}

/*
 * =========================================
 * NORMALIZE JOB ORDER
 * =========================================
 */

const normalizeJobOrder = (
  documentId: string,
  data: any,
): UnifiedDesignJob => {
  const rawItems = Array.isArray(
    data.items,
  )
    ? data.items
    : []

  const items: DesignItem[] =
    rawItems.map(
      (
        item: any,
        index: number,
      ) => ({
        slNo:
          typeof item?.slNo ===
          'number'
            ? item.slNo
            : index + 1,

        name:
          getString(
            item?.name,
          ),

        width:
          getString(
            item?.width,
          ),

        height:
          getString(
            item?.height,
          ),

        qty:
          getString(
            item?.qty,
          ),

        price:
          getString(
            item?.price,
          ),

        remarks:
          getString(
            item?.remarks,
          ),

        designStatus:
          item?.designStatus ??
          'pending',
      }),
    )

  return {
    id: documentId,

    source: 'job_orders',

    orderId:
      data.orderId ??
      data.orderNumber ??
      documentId,

    date:
      getString(
        data.date,
      ),

    expectedDeliveryDate:
      getString(
        data.expectedDeliveryDate ??
          data.deliveryDate,
      ),

    branch:
      getString(
        data.branch ??
          data.selectedBranch,
      ),

    customer: {
      name:
        getString(
          data.customer?.name,
        ),

      companyName:
        getString(
          data.customer
            ?.companyName,
        ),

      phoneNumber:
        getString(
          data.customer
            ?.phoneNumber,
        ),

      whatsappNumber:
        getString(
          data.customer
            ?.whatsappNumber,
        ),

      place:
        getString(
          data.customer?.place,
        ),
    },

    items,

    officeInfo: {
      designJob:
        getBoolean(
          data.officeInfo
            ?.designJob,
        ),

      printJob:
        getBoolean(
          data.officeInfo
            ?.printJob,
        ),

      productionJob:
        getBoolean(
          data.officeInfo
            ?.productionJob,
        ),

      cuttingJob:
        getBoolean(
          data.officeInfo
            ?.cuttingJob,
        ),

      designer:
        data.officeInfo
          ?.designer ??
        null,

      designerUsername:
        data.officeInfo
          ?.designerUsername ??
        null,

      printBranch:
        data.officeInfo
          ?.printBranch ??
        null,
    },

    customerAdviser: {
      name:
        getString(
          data.customerAdviser
            ?.name,
        ),

      username:
        getString(
          data.customerAdviser
            ?.username,
        ),
    },

    statuses: {
      design:
        getJobStatus(
          data.statuses
            ?.design,
        ),

      print:
        getJobStatus(
          data.statuses?.print,
        ),

      production:
        getJobStatus(
          data.statuses
            ?.production,
        ),

      cutting:
        getJobStatus(
          data.statuses
            ?.cutting,
        ),
    },

    designCharge:
      typeof data.designCharge ===
      'number'
        ? data.designCharge
        : undefined,

    delivered:
      data.delivered ??
      false,

    createdAt:
      data.createdAt,
  }
}

/*
 * =========================================
 * NORMALIZE MEASUREMENT
 * =========================================
 */

const normalizeMeasurement = (
  documentId: string,
  data: any,
): UnifiedDesignJob => {
  const rawItems = Array.isArray(
    data.items,
  )
    ? data.items
    : []

  const items: DesignItem[] =
    rawItems.map(
      (
        item: any,
        index: number,
      ) => ({
        slNo:
          typeof item?.slNo ===
          'number'
            ? item.slNo
            : index + 1,

        name:
          getString(
            item?.name,
          ),

        width:
          getString(
            item?.width,
          ),

        height:
          getString(
            item?.height,
          ),

        qty:
          getString(
            item?.qty,
          ),

        price:
          getString(
            item?.price,
          ),

        remarks:
          getString(
            item?.remarks,
          ),

        designStatus:
          item?.designStatus ??
          'pending',
      }),
    )

  const quotationStatus =
    data.quotation?.status ===
    'Confirmed'
      ? 'Confirmed'
      : 'Pending'

  return {
    id: documentId,

    source: 'measurements',

    orderId:
      data.measurementId ??
      data.orderId ??
      documentId,

    date:
      getString(
        data.date,
      ),

    expectedDeliveryDate:
      getString(
        data.expectedDeliveryDate,
      ),

    branch:
      getString(
        data.branch ??
          data.selectedBranch,
      ),

    customer: {
      name:
        getString(
          data.customer?.name,
        ),

      companyName:
        getString(
          data.customer
            ?.companyName,
        ),

      phoneNumber:
        getString(
          data.customer
            ?.phoneNumber,
        ),

      whatsappNumber:
        getString(
          data.customer
            ?.whatsappNumber,
        ),

      place:
        getString(
          data.customer?.place,
        ),
    },

    items,

    officeInfo: {
      designJob:
        getBoolean(
          data.officeInfo
            ?.designJob,
        ),

      printJob:
        getBoolean(
          data.officeInfo
            ?.printJob,
        ),

      productionJob:
        getBoolean(
          data.officeInfo
            ?.productionJob,
        ),

      cuttingJob:
        getBoolean(
          data.officeInfo
            ?.cuttingJob,
        ),

      designer:
        data.officeInfo
          ?.designer ??
        null,

      designerUsername:
        data.officeInfo
          ?.designerUsername ??
        null,

      printBranch:
        data.officeInfo
          ?.printBranch ??
        null,
    },

    customerAdviser: {
      name:
        getString(
          data.customerAdviser
            ?.name,
        ),

      username:
        getString(
          data.customerAdviser
            ?.username,
        ),
    },

    statuses: {
      design:
        getJobStatus(
          data.statuses
            ?.design,
        ),

      print:
        getJobStatus(
          data.statuses?.print,
        ),

      production:
        getJobStatus(
          data.statuses
            ?.production,
        ),

      cutting:
        getJobStatus(
          data.statuses
            ?.cutting,
        ),
    },

    /*
     * =====================================
     * MEASUREMENT QUOTATION
     * =====================================
     */

    quotationStatus,

    quotationGeneratedBy:
      data.quotation
        ?.generatedBy
        ? {
            name:
              getString(
                data.quotation
                  .generatedBy
                  ?.name,
              ),

            username:
              getString(
                data.quotation
                  .generatedBy
                  ?.username,
              ),
          }
        : undefined,

    /*
     * =====================================
     * DESIGN CHARGE
     *
     * Measurements can now also have
     * a designCharge.
     * =====================================
     */

    designCharge:
      typeof data.designCharge ===
      'number'
        ? data.designCharge
        : undefined,

    createdAt:
      data.createdAt,
  }
}

/*
 * =========================================
 * COMPONENT
 * =========================================
 */

function Designer({
  user,
}: DesignerProps) {
  const currentUser = user ?? {
    name: '',
    username: '',
    roles: [],
  }

  /*
   * =========================================
   * STATE
   * =========================================
   */

  const [designJobs, setDesignJobs] =
    useState<UnifiedDesignJob[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [showAllWork, setShowAllWork] =
    useState(false)

  const [activeFilter, setActiveFilter] =
    useState<DesignerFilter>(
      'pending',
    )

  const [expandedOrder, setExpandedOrder] =
    useState<string | null>(null)

  const [savingItem, setSavingItem] =
    useState<string | null>(null)

  const [acceptingOrder, setAcceptingOrder] =
    useState<string | null>(null)

  /*
   * DESIGN CHARGE
   */

  const [designCharge, setDesignCharge] =
    useState('')

  const [finishOrderId, setFinishOrderId] =
    useState<string | null>(null)

  const [finishingOrder, setFinishingOrder] =
    useState<string | null>(null)

  /*
   * =========================================
   * FETCH JOB ORDERS + MEASUREMENTS
   * =========================================
   */

  useEffect(() => {
    setLoading(true)
    setError('')

    const jobOrdersRef =
      collection(
        db,
        'job_orders',
      )

    const measurementsRef =
      collection(
        db,
        'measurements',
      )

    const jobOrdersQuery =
      query(
        jobOrdersRef,
        orderBy(
          'createdAt',
          'desc',
        ),
      )

    const measurementsQuery =
      query(
        measurementsRef,
        orderBy(
          'createdAt',
          'desc',
        ),
      )

    let jobOrders: UnifiedDesignJob[] =
      []

    let measurements: UnifiedDesignJob[] =
      []

    let jobOrdersLoaded = false
    let measurementsLoaded = false

    const updateCombinedJobs = () => {
      if (
        !jobOrdersLoaded ||
        !measurementsLoaded
      ) {
        return
      }

      /*
       * =====================================
       * ACTIVE JOB ORDERS
       * =====================================
       */

      const activeJobOrders =
        jobOrders.filter(
          (order) =>
            order.officeInfo
              .designJob === true &&
            order.statuses
              .design !==
              'Finished',
        )

      /*
       * =====================================
       * ACTIVE MEASUREMENTS
       *
       * Quotation must be confirmed.
       * =====================================
       */

      const activeMeasurements =
        measurements.filter(
          (measurement) =>
            measurement.officeInfo
              .designJob === true &&
            measurement.quotationStatus ===
              'Confirmed' &&
            measurement.statuses
              .design !==
              'Finished',
        )

      /*
       * =====================================
       * COMBINE
       * =====================================
       */

      const combined = [
        ...activeJobOrders,
        ...activeMeasurements,
      ]

      /*
       * =====================================
       * NEWEST FIRST
       * =====================================
       */

      combined.sort(
        (a, b) => {
          const aTime =
            a.createdAt?.toMillis?.() ??
            0

          const bTime =
            b.createdAt?.toMillis?.() ??
            0

          return bTime - aTime
        },
      )

      setDesignJobs(
        combined,
      )

      setLoading(false)
    }

    /*
     * =====================================
     * JOB ORDERS LISTENER
     * =====================================
     */

    const unsubscribeJobOrders =
      onSnapshot(
        jobOrdersQuery,
        (snapshot) => {
          jobOrders =
            snapshot.docs.map(
              (document) =>
                normalizeJobOrder(
                  document.id,
                  document.data(),
                ),
            )

          jobOrdersLoaded = true

          updateCombinedJobs()
        },
        (firebaseError) => {
          console.error(
            'Error fetching job orders:',
            firebaseError,
          )

          setError(
            'Unable to load Job Order design work.',
          )

          setLoading(false)
        },
      )

    /*
     * =====================================
     * MEASUREMENTS LISTENER
     * =====================================
     */

    const unsubscribeMeasurements =
      onSnapshot(
        measurementsQuery,
        (snapshot) => {
          measurements =
            snapshot.docs.map(
              (document) =>
                normalizeMeasurement(
                  document.id,
                  document.data(),
                ),
            )

          measurementsLoaded = true

          updateCombinedJobs()
        },
        (firebaseError) => {
          console.error(
            'Error fetching measurements:',
            firebaseError,
          )

          setError(
            'Unable to load Measurement design work.',
          )

          setLoading(false)
        },
      )

    return () => {
      unsubscribeJobOrders()
      unsubscribeMeasurements()
    }
  }, [])

  /*
   * =========================================
   * ASSIGNMENT
   * =========================================
   */

  const isAssignedToCurrentUser = (
    order: UnifiedDesignJob,
  ) => {
    if (
      order.officeInfo
        .designerUsername
    ) {
      return (
        order.officeInfo
          .designerUsername ===
        currentUser.username
      )
    }

    return (
      !!order.officeInfo.designer &&
      order.officeInfo
        .designer ===
        currentUser.name
    )
  }

  /*
   * =========================================
   * JOB SOURCE LABEL
   * =========================================
   */

  const getSourceLabel = (
    order: UnifiedDesignJob,
  ) => {
    return order.source ===
      'measurements'
      ? 'Measurement'
      : 'Job Order'
  }

  /*
   * =========================================
   * ITEM PROGRESS
   * =========================================
   */

  const hasStartedDesignWork = (
    order: UnifiedDesignJob,
  ) => {
    return (
      order.statuses.design ===
        'In Progress' ||
      order.items.some(
        (item) =>
          item.designStatus ===
            'finished' ||
          item.designStatus === 'na',
      )
    )
  }

  const areAllItemsFinished = (
    order: UnifiedDesignJob,
  ) => {
    if (
      order.items.length === 0
    ) {
      return false
    }

    return order.items.every(
      (item) =>
        item.designStatus ===
          'finished' ||
        item.designStatus === 'na',
    )
  }

  /*
   * =========================================
   * VISIBLE ORDERS
   * =========================================
   */

  const visibleOrders =
    useMemo(() => {
      if (showAllWork) {
        return designJobs
      }

      return designJobs.filter(
        (order) =>
          isAssignedToCurrentUser(
            order,
          ),
      )
    }, [
      designJobs,
      showAllWork,
      currentUser.username,
      currentUser.name,
    ])

  /*
   * =========================================
   * COUNTS
   * =========================================
   */

  const pendingCount =
    useMemo(() => {
      return visibleOrders.filter(
        (order) =>
          !(
            order.source ===
              'measurements' &&
            order.statuses
              .design ===
              'In Progress'
          ) &&
          !areAllItemsFinished(
            order,
          ),
      ).length
    }, [visibleOrders])

  const todayCount =
    useMemo(() => {
      const today =
        getTodayString()

      return visibleOrders.filter(
        (order) =>
          order.expectedDeliveryDate ===
            today &&
          !areAllItemsFinished(
            order,
          ),
      ).length
    }, [visibleOrders])

  const lateCount =
    useMemo(() => {
      const today =
        getTodayString()

      return visibleOrders.filter(
        (order) =>
          !!order.expectedDeliveryDate &&
          order.expectedDeliveryDate <
            today &&
          !areAllItemsFinished(
            order,
          ),
      ).length
    }, [visibleOrders])

  /*
   * =========================================
   * FILTERED ORDERS
   * =========================================
   */

  const filteredOrders =
    useMemo(() => {
      const today =
        getTodayString()

      switch (
        activeFilter
      ) {
        case 'pending':
          return visibleOrders.filter(
            (order) =>
              !areAllItemsFinished(
                order,
              ),
          )

        case 'today':
          return visibleOrders.filter(
            (order) =>
              order.expectedDeliveryDate ===
                today &&
              !areAllItemsFinished(
                order,
              ),
          )

        case 'late':
          return visibleOrders.filter(
            (order) =>
              !!order.expectedDeliveryDate &&
              order.expectedDeliveryDate <
                today &&
              !areAllItemsFinished(
                order,
              ),
          )

        case 'all':
        default:
          return visibleOrders
      }
    }, [
      visibleOrders,
      activeFilter,
    ])

  /*
   * =========================================
   * FILTER CLICK
   * =========================================
   */

  const handleFilterClick = (
    filter: DesignerFilter,
  ) => {
    setActiveFilter(
      filter,
    )

    setExpandedOrder(
      null,
    )
  }

  /*
   * =========================================
   * ACCEPT WORK
   * =========================================
   */

  const handleAcceptWork = async (
    order: UnifiedDesignJob,
  ) => {
    if (
      acceptingOrder ===
      order.id
    ) {
      return
    }

    /*
     * Measurement quotation protection.
     */

    if (
      order.source ===
        'measurements' &&
      order.quotationStatus !==
        'Confirmed'
    ) {
      alert(
        'Quotation must be confirmed before design work can be accepted.',
      )

      return
    }

    /*
     * Prevent another designer from
     * accepting already-started work.
     */

    if (
      hasStartedDesignWork(
        order,
      )
    ) {
      alert(
        'This design work has already started. Another designer cannot accept this order.',
      )

      return
    }

    setAcceptingOrder(
      order.id,
    )

    setError('')

    try {
      const collectionName =
        order.source ===
        'measurements'
          ? 'measurements'
          : 'job_orders'

      await updateDoc(
        doc(
          db,
          collectionName,
          order.id,
        ),
        {
          'officeInfo.designer':
            currentUser.name,

          'officeInfo.designerUsername':
            currentUser.username,

          'statuses.design':
            'In Progress',
        },
      )
    } catch (firebaseError) {
      console.error(
        'Error accepting design work:',
        firebaseError,
      )

      setError(
        'Unable to accept this work.',
      )
    } finally {
      setAcceptingOrder(
        null,
      )
    }
  }

  /*
   * =========================================
   * UPDATE ITEM STATUS
   * =========================================
   */

  const handleItemStatus = async (
    order: UnifiedDesignJob,
    itemIndex: number,
    status:
      | 'finished'
      | 'na',
  ) => {
    const itemKey =
      `${order.source}-${order.id}-${itemIndex}`

    if (
      savingItem ===
      itemKey
    ) {
      return
    }

    if (
      !isAssignedToCurrentUser(
        order,
      )
    ) {
      alert(
        'Accept this work before updating the design.',
      )

      return
    }

    if (
      order.statuses.design ===
      'Finished'
    ) {
      return
    }

    const updatedItems =
      order.items.map(
        (
          item,
          index,
        ) =>
          index ===
          itemIndex
            ? {
                ...item,
                designStatus:
                  status,
              }
            : item,
      )

    setSavingItem(
      itemKey,
    )

    setError('')

    try {
      const collectionName =
        order.source ===
        'measurements'
          ? 'measurements'
          : 'job_orders'

      await updateDoc(
        doc(
          db,
          collectionName,
          order.id,
        ),
        {
          items:
            updatedItems,

          'statuses.design':
            'In Progress',

          'officeInfo.designer':
            currentUser.name,

          'officeInfo.designerUsername':
            currentUser.username,
        },
      )
    } catch (firebaseError) {
      console.error(
        'Error updating item:',
        firebaseError,
      )

      setError(
        'Unable to update item status.',
      )
    } finally {
      setSavingItem(
        null,
      )
    }
  }

  /*
   * =========================================
   * OPEN FINISH
   * =========================================
   */

  const handleOpenFinish = (
    order: UnifiedDesignJob,
  ) => {
    if (
      !isAssignedToCurrentUser(
        order,
      )
    ) {
      alert(
        'Only the assigned designer can finish this work.',
      )

      return
    }

    if (
      order.statuses.design !==
      'In Progress'
    ) {
      alert(
        'Accept this design work before finishing it.',
      )

      return
    }

    if (
      !areAllItemsFinished(
        order,
      )
    ) {
      alert(
        'Every item must be marked Finished Design or NA before completing the order.',
      )

      return
    }

    /*
     * Load existing design charge
     * if available.
     */

    setDesignCharge(
      order.designCharge !==
        undefined
        ? String(
            order.designCharge,
          )
        : '',
    )

    setFinishOrderId(
      order.id,
    )
  }

  /*
   * =========================================
   * FINISH DESIGN
   * =========================================
   */

  const handleFinishDesign =
    async () => {
      if (
        !finishOrderId
      ) {
        return
      }

      const order =
        designJobs.find(
          (item) =>
            item.id ===
              finishOrderId,
        )

      if (!order) {
        return
      }

      /*
       * =====================================
       * CHECK ASSIGNMENT
       * =====================================
       */

      if (
        !isAssignedToCurrentUser(
          order,
        )
      ) {
        alert(
          'Only the assigned designer can finish this work.',
        )

        return
      }

      /*
       * =====================================
       * CHECK DESIGN STATUS
       * =====================================
       */

      if (
        order.statuses.design !==
        'In Progress'
      ) {
        alert(
          'Design must be In Progress before it can be finished.',
        )

        return
      }

      /*
       * =====================================
       * CHECK ALL ITEMS
       * =====================================
       */

      if (
        !areAllItemsFinished(
          order,
        )
      ) {
        alert(
          'All items must be marked Finished Design or NA before completing the order.',
        )

        return
      }

      /*
       * =====================================
       * DESIGN CHARGE
       *
       * NOW REQUIRED FOR BOTH:
       * 1. Job Orders
       * 2. Measurements
       * =====================================
       */

      const charge =
        Number(
          designCharge,
        )

      if (
        designCharge.trim() ===
          '' ||
        Number.isNaN(charge) ||
        charge < 0
      ) {
        alert(
          'Please enter a valid design charge.',
        )

        return
      }

      setFinishingOrder(
        order.id,
      )

      setError('')

      try {
        const collectionName =
          order.source ===
          'measurements'
            ? 'measurements'
            : 'job_orders'

        /*
         * =================================
         * UPDATE DATA
         * =================================
         *
         * designCharge is now saved for
         * BOTH Job Orders and Measurements.
         */

        const updateData:
          Record<string, unknown> = {
          items:
            order.items,

          'statuses.design':
            'Finished',

          'officeInfo.designer':
            currentUser.name,

          'officeInfo.designerUsername':
            currentUser.username,

          designCharge:
            charge,
        }

        await updateDoc(
          doc(
            db,
            collectionName,
            order.id,
          ),
          updateData,
        )

        /*
         * =================================
         * RESET MODAL
         * =================================
         */

        setFinishOrderId(
          null,
        )

        setDesignCharge('')

        setExpandedOrder(
          null,
        )
      } catch (firebaseError) {
        console.error(
          'Error finishing design:',
          firebaseError,
        )

        setError(
          'Unable to finish design work.',
        )
      } finally {
        setFinishingOrder(
          null,
        )
      }
    }

  /*
   * =========================================
   * ORDER ID
   * =========================================
   */

  const getOrderId = (
    order: UnifiedDesignJob,
  ) => {
    if (
      order.orderId !==
        undefined &&
      order.orderId !== ''
    ) {
      return order.orderId
    }

    return order.id
  }

  /*
   * =========================================
   * DESIGNER LABEL
   * =========================================
   */

  const getDesignerLabel = (
    order: UnifiedDesignJob,
  ) => {
    if (
      isAssignedToCurrentUser(
        order,
      )
    ) {
      return `${currentUser.name} (You)`
    }

    return (
      order.officeInfo
        .designer ||
      'Unassigned'
    )
  }

  /*
   * =========================================
   * PAGE
   * =========================================
   */

  return (
    <div className="department-page">

      <div className="department-container">

        {/* =====================================
            HEADER
        ====================================== */}

        <div className="department-header">

          <div>
            <h1>
              Designer Dashboard
            </h1>

            <p>
              Design work • Priority:
              Design → Printing/Cutting →
              Production
            </p>
          </div>

          <button
            type="button"
            className={
              showAllWork
                ? 'add-item-button'
                : 'view-button'
            }
            onClick={() => {
              setShowAllWork(
                !showAllWork,
              )

              setExpandedOrder(
                null,
              )
            }}
          >
            {showAllWork
              ? 'My Work'
              : 'Show All Work'}
          </button>

        </div>

        {/* =====================================
            ERROR
        ====================================== */}

        {error && (
          <div className="form-message">
            {error}
          </div>
        )}

        {/* =====================================
            DASHBOARD FILTERS
        ====================================== */}

        <div className="statistics-dashboard">

          <button
            type="button"
            className={
              activeFilter ===
              'all'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'all',
              )
            }
          >
            <div className="statistics-card-label">
              All Work
            </div>

            <div className="statistics-card-value">
              {visibleOrders.length}
            </div>

            <div className="statistics-card-help">
              All active design orders
            </div>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              'pending'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'pending',
              )
            }
          >
            <div className="statistics-card-label">
              Pending
            </div>

            <div className="statistics-card-value">
              {pendingCount}
            </div>

            <div className="statistics-card-help">
              Design work pending
            </div>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              'today'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'today',
              )
            }
          >
            <div className="statistics-card-label">
              Must Finish Today
            </div>

            <div className="statistics-card-value">
              {todayCount}
            </div>

            <div className="statistics-card-help">
              Expected today
            </div>
          </button>

          <button
            type="button"
            className={
              activeFilter ===
              'late'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'late',
              )
            }
          >
            <div className="statistics-card-label">
              Late
            </div>

            <div className="statistics-card-value">
              {lateCount}
            </div>

            <div className="statistics-card-help">
              Past expected date
            </div>
          </button>

        </div>

        {/* =====================================
            CURRENT MODE
        ====================================== */}

        <div className="statistics-filter-bar">

          <div>
            <strong>
              Viewing:
            </strong>

            <span>
              {showAllWork
                ? ' All Designers'
                : ` ${currentUser.name}'s Work`}
            </span>
          </div>

          <div>
            <strong>
              Filter:
            </strong>

            <span>
              {activeFilter ===
              'pending'
                ? ' Pending'
                : activeFilter ===
                    'today'
                  ? ' Must Finish Today'
                  : activeFilter ===
                      'late'
                    ? ' Late'
                    : ' All Work'}
            </span>
          </div>

        </div>

        {/* =====================================
            ORDERS
        ====================================== */}

        <div className="department-section">

          <div className="section-heading-row">

            <div>
              <h2>
                Design Work
              </h2>

              <p>
                {filteredOrders.length}{' '}
                order
                {filteredOrders.length !==
                1
                  ? 's'
                  : ''}{' '}
                found
              </p>
            </div>

          </div>

          {loading && (
            <div className="empty-items">
              Loading design work...
            </div>
          )}

          {!loading &&
            filteredOrders.length ===
              0 && (
              <div className="empty-items">

                <h3>
                  No Design Work Found
                </h3>

                <p>
                  There are no active
                  design orders matching
                  the current selection.
                </p>

              </div>
            )}

          {!loading &&
            filteredOrders.length >
              0 && (
              <div className="statistics-orders-list">

                {filteredOrders.map(
                  (order) => {

                    const isExpanded =
                      expandedOrder ===
                      `${order.source}-${order.id}`

                    const assignedToMe =
                      isAssignedToCurrentUser(
                        order,
                      )

                    const workStarted =
                      hasStartedDesignWork(
                        order,
                      )

                    const allItemsDone =
                      areAllItemsFinished(
                        order,
                      )

                    const isMeasurement =
                      order.source ===
                      'measurements'

                    return (
                      <div
                        key={`${order.source}-${order.id}`}
                        className="statistics-order-card"
                      >

                        {/* =================================
                            ORDER HEADER
                        ================================== */}

                        <div className="statistics-order-header">

                          <div>

                            <div className="job-order-id">
                              {getSourceLabel(
                                order,
                              )}{' '}
                              ID:{' '}
                              {getOrderId(
                                order,
                              )}
                            </div>

                            <h3>
                              {order
                                .customer
                                .name ||
                                'Unnamed Customer'}
                            </h3>

                            <p>
                              {order
                                .customer
                                .companyName ||
                                'No company name'}
                            </p>

                          </div>

                          <div className="statistics-order-meta">

                            <span>
                              Delivery:{' '}
                              {order
                                .expectedDeliveryDate ||
                                '-'}
                            </span>

                            <span>
                              Designer:{' '}
                              {getDesignerLabel(
                                order,
                              )}
                            </span>

                            <span>
                              Source:{' '}
                              {getSourceLabel(
                                order,
                              )}
                            </span>

                          </div>

                        </div>

                        {/* =================================
                            SUMMARY
                        ================================== */}

                        <div className="statistics-order-summary">

                          <div>
                            <strong>
                              Adviser
                            </strong>

                            <span>
                              {order
                                .customerAdviser
                                .name ||
                                '-'}
                            </span>
                          </div>

                          <div>
                            <strong>
                              Design Status
                            </strong>

                            <span>
                              {order
                                .statuses
                                .design ||
                                'Pending'}
                            </span>
                          </div>

                          <div>
                            <strong>
                              Items
                            </strong>

                            <span>
                              {order.items.length}
                            </span>
                          </div>

                          <div>
                            <strong>
                              {isMeasurement
                                ? 'Quotation'
                                : 'Design Charge'}
                            </strong>

                            <span>
                              {isMeasurement
                                ? order
                                    .quotationStatus ||
                                  'Pending'
                                : order
                                      .designCharge !==
                                    undefined
                                  ? `₹${order.designCharge}`
                                  : '-'}
                            </span>
                          </div>

                          {/* Show design charge for Measurement
                              if it has already been saved */}

                          {isMeasurement &&
                            order.designCharge !==
                              undefined && (
                            <div>
                              <strong>
                                Design Charge
                              </strong>

                              <span>
                                ₹
                                {
                                  order.designCharge
                                }
                              </span>
                            </div>
                          )}

                        </div>

                        {/* =================================
                            ACTIONS
                        ================================== */}

                        <div className="statistics-order-actions">

                          {/* ACCEPT */}

                          {showAllWork &&
                            !assignedToMe &&
                            !workStarted && (
                              <button
                                type="button"
                                className="add-item-button"
                                disabled={
                                  acceptingOrder ===
                                    order.id ||
                                  (
                                    isMeasurement &&
                                    order.quotationStatus !==
                                      'Confirmed'
                                  )
                                }
                                onClick={() =>
                                  handleAcceptWork(
                                    order,
                                  )
                                }
                              >
                                {acceptingOrder ===
                                order.id
                                  ? 'Accepting...'
                                  : isMeasurement &&
                                      order.quotationStatus !==
                                        'Confirmed'
                                    ? 'Waiting for Quotation'
                                    : 'Accept Work'}
                              </button>
                            )}

                          {/* ALREADY STARTED */}

                          {showAllWork &&
                            !assignedToMe &&
                            workStarted && (
                              <span
                                style={{
                                  padding:
                                    '8px 12px',
                                  borderRadius:
                                    '8px',
                                  background:
                                    '#f1f5f9',
                                  color:
                                    '#64748b',
                                  fontSize:
                                    '13px',
                                  fontWeight:
                                    600,
                                }}
                              >
                                Work Already Started
                              </span>
                            )}

                          {/* VIEW */}

                          <button
                            type="button"
                            className="view-button"
                            onClick={() =>
                              setExpandedOrder(
                                isExpanded
                                  ? null
                                  : `${order.source}-${order.id}`,
                              )
                            }
                          >
                            {isExpanded
                              ? 'Hide Details'
                              : 'View Details'}
                          </button>

                          {/* FINISH */}

                          {assignedToMe && (
                            <button
                              type="button"
                              className={
                                allItemsDone
                                  ? 'submit-job-button'
                                  : 'cancel-button'
                              }
                              disabled={
                                !allItemsDone ||
                                finishingOrder ===
                                  order.id
                              }
                              onClick={() =>
                                handleOpenFinish(
                                  order,
                                )
                              }
                              title={
                                allItemsDone
                                  ? 'Finish design'
                                  : 'Complete all items first'
                              }
                            >
                              {allItemsDone
                                ? 'Finish Design'
                                : 'Complete All Items'}
                            </button>
                          )}

                        </div>

                        {/* =================================
                            EXPANDED DETAILS
                        ================================== */}

                        {isExpanded && (
                          <div className="statistics-order-details">

                            <h4>
                              Customer Details
                            </h4>

                            <div className="details-grid">

                              <div>
                                <strong>
                                  Source
                                </strong>

                                <span>
                                  {getSourceLabel(
                                    order,
                                  )}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Order / Measurement ID
                                </strong>

                                <span>
                                  {getOrderId(
                                    order,
                                  )}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Customer
                                </strong>

                                <span>
                                  {order
                                    .customer
                                    .name ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Company
                                </strong>

                                <span>
                                  {order
                                    .customer
                                    .companyName ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Phone
                                </strong>

                                <span>
                                  {order
                                    .customer
                                    .phoneNumber ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  WhatsApp
                                </strong>

                                <span>
                                  {order
                                    .customer
                                    .whatsappNumber ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Place
                                </strong>

                                <span>
                                  {order
                                    .customer
                                    .place ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Designer
                                </strong>

                                <span>
                                  {getDesignerLabel(
                                    order,
                                  )}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Design Status
                                </strong>

                                <span>
                                  {order
                                    .statuses
                                    .design}
                                </span>
                              </div>

                              {isMeasurement && (
                                <div>
                                  <strong>
                                    Quotation
                                  </strong>

                                  <span>
                                    {order
                                      .quotationStatus ||
                                      'Pending'}
                                  </span>
                                </div>
                              )}

                              {isMeasurement &&
                                order
                                  .quotationGeneratedBy && (
                                  <div>
                                    <strong>
                                      Quotation Generated By
                                    </strong>

                                    <span>
                                      {
                                        order
                                          .quotationGeneratedBy
                                          .name
                                      }
                                    </span>
                                  </div>
                                )}

                              {order.designCharge !==
                                undefined && (
                                <div>
                                  <strong>
                                    Design Charge
                                  </strong>

                                  <span>
                                    ₹
                                    {
                                      order.designCharge
                                    }
                                  </span>
                                </div>
                              )}

                            </div>

                            {/* =================================
                                ITEM LIST
                            ================================== */}

                            <h4>
                              Items for Design
                            </h4>

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
                                      Remarks
                                    </th>

                                    <th>
                                      Design
                                    </th>

                                  </tr>
                                </thead>

                                <tbody>

                                  {order.items.map(
                                    (
                                      item,
                                      itemIndex,
                                    ) => {

                                      const itemKey =
                                        `${order.source}-${order.id}-${itemIndex}`

                                      const itemDone =
                                        item.designStatus ===
                                        'finished'

                                      const itemNA =
                                        item.designStatus ===
                                        'na'

                                      return (
                                        <tr
                                          key={
                                            itemKey
                                          }
                                        >

                                          <td className="sl-number">
                                            {item.slNo ??
                                              itemIndex +
                                                1}
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
                                            {item.remarks ||
                                              '-'}
                                          </td>

                                          <td>

                                            <div
                                              style={{
                                                display:
                                                  'flex',
                                                gap:
                                                  '6px',
                                                flexWrap:
                                                  'wrap',
                                              }}
                                            >

                                              {/* NA */}

                                              <button
                                                type="button"
                                                disabled={
                                                  !assignedToMe ||
                                                  savingItem ===
                                                    itemKey ||
                                                  itemDone ||
                                                  itemNA
                                                }
                                                onClick={() =>
                                                  handleItemStatus(
                                                    order,
                                                    itemIndex,
                                                    'na',
                                                  )
                                                }
                                                style={{
                                                  border:
                                                    '1px solid #cbd5e1',
                                                  borderRadius:
                                                    '7px',
                                                  padding:
                                                    '7px 10px',
                                                  background:
                                                    itemNA
                                                      ? '#e2e8f0'
                                                      : 'white',
                                                  color:
                                                    '#475569',
                                                  fontWeight:
                                                    600,
                                                  cursor:
                                                    'pointer',
                                                }}
                                              >
                                                NA
                                              </button>

                                              {/* FINISHED */}

                                              <button
                                                type="button"
                                                disabled={
                                                  !assignedToMe ||
                                                  savingItem ===
                                                    itemKey ||
                                                  itemDone ||
                                                  itemNA
                                                }
                                                onClick={() =>
                                                  handleItemStatus(
                                                    order,
                                                    itemIndex,
                                                    'finished',
                                                  )
                                                }
                                                style={{
                                                  border:
                                                    '1px solid #86efac',
                                                  borderRadius:
                                                    '7px',
                                                  padding:
                                                    '7px 10px',
                                                  background:
                                                    itemDone
                                                      ? '#dcfce7'
                                                      : 'white',
                                                  color:
                                                    '#166534',
                                                  fontWeight:
                                                    700,
                                                  cursor:
                                                    'pointer',
                                                }}
                                              >
                                                ✓
                                              </button>

                                            </div>

                                            <div
                                              style={{
                                                marginTop:
                                                  '6px',
                                                fontSize:
                                                  '12px',
                                                color:
                                                  itemDone
                                                    ? '#15803d'
                                                    : itemNA
                                                      ? '#64748b'
                                                      : '#f59e0b',
                                                fontWeight:
                                                  600,
                                              }}
                                            >
                                              {itemDone
                                                ? 'Design Finished'
                                                : itemNA
                                                  ? 'Design NA'
                                                  : 'Pending'}
                                            </div>

                                          </td>

                                        </tr>
                                      )
                                    },
                                  )}

                                </tbody>

                              </table>

                            </div>

                            {/* =================================
                                MEASUREMENT DESIGN STATUS
                            ================================== */}

                            {isMeasurement && (
                              <div
                                style={{
                                  marginTop:
                                    '20px',
                                  padding:
                                    '15px',
                                  borderRadius:
                                    '10px',
                                  background:
                                    order
                                      .statuses
                                      .design ===
                                    'In Progress'
                                      ? '#eff6ff'
                                      : '#f8fafc',
                                  border:
                                    '1px solid #e2e8f0',
                                }}
                              >

                                <strong>
                                  Measurement Design Progress
                                </strong>

                                <p
                                  style={{
                                    margin:
                                      '6px 0 0',
                                    color:
                                      '#64748b',
                                  }}
                                >
                                  {order
                                    .statuses
                                    .design ===
                                  'In Progress'
                                    ? 'Design work is currently assigned and in progress.'
                                    : 'Accept this Measurement before starting design work.'}
                                </p>

                              </div>
                            )}

                            {/* =================================
                                JOB ORDER COMPLETION INFORMATION
                            ================================== */}

                            {!isMeasurement && (
                              <div
                                style={{
                                  marginTop:
                                    '20px',
                                  padding:
                                    '15px',
                                  borderRadius:
                                    '10px',
                                  background:
                                    allItemsDone
                                      ? '#dcfce7'
                                      : '#f8fafc',
                                  border:
                                    '1px solid #e2e8f0',
                                }}
                              >

                                <strong>
                                  Design Progress
                                </strong>

                                <p
                                  style={{
                                    margin:
                                      '6px 0 0',
                                    color:
                                      '#64748b',
                                  }}
                                >
                                  {allItemsDone
                                    ? 'All items are completed. Design can now be finished.'
                                    : 'Every item must be marked ✓ Finished or NA before the order can be finished.'}
                                </p>

                              </div>
                            )}

                          </div>
                        )}

                      </div>
                    )
                  },
                )}

              </div>
            )}

        </div>

      </div>

      {/* =========================================
          FINISH DESIGN MODAL
      ========================================== */}

      {finishOrderId && (
        <div className="modal-overlay">

          <div
            className="edit-modal"
            style={{
              maxWidth:
                '500px',
            }}
          >

            <div className="edit-modal-header">

              <div>
                <h2>
                  Finish Design
                </h2>

                <p>
                  Enter the design charge
                  before completing this
                  design work.
                </p>
              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={() => {
                  setFinishOrderId(
                    null,
                  )

                  setDesignCharge('')
                }}
              >
                ×
              </button>

            </div>

            {/* =====================================
                DESIGN CHARGE
                NOW SHOWN FOR BOTH
                JOB ORDER AND MEASUREMENT
            ====================================== */}

            <div className="input-group">

              <label>
                Design Charge
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={
                  designCharge
                }
                onChange={(
                  event,
                ) =>
                  setDesignCharge(
                    event.target.value,
                  )
                }
                placeholder="Enter design charge"
              />

              <small
                style={{
                  display:
                    'block',
                  marginTop:
                    '6px',
                  color:
                    '#64748b',
                }}
              >
                Enter the amount charged
                for the design work.
              </small>

            </div>

            <div className="form-actions">

              <button
                type="button"
                className="cancel-button"
                onClick={() => {
                  setFinishOrderId(
                    null,
                  )

                  setDesignCharge('')
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                className="submit-job-button"
                disabled={
                  finishingOrder !==
                  null
                }
                onClick={
                  handleFinishDesign
                }
              >
                {finishingOrder
                  ? 'Finishing...'
                  : 'Finish Design'}
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

export default Designer

