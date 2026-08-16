import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  Timestamp,
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

type CuttingFilter =
  | 'all'
  | 'pending'
  | 'today'
  | 'late'

interface CuttingItem {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string

  cuttingStatus?:
    | 'pending'
    | 'finished'
    | 'na'
}

interface JobOrder {
  id: string

  orderId?: number | string

  date: string

  expectedDeliveryDate?: string

  branch?: string

  customer: {
    name: string
    companyName: string
    phoneNumber: string
    whatsappNumber: string
    place: string
  }

  items: CuttingItem[]

  officeInfo: {
    designJob: boolean
    cuttingJob: boolean
    printJob: boolean
    productionJob: boolean

    designer?: string | null
    designerUsername?: string | null

    cutting?: string | null
    cuttingUsername?: string | null

    printBranch?: string | null
  }

  customerAdviser: {
    name: string
    username: string
  }

  statuses?: {
    design:
      | 'Pending'
      | 'In Progress'
      | 'Finished'

    cutting:
      | 'Pending'
      | 'In Progress'
      | 'Finished'

    print:
      | 'Pending'
      | 'In Progress'
      | 'Finished'

    production:
      | 'Pending'
      | 'In Progress'
      | 'Finished'
  }

  delivered?: boolean

  createdAt?: Timestamp
}

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

