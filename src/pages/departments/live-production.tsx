import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  arrayUnion,
  collection,
  deleteDoc,
  getDocs,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

import { useNavigate } from 'react-router-dom'

import { db } from '../../firebase'
import './Department.css'

// =====================================================
// PROPS
// =====================================================

interface LiveProductionProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

// =====================================================
// TYPES
// =====================================================

type JobStatus =
  | 'Pending'
  | 'In Progress'
  | 'Finished'

type Department =
  | 'design'
  | 'print'
  | 'cutting'
  | 'production'

type Branch =
  | 'Kalpetta'
  | 'Kondotty'
  | 'Sulthan Bathery'

const BRANCHES: Branch[] = [
  'Kalpetta',
  'Kondotty',
  'Sulthan Bathery',
]

interface Item {
  slNo?: number
  name?: string
  width?: string
  height?: string
  qty?: string
  price?: string
  remarks?: string
  image?: string
}

interface Customer {
  name: string
  companyName: string
  phoneNumber: string
  whatsappNumber: string
  place: string
}

interface Quotation {
  status: 'Pending' | 'Confirmed'
  generatedBy?: {
    name: string
    username: string
  }
  generatedAt?: unknown
}

interface OfficeInfo {
  designJob: boolean
  printJob: boolean
  productionJob: boolean
  cuttingJob: boolean

  designer?: string | null
  designerUsername?: string | null

  printBranch?: Branch | string | null
  cuttingBranch?: Branch | string | null
  productionBranch?: Branch | string | null
}

interface Statuses {
  design: JobStatus
  print: JobStatus
  cutting: JobStatus
  production: JobStatus
}

interface Designer {
  id: string
  name: string
  username: string
}

interface MeasurementJob {
  id: string
  measurementId: string
  date: string
  expectedDeliveryDate: string

  customer: Customer

  items: Item[]

  officeInfo: OfficeInfo

  customerAdviser: {
    name: string
    username: string
  }

  quotation: Quotation

  statuses: Statuses

  createdAt?: unknown
}

interface AssignmentDraft {
  designer: string
  designerUsername: string
  printBranch: string
  cuttingBranch: string
  productionBranch: string
}

interface EditDraft {
  date: string
  expectedDeliveryDate: string
  customer: Customer
  items: Item[]
  officeInfo: OfficeInfo
}

// =====================================================
// HELPERS
// =====================================================

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

const getStatus = (value: unknown): JobStatus => {
  if (
    value === 'Pending' ||
    value === 'In Progress' ||
    value === 'Finished'
  ) {
    return value
  }

  return 'Pending'
}

const getBranch = (
  value: unknown,
): string => {
  return getString(value)
}

const formatDate = (value: unknown): string => {
  if (!value) {
    return '-'
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'toDate' in value &&
    typeof (value as any).toDate === 'function'
  ) {
    return (value as any).toDate().toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
    )
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'seconds' in value
  ) {
    const seconds = Number(
      (value as any).seconds,
    )

    if (!Number.isNaN(seconds)) {
      return new Date(
        seconds * 1000,
      ).toLocaleDateString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
      )
    }
  }

  if (value instanceof Date) {
    return value.toLocaleDateString(
      'en-IN',
      {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      },
    )
  }

  if (typeof value === 'string') {
    if (!value.trim()) {
      return '-'
    }

    const parsed = new Date(value)

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toLocaleDateString(
        'en-IN',
        {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        },
      )
    }

    return value
  }

  return '-'
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
    const seconds = Number(
      (value as any).seconds,
    )

    if (!Number.isNaN(seconds)) {
      date = new Date(seconds * 1000)
    }
  } else if (value instanceof Date) {
    date = value
  } else if (typeof value === 'string') {
    const parsed = new Date(value)

    if (!Number.isNaN(parsed.getTime())) {
      date = parsed
    }
  }

  if (!date) {
    return '-'
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    },
  )
}

const createMeasurementJob = (
  documentId: string,
  data: any,
): MeasurementJob | null => {
  const measurementId = getString(
    data?.measurementId,
  )

  if (!/^M\/\d+$/.test(measurementId)) {
    return null
  }

  const customer = data?.customer || {}
  const officeInfo = data?.officeInfo || {}
  const customerAdviser =
    data?.customerAdviser || {}
  const quotationData =
    data?.quotation || {}

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
      image: getString(item?.image),
    }),
  )

  return {
    id: documentId,

    measurementId,

    date: getString(data?.date),

    expectedDeliveryDate:
      getString(data?.expectedDeliveryDate),

    customer: {
      name: getString(customer?.name),
      companyName: getString(
        customer?.companyName,
      ),
      phoneNumber: getString(
        customer?.phoneNumber,
      ),
      whatsappNumber: getString(
        customer?.whatsappNumber,
      ),
      place: getString(customer?.place),
    },

    items,

    officeInfo: {
      designJob: getBoolean(
        officeInfo?.designJob,
      ),
      printJob: getBoolean(
        officeInfo?.printJob,
      ),
      cuttingJob: getBoolean(
        officeInfo?.cuttingJob,
      ),
      productionJob: getBoolean(
        officeInfo?.productionJob,
      ),

      designer:
        getString(officeInfo?.designer) ||
        null,

      designerUsername:
        getString(
          officeInfo?.designerUsername,
        ) || null,

      printBranch:
        getBranch(
          officeInfo?.printBranch,
        ) || null,

      cuttingBranch:
        getBranch(
          officeInfo?.cuttingBranch,
        ) || null,

      productionBranch:
        getBranch(
          officeInfo?.productionBranch,
        ) || null,
    },

    customerAdviser: {
      name: getString(
        customerAdviser?.name,
      ),
      username: getString(
        customerAdviser?.username,
      ),
    },

    quotation: {
      status:
        quotationData?.status ===
        'Confirmed'
          ? 'Confirmed'
          : 'Pending',

      generatedBy:
        quotationData?.generatedBy
          ? {
              name: getString(
                quotationData
                  .generatedBy.name,
              ),
              username: getString(
                quotationData
                  .generatedBy.username,
              ),
            }
          : undefined,

      generatedAt:
        quotationData?.generatedAt,
    },

    statuses: {
      design: getStatus(
        data?.statuses?.design,
      ),
      print: getStatus(
        data?.statuses?.print,
      ),
      cutting: getStatus(
        data?.statuses?.cutting,
      ),
      production: getStatus(
        data?.statuses?.production,
      ),
    },

    createdAt: data?.createdAt,
  }
}

// =====================================================
// FIRST WORKFLOW STAGE
// =====================================================

const getFirstDepartment = (
  measurement: MeasurementJob,
): Department | null => {
  if (measurement.officeInfo.designJob) {
    return 'design'
  }

  if (measurement.officeInfo.printJob) {
    return 'print'
  }

  if (measurement.officeInfo.cuttingJob) {
    return 'cutting'
  }

  if (measurement.officeInfo.productionJob) {
    return 'production'
  }

  return null
}

// =====================================================
// PRINT HELPERS
// =====================================================

