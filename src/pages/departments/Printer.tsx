import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  collection,
  doc,
  onSnapshot,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'

import { db } from '../../firebase'

import './Department.css'


/* =========================================================
   PROPS
========================================================= */

interface PrinterProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}


/* =========================================================
   FILTER
========================================================= */

type PrinterFilter =
  | 'all'
  | 'pending'
  | 'today'
  | 'late'


/* =========================================================
   SOURCE TYPE
========================================================= */

type PrinterSource =
  | 'measurement'
  | 'job_order'


/* =========================================================
   ITEM
========================================================= */

interface PrintItem {
  slNo: number
  name: string
  width: string
  height: string
  qty: string
  price: string
  remarks: string
  image?: string

  printStatus?:
    | 'pending'
    | 'printed'
    | 'na'
}


/* =========================================================
   PRINTABLE ORDER
   ---------------------------------------------------------
   Both measurements and job_orders are converted into
   this same structure.
========================================================= */

interface PrintableOrder {
  id: string

  source: PrinterSource

  orderId?: number | string

  measurementId?: string

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

    cuttingJob?: boolean

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

  statuses: {
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


/* =========================================================
   TODAY
========================================================= */

const getTodayString = () => {
  const today = new Date()

  const year =
    today.getFullYear()

  const month =
    String(
      today.getMonth() + 1,
    ).padStart(2, '0')

  const day =
    String(
      today.getDate(),
    ).padStart(2, '0')

  return `${year}-${month}-${day}`
}


/* =========================================================
   COMPONENT
========================================================= */

function Printer({
  user,
}: PrinterProps) {

  /* =======================================================
     CURRENT USER
  ======================================================= */

  const currentUser = user ?? {
    name: '',
    username: '',
    roles: [],
  }


  /* =======================================================
     STATE
  ======================================================= */

  const [jobOrders, setJobOrders] =
    useState<PrintableOrder[]>([])

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


  /* =======================================================
     CHECK WHETHER PRINTING IS AVAILABLE

     IMPORTANT:

     Printing is available when:

     1. printJob = true

     AND

     2. designJob = false
        OR
        designJob = true AND design is Finished

     Production DOES NOT BLOCK PRINTING.

     This is intentional based on your workflow.
  ======================================================= */

  const isPrintAvailable = (
    order: PrintableOrder,
  ) => {

    /* -----------------------------------------------------
       PRINT JOB MUST EXIST
    ----------------------------------------------------- */

    if (
      order.officeInfo.printJob !== true
    ) {
      return false
    }


    /* -----------------------------------------------------
       DESIGN CHECK
    -----------------------------------------------------

       NO DESIGN JOB:
         Printing can start immediately.

       DESIGN JOB:
         Design must be Finished.
    ----------------------------------------------------- */

    if (
      order.officeInfo.designJob === true &&
      order.statuses.design !== 'Finished'
    ) {
      return false
    }


    /* -----------------------------------------------------
       IMPORTANT

       We intentionally DO NOT check:

       productionJob
       production status

       because production is not a prerequisite for
       printing in the workflow you described.
    ----------------------------------------------------- */

    return true
  }


  /* =======================================================
     CONVERT FIRESTORE ITEM
  ======================================================= */

  const normalizeItems = (
    rawItems: unknown,
  ): PrintItem[] => {

    if (!Array.isArray(rawItems)) {
      return []
    }

    return rawItems.map(
      (
        rawItem: any,
        index: number,
      ) => {

        return {
          slNo:
            typeof rawItem?.slNo === 'number'
              ? rawItem.slNo
              : index + 1,

          name:
            rawItem?.name ?? '',

          width:
            rawItem?.width ?? '',

          height:
            rawItem?.height ?? '',

          qty:
            rawItem?.qty ?? '',

          price:
            rawItem?.price ?? '',

          remarks:
            rawItem?.remarks ?? '',

          image:
            rawItem?.image ?? '',

          /*
           * Existing records without printStatus
           * automatically become pending.
           */
          printStatus:
            rawItem?.printStatus ??
            'pending',
        }
      },
    )
  }


  /* =======================================================
     READ MEASUREMENTS + JOB ORDERS

     THIS IS THE IMPORTANT PART.

     We explicitly subscribe to:

       1. measurements
       2. job_orders

     They are completely independent.

     A measurement does NOT need a job_order.
  ======================================================= */

  useEffect(() => {

    let measurementsLoaded = false
    let jobOrdersLoaded = false

    let measurementOrders: PrintableOrder[] = []
    let normalJobOrders: PrintableOrder[] = []


    /* =====================================================
       UPDATE COMBINED LIST
    ===================================================== */

    const updateCombinedOrders = () => {

      /*
       * Wait until BOTH collections have loaded.
       */

      if (
        !measurementsLoaded ||
        !jobOrdersLoaded
      ) {
        return
      }


      /*
       * Combine both sources.
       */

      const combined = [
        ...measurementOrders,
        ...normalJobOrders,
      ]


      /*
       * Newest first.
       */

      combined.sort(
        (a, b) => {

          const aTime =
            a.createdAt?.toMillis?.() ?? 0

          const bTime =
            b.createdAt?.toMillis?.() ?? 0

          return bTime - aTime
        },
      )


      setJobOrders(combined)

      setLoading(false)

      setError('')
    }


    /* =====================================================
       1. READ MEASUREMENTS
    ===================================================== */

    const measurementsRef =
      collection(
        db,
        'measurements',
      )


    const unsubscribeMeasurements =
      onSnapshot(
        measurementsRef,
        (snapshot) => {

          measurementOrders =
            snapshot.docs.map(
              (document) => {

                const data =
                  document.data()


                /*
                 * Measurement statuses may not exist
                 * on older documents.
                 */

                const designStatus =
                  data.statuses?.design ??
                  'Pending'

                const printStatus =
                  data.statuses?.print ??
                  'Pending'

                const productionStatus =
                  data.statuses?.production ??
                  'Pending'


                const order: PrintableOrder = {

                  /*
                   * IMPORTANT:
                   * Prefix the ID so a measurement and
                   * job_order can never collide in React.
                   */
                  id:
                    `measurement-${document.id}`,

                  source:
                    'measurement',

                  measurementId:
                    data.measurementId ??
                    document.id,

                  date:
                    data.date ?? '',

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
                      data.customer?.companyName ??
                      '',

                    phoneNumber:
                      data.customer?.phoneNumber ??
                      '',

                    whatsappNumber:
                      data.customer?.whatsappNumber ??
                      '',

                    place:
                      data.customer?.place ??
                      '',
                  },


                  items:
                    normalizeItems(
                      data.items,
                    ),


                  officeInfo: {

                    designJob:
                      data.officeInfo?.designJob ??
                      false,

                    printJob:
                      data.officeInfo?.printJob ??
                      false,

                    productionJob:
                      data.officeInfo?.productionJob ??
                      false,

                    cuttingJob:
                      data.officeInfo?.cuttingJob ??
                      false,

                    designer:
                      data.officeInfo?.designer ??
                      null,

                    designerUsername:
                      data.officeInfo?.designerUsername ??
                      null,

                    printer:
                      data.officeInfo?.printer ??
                      null,

                    printerUsername:
                      data.officeInfo?.printerUsername ??
                      null,

                    printBranch:
                      data.officeInfo?.printBranch ??
                      null,
                  },


                  customerAdviser: {

                    name:
                      data.customerAdviser?.name ??
                      '',

                    username:
                      data.customerAdviser?.username ??
                      '',
                  },


                  statuses: {

                    design:
                      designStatus,

                    print:
                      printStatus,

                    production:
                      productionStatus,
                  },


                  delivered:
                    data.delivered ??
                    false,

                  createdAt:
                    data.createdAt,
                }


                return order
              },
            )


          measurementsLoaded = true

          updateCombinedOrders()
        },
        (firebaseError) => {

          console.error(
            'Error reading measurements:',
            firebaseError,
          )

          setError(
            'Unable to load measurements.',
          )

          measurementsLoaded = true

          updateCombinedOrders()
        },
      )


    /* =====================================================
       2. READ JOB ORDERS
    ===================================================== */

    const jobOrdersRef =
      collection(
        db,
        'job_orders',
      )


    const unsubscribeJobOrders =
      onSnapshot(
        jobOrdersRef,
        (snapshot) => {

          normalJobOrders =
            snapshot.docs.map(
              (document) => {

                const data =
                  document.data()


                const designStatus =
                  data.statuses?.design ??
                  'Pending'

                const printStatus =
                  data.statuses?.print ??
                  'Pending'

                const productionStatus =
                  data.statuses?.production ??
                  'Pending'


                const order: PrintableOrder = {

                  id:
                    `joborder-${document.id}`,

                  source:
                    'job_order',

                  orderId:
                    data.orderId ??
                    data.orderNumber ??
                    document.id,

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
                      data.customer?.name ??
                      '',

                    companyName:
                      data.customer?.companyName ??
                      '',

                    phoneNumber:
                      data.customer?.phoneNumber ??
                      '',

                    whatsappNumber:
                      data.customer?.whatsappNumber ??
                      '',

                    place:
                      data.customer?.place ??
                      '',
                  },


                  items:
                    normalizeItems(
                      data.items,
                    ),


                  officeInfo: {

                    designJob:
                      data.officeInfo?.designJob ??
                      false,

                    printJob:
                      data.officeInfo?.printJob ??
                      false,

                    productionJob:
                      data.officeInfo?.productionJob ??
                      false,

                    cuttingJob:
                      data.officeInfo?.cuttingJob ??
                      false,

                    designer:
                      data.officeInfo?.designer ??
                      null,

                    designerUsername:
                      data.officeInfo?.designerUsername ??
                      null,

                    printer:
                      data.officeInfo?.printer ??
                      null,

                    printerUsername:
                      data.officeInfo?.printerUsername ??
                      null,

                    printBranch:
                      data.officeInfo?.printBranch ??
                      null,
                  },


                  customerAdviser: {

                    name:
                      data.customerAdviser?.name ??
                      '',

                    username:
                      data.customerAdviser?.username ??
                      '',
                  },


                  statuses: {

                    design:
                      designStatus,

                    print:
                      printStatus,

                    production:
                      productionStatus,
                  },


                  delivered:
                    data.delivered ??
                    false,

                  createdAt:
                    data.createdAt,
                }


                return order
              },
            )


          jobOrdersLoaded = true

          updateCombinedOrders()
        },
        (firebaseError) => {

          console.error(
            'Error reading job orders:',
            firebaseError,
          )

          setError(
            'Unable to load job orders.',
          )

          jobOrdersLoaded = true

          updateCombinedOrders()
        },
      )


    /* =====================================================
       CLEANUP
    ===================================================== */

    return () => {

      unsubscribeMeasurements()

      unsubscribeJobOrders()
    }

  }, [])


