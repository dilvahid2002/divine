import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import './Department.css'

interface SalesManagerProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type JobStatus = 'Pending' | 'In Progress' | 'Finished'

interface JobItem {
  slNo?: number
  name?: string
  width?: string | number
  height?: string | number
  qty?: string | number
  price?: string | number
  remarks?: string
  designStatus?: string
  printStatus?: string
  cuttingStatus?: string
  productionStatus?: string
  designCharge?: number
}

interface ProductionStaff {
  userId?: string
  name?: string
  username?: string
}

interface JobRecord {
  id: string
  source: 'job_order' | 'measurement'
  orderId: string
  date: string
  expectedDeliveryDate: string
  branch: string

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

    printer?: string | null
    printerUsername?: string | null
    printBranch?: string | null

    cutting?: string | null
    cuttingUsername?: string | null
    cuttingBranch?: string | null

    productionStaff: ProductionStaff[]
    productionBranch?: string | null
  }

  customerAdviser: {
    name: string
    username: string
  }

  acceptingOrder?: {
    name?: string
    username?: string
  } | null

  statuses: {
    design: JobStatus
    print: JobStatus
    cutting: JobStatus
    production: JobStatus
  }

  designCharge: number
  delivered: boolean
}

interface DepartmentRow {
  name: string
  username: string
  completedWorks: number
  totalDesignCharge?: number
  totalSquareFeet?: number
}

interface CompletedFile {
  job: JobRecord
  completedItems: JobItem[]
}

interface DepartmentRowWithFiles extends DepartmentRow {
  files: CompletedFile[]
}

const getString = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value)
  }

  return ''
}