const escapeHtml = (value: unknown): string => {
  return String(value ?? '-')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

const printMeasurementA4 = (
  measurement: MeasurementJob,
) => {
  const printWindow = window.open(
    '',
    '_blank',
    'width=900,height=1000',
  )

  if (!printWindow) {
    alert(
      'Please allow pop-ups in your browser to print this work.',
    )
    return
  }

  const rows = measurement.items
    .map(
      (item, index) => `
        <tr>
          <td>${escapeHtml(
            item.slNo ?? index + 1,
          )}</td>
          <td>${escapeHtml(
            item.name || '-',
          )}</td>
          <td>${escapeHtml(
            item.width || '-',
          )}</td>
          <td>${escapeHtml(
            item.height || '-',
          )}</td>
          <td>${escapeHtml(
            item.qty || '-',
          )}</td>
          <td>${escapeHtml(
            item.price || '-',
          )}</td>
          <td>${escapeHtml(
            item.remarks || '-',
          )}</td>
          <td>
            ${
              item.image
                ? `<img class="item-image" src="${escapeHtml(
                    item.image,
                  )}" />`
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
      <td><strong>${escapeHtml(
        label,
      )}</strong></td>
      <td>${selected ? 'Yes' : 'No'}</td>
      <td>${escapeHtml(
        selected ? assignment || 'Not assigned' : '-',
      )}</td>
      <td>${escapeHtml(
        selected ? status : '-',
      )}</td>
    </tr>
  `

  const html = `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(
          measurement.measurementId,
        )}</title>

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

            .no-print {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="page">

          <div class="header">
            <div class="title">
              Measurement / Job Work
            </div>
            <div class="subtitle">
              ${escapeHtml(
                measurement.measurementId,
              )}
            </div>
          </div>

          <div class="grid">
            <div class="box">
              <span class="label">Measurement ID</span>
              <span class="value">
                ${escapeHtml(
                  measurement.measurementId,
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Date</span>
              <span class="value">
                ${escapeHtml(
                  formatDate(
                    measurement.date,
                  ),
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Expected Delivery</span>
              <span class="value">
                ${escapeHtml(
                  formatDate(
                    measurement
                      .expectedDeliveryDate,
                  ),
                )}
              </span>
            </div>
          </div>

          <h2>Customer Information</h2>

          <div class="grid">
            <div class="box">
              <span class="label">Customer</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customer.name ||
                    '-',
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Company</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customer
                    .companyName || '-',
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Phone</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customer
                    .phoneNumber || '-',
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">WhatsApp</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customer
                    .whatsappNumber || '-',
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Place</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customer.place ||
                    '-',
                )}
              </span>
            </div>

            <div class="box">
              <span class="label">Customer Adviser</span>
              <span class="value">
                ${escapeHtml(
                  measurement.customerAdviser
                    .name || '-',
                )}
              </span>
            </div>
          </div>

          <h2>Job Assignments & Status</h2>

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
                measurement.officeInfo.designJob,
                measurement.officeInfo.designer
                  ? `${measurement.officeInfo.designer}${
                      measurement.officeInfo.designerUsername
                        ? ` (${measurement.officeInfo.designerUsername})`
                        : ''
                    }`
                  : '',
                measurement.statuses.design,
              )}

              ${jobRow(
                'Printing',
                measurement.officeInfo.printJob,
                getBranch(
                  measurement.officeInfo
                    .printBranch,
                ),
                measurement.statuses.print,
              )}

              ${jobRow(
                'Cutting',
                measurement.officeInfo.cuttingJob,
                getBranch(
                  measurement.officeInfo
                    .cuttingBranch,
                ),
                measurement.statuses.cutting,
              )}

              ${jobRow(
                'Production',
                measurement.officeInfo.productionJob,
                getBranch(
                  measurement.officeInfo
                    .productionBranch,
                ),
                measurement.statuses.production,
              )}
            </tbody>
          </table>

          <h2>Items</h2>

          ${
            measurement.items.length > 0
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

          <div class="footer">
            Quotation:
            ${escapeHtml(
              measurement.quotation.status,
            )}
            &nbsp; • &nbsp;
            Printed from Live Production
            &nbsp; • &nbsp;
            ${escapeHtml(
              formatDateTime(
                Timestamp.now(),
              ),
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

// =====================================================
// COMPONENT
// =====================================================

function LiveProduction({
  user,
}: LiveProductionProps) {
  const navigate = useNavigate()

  // ===================================================
  // MAIN STATE
  // ===================================================

  const [
    measurements,
    setMeasurements,
  ] = useState<MeasurementJob[]>([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    error,
    setError,
  ] = useState('')

  const [
    searchText,
    setSearchText,
  ] = useState('')

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('')

  const [
    expandedMeasurement,
    setExpandedMeasurement,
  ] = useState<string | null>(null)

  const [
    confirmingQuotation,
    setConfirmingQuotation,
  ] = useState<string | null>(null)

  // ===================================================
  // DESIGNERS
  // ===================================================

  const [
    designers,
    setDesigners,
  ] = useState<Designer[]>([])

  const [
    designersLoading,
    setDesignersLoading,
  ] = useState(true)

  // ===================================================
  // ASSIGNMENT DRAFTS
  // ===================================================

  const [
    assignmentDrafts,
    setAssignmentDrafts,
  ] = useState<
    Record<string, AssignmentDraft>
  >({})

  const [
    savingAssignments,
    setSavingAssignments,
  ] = useState<string | null>(null)

  // ===================================================
  // EDIT STATE
  // ===================================================

  const [
    editingMeasurement,
    setEditingMeasurement,
  ] = useState<
    MeasurementJob | null
  >(null)

  const [
    editDraft,
    setEditDraft,
  ] = useState<EditDraft | null>(null)

  const [
    savingEdit,
    setSavingEdit,
  ] = useState(false)

  // ===================================================
  // LOAD MEASUREMENTS
  // ===================================================

  useEffect(() => {
    const measurementCollection =
      collection(
        db,
        'measurements',
      )

    const measurementQuery =
      query(
        measurementCollection,
        orderBy(
          'createdAt',
          'desc',
        ),
      )

    const unsubscribe =
      onSnapshot(
        measurementQuery,
        (snapshot) => {
          const loadedMeasurements =
            snapshot.docs
              .map(
                (document) =>
                  createMeasurementJob(
                    document.id,
                    document.data(),
                  ),
              )
              .filter(
                (
                  measurement,
                ): measurement is MeasurementJob =>
                  measurement !== null,
              )

          setMeasurements(
            loadedMeasurements,
          )

          setLoading(false)
          setError('')
        },
        (firebaseError) => {
          console.error(
            'Error loading measurements:',
            firebaseError,
          )

          setError(
            `Unable to load measurements: ${firebaseError.message}`,
          )

          setLoading(false)
        },
      )

    return unsubscribe
  }, [])

  // ===================================================
  // LOAD DESIGNERS
  // ===================================================

  useEffect(() => {
    let cancelled = false

    const fetchDesigners = async () => {
      setDesignersLoading(true)

      try {
        const usersRef = collection(
          db,
          'users',
        )

        // Same lookup used by the Job Order page:
        // first try lowercase "designer".
        const designerQuery = query(
          usersRef,
          where(
            'roles',
            'array-contains',
            'designer',
          ),
        )

        const snapshot = await getDocs(
          designerQuery,
        )

        let loadedDesigners: Designer[] =
          snapshot.docs
            .map((document) => {
              const data =
                document.data()

              return {
                id: document.id,
                name: getString(data.name),
                username: getString(
                  data.username,
                ),
              }
            })
            .filter(
              (designer) =>
                designer.name ||
                designer.username,
            )

        // Backward compatibility:
        // some users may have the role "Designer".
        if (loadedDesigners.length === 0) {
          const capitalDesignerQuery = query(
            usersRef,
            where(
              'roles',
              'array-contains',
              'Designer',
            ),
          )

          const capitalSnapshot =
            await getDocs(
              capitalDesignerQuery,
            )

          loadedDesigners =
            capitalSnapshot.docs
              .map((document) => {
                const data =
                  document.data()

                return {
                  id: document.id,
                  name: getString(data.name),
                  username: getString(
                    data.username,
                  ),
                }
              })
              .filter(
                (designer) =>
                  designer.name ||
                  designer.username,
              )
        }

        loadedDesigners.sort((a, b) =>
          a.name.localeCompare(b.name),
        )

        if (!cancelled) {
          setDesigners(loadedDesigners)
          setDesignersLoading(false)
        }
      } catch (firebaseError) {
        console.error(
          'Error loading designers:',
          firebaseError,
        )

        if (!cancelled) {
          setDesigners([])
          setDesignersLoading(false)

          setError(
            firebaseError instanceof Error
              ? `Unable to load designers: ${firebaseError.message}`
              : 'Unable to load designers from Firebase.',
          )
        }
      }
    }

    fetchDesigners()

    return () => {
      cancelled = true
    }
  }, [])

  // ===================================================
  // CREATE / UPDATE ASSIGNMENT DRAFT
  // ===================================================

  const getAssignmentDraft = (
    measurement: MeasurementJob,
  ): AssignmentDraft => {
    return (
      assignmentDrafts[
        measurement.id
      ] ?? {
        designer:
          measurement.officeInfo
            .designer || '',
        designerUsername:
          measurement.officeInfo
            .designerUsername || '',
        printBranch:
          getBranch(
            measurement.officeInfo
              .printBranch,
          ),
        cuttingBranch:
          getBranch(
            measurement.officeInfo
              .cuttingBranch,
          ),
        productionBranch:
          getBranch(
            measurement.officeInfo
              .productionBranch,
          ),
      }
    )
  }

  const updateAssignmentDraft = (
    measurementId: string,
    field: keyof AssignmentDraft,
    value: string,
  ) => {
    setAssignmentDrafts(
      (previous) => {
        const current =
          previous[
            measurementId
          ] ?? {
            designer: '',
            designerUsername: '',
            printBranch: '',
            cuttingBranch: '',
            productionBranch: '',
          }

        return {
          ...previous,
          [measurementId]: {
            ...current,
            [field]: value,
          },
        }
      },
    )
  }

  const handleDesignerChange = (
    measurementId: string,
    designerId: string,
  ) => {
    const selected =
      designers.find(
        (designer) =>
          designer.id ===
          designerId,
      )

    updateAssignmentDraft(
      measurementId,
      'designer',
      selected?.name || '',
    )

    updateAssignmentDraft(
      measurementId,
      'designerUsername',
      selected?.username || '',
    )
  }

  // ===================================================
  // SAVE ASSIGNMENTS
  // ===================================================

  const handleSaveAssignments =
    async (
      measurement: MeasurementJob,
    ) => {
      if (
        measurement.quotation.status !==
        'Confirmed'
      ) {
        setError(
          'Quotation must be confirmed before assignments can be saved.',
        )
        return
      }

      const draft =
        getAssignmentDraft(
          measurement,
        )

      if (
        measurement.officeInfo.designJob &&
        !draft.designer.trim()
      ) {
        setError(
          `Please select a designer for ${measurement.measurementId}.`,
        )
        return
      }

      if (
        measurement.officeInfo.printJob &&
        !draft.printBranch.trim()
      ) {
        setError(
          `Please select a printing branch for ${measurement.measurementId}.`,
        )
        return
      }

      if (
        measurement.officeInfo.cuttingJob &&
        !draft.cuttingBranch.trim()
      ) {
        setError(
          `Please select a cutting branch for ${measurement.measurementId}.`,
        )
        return
      }

      if (
        measurement.officeInfo.productionJob &&
        !draft.productionBranch.trim()
      ) {
        setError(
          `Please select a production branch for ${measurement.measurementId}.`,
        )
        return
      }

      setSavingAssignments(
        measurement.id,
      )
      setError('')

      try {
        const measurementReference =
          doc(
            db,
            'measurements',
            measurement.id,
          )

        await updateDoc(
          measurementReference,
          {
            'officeInfo.designer':
              measurement.officeInfo
                .designJob
                ? draft.designer.trim()
                : null,

            'officeInfo.designerUsername':
              measurement.officeInfo
                .designJob
                ? draft.designerUsername.trim()
                : null,

            'officeInfo.printBranch':
              measurement.officeInfo
                .printJob
                ? draft.printBranch.trim()
                : null,

            'officeInfo.cuttingBranch':
              measurement.officeInfo
                .cuttingJob
                ? draft.cuttingBranch.trim()
                : null,

            'officeInfo.productionBranch':
              measurement.officeInfo
                .productionJob
                ? draft.productionBranch.trim()
                : null,

            assignmentUpdatedAt:
              Timestamp.now(),

            assignmentUpdatedBy: {
              name: user.name,
              username: user.username,
            },
          },
        )

        setError('')
      } catch (
        assignmentError
      ) {
        console.error(
          'Error saving assignments:',
          assignmentError,
        )

        if (
          assignmentError instanceof
          Error
        ) {
          setError(
            `Unable to save assignments: ${assignmentError.message}`,
          )
        } else {
          setError(
            'Unable to save assignments.',
          )
        }
      } finally {
        setSavingAssignments(
          null,
        )
      }
    }

  // ===================================================
  // CONFIRM QUOTATION
  // ===================================================
const handleQuotationConfirm =
  async (
    measurement: MeasurementJob,
  ) => {
    if (
      confirmingQuotation ===
      measurement.id
    ) {
      return
    }

    setError('')

    setConfirmingQuotation(
      measurement.id,
    )

    try {
      const measurementReference =
        doc(
          db,
          'measurements',
          measurement.id,
        )

      await updateDoc(
        measurementReference,
        {
          quotation: {
            status:
              'Confirmed',

            generatedBy: {
              name:
                user.name,

              username:
                user.username,
            },

            generatedAt:
              Timestamp.now(),
          },

          /*
           * IMPORTANT:
           *
           * Confirming the quotation must NOT
           * start any department.
           *
           * Every selected department remains
           * Pending until its department/user
           * actually starts the work.
           */

          'statuses.design':
            'Pending',

          'statuses.print':
            'Pending',

          'statuses.cutting':
            'Pending',

          'statuses.production':
            'Pending',
        },
      )

      setError('')
    } catch (
      quotationError
    ) {
      console.error(
        'Quotation confirmation error:',
        quotationError,
      )

      if (
        quotationError instanceof
        Error
      ) {
        setError(
          `Quotation confirmation failed: ${quotationError.message}`,
        )
      } else {
        setError(
          'Quotation confirmation failed.',
        )
      }
    } finally {
      setConfirmingQuotation(
        null,
      )
    }
  }

  // ===================================================
  // WORKFLOW PREREQUISITES
  // ===================================================

  const canStartDesign = (
    measurement: MeasurementJob,
  ): boolean => {
    return (
      measurement.quotation.status ===
        'Confirmed' &&
      measurement.officeInfo.designJob
    )
  }

  const canStartPrint = (
    measurement: MeasurementJob,
  ): boolean => {
    if (
      measurement.quotation.status !==
      'Confirmed'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.printJob
    ) {
      return false
    }

    if (
      measurement.officeInfo.designJob &&
      measurement.statuses.design !==
        'Finished'
    ) {
      return false
    }

    return true
  }

  const canStartCutting = (
    measurement: MeasurementJob,
  ): boolean => {
    if (
      measurement.quotation.status !==
      'Confirmed'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.cuttingJob
    ) {
      return false
    }

    if (
      measurement.officeInfo.printJob &&
      measurement.statuses.print !==
        'Finished'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.printJob &&
      measurement.officeInfo.designJob &&
      measurement.statuses.design !==
        'Finished'
    ) {
      return false
    }

    return true
  }

  const canStartProduction = (
    measurement: MeasurementJob,
  ): boolean => {
    if (
      measurement.quotation.status !==
      'Confirmed'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.productionJob
    ) {
      return false
    }

    if (
      measurement.officeInfo.cuttingJob &&
      measurement.statuses.cutting !==
        'Finished'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.cuttingJob &&
      measurement.officeInfo.printJob &&
      measurement.statuses.print !==
        'Finished'
    ) {
      return false
    }

    if (
      !measurement.officeInfo.cuttingJob &&
      !measurement.officeInfo.printJob &&
      measurement.officeInfo.designJob &&
      measurement.statuses.design !==
        'Finished'
    ) {
      return false
    }

    return true
  }

  // ===================================================
  // STATUS CHANGE
  // ===================================================

  const handleStatusChange =
    async (
      measurement: MeasurementJob,
      department: Department,
      status: JobStatus,
    ) => {
      if (
        measurement.quotation.status !==
        'Confirmed'
      ) {
        setError(
          'Quotation must be confirmed before starting work.',
        )
        return
      }

      let allowed = false

      if (
        department ===
        'design'
      ) {
        allowed =
          canStartDesign(
            measurement,
          )
      }

      if (
        department ===
        'print'
      ) {
        allowed =
          canStartPrint(
            measurement,
          )
      }

      if (
        department ===
        'cutting'
      ) {
        allowed =
          canStartCutting(
            measurement,
          )
      }

      if (
        department ===
        'production'
      ) {
        allowed =
          canStartProduction(
            measurement,
          )
      }

      if (!allowed) {
        setError(
          `This ${department} job is not ready yet.`,
        )
        return
      }

      try {
        await updateDoc(
          doc(
            db,
            'measurements',
            measurement.id,
          ),
          {
            [`statuses.${department}`]:
              status,
          },
        )

        setError('')
      } catch (
        statusError
      ) {
        console.error(
          'Error updating status:',
          statusError,
        )

        if (
          statusError instanceof
          Error
        ) {
          setError(
            `Unable to update ${department}: ${statusError.message}`,
          )
        } else {
          setError(
            `Unable to update ${department}.`,
          )
        }
      }
    }

  // ===================================================
  // EDIT
  // ===================================================

  const handleOpenEdit = (
    measurement: MeasurementJob,
  ) => {
    setEditingMeasurement(
      measurement,
    )

    setEditDraft({
      date:
        measurement.date,

      expectedDeliveryDate:
        measurement.expectedDeliveryDate,

      customer: {
        ...measurement.customer,
      },

      items:
        measurement.items.map(
          (item) => ({
            ...item,
          }),
        ),

      officeInfo: {
        ...measurement.officeInfo,
      },
    })

    setError('')
  }

  const handleCloseEdit = () => {
    if (savingEdit) {
      return
    }

    setEditingMeasurement(
      null,
    )

    setEditDraft(null)
  }

  const handleEditCustomerChange = (
    field: keyof Customer,
    value: string,
  ) => {
    setEditDraft(
      (previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          customer: {
            ...previous.customer,
            [field]: value,
          },
        }
      },
    )
  }

  const handleEditItemChange = (
    index: number,
    field: keyof Item,
    value: string,
  ) => {
    setEditDraft(
      (previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          items:
            previous.items.map(
              (
                item,
                itemIndex,
              ) =>
                itemIndex ===
                index
                  ? {
                      ...item,
                      [field]: value,
                    }
                  : item,
            ),
        }
      },
    )
  }

  const handleAddEditItem = () => {
    setEditDraft(
      (previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          items: [
            ...previous.items,
            {
              slNo:
                previous.items.length +
                1,
              name: '',
              width: '',
              height: '',
              qty: '',
              price: '',
              remarks: '',
              image: '',
            },
          ],
        }
      },
    )
  }

  const handleRemoveEditItem = (
    index: number,
  ) => {
    setEditDraft(
      (previous) => {
        if (!previous) {
          return previous
        }

        return {
          ...previous,
          items:
            previous.items
              .filter(
                (
                  _,
                  itemIndex,
                ) =>
                  itemIndex !==
                  index,
              )
              .map(
                (
                  item,
                  itemIndex,
                ) => ({
                  ...item,
                  slNo:
                    itemIndex + 1,
                }),
              ),
        }
      },
    )
  }

  const handleSaveEdit =
    async () => {
      if (
        !editingMeasurement ||
        !editDraft
      ) {
        return
      }

      setSavingEdit(true)
      setError('')

      try {
        await updateDoc(
          doc(
            db,
            'measurements',
            editingMeasurement.id,
          ),
          {
            date:
              editDraft.date,

            expectedDeliveryDate:
              editDraft.expectedDeliveryDate,

            customer:
              editDraft.customer,

            items:
              editDraft.items,

            officeInfo:
              editDraft.officeInfo,
          },
        )

        setEditingMeasurement(
          null,
        )

        setEditDraft(null)
      } catch (
        editError
      ) {
        console.error(
          'Error editing measurement:',
          editError,
        )

        if (
          editError instanceof
          Error
        ) {
          setError(
            `Unable to save changes: ${editError.message}`,
          )
        } else {
          setError(
            'Unable to save changes.',
          )
        }
      } finally {
        setSavingEdit(false)
      }
    }

  // ===================================================
  // DELETE
  // ===================================================

  const handleDelete = async (
    measurement: MeasurementJob,
  ) => {
    const confirmed =
      window.confirm(
        `Are you sure you want to delete ${measurement.measurementId}? This cannot be undone.`,
      )

    if (!confirmed) {
      return
    }

    try {
      setError('')

      await deleteDoc(
        doc(
          db,
          'measurements',
          measurement.id,
        ),
      )

      if (
        expandedMeasurement ===
        measurement.id
      ) {
        setExpandedMeasurement(
          null,
        )
      }
    } catch (
      deleteError
    ) {
      console.error(
        'Error deleting measurement:',
        deleteError,
      )

      if (
        deleteError instanceof
        Error
      ) {
        setError(
          `Unable to delete ${measurement.measurementId}: ${deleteError.message}`,
        )
      } else {
        setError(
          `Unable to delete ${measurement.measurementId}.`,
        )
      }
    }
  }

  // ===================================================
  // FILTER
  // ===================================================

  const filteredMeasurements =
    useMemo(() => {
      return measurements.filter(
        (measurement) => {
          const search =
            searchText
              .trim()
              .toLowerCase()

          if (search) {
            const searchableText =
              [
                measurement.measurementId,
                measurement.customer.name,
                measurement.customer.companyName,
                measurement.customer.phoneNumber,
                measurement.customer.whatsappNumber,
                measurement.customer.place,
                measurement.customerAdviser.name,
                measurement.customerAdviser.username,
                measurement.officeInfo.designer,
                measurement.officeInfo.designerUsername,
                measurement.officeInfo.printBranch,
                measurement.officeInfo.cuttingBranch,
                measurement.officeInfo.productionBranch,
                ...measurement.items.map(
                  (item) =>
                    item.name || '',
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

          if (
            statusFilter &&
            measurement.statuses.production !==
              statusFilter
          ) {
            return false
          }

          return true
        },
      )
    }, [
      measurements,
      searchText,
      statusFilter,
    ])

  // ===================================================
  // STATUS DISPLAY
  // ===================================================

  const statusStyle = (
    status: JobStatus,
  ) => {
    if (status === 'Finished') {
      return {
        background:
          '#dcfce7',
        color:
          '#166534',
      }
    }

    if (
      status === 'In Progress'
    ) {
      return {
        background:
          '#dbeafe',
        color:
          '#1d4ed8',
      }
    }

    return {
      background:
        '#fef3c7',
      color:
        '#92400e',
    }
  }

  const statusText = (
    status: JobStatus,
  ) => {
    return (
      <span
        style={{
          display:
            'inline-flex',
          alignItems:
            'center',
          padding:
            '5px 9px',
          borderRadius:
            '999px',
          fontSize:
            '12px',
          fontWeight:
            700,
          ...statusStyle(
            status,
          ),
        }}
      >
        {status}
      </span>
    )
  }

  // ===================================================
  // LOADING
  // ===================================================

  if (loading) {
    return (
      <div className="department-page">
        <div className="department-container">
          <div className="department-header">
            <div>
              <h1>
                Live Production
              </h1>

              <p>
                Loading measurements...
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ===================================================
  // MAIN UI
  // ===================================================

  return (
    <div className="department-page">
      <div className="department-container">

        {/* HEADER */}

        <div className="department-header">
          <div>
            <h1>
              Live Production
            </h1>

            <p>
              Measurement production
              workflow
            </p>
          </div>

          <button
            type="button"
            className="add-item-button"
            onClick={() =>
              navigate(
                '/departments/measurement',
              )
            }
          >
            + Measurement
          </button>
        </div>

        {/* ERROR */}

        {error && (
          <div
            className="form-message"
            style={{
              marginBottom:
                '20px',
            }}
          >
            {error}
          </div>
        )}

        {/* FILTER */}

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                Measurements
              </h2>

              <p>
                Live workflow for
                measurement orders.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label>
                Search
              </label>

              <input
                type="text"
                placeholder="Search Measurement, customer, phone, branch..."
                value={
                  searchText
                }
                onChange={(
                  event,
                ) =>
                  setSearchText(
                    event.target
                      .value,
                  )
                }
              />
            </div>

            <div className="input-group">
              <label>
                Production Status
              </label>

              <select
                value={
                  statusFilter
                }
                onChange={(
                  event,
                ) =>
                  setStatusFilter(
                    event.target
                      .value,
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
          </div>
        </section>

        {/* EMPTY */}

        {filteredMeasurements.length ===
          0 && (
          <section className="department-section">
            <div className="empty-items">
              {measurements.length ===
              0
                ? 'No Measurement orders available.'
                : 'No measurements match your search or filter.'}
            </div>
          </section>
        )}

        {/* MEASUREMENTS */}

        {filteredMeasurements.map(
          (
            measurement,
          ) => {
            const isExpanded =
              expandedMeasurement ===
              measurement.id

            const quotationConfirmed =
              measurement.quotation.status ===
              'Confirmed'

            const isConfirming =
              confirmingQuotation ===
              measurement.id

            const assignment =
              getAssignmentDraft(
                measurement,
              )

            const assignmentsSaved =
              Boolean(
                (
                  measurement
                    .officeInfo
                    .designJob
                    ? measurement
                        .officeInfo
                        .designer
                    : true
                ) &&
                (
                  measurement
                    .officeInfo
                    .printJob
                    ? measurement
                        .officeInfo
                        .printBranch
                    : true
                ) &&
                (
                  measurement
                    .officeInfo
                    .cuttingJob
                    ? measurement
                        .officeInfo
                        .cuttingBranch
                    : true
                ) &&
                (
                  measurement
                    .officeInfo
                    .productionJob
                    ? measurement
                        .officeInfo
                        .productionBranch
                    : true
                ),
              )

            return (
              <section
                className="department-section"
                key={
                  measurement.id
                }
              >

                {/* ORDER HEADER */}

                <div
                  style={{
                    display:
                      'flex',
                    justifyContent:
                      'space-between',
                    alignItems:
                      'center',
                    gap:
                      '15px',
                    flexWrap:
                      'wrap',
                    marginBottom:
                      '20px',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize:
                          '26px',
                        fontWeight:
                          700,
                      }}
                    >
                      {
                        measurement
                          .measurementId
                      }
                    </div>

                    <div
                      style={{
                        marginTop:
                          '5px',
                        fontSize:
                          '16px',
                        fontWeight:
                          600,
                      }}
                    >
                      {
                        measurement
                          .customer
                          .name ||
                        'Unnamed Customer'
                      }
                    </div>

                    {measurement
                      .customer
                      .companyName && (
                      <div
                        style={{
                          fontSize:
                            '13px',
                          opacity:
                            0.7,
                          marginTop:
                            '3px',
                        }}
                      >
                        {
                          measurement
                            .customer
                            .companyName
                        }
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      display:
                        'flex',
                      gap:
                        '8px',
                      alignItems:
                        'center',
                      flexWrap:
                        'wrap',
                    }}
                  >

                    <button
                      type="button"
                      className="edit-button"
                      onClick={() =>
                        handleOpenEdit(
                          measurement,
                        )
                      }
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() =>
                        handleDelete(
                          measurement,
                        )
                      }
                    >
                      Delete
                    </button>

                    {quotationConfirmed ? (
                      <div
                        style={{
                          padding:
                            '10px 16px',
                          borderRadius:
                            '8px',
                          background:
                            '#e8f7ee',
                          color:
                            '#187a3d',
                          fontWeight:
                            600,
                        }}
                      >
                        ✓ Quotation
                        Confirmed

                        <div
                          style={{
                            fontSize:
                              '12px',
                            marginTop:
                              '4px',
                            fontWeight:
                              400,
                          }}
                        >
                          By:{' '}
                          {
                            measurement
                              .quotation
                              .generatedBy
                              ?.name ||
                            '-'
                          }
                        </div>

                        <div
                          style={{
                            fontSize:
                              '11px',
                            marginTop:
                              '2px',
                          }}
                        >
                          {formatDateTime(
                            measurement
                              .quotation
                              .generatedAt,
                          )}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="add-item-button"
                        disabled={
                          isConfirming
                        }
                        onClick={() =>
                          handleQuotationConfirm(
                            measurement,
                          )
                        }
                      >
                        {isConfirming
                          ? 'Confirming...'
                          : '✓ Quotation Generated and Confirmed'}
                      </button>
                    )}

                    {/* VIEW */}

                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        setExpandedMeasurement(
                          isExpanded
                            ? null
                            : measurement.id,
                        )
                      }
                    >
                      {isExpanded
                        ? 'Hide'
                        : 'View'}
                    </button>

                    {/* PRINT */}

                    <button
                      type="button"
                      className="view-button"
                      onClick={() =>
                        printMeasurementA4(
                          measurement,
                        )
                      }
                    >
                      🖨 Print
                    </button>
                  </div>
                </div>

                {/* BASIC INFORMATION */}

                <div
                  style={{
                    display:
                      'grid',
                    gridTemplateColumns:
                      'repeat(auto-fit, minmax(180px, 1fr))',
                    gap:
                      '15px',
                    marginBottom:
                      '20px',
                  }}
                >
                  <div className="status-box">
                    <label>
                      Measurement ID
                    </label>
                    <strong>
                      {
                        measurement
                          .measurementId
                      }
                    </strong>
                  </div>

                  <div className="status-box">
                    <label>
                      Created
                    </label>
                    <span>
                      {formatDateTime(
                        measurement
                          .createdAt,
                      )}
                    </span>
                  </div>

                  <div className="status-box">
                    <label>
                      Measurement Date
                    </label>
                    <span>
                      {formatDate(
                        measurement.date,
                      )}
                    </span>
                  </div>

                  <div className="status-box">
                    <label>
                      Expected Delivery
                    </label>
                    <span>
                      {formatDate(
                        measurement
                          .expectedDeliveryDate,
                      )}
                    </span>
                  </div>

                  <div className="status-box">
                    <label>
                      Customer Adviser
                    </label>
                    <span>
                      {
                        measurement
                          .customerAdviser
                          .name ||
                        '-'
                      }
                    </span>
                  </div>
                </div>

                {/* =================================================
                    ASSIGNMENT SECTION
                ================================================== */}

                {quotationConfirmed && (
                  <div
                    style={{
                      marginBottom:
                        '25px',
                      padding:
                        '18px',
                      border:
                        '1px solid #dbe3ec',
                      borderRadius:
                        '12px',
                      background:
                        '#f8fafc',
                    }}
                  >
                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'space-between',
                        alignItems:
                          'center',
                        gap:
                          '12px',
                        flexWrap:
                          'wrap',
                        marginBottom:
                          '15px',
                      }}
                    >
                      <div>
                        <h3
                          style={{
                            margin:
                              0,
                          }}
                        >
                          Job Assignment
                        </h3>

                        <p
                          style={{
                            margin:
                              '5px 0 0',
                            color:
                              '#64748b',
                            fontSize:
                              '13px',
                          }}
                        >
                          Assign each selected
                          department. Status is
                          shown below and is
                          updated by the
                          department.
                        </p>
                      </div>

                      {assignmentsSaved && (
                        <span
                          style={{
                            padding:
                              '6px 10px',
                            borderRadius:
                              '999px',
                            background:
                              '#dcfce7',
                            color:
                              '#166534',
                            fontSize:
                              '12px',
                            fontWeight:
                              700,
                          }}
                        >
                          ✓ Assignment Saved
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        display:
                          'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(220px, 1fr))',
                        gap:
                          '12px',
                      }}
                    >

                      {/* DESIGN */}

                      {measurement
                        .officeInfo
                        .designJob && (
                        <div
                          className="status-box"
                        >
                          <label>
                            Design
                          </label>

                          <select
                            value={
                              designers.find(
                                (
                                  designer,
                                ) =>
                                  designer.name ===
                                    assignment.designer &&
                                  designer.username ===
                                    assignment.designerUsername,
                              )?.id ||
                              ''
                            }
                            onChange={(
                              event,
                            ) =>
                              handleDesignerChange(
                                measurement.id,
                                event.target
                                  .value,
                              )
                            }
                            disabled={
                              designersLoading
                            }
                          >
                            <option value="">
                              {designersLoading
                                ? 'Loading designers...'
                                : 'Select Designer'}
                            </option>

                            {designers.map(
                              (
                                designer,
                              ) => (
                                <option
                                  key={
                                    designer.id
                                  }
                                  value={
                                    designer.id
                                  }
                                >
                                  {
                                    designer.name
                                  }
                                  {designer.username
                                    ? ` (${designer.username})`
                                    : ''}
                                </option>
                              ),
                            )}
                          </select>

                          <div
                            style={{
                              marginTop:
                                '10px',
                            }}
                          >
                            <strong>
                              Status
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  '5px',
                              }}
                            >
                              {statusText(
                                measurement
                                  .statuses
                                  .design,
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PRINTING */}

                      {measurement
                        .officeInfo
                        .printJob && (
                        <div
                          className="status-box"
                        >
                          <label>
                            Printing
                          </label>

                          <select
                            value={
                              assignment.printBranch
                            }
                            onChange={(
                              event,
                            ) =>
                              updateAssignmentDraft(
                                measurement.id,
                                'printBranch',
                                event.target
                                  .value,
                              )
                            }
                          >
                            <option value="">
                              Select Printing
                              Branch
                            </option>

                            {BRANCHES.map(
                              (
                                branch,
                              ) => (
                                <option
                                  key={
                                    branch
                                  }
                                  value={
                                    branch
                                  }
                                >
                                  {
                                    branch
                                  }
                                </option>
                              ),
                            )}
                          </select>

                          <div
                            style={{
                              marginTop:
                                '10px',
                            }}
                          >
                            <strong>
                              Status
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  '5px',
                              }}
                            >
                              {statusText(
                                measurement
                                  .statuses
                                  .print,
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* CUTTING */}

                      {measurement
                        .officeInfo
                        .cuttingJob && (
                        <div
                          className="status-box"
                        >
                          <label>
                            Cutting
                          </label>

                          <select
                            value={
                              assignment.cuttingBranch
                            }
                            onChange={(
                              event,
                            ) =>
                              updateAssignmentDraft(
                                measurement.id,
                                'cuttingBranch',
                                event.target
                                  .value,
                              )
                            }
                          >
                            <option value="">
                              Select Cutting
                              Branch
                            </option>

                            {BRANCHES.map(
                              (
                                branch,
                              ) => (
                                <option
                                  key={
                                    branch
                                  }
                                  value={
                                    branch
                                  }
                                >
                                  {
                                    branch
                                  }
                                </option>
                              ),
                            )}
                          </select>

                          <div
                            style={{
                              marginTop:
                                '10px',
                            }}
                          >
                            <strong>
                              Status
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  '5px',
                              }}
                            >
                              {statusText(
                                measurement
                                  .statuses
                                  .cutting,
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* PRODUCTION */}

                      {measurement
                        .officeInfo
                        .productionJob && (
                        <div
                          className="status-box"
                        >
                          <label>
                            Production
                          </label>

                          <select
                            value={
                              assignment.productionBranch
                            }
                            onChange={(
                              event,
                            ) =>
                              updateAssignmentDraft(
                                measurement.id,
                                'productionBranch',
                                event.target
                                  .value,
                              )
                            }
                          >
                            <option value="">
                              Select Production
                              Branch
                            </option>

                            {BRANCHES.map(
                              (
                                branch,
                              ) => (
                                <option
                                  key={
                                    branch
                                  }
                                  value={
                                    branch
                                  }
                                >
                                  {
                                    branch
                                  }
                                </option>
                              ),
                            )}
                          </select>

                          <div
                            style={{
                              marginTop:
                                '10px',
                            }}
                          >
                            <strong>
                              Status
                            </strong>

                            <div
                              style={{
                                marginTop:
                                  '5px',
                              }}
                            >
                              {statusText(
                                measurement
                                  .statuses
                                  .production,
                              )}
                            </div>
                          </div>
                        </div>
                      )}

                    </div>

                    <div
                      style={{
                        display:
                          'flex',
                        justifyContent:
                          'flex-end',
                        marginTop:
                          '15px',
                      }}
                    >
                      <button
                        type="button"
                        className="add-item-button"
                        disabled={
                          savingAssignments ===
                          measurement.id
                        }
                        onClick={() =>
                          handleSaveAssignments(
                            measurement,
                          )
                        }
                      >
                        {savingAssignments ===
                        measurement.id
                          ? 'Saving...'
                          : 'Save Assignments'}
                      </button>
                    </div>
                  </div>
                )}

                {/* WORKFLOW STATUS SUMMARY */}

                <div>
                  <h3>
                    Job Workflow
                  </h3>

                  {!quotationConfirmed && (
                    <div
                      style={{
                        padding:
                          '12px 15px',
                        borderRadius:
                          '8px',
                        background:
                          '#fff4e5',
                        marginBottom:
                          '15px',
                        fontWeight:
                          600,
                      }}
                    >
                      🔒 Quotation must be
                      generated and confirmed
                      before jobs can start.
                    </div>
                  )}

                  <div
                    style={{
                      display:
                        'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit, minmax(180px, 1fr))',
                      gap:
                        '12px',
                    }}
                  >

                    {measurement
                      .officeInfo
                      .designJob && (
                      <div className="status-box">
                        <label>
                          Design
                        </label>

                        <div
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          {statusText(
                            measurement
                              .statuses
                              .design,
                          )}
                        </div>

                        <small>
                          Designer:{' '}
                          {
                            measurement
                              .officeInfo
                              .designer ||
                            'Not assigned'
                          }
                        </small>
                      </div>
                    )}

                    {measurement
                      .officeInfo
                      .printJob && (
                      <div className="status-box">
                        <label>
                          Printing
                        </label>

                        <div
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          {statusText(
                            measurement
                              .statuses
                              .print,
                          )}
                        </div>

                        <small>
                          Branch:{' '}
                          {
                            measurement
                              .officeInfo
                              .printBranch ||
                            'Not assigned'
                          }
                        </small>
                      </div>
                    )}

                    {measurement
                      .officeInfo
                      .cuttingJob && (
                      <div className="status-box">
                        <label>
                          Cutting
                        </label>

                        <div
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          {statusText(
                            measurement
                              .statuses
                              .cutting,
                          )}
                        </div>

                        <small>
                          Branch:{' '}
                          {
                            measurement
                              .officeInfo
                              .cuttingBranch ||
                            'Not assigned'
                          }
                        </small>
                      </div>
                    )}

                    {measurement
                      .officeInfo
                      .productionJob && (
                      <div className="status-box">
                        <label>
                          Production
                        </label>

                        <div
                          style={{
                            marginTop:
                              '6px',
                          }}
                        >
                          {statusText(
                            measurement
                              .statuses
                              .production,
                          )}
                        </div>

                        <small>
                          Branch:{' '}
                          {
                            measurement
                              .officeInfo
                              .productionBranch ||
                            'Not assigned'
                          }
                        </small>
                      </div>
                    )}

                  </div>
                </div>

                {/* EXPANDED DETAILS */}

                {isExpanded && (
                  <div
                    style={{
                      marginTop:
                        '25px',
                    }}
                  >

                    {/* CUSTOMER */}

                    <h3>
                      Customer Details
                    </h3>

                    <div
                      style={{
                        display:
                          'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(180px, 1fr))',
                        gap:
                          '12px',
                      }}
                    >
                      <div className="status-box">
                        <label>
                          Customer
                        </label>
                        <span>
                          {
                            measurement
                              .customer
                              .name ||
                            '-'
                          }
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Company
                        </label>
                        <span>
                          {
                            measurement
                              .customer
                              .companyName ||
                            '-'
                          }
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Phone
                        </label>
                        <span>
                          {
                            measurement
                              .customer
                              .phoneNumber ||
                            '-'
                          }
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          WhatsApp
                        </label>
                        <span>
                          {
                            measurement
                              .customer
                              .whatsappNumber ||
                            '-'
                          }
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Place
                        </label>
                        <span>
                          {
                            measurement
                              .customer
                              .place ||
                            '-'
                          }
                        </span>
                      </div>
                    </div>

                    {/* SELECTED JOBS */}

                    <h3
                      style={{
                        marginTop:
                          '25px',
                      }}
                    >
                      Selected Jobs &
                      Assignments
                    </h3>

                    <div
                      style={{
                        display:
                          'grid',
                        gridTemplateColumns:
                          'repeat(auto-fit, minmax(180px, 1fr))',
                        gap:
                          '12px',
                      }}
                    >
                      <div className="status-box">
                        <label>
                          Design
                        </label>
                        <span>
                          {measurement
                            .officeInfo
                            .designJob
                            ? `Yes — ${
                                measurement
                                  .officeInfo
                                  .designer ||
                                'Not assigned'
                              }`
                            : 'No'}
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Printing
                        </label>
                        <span>
                          {measurement
                            .officeInfo
                            .printJob
                            ? `Yes — ${
                                measurement
                                  .officeInfo
                                  .printBranch ||
                                'Not assigned'
                              }`
                            : 'No'}
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Cutting
                        </label>
                        <span>
                          {measurement
                            .officeInfo
                            .cuttingJob
                            ? `Yes — ${
                                measurement
                                  .officeInfo
                                  .cuttingBranch ||
                                'Not assigned'
                              }`
                            : 'No'}
                        </span>
                      </div>

                      <div className="status-box">
                        <label>
                          Production
                        </label>
                        <span>
                          {measurement
                            .officeInfo
                            .productionJob
                            ? `Yes — ${
                                measurement
                                  .officeInfo
                                  .productionBranch ||
                                'Not assigned'
                              }`
                            : 'No'}
                        </span>
                      </div>
                    </div>

                    {/* QUOTATION */}

                    <h3
                      style={{
                        marginTop:
                          '25px',
                      }}
                    >
                      Quotation
                    </h3>

                    <div className="status-box">
                      <label>
                        Status
                      </label>

                      <strong>
                        {
                          measurement
                            .quotation
                            .status
                        }
                      </strong>

                      {measurement
                        .quotation
                        .generatedBy && (
                        <div
                          style={{
                            marginTop:
                              '8px',
                          }}
                        >
                          Generated by:{' '}
                          {
                            measurement
                              .quotation
                              .generatedBy
                              ?.name
                          }

                          <br />

                          Username:{' '}
                          {
                            measurement
                              .quotation
                              .generatedBy
                              ?.username
                          }

                          <br />

                          Generated at:{' '}
                          {formatDateTime(
                            measurement
                              .quotation
                              .generatedAt,
                          )}
                        </div>
                      )}
                    </div>

                    {/* ITEMS */}

                    <h3
                      style={{
                        marginTop:
                          '25px',
                      }}
                    >
                      Items
                    </h3>

                    {measurement.items.length ===
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
                                Sl No
                              </th>
                              <th>
                                Name
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
                            </tr>
                          </thead>

                          <tbody>
                            {measurement.items.map(
                              (
                                item,
                                index,
                              ) => (
                                <tr
                                  key={`${measurement.id}-${index}`}
                                >
                                  <td>
                                    {
                                      item.slNo ??
                                      index +
                                        1
                                    }
                                  </td>

                                  <td>
                                    {
                                      item.name ||
                                      '-'
                                    }
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
                                      item.price ||
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
                                    {item.image ? (
                                      <a
                                        href={
                                          item.image
                                        }
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        <img
                                          src={
                                            item.image
                                          }
                                          alt={
                                            item.name ||
                                            'Item'
                                          }
                                          style={{
                                            width:
                                              '80px',
                                            height:
                                              '80px',
                                            objectFit:
                                              'cover',
                                            borderRadius:
                                              '8px',
                                          }}
                                        />
                                      </a>
                                    ) : (
                                      <span>
                                        No image
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ),
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )
          },
        )}
      </div>

      {/* =====================================================
          EDIT MODAL
      ====================================================== */}

      {editingMeasurement &&
        editDraft && (
        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(0,0,0,0.55)',
            zIndex:
              9999,
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding:
              '20px',
          }}
          onMouseDown={(
            event,
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              handleCloseEdit()
            }
          }}
        >
          <div
            style={{
              background:
                '#ffffff',
              borderRadius:
                '12px',
              width:
                'min(1100px, 100%)',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              padding:
                '25px',
              boxShadow:
                '0 20px 60px rgba(0,0,0,0.25)',
            }}
          >

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'center',
                gap:
                  '15px',
                marginBottom:
                  '25px',
              }}
            >
              <div>
                <h2
                  style={{
                    margin: 0,
                  }}
                >
                  Edit Measurement
                </h2>

                <p
                  style={{
                    margin:
                      '5px 0 0',
                  }}
                >
                  {
                    editingMeasurement
                      .measurementId
                  }
                </p>
              </div>

              <button
                type="button"
                className="view-button"
                onClick={
                  handleCloseEdit
                }
                disabled={
                  savingEdit
                }
              >
                Close
              </button>
            </div>

            <h3>
              Measurement Information
            </h3>

            <div className="form-grid">
              <div className="input-group">
                <label>
                  Measurement ID
                </label>

                <input
                  type="text"
                  value={
                    editingMeasurement
                      .measurementId
                  }
                  readOnly
                />
              </div>

              <div className="input-group">
                <label>
                  Measurement Date
                </label>

                <input
                  type="date"
                  value={
                    editDraft.date
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditDraft(
                      (
                        previous,
                      ) =>
                        previous
                          ? {
                              ...previous,
                              date:
                                event
                                  .target
                                  .value,
                            }
                          : previous,
                    )
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
                    editDraft
                      .expectedDeliveryDate
                  }
                  onChange={(
                    event,
                  ) =>
                    setEditDraft(
                      (
                        previous,
                      ) =>
                        previous
                          ? {
                              ...previous,
                              expectedDeliveryDate:
                                event
                                  .target
                                  .value,
                            }
                          : previous,
                    )
                  }
                />
              </div>
            </div>

            <h3
              style={{
                marginTop:
                  '25px',
              }}
            >
              Customer Details
            </h3>

            <div className="form-grid">
              <div className="input-group">
                <label>
                  Customer Name
                </label>

                <input
                  type="text"
                  value={
                    editDraft
                      .customer
                      .name
                  }
                  onChange={(
                    event,
                  ) =>
                    handleEditCustomerChange(
                      'name',
                      event.target
                        .value,
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
                    editDraft
                      .customer
                      .companyName
                  }
                  onChange={(
                    event,
                  ) =>
                    handleEditCustomerChange(
                      'companyName',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="input-group">
                <label>
                  Phone Number
                </label>

                <input
                  type="text"
                  value={
                    editDraft
                      .customer
                      .phoneNumber
                  }
                  onChange={(
                    event,
                  ) =>
                    handleEditCustomerChange(
                      'phoneNumber',
                      event.target
                        .value,
                    )
                  }
                />
              </div>

              <div className="input-group">
                <label>
                  WhatsApp Number
                </label>

                <input
                  type="text"
                  value={
                    editDraft
                      .customer
                      .whatsappNumber
                  }
                  onChange={(
                    event,
                  ) =>
                    handleEditCustomerChange(
                      'whatsappNumber',
                      event.target
                        .value,
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
                    editDraft
                      .customer
                      .place
                  }
                  onChange={(
                    event,
                  ) =>
                    handleEditCustomerChange(
                      'place',
                      event.target
                        .value,
                    )
                  }
                />
              </div>
            </div>

            <h3
              style={{
                marginTop:
                  '25px',
              }}
            >
              Job Selection
            </h3>

            <div
              style={{
                display:
                  'grid',
                gridTemplateColumns:
                  'repeat(auto-fit, minmax(180px, 1fr))',
                gap:
                  '12px',
              }}
            >
              {(
                [
                  [
                    'designJob',
                    'Design Job',
                  ],
                  [
                    'printJob',
                    'Print Job',
                  ],
                  [
                    'cuttingJob',
                    'Cutting Job',
                  ],
                  [
                    'productionJob',
                    'Production Job',
                  ],
                ] as const
              ).map(
                ([
                  field,
                  label,
                ]) => (
                  <label
                    className="checkbox-option"
                    key={
                      field
                    }
                  >
                    <input
                      type="checkbox"
                      checked={
                        editDraft
                          .officeInfo[
                            field
                          ]
                      }
                      onChange={(
                        event,
                      ) =>
                        setEditDraft(
                          (
                            previous,
                          ) =>
                            previous
                              ? {
                                  ...previous,
                                  officeInfo:
                                    {
                                      ...previous.officeInfo,
                                      [field]:
                                        event
                                          .target
                                          .checked,
                                    },
                                }
                              : previous,
                        )
                      }
                    />

                    <span>
                      {label}
                    </span>
                  </label>
                ),
              )}
            </div>

            <div
              style={{
                marginTop:
                  '15px',
                padding:
                  '12px 15px',
                borderRadius:
                  '8px',
                background:
                  '#fff4e5',
                fontSize:
                  '13px',
              }}
            >
              Existing quotation and
              status values are preserved.
              Assignment values are also
              preserved unless you change
              them through the assignment
              section.
            </div>

            <h3
              style={{
                marginTop:
                  '25px',
              }}
            >
              Items
            </h3>

            {editDraft.items.map(
              (
                item,
                index,
              ) => (
                <div
                  key={index}
                  style={{
                    border:
                      '1px solid #ddd',
                    borderRadius:
                      '10px',
                    padding:
                      '15px',
                    marginBottom:
                      '15px',
                  }}
                >
                  <div
                    style={{
                      display:
                        'flex',
                      justifyContent:
                        'space-between',
                      alignItems:
                        'center',
                      marginBottom:
                        '12px',
                    }}
                  >
                    <strong>
                      Item{' '}
                      {index + 1}
                    </strong>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() =>
                        handleRemoveEditItem(
                          index,
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>

                  <div className="form-grid">
                    {(
                      [
                        [
                          'name',
                          'Item Name',
                        ],
                        [
                          'width',
                          'Width',
                        ],
                        [
                          'height',
                          'Height',
                        ],
                        [
                          'qty',
                          'Quantity',
                        ],
                        [
                          'price',
                          'Price',
                        ],
                        [
                          'remarks',
                          'Remarks',
                        ],
                        [
                          'image',
                          'Image URL',
                        ],
                      ] as const
                    ).map(
                      ([
                        field,
                        label,
                      ]) => (
                        <div
                          className="input-group"
                          key={
                            field
                          }
                        >
                          <label>
                            {label}
                          </label>

                          <input
                            type="text"
                            value={
                              item[
                                field
                              ] ||
                              ''
                            }
                            onChange={(
                              event,
                            ) =>
                              handleEditItemChange(
                                index,
                                field,
                                event
                                  .target
                                  .value,
                              )
                            }
                          />
                        </div>
                      ),
                    )}
                  </div>

                  {item.image && (
                    <div
                      style={{
                        marginTop:
                          '12px',
                      }}
                    >
                      <a
                        href={
                          item.image
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        <img
                          src={
                            item.image
                          }
                          alt={
                            item.name ||
                            'Item'
                          }
                          style={{
                            width:
                              '100px',
                            height:
                              '100px',
                            objectFit:
                              'cover',
                            borderRadius:
                              '8px',
                          }}
                        />
                      </a>
                    </div>
                  )}
                </div>
              ),
            )}

            <button
              type="button"
              className="add-item-button"
              onClick={
                handleAddEditItem
              }
            >
              + Add Item
            </button>

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'flex-end',
                gap:
                  '10px',
                marginTop:
                  '25px',
                paddingTop:
                  '20px',
                borderTop:
                  '1px solid #ddd',
              }}
            >
              <button
                type="button"
                className="view-button"
                onClick={
                  handleCloseEdit
                }
                disabled={
                  savingEdit
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="add-item-button"
                onClick={
                  handleSaveEdit
                }
                disabled={
                  savingEdit
                }
              >
                {savingEdit
                  ? 'Saving...'
                  : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default LiveProduction
