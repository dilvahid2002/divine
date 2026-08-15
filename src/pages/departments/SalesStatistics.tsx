import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface SalesStatisticsProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

type StatisticsFilter =
  | 'none'
  | 'not-delivered'
  | 'today'
  | 'missed-delivery'

type StatisticsTab = 'all' | 'mine'

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

  items: {
    slNo: number
    name: string
    width: string
    height: string
    qty: string
    price: string
    remarks: string
  }[]

  officeInfo: {
    designJob: boolean
    printJob: boolean
    productionJob: boolean
    designer?: string | null
    printBranch?: string | null
  }

  customerAdviser: {
    name: string
    username: string
  }

  statuses?: {
    design: 'Pending' | 'In Progress' | 'Finished'
    print: 'Pending' | 'In Progress' | 'Finished'
    production: 'Pending' | 'In Progress' | 'Finished'
  }

  delivered?: boolean

  createdAt?: Timestamp
}

const branches = [
  'Kalpetta',
  'Kondotty',
  'Sulthan Bathery',
]

function SalesStatistics({
  user,
}: SalesStatisticsProps) {
  const [jobOrders, setJobOrders] = useState<JobOrder[]>([])

  const [loading, setLoading] = useState(true)

  const [error, setError] = useState('')

  const [selectedBranch, setSelectedBranch] =
    useState('')

  const [activeTab, setActiveTab] =
    useState<StatisticsTab>('all')

  const [activeFilter, setActiveFilter] =
    useState<StatisticsFilter>('none')

  const [expandedOrder, setExpandedOrder] =
    useState<string | null>(null)

  /*
   * =========================================
   * FETCH ORDERS
   * =========================================
   */

  useEffect(() => {
    const ordersRef = collection(
      db,
      'job_orders',
    )

    const ordersQuery = query(
      ordersRef,
      orderBy('createdAt', 'desc'),
    )

    const unsubscribe = onSnapshot(
      ordersQuery,
      (snapshot) => {
        const orders: JobOrder[] =
          snapshot.docs.map((document) => {
            const data = document.data()

            return {
              id: document.id,

              orderId:
                data.orderId ??
                data.orderNumber ??
                '',

              date: data.date || '',

              expectedDeliveryDate:
                data.expectedDeliveryDate ||
                data.deliveryDate ||
                '',

              branch:
                data.branch ||
                data.selectedBranch ||
                '',

              customer: {
                name:
                  data.customer?.name || '',

                companyName:
                  data.customer?.companyName ||
                  '',

                phoneNumber:
                  data.customer?.phoneNumber ||
                  '',

                whatsappNumber:
                  data.customer?.whatsappNumber ||
                  '',

                place:
                  data.customer?.place || '',
              },

              items: Array.isArray(
                data.items,
              )
                ? data.items
                : [],

              officeInfo: {
                designJob:
                  data.officeInfo
                    ?.designJob || false,

                printJob:
                  data.officeInfo
                    ?.printJob || false,

                productionJob:
                  data.officeInfo
                    ?.productionJob || false,

                designer:
                  data.officeInfo?.designer ||
                  null,

                printBranch:
                  data.officeInfo
                    ?.printBranch ||
                  null,
              },

              customerAdviser: {
                name:
                  data.customerAdviser
                    ?.name || '',

                username:
                  data.customerAdviser
                    ?.username || '',
              },

              statuses: {
                design:
                  data.statuses?.design ||
                  'Pending',

                print:
                  data.statuses?.print ||
                  'Pending',

                production:
                  data.statuses?.production ||
                  'Pending',
              },

              delivered:
                data.delivered || false,

              createdAt:
                data.createdAt,
            }
          })

        setJobOrders(orders)

        setLoading(false)
      },
      (firebaseError) => {
        console.error(
          'Error fetching sales statistics:',
          firebaseError,
        )

        setError(
          'Unable to load sales statistics.',
        )

        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  /*
   * =========================================
   * TODAY
   * =========================================
   */

  const getTodayString = () => {
    const today = new Date()

    const year =
      today.getFullYear()

    const month = String(
      today.getMonth() + 1,
    ).padStart(2, '0')

    const day = String(
      today.getDate(),
    ).padStart(2, '0')

    return `${year}-${month}-${day}`
  }

  /*
   * =========================================
   * BRANCH FILTER
   * =========================================
   */

  const branchOrders = useMemo(() => {
    if (!selectedBranch) {
      return jobOrders
    }

    return jobOrders.filter(
      (order) =>
        order.branch ===
        selectedBranch,
    )
  }, [
    jobOrders,
    selectedBranch,
  ])

  /*
   * =========================================
   * TAB FILTER
   * =========================================
   */

  const tabOrders = useMemo(() => {
    if (activeTab === 'all') {
      return branchOrders
    }

    return branchOrders.filter(
      (order) =>
        order.customerAdviser
          .username === user.username,
    )
  }, [
    branchOrders,
    activeTab,
    user.username,
  ])

  /*
   * =========================================
   * DASHBOARD COUNTS
   * =========================================
   */

  const notDeliveredCount = useMemo(() => {
    return tabOrders.filter(
      (order) => !order.delivered,
    ).length
  }, [tabOrders])

  const todayCount = useMemo(() => {
    const today = getTodayString()

    return tabOrders.filter(
      (order) =>
        !order.delivered &&
        order.expectedDeliveryDate ===
          today,
    ).length
  }, [tabOrders])

  /*
   * =========================================
   * MISSED DELIVERY COUNT
   *
   * Delivery date is BEFORE today
   * and order is still not delivered.
   * =========================================
   */

  const missedDeliveryCount = useMemo(() => {
    const today = getTodayString()

    return tabOrders.filter((order) => {
      if (order.delivered) {
        return false
      }

      if (!order.expectedDeliveryDate) {
        return false
      }

      return (
        order.expectedDeliveryDate <
        today
      )
    }).length
  }, [tabOrders])

  /*
   * =========================================
   * LIST FILTER
   * =========================================
   */

  const filteredOrders = useMemo(() => {
    /*
     * NOT DELIVERED
     */
    if (
      activeFilter ===
      'not-delivered'
    ) {
      return tabOrders.filter(
        (order) =>
          !order.delivered,
      )
    }

    /*
     * MUST DELIVER TODAY
     */
    if (
      activeFilter ===
      'today'
    ) {
      const today =
        getTodayString()

      return tabOrders.filter(
        (order) =>
          !order.delivered &&
          order.expectedDeliveryDate ===
            today,
      )
    }

    /*
     * MISSED DELIVERY
     *
     * Expected delivery date is
     * before today and order is
     * still not delivered.
     */
    if (
      activeFilter ===
      'missed-delivery'
    ) {
      const today =
        getTodayString()

      return tabOrders.filter(
        (order) =>
          !order.delivered &&
          !!order.expectedDeliveryDate &&
          order.expectedDeliveryDate <
            today,
      )
    }

    return tabOrders
  }, [
    tabOrders,
    activeFilter,
  ])

  /*
   * =========================================
   * CARD CLICK
   * =========================================
   */

  const handleFilterClick = (
    filter: StatisticsFilter,
  ) => {
    setActiveFilter(
      activeFilter === filter
        ? 'none'
        : filter,
    )

    setExpandedOrder(null)
  }

  /*
   * =========================================
   * TAB CHANGE
   * =========================================
   */

  const handleTabChange = (
    tab: StatisticsTab,
  ) => {
    setActiveTab(tab)

    setActiveFilter('none')

    setExpandedOrder(null)
  }

  /*
   * =========================================
   * BRANCH CHANGE
   * =========================================
   */

  const handleBranchChange = (
    branch: string,
  ) => {
    setSelectedBranch(branch)

    setActiveFilter('none')

    setExpandedOrder(null)
  }

  /*
   * =========================================
   * FORMAT ORDER ID
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
   * ACTIVE FILTER LABEL
   * =========================================
   */

  const getActiveFilterLabel = () => {
    if (
      activeFilter ===
      'not-delivered'
    ) {
      return 'Not Delivered'
    }

    if (
      activeFilter ===
      'today'
    ) {
      return 'Must Deliver Today'
    }

    if (
      activeFilter ===
      'missed-delivery'
    ) {
      return 'Missed Delivery'
    }

    return ''
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
              Sales Statistics
            </h1>

            <p>
              Track job orders and delivery
              performance
            </p>
          </div>

        </div>


        {/* =====================================
            BRANCH SELECTOR
        ====================================== */}

        <div className="department-section">

          <div className="section-heading-row">

            <div>
              <h2>
                Select Branch
              </h2>

              <p>
                Choose a branch to view
                sales statistics.
              </p>
            </div>

          </div>

          <div className="statistics-branch-selector">

            <select
              value={selectedBranch}
              onChange={(event) =>
                handleBranchChange(
                  event.target.value,
                )
              }
            >

              <option value="">
                All Branches
              </option>

              {branches.map(
                (branch) => (
                  <option
                    key={branch}
                    value={branch}
                  >
                    {branch}
                  </option>
                ),
              )}

            </select>

          </div>

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
            TABS
        ====================================== */}

        <div className="statistics-tabs">

          <button
            type="button"
            className={
              activeTab === 'all'
                ? 'statistics-tab active'
                : 'statistics-tab'
            }
            onClick={() =>
              handleTabChange('all')
            }
          >

            <span>
              All Orders
            </span>

            <small>
              Everyone
            </small>

          </button>


          <button
            type="button"
            className={
              activeTab === 'mine'
                ? 'statistics-tab active'
                : 'statistics-tab'
            }
            onClick={() =>
              handleTabChange('mine')
            }
          >

            <span>
              Your Orders
            </span>

            <small>
              {user.name}
            </small>

          </button>

        </div>


        {/* =====================================
            DASHBOARD
        ====================================== */}

        <div className="statistics-dashboard">

          {/* ===================================
              NOT DELIVERED
          ==================================== */}

          <button
            type="button"
            className={
              activeFilter ===
              'not-delivered'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'not-delivered',
              )
            }
          >

            <div className="statistics-card-label">
              Not Delivered
            </div>

            <div className="statistics-card-value">
              {notDeliveredCount}
            </div>

            <div className="statistics-card-help">
              Click to view orders
            </div>

          </button>


          {/* ===================================
              MUST DELIVER TODAY
          ==================================== */}

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
              Must Deliver Today
            </div>

            <div className="statistics-card-value">
              {todayCount}
            </div>

            <div className="statistics-card-help">
              Expected delivery today
            </div>

          </button>


          {/* ===================================
              MISSED DELIVERY
          ==================================== */}

          <button
            type="button"
            className={
              activeFilter ===
              'missed-delivery'
                ? 'statistics-card selected'
                : 'statistics-card'
            }
            onClick={() =>
              handleFilterClick(
                'missed-delivery',
              )
            }
          >

            <div className="statistics-card-label">
              Missed Delivery
            </div>

            <div className="statistics-card-value">
              {missedDeliveryCount}
            </div>

            <div className="statistics-card-help">
              Delivery date has passed
            </div>

          </button>

        </div>


        {/* =====================================
            ACTIVE FILTER
        ====================================== */}

        {activeFilter !==
          'none' && (
          <div className="statistics-filter-bar">

            <div>
              <strong>
                Showing:
              </strong>

              <span>
                {' '}
                {getActiveFilterLabel()}
              </span>
            </div>

            <button
              type="button"
              onClick={() =>
                setActiveFilter(
                  'none',
                )
              }
            >
              Clear Filter
            </button>

          </div>
        )}


        {/* =====================================
            RESULTS
        ====================================== */}

        <div className="department-section">

          <div className="section-heading-row">

            <div>
              <h2>
                Orders
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


          {/* LOADING */}

          {loading && (
            <div className="empty-items">
              Loading orders...
            </div>
          )}


          {/* EMPTY */}

          {!loading &&
            filteredOrders.length ===
              0 && (
              <div className="empty-items">

                <h3>
                  No Orders Found
                </h3>

                <p>
                  There are no orders
                  matching the current
                  selection.
                </p>

              </div>
            )}


          {/* ORDERS */}

          {!loading &&
            filteredOrders.length >
              0 && (
              <div className="statistics-orders-list">

                {filteredOrders.map(
                  (order) => {

                    const isExpanded =
                      expandedOrder ===
                      order.id

                    return (
                      <div
                        key={order.id}
                        className={
                          order.delivered
                            ? 'statistics-order-card delivered'
                            : 'statistics-order-card'
                        }
                      >

                        {/* ORDER HEADER */}

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
                              Entry:{' '}
                              {order.date ||
                                '-'}
                            </span>

                            <span>
                              Delivery:{' '}
                              {order
                                .expectedDeliveryDate ||
                                '-'}
                            </span>

                          </div>

                        </div>


                        {/* SUMMARY */}

                        <div className="statistics-order-summary">

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
                              Designer
                            </strong>

                            <span>
                              {order
                                .officeInfo
                                .designer ||
                                '-'}
                            </span>
                          </div>


                          <div>
                            <strong>
                              Delivery
                            </strong>

                            <span>
                              {order.delivered
                                ? 'Delivered'
                                : 'Not Delivered'}
                            </span>
                          </div>

                        </div>


                        {/* VIEW BUTTON */}

                        <div className="statistics-order-actions">

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

                        </div>


                        {/* EXPANDED DETAILS */}

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
                                  Customer Adviser
                                </strong>

                                <span>
                                  {order
                                    .customerAdviser
                                    .name ||
                                    '-'}
                                </span>
                              </div>

                            </div>


                            <h4>
                              Job Status
                            </h4>

                            <div className="statistics-status-list">

                              {order
                                .officeInfo
                                .designJob && (
                                <span>
                                  Design:{' '}
                                  {order
                                    .statuses
                                    ?.design ||
                                    'Pending'}
                                </span>
                              )}


                              {order
                                .officeInfo
                                .printJob && (
                                <span>
                                  Print:{' '}
                                  {order
                                    .statuses
                                    ?.print ||
                                    'Pending'}
                                </span>
                              )}


                              {order
                                .officeInfo
                                .productionJob && (
                                <span>
                                  Production:{' '}
                                  {order
                                    .statuses
                                    ?.production ||
                                    'Pending'}
                                </span>
                              )}

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

export default SalesStatistics