const getNumber = (value: unknown): number => {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

const getOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') {
    return undefined
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
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

/*
 * This follows the Sales page data structure:
 *
 * orderId / measurementId
 * date
 * expectedDeliveryDate / deliveryDate
 * branch
 * customer.*
 * items[]
 * officeInfo.*
 * customerAdviser.*
 * acceptingOrder.*
 * statuses.*
 * designCharge
 * delivered
 */
const createJobRecord = (
  documentId: string,
  data: any,
  source: 'job_order' | 'measurement',
): JobRecord => {
  const rawItems = Array.isArray(data?.items)
    ? data.items
    : []

  const orderId =
    getString(
      data?.orderId ??
        data?.measurementId ??
        documentId,
    ) || documentId

  const officeInfo = data?.officeInfo || {}
  const customer = data?.customer || {}
  const adviser = data?.customerAdviser || {}

  const productionStaff = Array.isArray(
    officeInfo.productionStaff,
  )
    ? officeInfo.productionStaff
        .map((staff: any) => ({
          userId: getString(staff?.userId),
          name: getString(staff?.name),
          username: getString(staff?.username),
        }))
        .filter(
          (staff: ProductionStaff) =>
            !!staff.name || !!staff.username,
        )
    : []

  return {
    id: documentId,
    source,
    orderId,

    date: getString(data?.date),

    expectedDeliveryDate: getString(
      data?.expectedDeliveryDate ??
        data?.deliveryDate,
    ),

    branch: getString(
      data?.branch ??
        data?.selectedBranch,
    ),

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

    items: rawItems.map((item: any) => ({
      slNo:
        typeof item?.slNo === 'number'
          ? item.slNo
          : undefined,
      name: getString(item?.name),
      width: getString(item?.width),
      height: getString(item?.height),
      qty: getString(item?.qty),
      price: getString(item?.price),
      remarks: getString(item?.remarks),
      designStatus: getString(item?.designStatus).toLowerCase(),
      printStatus: getString(item?.printStatus).toLowerCase(),
      cuttingStatus: getString(item?.cuttingStatus).toLowerCase(),
      productionStatus: getString(item?.productionStatus).toLowerCase(),
      designCharge: getOptionalNumber(item?.designCharge),
    })),

    officeInfo: {
      designJob:
        officeInfo?.designJob === true,

      printJob:
        officeInfo?.printJob === true,

      cuttingJob:
        officeInfo?.cuttingJob === true,

      productionJob:
        officeInfo?.productionJob === true,

      designer:
        getString(officeInfo?.designer) || null,

      designerUsername:
        getString(
          officeInfo?.designerUsername,
        ) || null,

      printer:
        getString(officeInfo?.printer) || null,

      printerUsername:
        getString(
          officeInfo?.printerUsername,
        ) || null,

      printBranch:
        getString(
          officeInfo?.printBranch,
        ) || null,

      cutting:
        getString(officeInfo?.cutting) || null,

      cuttingUsername:
        getString(
          officeInfo?.cuttingUsername,
        ) || null,

      cuttingBranch:
        getString(
          officeInfo?.cuttingBranch,
        ) || null,

      productionStaff,

      productionBranch:
        getString(
          officeInfo?.productionBranch,
        ) || null,
    },

    customerAdviser: {
      name: getString(adviser?.name),
      username: getString(
        adviser?.username,
      ),
    },

    acceptingOrder:
      data?.acceptingOrder
        ? {
            name: getString(
              data.acceptingOrder?.name,
            ),
            username: getString(
              data.acceptingOrder?.username,
            ),
          }
        : null,

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

    designCharge: getNumber(
      data?.designCharge,
    ),

    delivered:
      data?.delivered === true,
  }
}

const getDisplayName = (
  name?: string | null,
  username?: string | null,
): string => {
  return (
    name?.trim() ||
    username?.trim() ||
    'Unassigned'
  )
}

const getSquareFeet = (
  items: JobItem[],
): number => {
  return items.reduce((total, item) => {
    const width = getNumber(item?.width)
    const height = getNumber(item?.height)
    const qty = getNumber(item?.qty) || 1

    if (width <= 0 || height <= 0) {
      return total
    }

    return (
      total +
      (width * height * qty) / 144
    )
  }, 0)
}

const formatDate = (value: string): string => {
  if (!value) return '-'

  const parts = value.split('-')

  if (parts.length !== 3) {
    return value
  }

  const date = new Date(
    Number(parts[0]),
    Number(parts[1]) - 1,
    Number(parts[2]),
  )

  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

const sortRows = <T extends { name: string }>(
  rows: T[],
): T[] => {
  return [...rows].sort((a, b) =>
    a.name.localeCompare(b.name),
  )
}

function SalesManager({
  user,
}: SalesManagerProps) {
  const navigate = useNavigate()

  const today = new Date()
  const todayKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-')

  const [dateFrom, setDateFrom] =
    useState(todayKey)

  const [dateTo, setDateTo] =
    useState(todayKey)

  const [jobs, setJobs] = useState<JobRecord[]>(
    [],
  )

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [viewDepartment, setViewDepartment] =
    useState<'designer' | 'printer' | 'cutting' | 'production' | null>(null)

  const [viewRow, setViewRow] =
    useState<DepartmentRowWithFiles | null>(null)

  /*
   * EXACTLY LIKE SALES:
   * - read job_orders with onSnapshot
   * - use orderBy(createdAt, desc)
   * - normalize the same fields
   *
   * We also read measurements using the same
   * field structure so Measurement-created work
   * is included in the manager dashboard.
   */
  useEffect(() => {
    let jobOrders: JobRecord[] = []
    let measurements: JobRecord[] = []

    const publish = () => {
      setJobs([
        ...jobOrders,
        ...measurements,
      ])

      setLoading(false)
      setError('')
    }

    const jobOrdersQuery = query(
      collection(db, 'job_orders'),
      orderBy('createdAt', 'desc'),
    )

    const measurementsQuery = query(
      collection(db, 'measurements'),
      orderBy('createdAt', 'desc'),
    )

    const unsubscribeJobOrders =
      onSnapshot(
        jobOrdersQuery,
        (snapshot) => {
          jobOrders = snapshot.docs.map(
            (document) =>
              createJobRecord(
                document.id,
                document.data(),
                'job_order',
              ),
          )

          publish()
        },
        (firebaseError) => {
          console.error(
            'Sales Manager job_orders error:',
            firebaseError,
          )

          setError(
            `Unable to load job orders: ${firebaseError.message}`,
          )

          setLoading(false)
        },
      )

    const unsubscribeMeasurements =
      onSnapshot(
        measurementsQuery,
        (snapshot) => {
          measurements = snapshot.docs.map(
            (document) =>
              createJobRecord(
                document.id,
                document.data(),
                'measurement',
              ),
          )

          publish()
        },
        (firebaseError) => {
          console.error(
            'Sales Manager measurements error:',
            firebaseError,
          )

          setError(
            `Unable to load measurements: ${firebaseError.message}`,
          )

          setLoading(false)
        },
      )

    return () => {
      unsubscribeJobOrders()
      unsubscribeMeasurements()
    }
  }, [])

  const validRange =
    !!dateFrom &&
    !!dateTo &&
    dateFrom <= dateTo

  /*
   * IMPORTANT:
   *
   * Sales has a reliable "date" field.
   * The old Sales Manager depended on department
   * finish timestamps which are not part of the
   * Sales data structure.
   *
   * Therefore this dashboard filters by the
   * Sales "date" field and then checks whether
   * the department status is Finished.
   */
  const jobsInRange = useMemo(() => {
    if (!validRange) {
      return []
    }

    return jobs.filter((job) => {
      if (!job.date) {
        return false
      }

      return (
        job.date >= dateFrom &&
        job.date <= dateTo
      )
    })
  }, [
    jobs,
    dateFrom,
    dateTo,
    validRange,
  ])

  const designerRows =
    useMemo<DepartmentRowWithFiles[]>(() => {
      const map =
        new Map<string, DepartmentRow>()

      jobsInRange.forEach((job) => {
        if (
          !job.officeInfo.designJob ||
          job.statuses.design !== 'Finished'
        ) {
          return
        }

        const name = getDisplayName(
          job.officeInfo.designer,
          job.officeInfo.designerUsername,
        )

        const username =
          job.officeInfo.designerUsername || ''

        const key =
          username ||
          name.toLowerCase()

        const current =
          map.get(key) || {
            name,
            username,
            completedWorks: 0,
            totalDesignCharge: 0,
            files: [],
          }

        current.completedWorks += 1
        // Design charge is stored once at the job level.
        // It is displayed once with rowspan in the View table.
        current.totalDesignCharge =
          (current.totalDesignCharge || 0) +
          job.designCharge

        const completedItems = job.items.filter(
          (item) =>
            item.designStatus !== 'na' &&
            item.designStatus !== 'NA' &&
            item.designStatus !== 'not applicable',
        )

        current.files.push({
          job,
          completedItems,
        })

        map.set(key, current)
      })

      return sortRows(
        Array.from(map.values()),
      )
    }, [jobsInRange])

  const printerRows =
    useMemo<DepartmentRowWithFiles[]>(() => {
      const map =
        new Map<string, DepartmentRow>()

      jobsInRange.forEach((job) => {
        if (
          !job.officeInfo.printJob ||
          job.statuses.print !== 'Finished'
        ) {
          return
        }

        const name = getDisplayName(
          job.officeInfo.printer,
          job.officeInfo.printerUsername,
        )

        const username =
          job.officeInfo.printerUsername || ''

        const key =
          username ||
          name.toLowerCase()

        const current =
          map.get(key) || {
            name,
            username,
            completedWorks: 0,
            totalSquareFeet: 0,
            files: [],
          }

        current.completedWorks += 1
        current.totalSquareFeet =
          (current.totalSquareFeet || 0) +
          getSquareFeet(job.items)

        current.files.push({
          job,
          completedItems: job.items.filter(
            (item) =>
              item.printStatus !== 'na' &&
              item.printStatus !== 'NA' &&
              item.printStatus !== 'not applicable',
          ),
        })

        map.set(key, current)
      })

      return sortRows(
        Array.from(map.values()),
      )
    }, [jobsInRange])

  const cuttingRows =
    useMemo<DepartmentRowWithFiles[]>(() => {
      const map =
        new Map<string, DepartmentRow>()

      jobsInRange.forEach((job) => {
        if (
          !job.officeInfo.cuttingJob ||
          job.statuses.cutting !== 'Finished'
        ) {
          return
        }

        const name = getDisplayName(
          job.officeInfo.cutting,
          job.officeInfo.cuttingUsername,
        )

        const username =
          job.officeInfo.cuttingUsername || ''

        const key =
          username ||
          name.toLowerCase()

        const current =
          map.get(key) || {
            name,
            username,
            completedWorks: 0,
            totalSquareFeet: 0,
            files: [],
          }

        current.completedWorks += 1
        current.totalSquareFeet =
          (current.totalSquareFeet || 0) +
          getSquareFeet(job.items)

        current.files.push({
          job,
          completedItems: job.items.filter(
            (item) =>
              item.printStatus !== 'na' &&
              item.printStatus !== 'NA' &&
              item.printStatus !== 'not applicable',
          ),
        })

        map.set(key, current)
      })

      return sortRows(
        Array.from(map.values()),
      )
    }, [jobsInRange])

  const productionRows =
    useMemo<DepartmentRowWithFiles[]>(() => {
      const map =
        new Map<string, DepartmentRow>()

      jobsInRange.forEach((job) => {
        if (
          !job.officeInfo.productionJob ||
          job.statuses.production !==
            'Finished'
        ) {
          return
        }

        const staff =
          job.officeInfo.productionStaff

        if (staff.length === 0) {
          const current =
            map.get('unassigned') || {
              name: 'Unassigned',
              username: '',
              completedWorks: 0,
              files: [],
            }

          current.completedWorks += 1
          current.files.push({
            job,
            completedItems: job.items.filter(
              (item) =>
                item.productionStatus !== 'na' &&
                item.productionStatus !== 'NA' &&
                item.productionStatus !== 'not applicable',
            ),
          })
          map.set('unassigned', current)
          return
        }

        staff.forEach((member) => {
          const name = getDisplayName(
            member.name,
            member.username,
          )

          const username =
            member.username || ''

          const key =
            username ||
            name.toLowerCase()

          const current =
            map.get(key) || {
              name,
              username,
              completedWorks: 0,
              files: [],
            }

          current.completedWorks += 1
          current.files.push({
            job,
            completedItems: job.items.filter(
              (item) =>
                item.productionStatus !== 'na' &&
                item.productionStatus !== 'NA' &&
                item.productionStatus !== 'not applicable',
            ),
          })
          map.set(key, current)
        })
      })

      return sortRows(
        Array.from(map.values()),
      )
    }, [jobsInRange])

  const totals = useMemo(() => {
    return {
      designWorks:
        designerRows.reduce(
          (sum, row) =>
            sum + row.completedWorks,
          0,
        ),

      designCharge:
        designerRows.reduce(
          (sum, row) =>
            sum +
            (row.totalDesignCharge || 0),
          0,
        ),

      printWorks:
        printerRows.reduce(
          (sum, row) =>
            sum + row.completedWorks,
          0,
        ),

      printSquareFeet:
        printerRows.reduce(
          (sum, row) =>
            sum +
            (row.totalSquareFeet || 0),
          0,
        ),

      cuttingWorks:
        cuttingRows.reduce(
          (sum, row) =>
            sum + row.completedWorks,
          0,
        ),

      cuttingSquareFeet:
        cuttingRows.reduce(
          (sum, row) =>
            sum +
            (row.totalSquareFeet || 0),
          0,
        ),

      productionWorks:
        productionRows.reduce(
          (sum, row) =>
            sum + row.completedWorks,
          0,
        ),
    }
  }, [
    designerRows,
    printerRows,
    cuttingRows,
    productionRows,
  ])

  const clearDates = () => {
    setDateFrom('')
    setDateTo('')
  }

  const tableEmpty = (
    <div className="empty-items">
      No completed work found for the
      selected date range.
    </div>
  )

  if (loading) {
    return (
      <div className="department-page">
        <div className="department-container">
          <div className="department-header">
            <div>
              <h1>
                Sales Manager Dashboard
              </h1>
              <p>
                Loading department
                performance...
              </p>
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
            <h1>
              Sales Manager Dashboard
            </h1>

            <p>
              Department performance from
              Sales job information
            </p>

            {user?.name && (
              <small>
                Logged in as {user.name}
              </small>
            )}
          </div>

          <button
            type="button"
            className="add-item-button"
            onClick={() =>
              navigate(
                '/departments/attendance',
              )
            }
          >
            Attendance
          </button>
        </div>

        {error && (
          <div className="form-message">
            {error}
          </div>
        )}

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                Performance Date Range
              </h2>

              <p>
                Only Date From and Date To
                are used. No single-day
                filter.
              </p>
            </div>
          </div>

          <div className="form-grid">
            <div className="input-group">
              <label htmlFor="sales-manager-date-from">
                Date From
              </label>

              <input
                id="sales-manager-date-from"
                type="date"
                value={dateFrom}
                onChange={(event) =>
                  setDateFrom(
                    event.target.value,
                  )
                }
              />
            </div>

            <div className="input-group">
              <label htmlFor="sales-manager-date-to">
                Date To
              </label>

              <input
                id="sales-manager-date-to"
                type="date"
                value={dateTo}
                onChange={(event) =>
                  setDateTo(
                    event.target.value,
                  )
                }
              />
            </div>

            <div
              className="input-group"
              style={{
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              <button
                type="button"
                className="clear-filter-button"
                onClick={clearDates}
              >
                Clear Dates
              </button>
            </div>
          </div>

          {!validRange && (
            <div
              className="form-message"
              style={{ marginTop: '15px' }}
            >
              Please select a valid date
              range.
            </div>
          )}

          {validRange && (
            <div
              className="statistics-filter-bar"
              style={{ marginTop: '15px' }}
            >
              <span>
                <strong>From:</strong>{' '}
                {formatDate(dateFrom)}
              </span>

              <span>
                <strong>To:</strong>{' '}
                {formatDate(dateTo)}
              </span>

              <span>
                <strong>Records:</strong>{' '}
                {jobsInRange.length}
              </span>
            </div>
          )}
        </section>

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                1. Designer Performance
              </h2>

              <p>
                Designer name, completed
                works and total design
                charge.
              </p>
            </div>
          </div>

          {designerRows.length === 0 ? (
            tableEmpty
          ) : (
            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Designer</th>
                    <th>Username</th>
                    <th>
                      Completed Works
                    </th>
                    <th>
                      Total Design Charge
                    </th>
                    <th>View</th>
                  </tr>
                </thead>

                <tbody>
                  {designerRows.map(
                    (row) => (
                      <tr
                        key={`${row.username}-${row.name}`}
                      >
                        <td>{row.name}</td>
                        <td>
                          {row.username ||
                            '-'}
                        </td>
                        <td>
                          {row.completedWorks}
                        </td>
                        <td>
                          ₹
                          {(
                            row.totalDesignCharge ||
                            0
                          ).toLocaleString(
                            'en-IN',
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="add-item-button"
                            onClick={() => {
                              setViewDepartment('designer')
                              setViewRow(row)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                2. Printer Performance
              </h2>

              <p>
                Printer name, completed
                works and total square
                feet.
              </p>
            </div>
          </div>

          {printerRows.length === 0 ? (
            tableEmpty
          ) : (
            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Printer</th>
                    <th>Username</th>
                    <th>
                      Completed Works
                    </th>
                    <th>
                      Total Square Feet
                    </th>
                    <th>View</th>
                  </tr>
                </thead>

                <tbody>
                  {printerRows.map(
                    (row) => (
                      <tr
                        key={`${row.username}-${row.name}`}
                      >
                        <td>{row.name}</td>
                        <td>
                          {row.username ||
                            '-'}
                        </td>
                        <td>
                          {row.completedWorks}
                        </td>
                        <td>
                          {(
                            row.totalSquareFeet ||
                            0
                          ).toFixed(2)}{' '}
                          sq ft
                        </td>
                        <td>
                          <button
                            type="button"
                            className="add-item-button"
                            onClick={() => {
                              setViewDepartment('printer')
                              setViewRow(row)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                3. Cutting Performance
              </h2>

              <p>
                Cutting staff, completed
                works and total square
                feet.
              </p>
            </div>
          </div>

          {cuttingRows.length === 0 ? (
            tableEmpty
          ) : (
            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>Cutting Staff</th>
                    <th>Username</th>
                    <th>
                      Completed Works
                    </th>
                    <th>
                      Total Square Feet
                    </th>
                    <th>View</th>
                  </tr>
                </thead>

                <tbody>
                  {cuttingRows.map(
                    (row) => (
                      <tr
                        key={`${row.username}-${row.name}`}
                      >
                        <td>{row.name}</td>
                        <td>
                          {row.username ||
                            '-'}
                        </td>
                        <td>
                          {row.completedWorks}
                        </td>
                        <td>
                          {(
                            row.totalSquareFeet ||
                            0
                          ).toFixed(2)}{' '}
                          sq ft
                        </td>
                        <td>
                          <button
                            type="button"
                            className="add-item-button"
                            onClick={() => {
                              setViewDepartment('printer')
                              setViewRow(row)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>
                4. Production Performance
              </h2>

              <p>
                Production staff and
                completed works.
              </p>
            </div>
          </div>

          {productionRows.length === 0 ? (
            tableEmpty
          ) : (
            <div className="items-table-wrapper">
              <table className="items-table">
                <thead>
                  <tr>
                    <th>
                      Production Staff
                    </th>
                    <th>Username</th>
                    <th>
                      Completed Works
                    </th>
                    <th>View</th>
                  </tr>
                </thead>

                <tbody>
                  {productionRows.map(
                    (row) => (
                      <tr
                        key={`${row.username}-${row.name}`}
                      >
                        <td>{row.name}</td>
                        <td>
                          {row.username ||
                            '-'}
                        </td>
                        <td>
                          {row.completedWorks}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="add-item-button"
                            onClick={() => {
                              setViewDepartment('production')
                              setViewRow(row)
                            }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {viewRow && viewDepartment && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.55)',
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px',
            }}
            onClick={() => {
              setViewRow(null)
              setViewDepartment(null)
            }}
          >
            <div
              style={{
                background: '#fff',
                borderRadius: '14px',
                width: 'min(1100px, 96vw)',
                maxHeight: '90vh',
                overflowY: 'auto',
                padding: '24px',
              }}
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div
                className="section-heading-row"
                style={{ marginBottom: '20px' }}
              >
                <div>
                  <h2>
                    Completed Files — {viewRow.name}
                  </h2>
                  <p>
                    {viewRow.completedWorks} completed file(s)
                    {viewRow.username
                      ? ` • ${viewRow.username}`
                      : ''}
                  </p>
                </div>

                <button
                  type="button"
                  className="clear-filter-button"
                  onClick={() => {
                    setViewRow(null)
                    setViewDepartment(null)
                  }}
                >
                  Close
                </button>
              </div>

              {viewRow.files.length === 0 ? (
                <div className="empty-items">
                  No completed files found.
                </div>
              ) : (
                viewRow.files.map(
                  ({ job, completedItems }, fileIndex) => (
                    <div
                      key={`${job.source}-${job.id}`}
                      style={{
                        border: '1px solid #ddd',
                        borderRadius: '10px',
                        padding: '16px',
                        marginBottom: '14px',
                      }}
                    >
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit, minmax(180px, 1fr))',
                          gap: '10px',
                          marginBottom: '14px',
                        }}
                      >
                        <div>
                          <strong>File {fileIndex + 1}</strong>
                        </div>

                        <div>
                          <strong>Job ID:</strong>{' '}
                          {job.orderId}
                        </div>

                        <div>
                          <strong>Customer:</strong>{' '}
                          {job.customer.name || '-'}
                        </div>

                        <div>
                          <strong>Company:</strong>{' '}
                          {job.customer.companyName || '-'}
                        </div>

                        <div>
                          <strong>Entry Date:</strong>{' '}
                          {formatDate(job.date)}
                        </div>

                        <div>
                          <strong>Branch:</strong>{' '}
                          {job.branch || '-'}
                        </div>
                      </div>

                      <div className="items-table-wrapper">
                        <table className="items-table">
                          <thead>
                            <tr>
                              <th>Job ID</th>
                              <th>Customer</th>
                              <th>Item</th>
                              <th>Size</th>
                              <th>Qty</th>
                              <th>Design Charge</th>
                            </tr>
                          </thead>
                          <tbody>
                            {completedItems.length === 0 ? (
                              <tr>
                                <td colSpan={6}>
                                  No non-NA items in this file.
                                </td>
                              </tr>
                            ) : (
                              completedItems.map(
                                (item, itemIndex) => (
                                  <tr
                                    key={`${job.id}-${itemIndex}`}
                                  >
                                    {itemIndex === 0 && (
                                      <td rowSpan={completedItems.length}>
                                        {job.orderId || job.id}
                                      </td>
                                    )}

                                    {itemIndex === 0 && (
                                      <td rowSpan={completedItems.length}>
                                        {job.customer.name || '-'}
                                      </td>
                                    )}

                                    <td>
                                      {item.name || '-'}
                                    </td>
                                    <td>
                                      {item.width || '-'} ×{' '}
                                      {item.height || '-'}
                                    </td>
                                    <td>
                                      {item.qty || '-'}
                                    </td>

                                    {itemIndex === 0 && (
                                      <td rowSpan={completedItems.length}>
                                        ₹{Number(job.designCharge || 0).toFixed(2)}
                                      </td>
                                    )}
                                  </tr>
                                ),
                              )
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ),
                )
              )}
            </div>
          </div>
        )}

        <section className="department-section">
          <div className="section-heading-row">
            <div>
              <h2>Data Source</h2>

              <p>
                This dashboard uses the same
                field structure as the Sales
                page and listens to Firestore
                in real time. Use View on any
                staff row to see that person's
                completed files and non-NA items.
              </p>
            </div>
          </div>

          <div className="statistics-filter-bar">
            <span>
              Job Orders:{' '}
              {
                jobs.filter(
                  (job) =>
                    job.source ===
                    'job_order',
                ).length
              }
            </span>

            <span>
              Measurements:{' '}
              {
                jobs.filter(
                  (job) =>
                    job.source ===
                    'measurement',
                ).length
              }
            </span>

            <span>
              In selected range:{' '}
              {jobsInRange.length}
            </span>
          </div>
        </section>
      </div>
    </div>
  )
}

export default SalesManager
