
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

interface PrinterProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type PrinterFilter =
  | 'all'
  | 'pending'
  | 'today'
  | 'late'

interface PrintItem {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string

  printStatus?: 'pending' | 'printed' | 'na'
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

  items: PrintItem[]

  officeInfo: {
    designJob: boolean
    printJob: boolean
    productionJob: boolean

    designer?: string | null
    designerUsername?: string | null

    printer?: string | null
    printerUsername?: string | null

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

function Printer({
  user,
}: PrinterProps) {

  /*
   * =========================================
   * CURRENT USER
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

  const [activeFilter, setActiveFilter] =
    useState<PrinterFilter>('pending')

  const [selectedBranch, setSelectedBranch] =
    useState('all')

  const [expandedOrder, setExpandedOrder] =
    useState<string | null>(null)

  const [savingItem, setSavingItem] =
    useState<string | null>(null)

  const [finishingOrder, setFinishingOrder] =
    useState<string | null>(null)

  /*
   * =========================================
   * FETCH PRINT JOBS
   * =========================================
   */

  useEffect(() => {

    const ordersRef =
      collection(
        db,
        'job_orders',
      )

    const ordersQuery =
      query(
        ordersRef,
        orderBy(
          'createdAt',
          'desc',
        ),
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

                const items: PrintItem[] =
                  rawItems.map(
                    (
                      item: PrintItem,
                    ) => ({
                      ...item,

                      /*
                       * Older orders may not have
                       * printStatus.
                       */
                      printStatus:
                        item.printStatus ??
                        'pending',
                    }),
                  )

                return {
                  id:
                    document.id,

                  orderId:
                    data.orderId ??
                    data.orderNumber ??
                    '',

                  date:
                    data.date ??
                    '',

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
                      data.customer
                        ?.name ??
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
                      data.customer
                        ?.place ??
                      '',
                  },

                  items,

                  officeInfo: {
                    designJob:
                      data.officeInfo
                        ?.designJob ??
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

                    printer:
                      data.officeInfo
                        ?.printer ??
                      null,

                    printerUsername:
                      data.officeInfo
                        ?.printerUsername ??
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

                    print:
                      data.statuses
                        ?.print ??
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
           * =====================================
           * PRINT AVAILABILITY RULE
           * =====================================
           *
           * Print Job must be enabled.
           *
           * If Design Job is also enabled,
           * Design MUST be Finished before
           * the order becomes visible here.
           *
           * If there is no Design Job,
           * printing is available immediately.
           */

          const printOrders =
            orders.filter(
              (order) => {

                if (
                  order.officeInfo
                    .printJob !== true
                ) {
                  return false
                }

                if (
                  order.officeInfo
                    .designJob === true
                ) {
                  return (
                    order.statuses
                      ?.design ===
                    'Finished'
                  )
                }

                return true
              },
            )

          setJobOrders(
            printOrders,
          )

          setLoading(false)
        },
        (firebaseError) => {

          console.error(
            'Error fetching printer jobs:',
            firebaseError,
          )

          setError(
            'Unable to load printer work.',
          )

          setLoading(false)
        },
      )

    return () =>
      unsubscribe()

  }, [])

  /*
   * =========================================
   * BRANCH LIST
   * =========================================
   */

  const branches =
    useMemo(() => {

      const uniqueBranches =
        new Set<string>()

      jobOrders.forEach(
        (order) => {

          const branch =
            order.branch?.trim()

          if (branch) {
            uniqueBranches.add(
              branch,
            )
          }
        },
      )

      return Array.from(
        uniqueBranches,
      ).sort(
        (a, b) =>
          a.localeCompare(b),
      )

    }, [jobOrders])

  /*
   * =========================================
   * BRANCH FILTERED ORDERS
   * =========================================
   */

  const branchFilteredOrders =
    useMemo(() => {

      if (
        selectedBranch ===
        'all'
      ) {
        return jobOrders
      }

      return jobOrders.filter(
        (order) =>
          order.branch?.trim() ===
          selectedBranch,
      )

    }, [
      jobOrders,
      selectedBranch,
    ])

  /*
   * =========================================
   * ITEM STATE
   * =========================================
   */

  const hasStartedPrintWork = (
    order: JobOrder,
  ) => {

    return order.items.some(
      (item) =>
        item.printStatus ===
          'printed' ||
        item.printStatus ===
          'na',
    )
  }

  const areAllItemsFinished = (
    order: JobOrder,
  ) => {

    if (
      order.items.length ===
      0
    ) {
      return false
    }

    return order.items.every(
      (item) =>
        item.printStatus ===
          'printed' ||
        item.printStatus ===
          'na',
    )
  }

  /*
   * =========================================
   * COUNTS
   * =========================================
   */

  const pendingCount =
    useMemo(() => {

      return branchFilteredOrders.filter(
        (order) =>
          order.statuses
            ?.print !==
            'Finished' &&
          !areAllItemsFinished(
            order,
          ),
      ).length

    }, [
      branchFilteredOrders,
    ])

  const todayCount =
    useMemo(() => {

      const today =
        getTodayString()

      return branchFilteredOrders.filter(
        (order) =>
          order.statuses
            ?.print !==
            'Finished' &&
          order.expectedDeliveryDate ===
            today,
      ).length

    }, [
      branchFilteredOrders,
    ])

  const lateCount =
    useMemo(() => {

      const today =
        getTodayString()

      return branchFilteredOrders.filter(
        (order) =>
          order.statuses
            ?.print !==
            'Finished' &&
          !!order.expectedDeliveryDate &&
          order.expectedDeliveryDate <
            today,
      ).length

    }, [
      branchFilteredOrders,
    ])

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
          return branchFilteredOrders.filter(
            (order) =>
              order.statuses
                ?.print !==
                'Finished' &&
              !areAllItemsFinished(
                order,
              ),
          )

        case 'today':
          return branchFilteredOrders.filter(
            (order) =>
              order.statuses
                ?.print !==
                'Finished' &&
              order.expectedDeliveryDate ===
                today,
          )

        case 'late':
          return branchFilteredOrders.filter(
            (order) =>
              order.statuses
                ?.print !==
                'Finished' &&
              !!order.expectedDeliveryDate &&
              order.expectedDeliveryDate <
                today,
          )

        case 'all':
        default:
          return branchFilteredOrders.filter(
            (order) =>
              order.statuses
                ?.print !==
              'Finished',
          )
      }

    }, [
      branchFilteredOrders,
      activeFilter,
    ])

  /*
   * =========================================
   * FILTER CLICK
   * =========================================
   */

  const handleFilterClick = (
    filter: PrinterFilter,
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
   * BRANCH CHANGE
   * =========================================
   */

  const handleBranchChange = (
    branch: string,
  ) => {

    setSelectedBranch(
      branch,
    )

    setExpandedOrder(
      null,
    )
  }

  /*
   * =========================================
   * UPDATE ITEM PRINT STATUS
   * =========================================
   */

  const handleItemStatus = async (
    order: JobOrder,
    itemIndex: number,
    status:
      | 'printed'
      | 'na',
  ) => {

    const itemKey =
      `${order.id}-${itemIndex}`

    if (
      savingItem ===
      itemKey
    ) {
      return
    }

    /*
     * Once printing work is finished,
     * no further changes are allowed.
     */

    if (
      order.statuses?.print ===
      'Finished'
    ) {
      return
    }

    const currentItem =
      order.items[itemIndex]

    /*
     * Completed items cannot be changed.
     */

    if (
      currentItem.printStatus ===
        'printed' ||
      currentItem.printStatus ===
        'na'
    ) {
      return
    }

    /*
     * Make sure design is completed
     * when a design job exists.
     */

    if (
      order.officeInfo
        .designJob === true &&
      order.statuses
        ?.design !==
        'Finished'
    ) {

      alert(
        'Printing cannot start until the design is finished.',
      )

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
                printStatus:
                  status,
              }
            : item,
      )

    setSavingItem(
      itemKey,
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

          items:
            updatedItems,

          'statuses.print':
            'In Progress',

          /*
           * Automatically record the
           * printer when work starts.
           */
          'officeInfo.printer':
            currentUser.name,

          'officeInfo.printerUsername':
            currentUser.username,
        },
      )

    } catch (
      firebaseError
    ) {

      console.error(
        'Error updating print item:',
        firebaseError,
      )

      setError(
        'Unable to update print item status.',
      )

    } finally {

      setSavingItem(
        null,
      )
    }
  }

  /*
   * =========================================
   * FINISH PRINTING
   * =========================================
   */

  const handleFinishPrinting =
    async (
      order: JobOrder,
    ) => {

      if (
        !areAllItemsFinished(
          order,
        )
      ) {

        alert(
          'Every item must be marked Printed or NA before completing the print job.',
        )

        return
      }

      if (
        finishingOrder ===
        order.id
      ) {
        return
      }

      /*
       * Design must be finished when
       * the order has a design job.
       */

      if (
        order.officeInfo
          .designJob === true &&
        order.statuses
          ?.design !==
        'Finished'
      ) {

        alert(
          'Printing cannot be finished until the design is finished.',
        )

        return
      }

      setFinishingOrder(
        order.id,
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

            items:
              order.items,

            'statuses.print':
              'Finished',

            /*
             * IMPORTANT:
             * Save the user who actually
             * finished the printing.
             */
            'officeInfo.printer':
              currentUser.name,

            'officeInfo.printerUsername':
              currentUser.username,
          },
        )

        setExpandedOrder(
          null,
        )

      } catch (
        firebaseError
      ) {

        console.error(
          'Error finishing print:',
          firebaseError,
        )

        setError(
          'Unable to finish printing.',
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
    order: JobOrder,
  ) => {

    if (
      order.orderId !==
        undefined &&
      order.orderId !==
        ''
    ) {

      return order.orderId
    }

    return order.id
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
              Printer Dashboard
            </h1>

            <p>
              Printing work • Design
              must be finished first
            </p>

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
            BRANCH FILTER
        ====================================== */}

        <div
          className="statistics-filter-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >

          <div>

            <strong>
              Branch:
            </strong>

          </div>


          <select
            value={
              selectedBranch
            }
            onChange={(event) =>
              handleBranchChange(
                event.target.value,
              )
            }
            style={{
              minWidth:
                '220px',
              padding:
                '10px 12px',
              border:
                '1px solid #cbd5e1',
              borderRadius:
                '8px',
              background:
                'white',
              fontSize:
                '14px',
              fontWeight:
                600,
              cursor:
                'pointer',
            }}
          >

            <option value="all">
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


        {/* =====================================
            DASHBOARD FILTERS
        ====================================== */}

        <div className="statistics-dashboard">

          {/* ALL */}

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
              {
                branchFilteredOrders.filter(
                  (order) =>
                    order.statuses
                      ?.print !==
                    'Finished',
                ).length
              }
            </div>

            <div className="statistics-card-help">
              Available print orders
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
              {
                pendingCount
              }
            </div>

            <div className="statistics-card-help">
              Printing pending
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
              {
                todayCount
              }
            </div>

            <div className="statistics-card-help">
              Expected today
            </div>

          </button>


          {/* LATE */}

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
              {
                lateCount
              }
            </div>

            <div className="statistics-card-help">
              Past expected date
            </div>

          </button>

        </div>


        {/* =====================================
            CURRENT FILTER
        ====================================== */}

        <div className="statistics-filter-bar">

          <div>

            <strong>
              Branch:
            </strong>

            <span>
              {
                selectedBranch ===
                'all'
                  ? ' All Branches'
                  : ` ${selectedBranch}`
              }
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
                Print Work
              </h2>

              <p>
                {
                  filteredOrders.length
                }{' '}
                order
                {
                  filteredOrders.length !==
                  1
                    ? 's'
                    : ''
                }{' '}
                found
              </p>

            </div>

          </div>


          {loading && (
            <div className="empty-items">
              Loading print work...
            </div>
          )}


          {!loading &&
            filteredOrders.length ===
              0 && (

              <div className="empty-items">

                <h3>
                  No Print Work Found
                </h3>

                <p>
                  There are no print
                  orders matching the
                  selected branch and
                  filter.
                </p>

              </div>
            )}


          {!loading &&
            filteredOrders.length >
              0 && (

              <div className="statistics-orders-list">

                {filteredOrders.map(
                  (
                    order,
                  ) => {

                    const isExpanded =
                      expandedOrder ===
                      order.id

                    const workStarted =
                      hasStartedPrintWork(
                        order,
                      )

                    const allItemsDone =
                      areAllItemsFinished(
                        order,
                      )

                    const printFinished =
                      order.statuses
                        ?.print ===
                      'Finished'

                    return (

                      <div
                        key={
                          order.id
                        }
                        className={
                          printFinished
                            ? 'statistics-order-card delivered'
                            : 'statistics-order-card'
                        }
                      >

                        {/* =================================
                            ORDER HEADER
                        ================================== */}

                        <div className="statistics-order-header">

                          <div>

                            <div className="job-order-id">
                              Order ID:{' '}
                              {
                                getOrderId(
                                  order,
                                )
                              }
                            </div>

                            <h3>
                              {
                                order
                                  .customer
                                  .name ||
                                'Unnamed Customer'
                              }
                            </h3>

                            <p>
                              {
                                order
                                  .customer
                                  .companyName ||
                                'No company name'
                              }
                            </p>

                          </div>


                          <div className="statistics-order-meta">

                            <span>
                              Branch:{' '}
                              {
                                order.branch ||
                                '-'
                              }
                            </span>

                            <span>
                              Delivery:{' '}
                              {
                                order
                                  .expectedDeliveryDate ||
                                '-'
                              }
                            </span>

                            <span>
                              Printer:{' '}
                              {
                                order
                                  .officeInfo
                                  .printer ||
                                'Not started'
                              }
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
                              {
                                order
                                  .customerAdviser
                                  .name ||
                                '-'
                              }
                            </span>

                          </div>


                          <div>

                            <strong>
                              Design Status
                            </strong>

                            <span>
                              {
                                order
                                  .statuses
                                  ?.design ||
                                'Pending'
                              }
                            </span>

                          </div>


                          <div>

                            <strong>
                              Print Status
                            </strong>

                            <span>
                              {
                                order
                                  .statuses
                                  ?.print ||
                                'Pending'
                              }
                            </span>

                          </div>


                          <div>

                            <strong>
                              Items
                            </strong>

                            <span>
                              {
                                order.items
                                  .length
                              }
                            </span>

                          </div>

                        </div>


                        {/* =================================
                            ACTIONS
                        ================================== */}

                        <div className="statistics-order-actions">

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

                          {!printFinished && (

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
                                handleFinishPrinting(
                                  order,
                                )
                              }
                              title={
                                allItemsDone
                                  ? 'Finish printing'
                                  : 'Complete all items first'
                              }
                            >

                              {
                                finishingOrder ===
                                order.id
                                  ? 'Finishing...'
                                  : allItemsDone
                                    ? 'Finish Printing'
                                    : 'Complete All Items'
                              }

                            </button>

                          )}

                        </div>


                        {/* =================================
                            EXPANDED DETAILS
                        ================================== */}

                        {isExpanded && (

                          <div className="statistics-order-details">

                            {/* CUSTOMER */}

                            <h4>
                              Customer Details
                            </h4>

                            <div className="details-grid">

                              <div>

                                <strong>
                                  Customer
                                </strong>

                                <span>
                                  {
                                    order
                                      .customer
                                      .name ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Company
                                </strong>

                                <span>
                                  {
                                    order
                                      .customer
                                      .companyName ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Phone
                                </strong>

                                <span>
                                  {
                                    order
                                      .customer
                                      .phoneNumber ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  WhatsApp
                                </strong>

                                <span>
                                  {
                                    order
                                      .customer
                                      .whatsappNumber ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Place
                                </strong>

                                <span>
                                  {
                                    order
                                      .customer
                                      .place ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Designer
                                </strong>

                                <span>
                                  {
                                    order
                                      .officeInfo
                                      .designer ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Printed By
                                </strong>

                                <span>
                                  {
                                    order
                                      .officeInfo
                                      .printer ||
                                    'Not started'
                                  }
                                </span>

                              </div>

                            </div>


                            {/* ITEMS */}

                            <h4>
                              Items for Printing
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
                                      Printing
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

                                      const itemPrinted =
                                        item.printStatus ===
                                        'printed'

                                      const itemNA =
                                        item.printStatus ===
                                        'na'

                                      return (

                                        <tr
                                          key={
                                            itemKey
                                          }
                                        >

                                          <td className="sl-number">
                                            {
                                              item.slNo ??
                                              itemIndex +
                                                1
                                            }
                                          </td>


                                          <td>

                                            <strong>
                                              {
                                                item.name ||
                                                '-'
                                              }
                                            </strong>

                                          </td>


                                          <td>
                                            {
                                              item.width ||
                                              '-'
                                            }
                                          </td>


                                          <td>
                                            {
                                              item.height ||
                                              '-'
                                            }
                                          </td>


                                          <td>
                                            {
                                              item.qty ||
                                              '-'
                                            }
                                          </td>


                                          <td>
                                            {
                                              item.remarks ||
                                              '-'
                                            }
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
                                                  printFinished ||
                                                  savingItem ===
                                                    itemKey ||
                                                  itemPrinted ||
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


                                              {/* PRINTED */}

                                              <button
                                                type="button"
                                                disabled={
                                                  printFinished ||
                                                  savingItem ===
                                                    itemKey ||
                                                  itemPrinted ||
                                                  itemNA
                                                }
                                                onClick={() =>
                                                  handleItemStatus(
                                                    order,
                                                    itemIndex,
                                                    'printed',
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
                                                    itemPrinted
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
                                                ✓ Printed
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
                                                  itemPrinted
                                                    ? '#15803d'
                                                    : itemNA
                                                      ? '#64748b'
                                                      : '#f59e0b',
                                                fontWeight:
                                                  600,
                                              }}
                                            >

                                              {itemPrinted
                                                ? 'Printed'
                                                : itemNA
                                                  ? 'Print NA'
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


                            {/* PROGRESS */}

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
                                Printing Progress
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
                                  ? 'All items are Printed or NA. Printing can now be finished.'
                                  : 'Every item must be marked ✓ Printed or NA before the print order can be finished.'}

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

export default Printer