  /* =======================================================
     ONLY PRINT-AVAILABLE WORK

     This is applied AFTER reading both collections.

     So:

       measurements
             ↓
       job_orders
             ↓
       combined
             ↓
       print availability
  ======================================================= */

  const printableOrders =
    useMemo(() => {

      return jobOrders.filter(
        (order) =>
          isPrintAvailable(order),
      )

    }, [jobOrders])


  /* =======================================================
     BRANCH LIST
  ======================================================= */

  const branches =
    useMemo(() => {

      const uniqueBranches =
        new Set<string>()

      printableOrders.forEach(
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

    }, [printableOrders])


  /* =======================================================
     BRANCH FILTER
  ======================================================= */

  const branchFilteredOrders =
    useMemo(() => {

      if (
        selectedBranch === 'all'
      ) {
        return printableOrders
      }

      return printableOrders.filter(
        (order) =>
          order.branch?.trim() ===
          selectedBranch,
      )

    }, [
      printableOrders,
      selectedBranch,
    ])


  /* =======================================================
     ITEM HELPERS
  ======================================================= */

  const hasStartedPrintWork = (
    order: PrintableOrder,
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
    order: PrintableOrder,
  ) => {

    if (
      order.items.length === 0
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


  /* =======================================================
     COUNTS
  ======================================================= */

  const pendingCount =
    useMemo(() => {

      return branchFilteredOrders.filter(
        (order) =>
          order.statuses.print !==
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
          order.statuses.print !==
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
          order.statuses.print !==
            'Finished' &&
          !!order.expectedDeliveryDate &&
          order.expectedDeliveryDate <
            today,
      ).length

    }, [
      branchFilteredOrders,
    ])


  /* =======================================================
     FILTERED ORDERS
  ======================================================= */

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
              order.statuses.print !==
                'Finished' &&
              !areAllItemsFinished(
                order,
              ),
          )


        case 'today':

          return branchFilteredOrders.filter(
            (order) =>
              order.statuses.print !==
                'Finished' &&
              order.expectedDeliveryDate ===
                today,
          )


        case 'late':

          return branchFilteredOrders.filter(
            (order) =>
              order.statuses.print !==
                'Finished' &&
              !!order.expectedDeliveryDate &&
              order.expectedDeliveryDate <
                today,
          )


        case 'all':

        default:

          return branchFilteredOrders.filter(
            (order) =>
              order.statuses.print !==
              'Finished',
          )
      }

    }, [
      branchFilteredOrders,
      activeFilter,
    ])


  /* =======================================================
     FILTER CLICK
  ======================================================= */

  const handleFilterClick = (
    filter: PrinterFilter,
  ) => {

    setActiveFilter(filter)

    setExpandedOrder(null)
  }


  /* =======================================================
     BRANCH CHANGE
  ======================================================= */

  const handleBranchChange = (
    branch: string,
  ) => {

    setSelectedBranch(branch)

    setExpandedOrder(null)
  }


  /* =======================================================
     VALIDATE PRINT
  ======================================================= */

  const validatePrintPrerequisites = (
    order: PrintableOrder,
  ) => {

    /* -----------------------------------------------------
       PRINT JOB
    ----------------------------------------------------- */

    if (
      order.officeInfo.printJob !== true
    ) {

      alert(
        'This file does not have a print job.',
      )

      return false
    }


    /* -----------------------------------------------------
       DESIGN
    ----------------------------------------------------- */

    if (
      order.officeInfo.designJob === true &&
      order.statuses.design !== 'Finished'
    ) {

      alert(
        'Printing cannot start until the design is finished.',
      )

      return false
    }


    /*
     * NO PRODUCTION CHECK HERE.
     *
     * Production does not block printing.
     */

    return true
  }


  /* =======================================================
     GET FIRESTORE DOCUMENT ID
  ======================================================= */

  const getFirestoreDocumentId = (
    order: PrintableOrder,
  ) => {

    /*
     * Our local React ID is:

       measurement-ABC
       joborder-XYZ

     * We need the original Firestore ID.
     */

    if (
      order.id.startsWith(
        'measurement-',
      )
    ) {

      return order.id.replace(
        'measurement-',
        '',
      )
    }


    return order.id.replace(
      'joborder-',
      '',
    )
  }


  /* =======================================================
     UPDATE ITEM PRINT STATUS
  ======================================================= */

  const handleItemStatus = async (
    order: PrintableOrder,
    itemIndex: number,
    status:
      | 'printed'
      | 'na',
  ) => {

    const itemKey =
      `${order.id}-${itemIndex}`


    if (
      savingItem === itemKey
    ) {
      return
    }


    /*
     * Cannot change after print is finished.
     */

    if (
      order.statuses.print ===
      'Finished'
    ) {
      return
    }


    /*
     * Check design/print rules.
     */

    if (
      !validatePrintPrerequisites(
        order,
      )
    ) {
      return
    }


    const currentItem =
      order.items[itemIndex]


    if (!currentItem) {
      return
    }


    /*
     * Once an item has been completed,
     * it cannot be changed.
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
     * Update only this item.
     */

    const updatedItems =
      order.items.map(
        (
          item,
          index,
        ) =>
          index === itemIndex
            ? {
                ...item,
                printStatus:
                  status,
              }
            : item,
      )


    setSavingItem(itemKey)

    setError('')


    try {

      const firestoreId =
        getFirestoreDocumentId(
          order,
        )


      const collectionName =
        order.source ===
        'measurement'
          ? 'measurements'
          : 'job_orders'


      /*
       * BOTH types are updated correctly:

       measurements/{id}

       OR

       job_orders/{id}
       */

      await updateDoc(
        doc(
          db,
          collectionName,
          firestoreId,
        ),
        {
          items:
            updatedItems,

          'statuses.print':
            'In Progress',

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

      setSavingItem(null)
    }
  }


  /* =======================================================
     FINISH PRINTING
  ======================================================= */

  const handleFinishPrinting =
    async (
      order: PrintableOrder,
    ) => {

      /*
       * Validate again.
       */

      if (
        !validatePrintPrerequisites(
          order,
        )
      ) {
        return
      }


      /*
       * Every item must be finished.
       */

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


      setFinishingOrder(
        order.id,
      )

      setError('')


      try {

        const firestoreId =
          getFirestoreDocumentId(
            order,
          )


        const collectionName =
          order.source ===
          'measurement'
            ? 'measurements'
            : 'job_orders'


        /*
         * Save the finished status into
         * the correct collection.
         */

        await updateDoc(
          doc(
            db,
            collectionName,
            firestoreId,
          ),
          {

            items:
              order.items,

            'statuses.print':
              'Finished',

            'officeInfo.printer':
              currentUser.name,

            'officeInfo.printerUsername':
              currentUser.username,
          },
        )


        setExpandedOrder(null)

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


  /* =======================================================
     DISPLAY ID
  ======================================================= */

  const getDisplayId = (
    order: PrintableOrder,
  ) => {

    /*
     * Measurement:
     * M/1
     * M/2
     *
     * Job Order:
     * existing order ID
     */

    if (
      order.source ===
      'measurement'
    ) {

      return (
        order.measurementId ||
        order.id
      )
    }


    if (
      order.orderId !==
        undefined &&
      order.orderId !== ''
    ) {

      return order.orderId
    }


    return order.id
  }


  /* =======================================================
     SOURCE LABEL
  ======================================================= */

  const getSourceLabel = (
    order: PrintableOrder,
  ) => {

    return order.source ===
      'measurement'
      ? 'Measurement'
      : 'Job Order'
  }


  /* =======================================================
     PAGE
  ======================================================= */

  return (

    <div className="department-page">

      <div className="department-container">


        {/* =================================================
            HEADER
        ================================================= */}

        <div className="department-header">

          <div>

            <h1>
              Printer Dashboard
            </h1>

            <p>
              Printing work from Measurements
              and Job Orders
            </p>

          </div>

        </div>


        {/* =================================================
            ERROR
        ================================================= */}

        {error && (

          <div className="form-message">
            {error}
          </div>

        )}


        {/* =================================================
            BRANCH FILTER
        ================================================= */}

        <div
          className="statistics-filter-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent:
              'space-between',
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


        {/* =================================================
            DASHBOARD FILTERS
        ================================================= */}

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

              {
                branchFilteredOrders.filter(
                  (order) =>
                    order.statuses.print !==
                    'Finished',
                ).length
              }

            </div>

            <div className="statistics-card-help">
              Measurements + Job Orders
            </div>

          </button>


          {/* PENDING */}

          <button
            type="button"
            className={
              activeFilter === 'pending'
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
              Printing pending
            </div>

          </button>


          {/* TODAY */}

          <button
            type="button"
            className={
              activeFilter === 'today'
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


        {/* =================================================
            CURRENT FILTER
        ================================================= */}

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

              {
                activeFilter ===
                'pending'
                  ? ' Pending'
                  : activeFilter ===
                      'today'
                    ? ' Must Finish Today'
                    : activeFilter ===
                        'late'
                      ? ' Late'
                      : ' All Work'
              }

            </span>

          </div>

        </div>


        {/* =================================================
            PRINT WORK
        ================================================= */}

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

                file
                {
                  filteredOrders.length !==
                  1
                    ? 's'
                    : ''
                }

                {' '}found

              </p>

            </div>

          </div>


          {/* =================================================
              LOADING
          ================================================= */}

          {loading && (

            <div className="empty-items">

              Loading measurements
              and job orders...

            </div>

          )}


          {/* =================================================
              EMPTY
          ================================================= */}

          {!loading &&
            filteredOrders.length === 0 && (

              <div className="empty-items">

                <h3>
                  No Print Work Found
                </h3>

                <p>

                  There are no printable
                  Measurements or Job Orders
                  matching the selected filter.

                </p>

              </div>

            )}


          {/* =================================================
              ORDERS
          ================================================= */}

          {!loading &&
            filteredOrders.length > 0 && (

              <div className="statistics-orders-list">

                {filteredOrders.map(
                  (order) => {

                    const isExpanded =
                      expandedOrder ===
                      order.id


                    const allItemsDone =
                      areAllItemsFinished(
                        order,
                      )


                    const printFinished =
                      order.statuses.print ===
                      'Finished'


                    return (

                      <div
                        key={order.id}
                        className={
                          printFinished
                            ? 'statistics-order-card delivered'
                            : 'statistics-order-card'
                        }
                      >


                        {/* =================================
                            HEADER
                        ================================= */}

                        <div className="statistics-order-header">

                          <div>

                            <div
                              className="job-order-id"
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

                              <span>
                                {getSourceLabel(
                                  order,
                                )}
                              </span>

                              <span>
                                ID:{' '}
                                {getDisplayId(
                                  order,
                                )}
                              </span>

                            </div>


                            <h3>

                              {
                                order.customer.name ||
                                'Unnamed Customer'
                              }

                            </h3>


                            <p>

                              {
                                order.customer.companyName ||
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
                                order.expectedDeliveryDate ||
                                '-'
                              }

                            </span>


                            <span>

                              Printer:{' '}

                              {
                                order.officeInfo.printer ||
                                'Not started'
                              }

                            </span>

                          </div>

                        </div>


                        {/* =================================
                            SUMMARY
                        ================================= */}

                        <div className="statistics-order-summary">


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
                              Adviser
                            </strong>

                            <span>

                              {
                                order.customerAdviser.name ||
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
                                order.officeInfo.designJob
                                  ? order.statuses.design
                                  : 'No Design Job'
                              }

                            </span>

                          </div>


                          <div>

                            <strong>
                              Print Status
                            </strong>

                            <span>
                              {
                                order.statuses.print
                              }
                            </span>

                          </div>


                          <div>

                            <strong>
                              Items
                            </strong>

                            <span>
                              {
                                order.items.length
                              }
                            </span>

                          </div>

                        </div>


                        {/* =================================
                            ACTIONS
                        ================================= */}

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

                            {
                              isExpanded
                                ? 'Hide Details'
                                : 'View Details'
                            }

                          </button>


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
                            DETAILS
                        ================================= */}

                        {isExpanded && (

                          <div className="statistics-order-details">


                            {/* =================================
                                CUSTOMER
                            ================================= */}

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
                                    order.customer.name ||
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
                                    order.customer.companyName ||
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
                                    order.customer.phoneNumber ||
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
                                    order.customer.whatsappNumber ||
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
                                    order.customer.place ||
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
                                    order.officeInfo.designer ||
                                    '-'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Design Job
                                </strong>

                                <span>
                                  {
                                    order.officeInfo.designJob
                                      ? order.statuses.design
                                      : 'No Design Job'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Production
                                </strong>

                                <span>
                                  {
                                    order.officeInfo.productionJob
                                      ? order.statuses.production
                                      : 'No Production Job'
                                  }
                                </span>

                              </div>


                              <div>

                                <strong>
                                  Printed By
                                </strong>

                                <span>
                                  {
                                    order.officeInfo.printer ||
                                    'Not started'
                                  }
                                </span>

                              </div>

                            </div>


                            {/* =================================
                                ITEMS
                            ================================= */}

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
                                      Image
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


                                          {/* # */}

                                          <td className="sl-number">

                                            {
                                              item.slNo ??
                                              itemIndex + 1
                                            }

                                          </td>


                                          {/* ITEM */}

                                          <td>

                                            <strong>

                                              {
                                                item.name ||
                                                '-'
                                              }

                                            </strong>

                                          </td>


                                          {/* WIDTH */}

                                          <td>

                                            {
                                              item.width ||
                                              '-'
                                            }

                                          </td>


                                          {/* HEIGHT */}

                                          <td>

                                            {
                                              item.height ||
                                              '-'
                                            }

                                          </td>


                                          {/* QTY */}

                                          <td>

                                            {
                                              item.qty ||
                                              '-'
                                            }

                                          </td>


                                          {/* REMARKS */}

                                          <td>

                                            {
                                              item.remarks ||
                                              '-'
                                            }

                                          </td>


                                          {/* IMAGE */}

                                          <td>

                                            {item.image ? (

                                              <img
                                                src={
                                                  item.image
                                                }
                                                alt={
                                                  item.name ||
                                                  `Item ${itemIndex + 1}`
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
                                                    '1px solid #cbd5e1',
                                                }}
                                              />

                                            ) : (

                                              <span
                                                style={{
                                                  color:
                                                    '#94a3b8',
                                                  fontSize:
                                                    '12px',
                                                }}
                                              >
                                                No image
                                              </span>

                                            )}

                                          </td>


                                          {/* PRINT STATUS */}

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

                                              {
                                                itemPrinted
                                                  ? 'Printed'
                                                  : itemNA
                                                    ? 'Print NA'
                                                    : 'Pending'
                                              }

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
                                PROGRESS
                            ================================= */}

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

                                {
                                  allItemsDone
                                    ? 'All items are Printed or NA. Printing can now be finished.'
                                    : 'Every item must be marked ✓ Printed or NA before the print order can be finished.'
                                }

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