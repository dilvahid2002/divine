
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface SalesProps {
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

type Branch =
  | 'Kalpetta'
  | 'Kondotty'
  | 'Sulthan Bathery'

interface JobItem {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string
}

interface AcceptingOrder {
  name?: string
  username?: string
}

interface JobOrder {
  id: string
  orderId: number | string

  date: string
  expectedDeliveryDate: string

  branch: Branch | string

  customer: {
    name: string
    companyName: string
    phoneNumber: string
    whatsappNumber: string
    place: string
  }

  items: JobItem[]

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

  /*
   * Person who accepted the order.
   *
   * This is fetched from Firebase and displayed
   * on the Sales page.
   */
  acceptingOrder?: AcceptingOrder | null

  /*
   * These statuses are READ ONLY on Sales.
   *
   * Design / Printing / Production departments
   * update these values in Firebase.
   *
   * Sales receives the latest values automatically
   * through onSnapshot().
   */
  statuses?: {
    design: JobStatus
    print: JobStatus
    production: JobStatus
  }

  delivered?: boolean

  createdAt?: Timestamp
}

function Sales({ user }: SalesProps) {
  const navigate = useNavigate()

  const [jobOrders, setJobOrders] =
    useState<JobOrder[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [expandedOrder, setExpandedOrder] =
    useState<string | null>(null)

  const [editingOrder, setEditingOrder] =
    useState<JobOrder | null>(null)

  // =========================================
  // FILTERS
  // =========================================

  const [searchText, setSearchText] =
    useState('')

  const [branchFilter, setBranchFilter] =
    useState('')

  const [entryDateFilter, setEntryDateFilter] =
    useState('')

  const [deliveryDateFilter, setDeliveryDateFilter] =
    useState('')

  const [designStatusFilter, setDesignStatusFilter] =
    useState('')

  const [printStatusFilter, setPrintStatusFilter] =
    useState('')

  const [productionStatusFilter, setProductionStatusFilter] =
    useState('')

  const [deliveryStatusFilter, setDeliveryStatusFilter] =
    useState('')

  // =========================================
  // FETCH JOB ORDERS
  // =========================================

  useEffect(() => {
    const jobOrdersRef = collection(
      db,
      'job_orders',
    )

    const jobOrdersQuery = query(
      jobOrdersRef,
      orderBy('createdAt', 'desc'),
    )

    /*
     * IMPORTANT:
     *
     * onSnapshot keeps Sales synchronized with Firebase.
     *
     * If Design changes:
     * statuses.design
     *
     * If Printing changes:
     * statuses.print
     *
     * If Production changes:
     * statuses.production
     *
     * Sales automatically receives the new values.
     *
     * Sales does NOT edit these statuses.
     */
    const unsubscribe = onSnapshot(
      jobOrdersQuery,
      (snapshot) => {
        const orders: JobOrder[] =
          snapshot.docs.map((document) => {
            const data = document.data()

            return {
              id: document.id,

              orderId:
                data.orderId ??
                document.id,

              date:
                data.date ||
                '',

              expectedDeliveryDate:
                data.expectedDeliveryDate ||
                '',

              branch:
                data.branch ||
                '',

              customer: {
                name:
                  data.customer?.name ||
                  '',

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
                  data.customer?.place ||
                  '',
              },

              items:
                Array.isArray(data.items)
                  ? data.items
                  : [],

              officeInfo: {
                designJob:
                  data.officeInfo?.designJob ||
                  false,

                printJob:
                  data.officeInfo?.printJob ||
                  false,

                productionJob:
                  data.officeInfo?.productionJob ||
                  false,

                designer:
                  data.officeInfo?.designer ||
                  null,

                printBranch:
                  data.officeInfo?.printBranch ||
                  null,
              },

              customerAdviser: {
                name:
                  data.customerAdviser?.name ||
                  '',

                username:
                  data.customerAdviser?.username ||
                  '',
              },

              /*
               * ACCEPTING ORDER
               *
               * Read directly from Firebase.
               */
              acceptingOrder:
                data.acceptingOrder
                  ? {
                      name:
                        data.acceptingOrder.name ||
                        '',

                      username:
                        data.acceptingOrder.username ||
                        '',
                    }
                  : null,

              /*
               * LIVE DEPARTMENT STATUSES
               *
               * READ ONLY on Sales.
               */
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
                data.delivered ||
                false,

              createdAt:
                data.createdAt,
            }
          })

        setJobOrders(orders)
        setLoading(false)
        setError('')
      },

      (firebaseError) => {
        console.error(
          'Error fetching job orders:',
          firebaseError,
        )

        setError(
          'Unable to load job orders from Firebase.',
        )

        setLoading(false)
      },
    )

    return () => unsubscribe()
  }, [])

  // =========================================
  // CLEAR FILTERS
  // =========================================

  const clearFilters = () => {
    setSearchText('')
    setBranchFilter('')
    setEntryDateFilter('')
    setDeliveryDateFilter('')
    setDesignStatusFilter('')
    setPrintStatusFilter('')
    setProductionStatusFilter('')
    setDeliveryStatusFilter('')
  }

  // =========================================
  // DELETE
  // =========================================

  const handleDelete = async (
    id: string,
  ) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this job order?',
    )

    if (!confirmed) {
      return
    }

    try {
      await deleteDoc(
        doc(db, 'job_orders', id),
      )
    } catch (deleteError) {
      console.error(
        'Error deleting job order:',
        deleteError,
      )

      setError(
        'Unable to delete the job order.',
      )
    }
  }

  // =========================================
  // DELIVERED
  // =========================================

  const handleDelivered = async (
    order: JobOrder,
  ) => {
    try {
      const orderRef = doc(
        db,
        'job_orders',
        order.id,
      )

      await updateDoc(orderRef, {
        delivered: true,
        deliveredAt: Timestamp.now(),
      })
    } catch (deliveryError) {
      console.error(
        'Error marking order as delivered:',
        deliveryError,
      )

      setError(
        'Unable to update delivery status.',
      )
    }
  }

  // =========================================
  // CHANGE DELIVERY STATUS
  // =========================================

  const handleDeliveryStatusChange =
    async (
      order: JobOrder,
      delivered: boolean,
    ) => {
      try {
        const orderRef = doc(
          db,
          'job_orders',
          order.id,
        )

        await updateDoc(orderRef, {
          delivered,
        })
      } catch (deliveryError) {
        console.error(
          'Error updating delivery status:',
          deliveryError,
        )

        setError(
          'Unable to update delivery status.',
        )
      }
    }

  // =========================================
  // SAVE EDIT
  // =========================================

  const handleSaveEdit = async () => {
    if (!editingOrder) {
      return
    }

    try {
      const orderRef = doc(
        db,
        'job_orders',
        editingOrder.id,
      )

      /*
       * IMPORTANT:
       *
       * statuses are intentionally NOT included here.
       *
       * Design / Printing / Production departments
       * own their respective statuses.
       *
       * This prevents Sales from accidentally
       * overwriting a status that another department
       * has just changed.
       */
      await updateDoc(orderRef, {
        date:
          editingOrder.date,

        expectedDeliveryDate:
          editingOrder.expectedDeliveryDate,

        branch:
          editingOrder.branch,

        customer:
          editingOrder.customer,

        items:
          editingOrder.items,

        officeInfo:
          editingOrder.officeInfo,

        delivered:
          editingOrder.delivered || false,
      })

      setEditingOrder(null)
    } catch (updateError) {
      console.error(
        'Error updating job order:',
        updateError,
      )

      setError(
        'Unable to update the job order.',
      )
    }
  }

  // =========================================
  // CUSTOMER EDIT
  // =========================================

  const updateCustomerField = (
    field:
      | 'name'
      | 'companyName'
      | 'phoneNumber'
      | 'whatsappNumber'
      | 'place',
    value: string,
  ) => {
    if (!editingOrder) {
      return
    }

    setEditingOrder({
      ...editingOrder,

      customer: {
        ...editingOrder.customer,
        [field]: value,
      },
    })
  }

  // =========================================
  // ITEM EDIT
  // =========================================

  const updateItem = (
    index: number,
    field: keyof JobItem,
    value: string,
  ) => {
    if (!editingOrder) {
      return
    }

    const updatedItems = [
      ...editingOrder.items,
    ]

    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value,
    }

    setEditingOrder({
      ...editingOrder,
      items: updatedItems,
    })
  }

  // =========================================
  // FILTER JOB ORDERS
  // =========================================

  const filteredOrders =
    jobOrders.filter((order) => {
      const statuses =
        order.statuses || {
          design:
            'Pending' as JobStatus,

          print:
            'Pending' as JobStatus,

          production:
            'Pending' as JobStatus,
        }

      // ---------------------------------------
      // SEARCH
      // ---------------------------------------

      if (searchText.trim()) {
        const search =
          searchText
            .toLowerCase()
            .trim()

        const searchableText =
          [
            String(order.orderId),

            order.date,

            order.expectedDeliveryDate,

            order.branch,

            order.customer.name,

            order.customer.companyName,

            order.customer.phoneNumber,

            order.customer.whatsappNumber,

            order.customer.place,

            order.customerAdviser.name,

            order.customerAdviser.username,

            /*
             * Accepting Order is included
             * in Sales search.
             */
            order.acceptingOrder?.name ||
              '',

            order.acceptingOrder?.username ||
              '',

            order.officeInfo.designer ||
              '',

            order.officeInfo.printBranch ||
              '',

            statuses.design,

            statuses.print,

            statuses.production,

            ...order.items.flatMap(
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
          !searchableText.includes(
            search,
          )
        ) {
          return false
        }
      }

      // ---------------------------------------
      // BRANCH
      // ---------------------------------------

      if (
        branchFilter &&
        order.branch !== branchFilter
      ) {
        return false
      }

      // ---------------------------------------
      // ENTRY DATE
      // ---------------------------------------

      if (
        entryDateFilter &&
        order.date !== entryDateFilter
      ) {
        return false
      }

      // ---------------------------------------
      // EXPECTED DELIVERY DATE
      // ---------------------------------------

      if (
        deliveryDateFilter &&
        order.expectedDeliveryDate !==
          deliveryDateFilter
      ) {
        return false
      }

      // ---------------------------------------
      // DESIGN STATUS
      // ---------------------------------------

      if (
        designStatusFilter &&
        statuses.design !==
          designStatusFilter
      ) {
        return false
      }

      // ---------------------------------------
      // PRINT STATUS
      // ---------------------------------------

      if (
        printStatusFilter &&
        statuses.print !==
          printStatusFilter
      ) {
        return false
      }

      // ---------------------------------------
      // PRODUCTION STATUS
      // ---------------------------------------

      if (
        productionStatusFilter &&
        statuses.production !==
          productionStatusFilter
      ) {
        return false
      }

      // ---------------------------------------
      // DELIVERY STATUS
      // ---------------------------------------

      if (
        deliveryStatusFilter ===
          'Delivered' &&
        !order.delivered
      ) {
        return false
      }

      if (
        deliveryStatusFilter ===
          'Pending' &&
        order.delivered
      ) {
        return false
      }

      return true
    })

  return (
    <div className="department-page">

      <div className="department-container">

        {/* =====================================
            HEADER
        ====================================== */}

        <div className="department-header">

          <div>
            <h1>Sales</h1>

            <p>
              Manage customer job orders
            </p>
          </div>

          <button
            type="button"
            className="add-item-button"
            onClick={() =>
              navigate(
                '/departments/job-order',
              )
            }
          >
            + Job Order
          </button>

        </div>

        {/* =====================================
            FILTER PANEL
        ====================================== */}

        <div className="department-content">

          <div className="sales-filter-header">

            <div>
              <h2>
                Job Orders
              </h2>

              <p>
                Search and filter your job orders
              </p>
            </div>

            <button
              type="button"
              className="clear-filter-button"
              onClick={clearFilters}
            >
              Clear Filters
            </button>

          </div>

          {/* SEARCH */}

          <div className="sales-search">

            <label htmlFor="sales-search">
              Search
            </label>

            <input
              id="sales-search"
              type="text"
              placeholder="Search Order ID, customer, phone, company, branch..."
              value={searchText}
              onChange={(event) =>
                setSearchText(
                  event.target.value,
                )
              }
            />

          </div>

          {/* FILTER GRID */}

          <div className="sales-filters">

            {/* BRANCH */}

            <div className="filter-group">

              <label htmlFor="branch-filter">
                Branch
              </label>

              <select
                id="branch-filter"
                value={branchFilter}
                onChange={(event) =>
                  setBranchFilter(
                    event.target.value,
                  )
                }
              >

                <option value="">
                  All Branches
                </option>

                <option value="Kalpetta">
                  Kalpetta
                </option>

                <option value="Kondotty">
                  Kondotty
                </option>

                <option value="Sulthan Bathery">
                  Sulthan Bathery
                </option>

              </select>

            </div>

            {/* ENTRY DATE */}

            <div className="filter-group">

              <label htmlFor="entry-date-filter">
                Entry Date
              </label>

              <input
                id="entry-date-filter"
                type="date"
                value={entryDateFilter}
                onChange={(event) =>
                  setEntryDateFilter(
                    event.target.value,
                  )
                }
              />

            </div>

            {/* EXPECTED DELIVERY DATE */}

            <div className="filter-group">

              <label htmlFor="delivery-date-filter">
                Expected Delivery Date
              </label>

              <input
                id="delivery-date-filter"
                type="date"
                value={deliveryDateFilter}
                onChange={(event) =>
                  setDeliveryDateFilter(
                    event.target.value,
                  )
                }
              />

            </div>

            {/* DESIGN STATUS */}

            <div className="filter-group">

              <label htmlFor="design-status-filter">
                Design Status
              </label>

              <select
                id="design-status-filter"
                value={designStatusFilter}
                onChange={(event) =>
                  setDesignStatusFilter(
                    event.target.value,
                  )
                }
              >

                <option value="">
                  All
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Finished">
                  Finished
                </option>

              </select>

            </div>

            {/* PRINT STATUS */}

            <div className="filter-group">

              <label htmlFor="print-status-filter">
                Printing Status
              </label>

              <select
                id="print-status-filter"
                value={printStatusFilter}
                onChange={(event) =>
                  setPrintStatusFilter(
                    event.target.value,
                  )
                }
              >

                <option value="">
                  All
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Finished">
                  Finished
                </option>

              </select>

            </div>

            {/* PRODUCTION STATUS */}

            <div className="filter-group">

              <label htmlFor="production-status-filter">
                Production Status
              </label>

              <select
                id="production-status-filter"
                value={
                  productionStatusFilter
                }
                onChange={(event) =>
                  setProductionStatusFilter(
                    event.target.value,
                  )
                }
              >

                <option value="">
                  All
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="In Progress">
                  In Progress
                </option>

                <option value="Finished">
                  Finished
                </option>

              </select>

            </div>

            {/* DELIVERY STATUS */}

            <div className="filter-group">

              <label htmlFor="delivery-status-filter">
                Delivery Status
              </label>

              <select
                id="delivery-status-filter"
                value={
                  deliveryStatusFilter
                }
                onChange={(event) =>
                  setDeliveryStatusFilter(
                    event.target.value,
                  )
                }
              >

                <option value="">
                  All
                </option>

                <option value="Pending">
                  Pending
                </option>

                <option value="Delivered">
                  Delivered
                </option>

              </select>

            </div>

          </div>

          {/* RESULT COUNT */}

          <div className="sales-result-count">
            Showing{' '}
            <strong>
              {filteredOrders.length}
            </strong>{' '}
            of{' '}
            <strong>
              {jobOrders.length}
            </strong>{' '}
            job orders
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
            LOADING
        ====================================== */}

        {loading && (
          <div className="empty-items">
            Loading job orders...
          </div>
        )}

        {/* =====================================
            NO ORDERS
        ====================================== */}

        {!loading &&
          jobOrders.length === 0 && (
            <div className="empty-items">

              <h3>
                No Job Orders
              </h3>

              <p>
                Create your first job order
                using the button above.
              </p>

            </div>
          )}

        {/* =====================================
            FILTERED EMPTY
        ====================================== */}

        {!loading &&
          jobOrders.length > 0 &&
          filteredOrders.length === 0 && (
            <div className="empty-items">

              <h3>
                No Matching Job Orders
              </h3>

              <p>
                Try changing your search or
                filters.
              </p>

            </div>
          )}

        {/* =====================================
            JOB ORDERS
        ====================================== */}

        <div className="job-orders-list">

          {filteredOrders.map((order) => {

            const isExpanded =
              expandedOrder === order.id

            /*
             * Statuses come directly from the
             * live Firebase snapshot.
             *
             * There are NO status setters here.
             */
            const statuses =
              order.statuses || {
                design:
                  'Pending' as JobStatus,

                print:
                  'Pending' as JobStatus,

                production:
                  'Pending' as JobStatus,
              }

            return (
              <div
                className={`job-order-card ${
                  order.delivered
                    ? 'job-order-delivered'
                    : ''
                }`}
                key={order.id}
              >

                {/* =================================
                    ORDER HEADER
                ================================== */}

                <div className="job-order-card-header">

                  <div>

                    <div className="order-id-display">
                      Order #
                      {order.orderId}
                    </div>

                    <h2>
                      {order.customer.name ||
                        'Unnamed Customer'}
                    </h2>

                    <p>
                      {order.customer.companyName ||
                        'No company name'}
                    </p>

                    <span>
                      Entry Date: {order.date}
                    </span>

                    <span>
                      Expected Delivery:{' '}
                      {order.expectedDeliveryDate ||
                        '-'}
                    </span>

                    <span>
                      Branch:{' '}
                      {order.branch ||
                        '-'}
                    </span>

                  </div>

                  <div className="job-order-actions">

                    {!order.delivered && (
                      <button
                        type="button"
                        className="delivered-button"
                        onClick={() =>
                          handleDelivered(
                            order,
                          )
                        }
                      >
                        ✓ Delivered
                      </button>
                    )}

                    {order.delivered && (
                      <span className="delivered-badge">
                        ✓ Delivered
                      </span>
                    )}

                    <button
                      type="button"
                      className="edit-button"
                      onClick={() =>
                        setEditingOrder(order)
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() =>
                        handleDelete(
                          order.id,
                        )
                      }
                    >
                      Delete
                    </button>

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
                        ? 'Hide'
                        : 'View'}
                    </button>

                  </div>

                </div>

                {/* =================================
                    STATUS SECTION
                    READ ONLY
                ================================== */}

                <div className="job-status-section">

                  {order.officeInfo.designJob && (
                    <div className="status-box">

                      <label>
                        Design Status
                      </label>

                      <div className="status-value">
                        {statuses.design}
                      </div>

                    </div>
                  )}

                  {order.officeInfo.printJob && (
                    <div className="status-box">

                      <label>
                        Print Status
                      </label>

                      <div className="status-value">
                        {statuses.print}
                      </div>

                    </div>
                  )}

                  {order.officeInfo.productionJob && (
                    <div className="status-box">

                      <label>
                        Production Status
                      </label>

                      <div className="status-value">
                        {statuses.production}
                      </div>

                    </div>
                  )}

                </div>

                {/* =================================
                    SUMMARY
                ================================== */}

                <div className="job-order-summary">

                  <div>
                    <strong>
                      Phone
                    </strong>

                    <span>
                      {order.customer.phoneNumber ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>
                      WhatsApp
                    </strong>

                    <span>
                      {order.customer.whatsappNumber ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>
                      Place
                    </strong>

                    <span>
                      {order.customer.place ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>
                      Branch
                    </strong>

                    <span>
                      {order.branch ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>
                      Customer Adviser
                    </strong>

                    <span>
                      {order.customerAdviser.name ||
                        '-'}
                    </span>
                  </div>

                  <div>
                    <strong>
                      Accepting Order
                    </strong>

                    <span>
                      {order.acceptingOrder?.name ||
                        order.acceptingOrder?.username ||
                        '-'}
                    </span>
                  </div>

                </div>

                {/* =================================
                    EXPANDED INFORMATION
                ================================== */}

                {isExpanded && (
                  <div className="job-order-details">

                    <h3>
                      Customer Details
                    </h3>

                    <div className="details-grid">

                      <div>
                        <strong>
                          Order ID
                        </strong>

                        <span>
                          #{order.orderId}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Branch
                        </strong>

                        <span>
                          {order.branch ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Entry Date
                        </strong>

                        <span>
                          {order.date ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Expected Delivery
                        </strong>

                        <span>
                          {order.expectedDeliveryDate ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Customer Name
                        </strong>

                        <span>
                          {order.customer.name ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Company
                        </strong>

                        <span>
                          {order.customer.companyName ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Phone
                        </strong>

                        <span>
                          {order.customer.phoneNumber ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          WhatsApp
                        </strong>

                        <span>
                          {order.customer.whatsappNumber ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Place
                        </strong>

                        <span>
                          {order.customer.place ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Customer Adviser
                        </strong>

                        <span>
                          {order.customerAdviser.name ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Accepting Order
                        </strong>

                        <span>
                          {order.acceptingOrder?.name ||
                            order.acceptingOrder?.username ||
                            '-'}
                        </span>
                      </div>

                      <div>
                        <strong>
                          Delivery Status
                        </strong>

                        <span>
                          {order.delivered
                            ? 'Delivered'
                            : 'Pending'}
                        </span>
                      </div>

                    </div>

                    {/* =================================
                        LIVE JOB STATUS
                    ================================== */}

                    <h3>
                      Job Status
                    </h3>

                    <div className="job-status-section">

                      {order.officeInfo.designJob && (
                        <div className="status-box">

                          <label>
                            Design Status
                          </label>

                          <div className="status-value">
                            {statuses.design}
                          </div>

                        </div>
                      )}

                      {order.officeInfo.printJob && (
                        <div className="status-box">

                          <label>
                            Print Status
                          </label>

                          <div className="status-value">
                            {statuses.print}
                          </div>

                        </div>
                      )}

                      {order.officeInfo.productionJob && (
                        <div className="status-box">

                          <label>
                            Production Status
                          </label>

                          <div className="status-value">
                            {statuses.production}
                          </div>

                        </div>
                      )}

                    </div>

                    {/* ITEMS */}

                    <h3>
                      Items
                    </h3>

                    <div className="items-table-wrapper">

                      <table className="items-table">

                        <thead>

                          <tr>
                            <th>
                              Sl No
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
                          </tr>

                        </thead>

                        <tbody>

                          {order.items.map(
                            (item) => (
                              <tr
                                key={
                                  item.slNo
                                }
                              >

                                <td>
                                  {item.slNo}
                                </td>

                                <td>
                                  {item.name}
                                </td>

                                <td>
                                  {item.width}
                                </td>

                                <td>
                                  {item.height}
                                </td>

                                <td>
                                  {item.qty}
                                </td>

                                <td>
                                  {item.price}
                                </td>

                                <td>
                                  {item.remarks}
                                </td>

                              </tr>
                            ),
                          )}

                        </tbody>

                      </table>

                    </div>

                    {/* OFFICE */}

                    <h3>
                      Office Information
                    </h3>

                    <div className="office-info-list">

                      {order.officeInfo.designJob && (
                        <span>
                          Design Job
                        </span>
                      )}

                      {order.officeInfo.printJob && (
                        <span>
                          Print Job
                        </span>
                      )}

                      {order.officeInfo.productionJob && (
                        <span>
                          Production Job
                        </span>
                      )}

                      {order.officeInfo.designer && (
                        <span>
                          Designer:{' '}
                          {
                            order.officeInfo
                              .designer
                          }
                        </span>
                      )}

                      {order.officeInfo.printBranch && (
                        <span>
                          Print Branch:{' '}
                          {
                            order.officeInfo
                              .printBranch
                          }
                        </span>
                      )}

                    </div>

                  </div>
                )}

              </div>
            )
          })}

        </div>

      </div>

      {/* =========================================
          EDIT MODAL
      ========================================== */}

      {editingOrder && (
        <div className="modal-overlay">

          <div className="edit-modal">

            <div className="edit-modal-header">

              <div>

                <div className="order-id-display">
                  Order #
                  {editingOrder.orderId}
                </div>

                <h2>
                  Edit Job Order
                </h2>

                <p>
                  {editingOrder.customer.name}
                </p>

              </div>

              <button
                type="button"
                className="modal-close-button"
                onClick={() =>
                  setEditingOrder(null)
                }
              >
                ×
              </button>

            </div>

            {/* CUSTOMER */}

            <h3>
              Job Order Information
            </h3>

            <div className="form-grid">

              <div className="input-group">

                <label>
                  Order ID
                </label>

                <input
                  type="text"
                  value={
                    editingOrder.orderId
                  }
                  readOnly
                />

              </div>

              <div className="input-group">

                <label>
                  Entry Date
                </label>

                <input
                  type="date"
                  value={
                    editingOrder.date
                  }
                  onChange={(event) =>
                    setEditingOrder({
                      ...editingOrder,
                      date:
                        event.target.value,
                    })
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  Expected Delivery Date
                </label>

                <input
                  type="date"
                  value={
                    editingOrder
                      .expectedDeliveryDate
                  }
                  onChange={(event) =>
                    setEditingOrder({
                      ...editingOrder,
                      expectedDeliveryDate:
                        event.target.value,
                    })
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  Branch
                </label>

                <select
                  value={
                    editingOrder.branch
                  }
                  onChange={(event) =>
                    setEditingOrder({
                      ...editingOrder,
                      branch:
                        event.target.value,
                    })
                  }
                >

                  <option value="">
                    Select Branch
                  </option>

                  <option value="Kalpetta">
                    Kalpetta
                  </option>

                  <option value="Kondotty">
                    Kondotty
                  </option>

                  <option value="Sulthan Bathery">
                    Sulthan Bathery
                  </option>

                </select>

              </div>

              <div className="input-group">

                <label>
                  Customer Name
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .customer.name
                  }
                  onChange={(event) =>
                    updateCustomerField(
                      'name',
                      event.target.value,
                    )
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  Company Name
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .customer.companyName
                  }
                  onChange={(event) =>
                    updateCustomerField(
                      'companyName',
                      event.target.value,
                    )
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  Phone
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .customer.phoneNumber
                  }
                  onChange={(event) =>
                    updateCustomerField(
                      'phoneNumber',
                      event.target.value,
                    )
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  WhatsApp
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .customer.whatsappNumber
                  }
                  onChange={(event) =>
                    updateCustomerField(
                      'whatsappNumber',
                      event.target.value,
                    )
                  }
                />

              </div>

              <div className="input-group">

                <label>
                  Place
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .customer.place
                  }
                  onChange={(event) =>
                    updateCustomerField(
                      'place',
                      event.target.value,
                    )
                  }
                />

              </div>

              {/* ACCEPTING ORDER */}

              <div className="input-group">

                <label>
                  Accepting Order
                </label>

                <input
                  type="text"
                  value={
                    editingOrder
                      .acceptingOrder?.name ||
                    editingOrder
                      .acceptingOrder?.username ||
                    '-'
                  }
                  readOnly
                />

              </div>

            </div>

            {/* ITEMS */}

            <h3>
              Items
            </h3>

            <div className="items-table-wrapper">

              <table className="items-table">

                <thead>

                  <tr>
                    <th>
                      Sl No
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
                  </tr>

                </thead>

                <tbody>

                  {editingOrder.items.map(
                    (item, index) => (
                      <tr
                        key={
                          item.slNo
                        }
                      >

                        <td>
                          {item.slNo}
                        </td>

                        <td>
                          <input
                            value={
                              item.name
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'name',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={
                              item.width
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'width',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={
                              item.height
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'height',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={
                              item.qty
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'qty',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={
                              item.price
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'price',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                        <td>
                          <input
                            value={
                              item.remarks
                            }
                            onChange={(
                              event,
                            ) =>
                              updateItem(
                                index,
                                'remarks',
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </td>

                      </tr>
                    ),
                  )}

                </tbody>

              </table>

            </div>

            {/* =================================
                JOB STATUS - READ ONLY
            ================================== */}

            <h3>
              Job Status
            </h3>

            <div className="job-status-section">

              {editingOrder.officeInfo.designJob && (
                <div className="status-box">

                  <label>
                    Design Status
                  </label>

                  <div className="status-value">
                    {editingOrder.statuses
                      ?.design ||
                      'Pending'}
                  </div>

                </div>
              )}

              {editingOrder.officeInfo.printJob && (
                <div className="status-box">

                  <label>
                    Print Status
                  </label>

                  <div className="status-value">
                    {editingOrder.statuses
                      ?.print ||
                      'Pending'}
                  </div>

                </div>
              )}

              {editingOrder.officeInfo.productionJob && (
                <div className="status-box">

                  <label>
                    Production Status
                  </label>

                  <div className="status-value">
                    {editingOrder.statuses
                      ?.production ||
                      'Pending'}
                  </div>

                </div>
              )}

            </div>

            {/* =================================
                DELIVERY
            ================================== */}

            <h3>
              Delivery
            </h3>

            <div className="status-box">

              <label>
                Delivery Status
              </label>

              <select
                value={
                  editingOrder.delivered
                    ? 'Delivered'
                    : 'Pending'
                }
                onChange={(event) =>
                  setEditingOrder({
                    ...editingOrder,
                    delivered:
                      event.target.value ===
                      'Delivered',
                  })
                }
              >

                <option value="Pending">
                  Pending
                </option>

                <option value="Delivered">
                  Delivered
                </option>

              </select>

            </div>

            {/* =================================
                MODAL ACTIONS
            ================================== */}

            <div className="form-actions">

              <button
                type="button"
                className="cancel-button"
                onClick={() =>
                  setEditingOrder(null)
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="submit-job-button"
                onClick={handleSaveEdit}
              >
                Save Changes
              </button>

            </div>

          </div>

        </div>
      )}

    </div>
  )
}

export default Sales

