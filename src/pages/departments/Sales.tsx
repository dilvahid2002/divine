
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
  [key: string]: unknown
}

interface AcceptingOrder {
  name?: string
  username?: string
}

// =====================================================
// PRINT HELPERS
// Same A4 print workflow used by Live Production.
// =====================================================

const escapeHtml = (value: unknown): string => {
  return String(value ?? '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const printJobOrderA4 = (order: JobOrder) => {
  const printWindow = window.open(
    '',
    '_blank',
    'width=900,height=1000',
  )

  if (!printWindow) {
    alert(
      'Please allow pop-ups in your browser to print this job order.',
    )
    return
  }

  const rows = order.items
    .map(
      (item, index) => `
        <tr>
          <td>${escapeHtml(item.slNo ?? index + 1)}</td>
          <td>${escapeHtml(item.name || '-')}</td>
          <td>${escapeHtml(item.width || '-')}</td>
          <td>${escapeHtml(item.height || '-')}</td>
          <td>${escapeHtml(item.qty || '-')}</td>
          <td>${escapeHtml(item.price || '-')}</td>
          <td>${escapeHtml(item.remarks || '-')}</td>
          <td>
            ${
              item.image
                ? `<img class="item-image" src="${escapeHtml(item.image)}" />`
                : '-'
            }
          </td>
        </tr>
      `,
    )
    .join('')

  const jobRow = (
    label: string,
    selected: boolean,
    assignment: string,
    status: JobStatus,
  ) => `
    <tr>
      <td><strong>${escapeHtml(label)}</strong></td>
      <td>${selected ? 'Yes' : 'No'}</td>
      <td>${escapeHtml(
        selected ? assignment || 'Not assigned' : '-',
      )}</td>
      <td>${escapeHtml(selected ? status : '-')}</td>
    </tr>
  `

  const office = order.officeInfo || ({} as JobOrder['officeInfo'])
  const statuses = order.statuses || {
    design: 'Pending' as JobStatus,
    print: 'Pending' as JobStatus,
    cutting: 'Pending' as JobStatus,
    production: 'Pending' as JobStatus,
  }

  const productionStaff = Array.isArray(office.productionStaff)
    ? office.productionStaff
        .map((staff: any) => staff?.name || staff?.username || '')
        .filter(Boolean)
        .join(', ')
    : ''

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>Job Order #${escapeHtml(order.orderId)}</title>
        <style>
          @page {
            size: A4;
            margin: 12mm;
          }

          * {
            box-sizing: border-box;
          }

          body {
            font-family: Arial, Helvetica, sans-serif;
            color: #111827;
            margin: 0;
            font-size: 11px;
          }

          .page {
            width: 100%;
          }

          .header {
            border-bottom: 2px solid #111827;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }

          .title {
            font-size: 22px;
            font-weight: 800;
            margin: 0 0 4px;
          }

          .subtitle {
            font-size: 12px;
            color: #4b5563;
          }

          .grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
            margin-bottom: 14px;
          }

          .box {
            border: 1px solid #d1d5db;
            border-radius: 5px;
            padding: 8px;
            min-height: 48px;
          }

          .label {
            display: block;
            font-size: 9px;
            color: #6b7280;
            margin-bottom: 3px;
            text-transform: uppercase;
          }

          .value {
            font-weight: 700;
          }

          h2 {
            font-size: 14px;
            margin: 14px 0 7px;
            border-bottom: 1px solid #d1d5db;
            padding-bottom: 4px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 10px;
          }

          th,
          td {
            border: 1px solid #d1d5db;
            padding: 5px;
            vertical-align: top;
          }

          th {
            background: #f3f4f6;
            font-size: 9px;
          }

          td {
            font-size: 10px;
          }

          .item-image {
            width: 45px;
            height: 45px;
            object-fit: cover;
            border-radius: 3px;
          }

          .footer {
            margin-top: 15px;
            padding-top: 8px;
            border-top: 1px solid #d1d5db;
            color: #6b7280;
            font-size: 9px;
          }

          @media print {
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">
          <div class="header">
            <div class="title">Job Order</div>
            <div class="subtitle">Order #${escapeHtml(order.orderId)}</div>
          </div>

          <div class="grid">
            <div class="box">
              <span class="label">Order ID</span>
              <span class="value">#${escapeHtml(order.orderId)}</span>
            </div>

            <div class="box">
              <span class="label">Entry Date</span>
              <span class="value">${escapeHtml(order.date || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Expected Delivery</span>
              <span class="value">${escapeHtml(order.expectedDeliveryDate || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Branch</span>
              <span class="value">${escapeHtml(order.branch || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Customer Adviser</span>
              <span class="value">${escapeHtml(order.customerAdviser?.name || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Delivery Status</span>
              <span class="value">${order.delivered ? 'Delivered' : 'Pending'}</span>
            </div>
          </div>

          <h2>Customer Information</h2>

          <div class="grid">
            <div class="box">
              <span class="label">Customer</span>
              <span class="value">${escapeHtml(order.customer?.name || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Company</span>
              <span class="value">${escapeHtml(order.customer?.companyName || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Phone</span>
              <span class="value">${escapeHtml(order.customer?.phoneNumber || '-')}</span>
            </div>

            <div class="box">
              <span class="label">WhatsApp</span>
              <span class="value">${escapeHtml(order.customer?.whatsappNumber || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Place</span>
              <span class="value">${escapeHtml(order.customer?.place || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Accepting Order</span>
              <span class="value">${escapeHtml(order.acceptingOrder?.name || order.acceptingOrder?.username || '-')}</span>
            </div>
          </div>

          <h2>Job Assignments &amp; Status</h2>

          <table>
            <thead>
              <tr>
                <th>Job</th>
                <th>Selected</th>
                <th>Assigned To / Branch</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${jobRow(
                'Design',
                Boolean(office.designJob),
                office.designer || '',
                statuses.design,
              )}

              ${jobRow(
                'Printing',
                Boolean(office.printJob),
                office.printBranch || '',
                statuses.print,
              )}

              ${jobRow(
                'Cutting',
                Boolean(office.cuttingJob),
                office.cuttingBranch || office.cutting || '',
                statuses.cutting || 'Pending',
              )}

              ${jobRow(
                'Production',
                Boolean(office.productionJob),
                office.productionBranch || productionStaff || '',
                statuses.production,
              )}
            </tbody>
          </table>

          <h2>Items</h2>

          ${
            order.items.length > 0
              ? `
                <table>
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
                    ${rows}
                  </tbody>
                </table>
              `
              : '<p>No items.</p>'
          }

          <h2>Office Information</h2>

          <div class="grid">
            <div class="box">
              <span class="label">Designer</span>
              <span class="value">${escapeHtml(office.designer || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Printing Branch</span>
              <span class="value">${escapeHtml(office.printBranch || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Cutting Branch</span>
              <span class="value">${escapeHtml(office.cuttingBranch || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Cutting Staff</span>
              <span class="value">${escapeHtml(office.cutting || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Production Branch</span>
              <span class="value">${escapeHtml(office.productionBranch || '-')}</span>
            </div>

            <div class="box">
              <span class="label">Production Staff</span>
              <span class="value">${escapeHtml(productionStaff || '-')}</span>
            </div>
          </div>

          <div class="footer">
            Printed from Sales &nbsp; • &nbsp; ${escapeHtml(
              new Date().toLocaleString('en-IN', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
            )}
          </div>
        </div>

        <script>
          window.addEventListener('load', function () {
            setTimeout(function () {
              window.print();
            }, 700);
          });
        </script>
      </body>
    </html>
  `

  printWindow.document.open()
  printWindow.document.write(html)
  printWindow.document.close()
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
    cuttingJob: boolean
    productionJob: boolean
    designer?: string | null
    designerUsername?: string | null
    printBranch?: string | null
    cuttingBranch?: string | null
    productionBranch?: string | null
    cutting?: string | null
    cuttingUsername?: string | null
    productionStaff?: unknown[]
    [key: string]: unknown
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
    cutting?: JobStatus
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

  const [cuttingStatusFilter, setCuttingStatusFilter] =
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

                cuttingJob:
                  data.officeInfo?.cuttingJob ||
                  false,

                designer:
                  data.officeInfo?.designer ||
                  null,

                designerUsername:
                  data.officeInfo?.designerUsername ||
                  null,

                printBranch:
                  data.officeInfo?.printBranch ||
                  null,

                cuttingBranch:
                  data.officeInfo?.cuttingBranch ||
                  null,

                productionBranch:
                  data.officeInfo?.productionBranch ||
                  null,

                cutting:
                  data.officeInfo?.cutting ||
                  null,

                cuttingUsername:
                  data.officeInfo?.cuttingUsername ||
                  null,

                productionStaff:
                  Array.isArray(
                    data.officeInfo?.productionStaff,
                  )
                    ? data.officeInfo.productionStaff
                    : [],
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

                cutting:
                  data.statuses?.cutting ||
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
    setCuttingStatusFilter('')
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

  const stripUndefined = (
    value: unknown,
  ): unknown => {
    if (Array.isArray(value)) {
      return value
        .filter(
          (item) =>
            item !== undefined,
        )
        .map((item) =>
          stripUndefined(item),
        )
    }

    if (
      value &&
      typeof value === 'object' &&
      !(value instanceof Timestamp)
    ) {
      const cleaned: Record<
        string,
        unknown
      > = {}

      Object.entries(
        value as Record<string, unknown>,
      ).forEach(([key, item]) => {
        if (item !== undefined) {
          cleaned[key] =
            stripUndefined(item)
        }
      })

      return cleaned
    }

    return value
  }

  const handleSaveEdit = async () => {
    if (!editingOrder) {
      return
    }

    if (editingOrder.items.length === 0) {
      setError(
        'At least one item is required.',
      )
      return
    }

    try {
      const orderRef = doc(
        db,
        'job_orders',
        editingOrder.id,
      )

      /*
       * Sales can edit the order information,
       * customer information, items and which
       * departments are required.
       *
       * Department statuses are deliberately
       * NOT written here. They remain owned by
       * the respective departments.
       */
      const updateData = stripUndefined({
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

        updatedAt:
          Timestamp.now(),
      }) as Record<string, unknown>

      await updateDoc(
        orderRef,
        updateData,
      )

      setEditingOrder(null)
      setError('')
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

  const addItem = () => {
    if (!editingOrder) {
      return
    }

    const nextSlNo =
      editingOrder.items.length > 0
        ? Math.max(
            ...editingOrder.items.map(
              (item) =>
                Number(item.slNo) || 0,
            ),
          ) + 1
        : 1

    const newItem: JobItem = {
      slNo: nextSlNo,
      name: '',
      width: '',
      height: '',
      qty: '1',
      price: '',
      remarks: '',
    }

    setEditingOrder({
      ...editingOrder,
      items: [
        ...editingOrder.items,
        newItem,
      ],
    })
  }

  const removeItem = (
    index: number,
  ) => {
    if (!editingOrder) {
      return
    }

    if (editingOrder.items.length <= 1) {
      window.alert(
        'At least one item must remain in the job order.',
      )
      return
    }

    const updatedItems =
      editingOrder.items
        .filter(
          (_, itemIndex) =>
            itemIndex !== index,
        )
        .map(
          (item, itemIndex) => ({
            ...item,
            slNo: itemIndex + 1,
          }),
        )

    setEditingOrder({
      ...editingOrder,
      items: updatedItems,
    })
  }

  const updateJobType = (
    field:
      | 'designJob'
      | 'printJob'
      | 'cuttingJob'
      | 'productionJob',
    checked: boolean,
  ) => {
    if (!editingOrder) {
      return
    }

    setEditingOrder({
      ...editingOrder,
      officeInfo: {
        ...editingOrder.officeInfo,
        [field]: checked,
      },
    })
  }

  const updateOfficeField = (
    field:
      | 'designer'
      | 'designerUsername'
      | 'printBranch'
      | 'cuttingBranch'
      | 'productionBranch'
      | 'cutting',
      value: string,
  ) => {
    if (!editingOrder) {
      return
    }

    setEditingOrder({
      ...editingOrder,
      officeInfo: {
        ...editingOrder.officeInfo,
        [field]: value,
      },
    })
  }

  // =========================================
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

          cutting:
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
      // CUTTING STATUS
      // ---------------------------------------

      if (
        cuttingStatusFilter &&
        statuses.cutting !==
          cuttingStatusFilter
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
          
           <button
            type="button"
            className="add-item-button"
            onClick={() =>
              navigate(
                '/departments/Measurement',
              )
            }
          >
            + Measurement
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

            {/* CUTTING STATUS */}

            <div className="filter-group">

              <label htmlFor="cutting-status-filter">
                Cutting Status
              </label>

              <select
                id="cutting-status-filter"
                value={cuttingStatusFilter}
                onChange={(event) =>
                  setCuttingStatusFilter(
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

                    {/* PRINT - same A4 print option as Live Production */}
                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        printJobOrderA4(order)
                      }
                    >
                      🖨 Print
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

                  {order.officeInfo.cuttingJob && (
                    <div className="status-box">

                      <label>
                        Cutting Status
                      </label>

                      <div className="status-value">
                        {statuses.cutting}
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

                      {order.officeInfo.cuttingJob && (
                        <span>
                          Cutting Job
                        </span>
                      )}

                      {order.officeInfo.cuttingBranch && (
                        <span>
                          Cutting Branch:{' '}
                          {
                            order.officeInfo
                              .cuttingBranch
                          }
                        </span>
                      )}

                      {order.officeInfo.productionBranch && (
                        <span>
                          Production Branch:{' '}
                          {
                            order.officeInfo
                              .productionBranch
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

            {/* JOB TYPES */}

            <h3>
              Job Types / Department Assignment
            </h3>

            <p
              style={{
                marginTop: '-8px',
                marginBottom: '16px',
                color: '#667085',
              }}
            >
              Select every department that must work on
              this job. Existing department statuses are
              kept unchanged when you edit these options.
            </p>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
                marginBottom: '20px',
              }}
            >
              {[
                {
                  key: 'designJob' as const,
                  label: 'Designer',
                },
                {
                  key: 'printJob' as const,
                  label: 'Printing',
                },
                {
                  key: 'cuttingJob' as const,
                  label: 'Cutting',
                },
                {
                  key: 'productionJob' as const,
                  label: 'Production',
                },
              ].map((jobType) => (
                <label
                  key={jobType.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '14px',
                    border: '1px solid #d0d5dd',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    background:
                      editingOrder.officeInfo[
                        jobType.key
                      ]
                        ? '#eef4ff'
                        : '#fff',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={
                      Boolean(
                        editingOrder.officeInfo[
                          jobType.key
                        ],
                      )
                    }
                    onChange={(event) =>
                      updateJobType(
                        jobType.key,
                        event.target.checked,
                      )
                    }
                  />
                  <strong>
                    {jobType.label}
                  </strong>
                </label>
              ))}
            </div>

            {(editingOrder.officeInfo.designJob ||
              editingOrder.officeInfo.printJob ||
              editingOrder.officeInfo.cuttingJob ||
              editingOrder.officeInfo.productionJob) && (
              <div
                className="form-grid"
                style={{
                  marginBottom: '20px',
                }}
              >
                {editingOrder.officeInfo.designJob && (
                  <>
                    <div className="input-group">
                      <label>
                        Designer
                      </label>
                      <input
                        type="text"
                        value={
                          editingOrder.officeInfo
                            .designer || ''
                        }
                        onChange={(event) =>
                          updateOfficeField(
                            'designer',
                            event.target.value,
                          )
                        }
                        placeholder="Designer name (optional)"
                      />
                    </div>

                    <div className="input-group">
                      <label>
                        Designer Username
                      </label>
                      <input
                        type="text"
                        value={
                          editingOrder.officeInfo
                            .designerUsername || ''
                        }
                        onChange={(event) =>
                          updateOfficeField(
                            'designerUsername',
                            event.target.value,
                          )
                        }
                        placeholder="Username (optional)"
                      />
                    </div>
                  </>
                )}

                {editingOrder.officeInfo.printJob && (
                  <div className="input-group">
                    <label>
                      Printing Branch
                    </label>
                    <select
                      value={
                        editingOrder.officeInfo
                          .printBranch || ''
                      }
                      onChange={(event) =>
                        updateOfficeField(
                          'printBranch',
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Select Printing Branch
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
                )}

                {editingOrder.officeInfo.cuttingJob && (
                  <>
                    <div className="input-group">
                      <label>
                        Cutting Branch
                      </label>
                      <select
                        value={
                          editingOrder.officeInfo
                            .cuttingBranch || ''
                        }
                        onChange={(event) =>
                          updateOfficeField(
                            'cuttingBranch',
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          Select Cutting Branch
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
                        Cutting Staff
                      </label>
                      <input
                        type="text"
                        value={
                          editingOrder.officeInfo
                            .cutting || ''
                        }
                        onChange={(event) =>
                          updateOfficeField(
                            'cutting',
                            event.target.value,
                          )
                        }
                        placeholder="Cutting staff (optional)"
                      />
                    </div>
                  </>
                )}

                {editingOrder.officeInfo.productionJob && (
                  <div className="input-group">
                    <label>
                      Production Branch
                    </label>
                    <select
                      value={
                        editingOrder.officeInfo
                          .productionBranch || ''
                      }
                      onChange={(event) =>
                        updateOfficeField(
                          'productionBranch',
                          event.target.value,
                        )
                      }
                    >
                      <option value="">
                        Select Production Branch
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
                )}
              </div>
            )}

            {/* ITEMS */}

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                marginBottom: '12px',
              }}
            >
              <h3 style={{ margin: 0 }}>
                Items
              </h3>

              <button
                type="button"
                className="add-item-button"
                onClick={addItem}
              >
                + Add Item
              </button>
            </div>

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

                    <th>
                      Action
                    </th>
                  </tr>

                </thead>

                <tbody>

                  {editingOrder.items.map(
                    (item, index) => (
                      <tr
                        key={`${item.slNo}-${item.name}`}
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

                        <td>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() =>
                              removeItem(index)
                            }
                          >
                            Remove
                          </button>
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