function Cutting({
  user,
}: CuttingProps) {
  /*
   * =========================================
   * USER
   * =========================================
   */

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

  const [jobOrders, setJobOrders] =
    useState<JobOrder[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [showAllWork, setShowAllWork] =
    useState(false)

  const [activeFilter, setActiveFilter] =
    useState<CuttingFilter>('pending')

  const [expandedOrder, setExpandedOrder] =
    useState<string | null>(null)

  const [savingItem, setSavingItem] =
    useState<string | null>(null)

  const [acceptingOrder, setAcceptingOrder] =
    useState<string | null>(null)

  const [finishingOrder, setFinishingOrder] =
    useState<string | null>(null)

  /*
   * =========================================
   * FETCH CUTTING JOBS
   * =========================================
   */

  useEffect(() => {
    const ordersRef =
      collection(db, 'job_orders')

    const ordersQuery = query(
      ordersRef,
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe =
      onSnapshot(
        ordersQuery,
        (snapshot) => {
          const orders: JobOrder[] =
            snapshot.docs.map(
              (document) => {
                const data =
                  document.data()

                const rawItems =
                  Array.isArray(
                    data.items,
                  )
                    ? data.items
                    : []

                const items: CuttingItem[] =
                  rawItems.map(
                    (
                      item: CuttingItem,
                    ) => ({
                      ...item,

                      cuttingStatus:
                        item.cuttingStatus ??
                        'pending',
                    }),
                  )

                return {
                  id: document.id,

                  orderId:
                    data.orderId ??
                    data.orderNumber ??
                    '',

                  date:
                    data.date || '',

                  expectedDeliveryDate:
                    data.expectedDeliveryDate ??
                    data.deliveryDate ??
                    '',

                  branch:
                    data.branch ??
                    data.selectedBranch ??
                    '',

                  customer: {
                    name:
                      data.customer?.name ??
                      '',

                    companyName:
                      data.customer
                        ?.companyName ??
                      '',

                    phoneNumber:
                      data.customer
                        ?.phoneNumber ??
                      '',

                    whatsappNumber:
                      data.customer
                        ?.whatsappNumber ??
                      '',

                    place:
                      data.customer?.place ??
                      '',
                  },

                  items,

                  officeInfo: {
                    designJob:
                      data.officeInfo
                        ?.designJob ??
                      false,

                    cuttingJob:
                      data.officeInfo
                        ?.cuttingJob ??
                      false,

                    printJob:
                      data.officeInfo
                        ?.printJob ??
                      false,

                    productionJob:
                      data.officeInfo
                        ?.productionJob ??
                      false,

                    designer:
                      data.officeInfo
                        ?.designer ??
                      null,

                    designerUsername:
                      data.officeInfo
                        ?.designerUsername ??
                      null,

                    cutting:
                      data.officeInfo
                        ?.cutting ??
                      null,

                    cuttingUsername:
                      data.officeInfo
                        ?.cuttingUsername ??
                      null,

                    printBranch:
                      data.officeInfo
                        ?.printBranch ??
                      null,
                  },

                  customerAdviser: {
                    name:
                      data.customerAdviser
                        ?.name ??
                      '',

                    username:
                      data.customerAdviser
                        ?.username ??
                      '',
                  },

                  statuses: {
                    design:
                      data.statuses
                        ?.design ??
                      'Pending',

                    cutting:
                      data.statuses
                        ?.cutting ??
                      'Pending',

                    print:
                      data.statuses?.print ??
                      'Pending',

                    production:
                      data.statuses
                        ?.production ??
                      'Pending',
                  },

                  delivered:
                    data.delivered ??
                    false,

                  createdAt:
                    data.createdAt,
                }
              },
            )

          /*
           * Only show actual cutting jobs.
           *
           * Finished cutting jobs are removed
           * automatically.
           */

          const activeCuttingOrders =
            orders.filter(
              (order) =>
                order.officeInfo
                  .cuttingJob === true &&
                order.statuses?.cutting !==
                  'Finished',
            )

          setJobOrders(
            activeCuttingOrders,
          )

          setLoading(false)
        },
        (firebaseError) => {
          console.error(
            'Error fetching cutting jobs:',
            firebaseError,
          )

          setError(
            'Unable to load cutting work.',
          )

          setLoading(false)
        },
      )

    return () => unsubscribe()
  }, [])

  /*
   * =========================================
   * CHECK ASSIGNMENT
   * =========================================
   */

  const isAssignedToCurrentUser = (
    order: JobOrder,
  ) => {
    /*
     * Prefer username because it is unique.
     */

    if (
      order.officeInfo
        .cuttingUsername
    ) {
      return (
        order.officeInfo
          .cuttingUsername ===
        currentUser.username
      )
    }

    /*
     * Backward compatibility using name.
     */

    return (
      !!order.officeInfo.cutting &&
      order.officeInfo.cutting ===
        currentUser.name
    )
  }

  /*
   * =========================================
   * ITEM STATE
   * =========================================
   */

  const hasStartedCuttingWork = (
    order: JobOrder,
  ) => {
    return order.items.some(
      (item) =>
        item.cuttingStatus ===
          'finished' ||
        item.cuttingStatus === 'na',
    )
  }

  const areAllItemsFinished = (
    order: JobOrder,
  ) => {
    if (
      order.items.length === 0
    ) {
      return false
    }

    return order.items.every(
      (item) =>
        item.cuttingStatus ===
          'finished' ||
        item.cuttingStatus === 'na',
    )
  }

  /*
   * =========================================
   * AVAILABLE WORK
   * =========================================
   */

  const visibleOrders = useMemo(() => {
    if (showAllWork) {
      return jobOrders
    }

    return jobOrders.filter(
      (order) =>
        isAssignedToCurrentUser(
          order,
        ),
    )
  }, [
    jobOrders,
    showAllWork,
    currentUser.username,
    currentUser.name,
  ])

  /*
   * =========================================
   * COUNTS
   * =========================================
   */

  const pendingCount = useMemo(() => {
    return visibleOrders.filter(
      (order) =>
        !areAllItemsFinished(order),
    ).length
  }, [visibleOrders])

  const todayCount = useMemo(() => {
    const today =
      getTodayString()

    return visibleOrders.filter(
      (order) =>
        order.expectedDeliveryDate ===
          today &&
        !areAllItemsFinished(order),
    ).length
  }, [visibleOrders])

  const lateCount = useMemo(() => {
    const today =
      getTodayString()

    return visibleOrders.filter(
      (order) =>
        !!order.expectedDeliveryDate &&
        order.expectedDeliveryDate <
          today &&
        !areAllItemsFinished(order),
    ).length
  }, [visibleOrders])

  /*
   * =========================================
   * FILTERED ORDERS
   * =========================================
   */

  const filteredOrders = useMemo(() => {
    const today =
      getTodayString()

    switch (activeFilter) {
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
    filter: CuttingFilter,
  ) => {
    setActiveFilter(filter)

    setExpandedOrder(null)
  }

  /*
   * =========================================
   * ACCEPT WORK
   * =========================================
   */

  const handleAcceptWork = async (
    order: JobOrder,
  ) => {
    if (
      acceptingOrder === order.id
    ) {
      return
    }

    /*
     * If cutting work has already started,
     * another worker cannot take it.
     */

    if (
      hasStartedCuttingWork(order)
    ) {
      alert(
        'This cutting work has already started. Another cutting worker cannot accept this order.',
      )

      return
    }

    setAcceptingOrder(order.id)

    setError('')

    try {
      await updateDoc(
        doc(
          db,
          'job_orders',
          order.id,
        ),
        {
          'officeInfo.cutting':
            currentUser.name,

          'officeInfo.cuttingUsername':
            currentUser.username,

          'statuses.cutting':
            'In Progress',
        },
      )
    } catch (firebaseError) {
      console.error(
        'Error accepting cutting work:',
        firebaseError,
      )

      setError(
        'Unable to accept this work.',
      )
    } finally {
      setAcceptingOrder(null)
    }
  }

  /*
   * =========================================
   * UPDATE ITEM STATUS
   * =========================================
   */

  const handleItemStatus = async (
    order: JobOrder,
    itemIndex: number,
    status:
      | 'finished'
      | 'na',
  ) => {
    if (
      savingItem ===
      `${order.id}-${itemIndex}`
    ) {
      return
    }

    /*
     * Only assigned cutting worker
     * can update items.
     */

    if (
      !isAssignedToCurrentUser(
        order,
      )
    ) {
      alert(
        'Accept this work before updating the cutting status.',
      )

      return
    }

    if (
      order.statuses?.cutting ===
      'Finished'
    ) {
      return
    }

    const updatedItems =
      order.items.map(
        (item, index) =>
          index === itemIndex
            ? {
                ...item,
                cuttingStatus: status,
              }
            : item,
      )

    setSavingItem(
      `${order.id}-${itemIndex}`,
    )

    setError('')

    try {
      await updateDoc(
        doc(
          db,
          'job_orders',
          order.id,
        ),
        {
          items: updatedItems,

          'statuses.cutting':
            'In Progress',

          'officeInfo.cutting':
            currentUser.name,

          'officeInfo.cuttingUsername':
            currentUser.username,
        },
      )
    } catch (firebaseError) {
      console.error(
        'Error updating cutting item:',
        firebaseError,
      )

      setError(
        'Unable to update item status.',
      )
    } finally {
      setSavingItem(null)
    }
  }

  /*
   * =========================================
   * FINISH CUTTING
   * =========================================
   */

  const handleFinishCutting =
    async (
      order: JobOrder,
    ) => {
      if (
        !isAssignedToCurrentUser(
          order,
        )
      ) {
        alert(
          'Only the assigned cutting worker can finish this work.',
        )

        return
      }

      if (
        !areAllItemsFinished(order)
      ) {
        alert(
          'Every item must be marked Finished Cutting or NA before completing the order.',
        )

        return
      }

      if (
        finishingOrder === order.id
      ) {
        return
      }

      setFinishingOrder(order.id)

      setError('')

      try {
        await updateDoc(
          doc(
            db,
            'job_orders',
            order.id,
          ),
          {
            items: order.items,

            'statuses.cutting':
              'Finished',

            'officeInfo.cutting':
              currentUser.name,

            'officeInfo.cuttingUsername':
              currentUser.username,
          },
        )

        setExpandedOrder(null)
      } catch (firebaseError) {
        console.error(
          'Error finishing cutting:',
          firebaseError,
        )

        setError(
          'Unable to finish cutting work.',
        )
      } finally {
        setFinishingOrder(null)
      }
    }

  /*
   * =========================================
   * ORDER ID
   * =========================================
   */

  const getOrderId = (
    order: JobOrder,
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
   * CUTTING WORKER LABEL
   * =========================================
   */

  const getCuttingLabel = (
    order: JobOrder,
  ) => {
    if (
      isAssignedToCurrentUser(
        order,
      )
    ) {
      return `${currentUser.name} (You)`
    }

    return (
      order.officeInfo.cutting ||
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
              Cutting Dashboard
            </h1>

            <p>
              Cutting work • Priority:
              Design → Cutting → Printing
              → Production
            </p>
          </div>

          {/* MY WORK / ALL WORK */}

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

              setExpandedOrder(null)
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

          {/* ALL */}

          <button
            type="button"
            className={
              activeFilter === 'all'
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
              All active cutting orders
            </div>
          </button>


          {/* PENDING */}

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
              Cutting work pending
            </div>
          </button>


          {/* TODAY */}

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


          {/* LATE */}

          <button
            type="button"
            className={
              activeFilter === 'late'
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
                ? ' All Cutting Workers'
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
                Cutting Work
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
              Loading cutting work...
            </div>
          )}


          {!loading &&
            filteredOrders.length ===
              0 && (
              <div className="empty-items">

                <h3>
                  No Cutting Work Found
                </h3>

                <p>
                  There are no active
                  cutting orders matching
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
                      order.id

                    const assignedToMe =
                      isAssignedToCurrentUser(
                        order,
                      )

                    const workStarted =
                      hasStartedCuttingWork(
                        order,
                      )

                    const allItemsDone =
                      areAllItemsFinished(
                        order,
                      )

                    return (
                      <div
                        key={order.id}
                        className="statistics-order-card"
                      >

                        {/* =================================
                            ORDER HEADER
                        ================================== */}

                        <div className="statistics-order-header">

                          <div>

                            <div className="job-order-id">
                              Order ID:{' '}
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
                              Branch:{' '}
                              {order.branch ||
                                '-'}
                            </span>

                            <span>
                              Delivery:{' '}
                              {order
                                .expectedDeliveryDate ||
                                '-'}
                            </span>

                            <span>
                              Cutting:{' '}
                              {getCuttingLabel(
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
                              Cutting Status
                            </strong>

                            <span>
                              {order
                                .statuses
                                ?.cutting ||
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
                                  order.id
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
                                  : order.id,
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
                                handleFinishCutting(
                                  order,
                                )
                              }
                              title={
                                allItemsDone
                                  ? 'Finish cutting'
                                  : 'Complete all items first'
                              }
                            >
                              {finishingOrder ===
                              order.id
                                ? 'Finishing...'
                                : allItemsDone
                                  ? 'Finish Cutting'
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
                                  Cutting Worker
                                </strong>

                                <span>
                                  {getCuttingLabel(
                                    order,
                                  )}
                                </span>
                              </div>

                            </div>


                            {/* =================================
                                ITEM LIST
                            ================================== */}

                            <h4>
                              Items for Cutting
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
                                      Cutting
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
                                        `${order.id}-${itemIndex}`

                                      const itemDone =
                                        item.cuttingStatus ===
                                        'finished'

                                      const itemNA =
                                        item.cuttingStatus ===
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


                                            {/* ITEM STATUS */}

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
                                                ? 'Cutting Finished'
                                                : itemNA
                                                  ? 'Cutting NA'
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
                                COMPLETION INFORMATION
                            ================================== */}

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
                                Cutting Progress
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
                                  ? 'All items are completed. Cutting can now be finished.'
                                  : 'Every item must be marked ✓ Finished or NA before the order can be finished.'}
                              </p>

                            </div>

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

    </div>
  )
}

export default Cutting