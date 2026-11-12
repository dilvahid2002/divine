  import { useEffect, useState } from 'react'
    import {
    useLocation,
    useNavigate,
    useParams,
  } from 'react-router-dom'
    import {
      collection,
      doc,
      getDoc,
      getDocs,
      query,
      runTransaction,
      serverTimestamp,
      updateDoc,
      where,
    } from 'firebase/firestore'
    import { db } from '../../firebase'
    import './Department.css'

    interface JobOrderLocationState {
    leadId?: string
    customerName?: string
    phoneNumber?: string
    place?: string
    branch?: Branch
    jobOrderId?: string
  }

  interface JobOrderProps {
      user: {
        name: string
        username: string
        roles: string[]
      }
    }

    interface Item {
      slNo: number
      name: string
      width: string
      height: string
      qty: string
      price: string
      remarks: string
    }

    interface Designer {
      id: string
      name: string
      username: string
    }

    type Branch =
      | 'Kalpetta'
      | 'Kondotty'
      | 'Sulthan Bathery'

    const BRANCHES: Branch[] = [
      'Kalpetta',
      'Kondotty',
      'Sulthan Bathery',
    ]


    const BRANCH_CODES: Record<Branch, string> = {
      Kalpetta: 'KPT',
      Kondotty: 'KDY',
      'Sulthan Bathery': 'SBY',
    }

    function JobOrder({ user }: JobOrderProps) {
      const navigate = useNavigate()
      const location = useLocation()
      const locationState =
        (location.state ?? {}) as JobOrderLocationState

      /* =========================================
        EDIT MODE

        Edit mode is on when the route has an :id
        param (e.g. /departments/sales/job-orders/:id/edit)
        or when navigate() passes { jobOrderId } in state.
      ========================================== */

      const { id: routeId } = useParams()

      const editId = routeId ?? locationState.jobOrderId

      const isEditMode = Boolean(editId)

      const [loadingOrder, setLoadingOrder] =
        useState(false)

      const [orderIdLabel, setOrderIdLabel] =
        useState('')

      const [originalOrder, setOriginalOrder] =
        useState<{
          statuses: Record<string, string>
          officeInfo: Record<string, unknown>
        }>({ statuses: {}, officeInfo: {} })

      /* =========================================
        BRANCH
      ========================================== */

      const [branch, setBranch] =
        useState<Branch | ''>('')


      /* =========================================
        CUSTOMER DETAILS
      ========================================== */

      const [date, setDate] =
        useState('')

      const [
        expectedDeliveryDate,
        setExpectedDeliveryDate,
      ] = useState('')

      const [customerName, setCustomerName] =
        useState('')

      const [companyName, setCompanyName] =
        useState('')

      const [phoneNumber, setPhoneNumber] =
        useState('')

      const [whatsappNumber, setWhatsappNumber] =
        useState('')

      const [place, setPlace] =
        useState('')


      /* =========================================
        ITEMS
      ========================================== */

      const [items, setItems] =
        useState<Item[]>([])


      /* =========================================
        OFFICE INFORMATION
      ========================================== */

      const [designJob, setDesignJob] =
        useState(false)

      const [printJob, setPrintJob] =
        useState(false)

      const [productionJob, setProductionJob] =
        useState(false)

      /*
      * NEW:
      * Cutting job
      */
      const [cuttingJob, setCuttingJob] =
        useState(false)


      /* =========================================
        DESIGNER
      ========================================== */

      const [designers, setDesigners] =
        useState<Designer[]>([])

      const [selectedDesigner, setSelectedDesigner] =
        useState('')

      const [loadingDesigners, setLoadingDesigners] =
        useState(false)


      /* =========================================
        PRINT BRANCH
      ========================================== */

      const [printBranch, setPrintBranch] =
        useState<Branch | ''>('')


      /* =========================================
        FORM STATE
      ========================================== */

      const [saving, setSaving] =
        useState(false)

      const [message, setMessage] =
        useState('')

      const [messageType, setMessageType] =
        useState<'error' | 'success'>('error')


      /* =========================================
        SET CURRENT DATE
      ========================================== */

      useEffect(() => {
        const today = new Date()

        const formattedDate =
          today.toISOString().split('T')[0]

        setDate(formattedDate)
      }, [])

      /* =========================================
        PREFILL CUSTOMER FROM LEAD
      ========================================== */

      useEffect(() => {
        if (!locationState.customerName &&
            !locationState.phoneNumber &&
            !locationState.place &&
            !locationState.branch) {
          return
        }

        if (locationState.customerName) {
          setCustomerName(locationState.customerName)
        }

        if (locationState.phoneNumber) {
          setPhoneNumber(locationState.phoneNumber)
          setWhatsappNumber(locationState.phoneNumber)
        }

        if (locationState.place) {
          setPlace(locationState.place)
        }

        if (locationState.branch) {
          setBranch(locationState.branch)
        }
      }, [
        locationState.customerName,
        locationState.phoneNumber,
        locationState.place,
        locationState.branch,
      ])


      /* =========================================
        FETCH DESIGNERS
        
        Designers are loaded when Design Job
        is selected.
      ========================================== */

      useEffect(() => {
        if (!designJob) {
          setDesigners([])
          setSelectedDesigner('')
          return
        }

        const fetchDesigners = async () => {
          setLoadingDesigners(true)
          setMessage('')

          try {
            const usersRef =
              collection(db, 'users')

            /*
            * First try lowercase "designer"
            */
            const designerQuery =
              query(
                usersRef,
                where(
                  'roles',
                  'array-contains',
                  'designer',
                ),
              )

            const snapshot =
              await getDocs(
                designerQuery,
              )

            const designerList: Designer[] =
              snapshot.docs.map(
                (document) => {
                  const data =
                    document.data()

                  return {
                    id: document.id,
                    name:
                      data.name || '',
                    username:
                      data.username || '',
                  }
                },
              )

            /*
            * Backward compatibility:
            * Some users may have "Designer"
            * with capital D.
            */
            if (
              designerList.length === 0
            ) {
              const capitalDesignerQuery =
                query(
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

              const capitalDesignerList:
                Designer[] =
                capitalSnapshot.docs.map(
                  (document) => {
                    const data =
                      document.data()

                    return {
                      id: document.id,
                      name:
                        data.name || '',
                      username:
                        data.username || '',
                    }
                  },
                )

              setDesigners(
                capitalDesignerList,
              )
            } else {
              setDesigners(
                designerList,
              )
            }
          } catch (error) {
            console.error(
              'Error fetching designers:',
              error,
            )

            setMessage(
              'Unable to load designers from Firebase.',
            )

            setMessageType('error')
          } finally {
            setLoadingDesigners(false)
          }
        }

        fetchDesigners()
      }, [designJob])


      /* =========================================
        LOAD JOB ORDER (EDIT MODE)
      ========================================== */

      useEffect(() => {
        if (!editId) {
          return
        }

        let cancelled = false

        const loadJobOrder = async () => {
          setLoadingOrder(true)
          setMessage('')

          try {
            const snapshot = await getDoc(
              doc(db, 'job_orders', editId),
            )

            if (cancelled) {
              return
            }

            if (!snapshot.exists()) {
              setMessage('Job order not found.')
              setMessageType('error')
              return
            }

            const data = snapshot.data()
            const office = data.officeInfo ?? {}

            setBranch(data.branch ?? '')
            setDate(data.date ?? '')
            setExpectedDeliveryDate(
              data.expectedDeliveryDate ?? '',
            )

            setCustomerName(data.customer?.name ?? '')
            setCompanyName(data.customer?.companyName ?? '')
            setPhoneNumber(data.customer?.phoneNumber ?? '')
            setWhatsappNumber(
              data.customer?.whatsappNumber ?? '',
            )
            setPlace(data.customer?.place ?? '')

            setItems(
              Array.isArray(data.items)
                ? data.items.map(
                    (
                      item: Partial<Item>,
                      index: number,
                    ) => ({
                      slNo: index + 1,
                      name: String(item.name ?? ''),
                      width: String(item.width ?? ''),
                      height: String(item.height ?? ''),
                      qty: String(item.qty ?? ''),
                      price: String(item.price ?? ''),
                      remarks: String(item.remarks ?? ''),
                    }),
                  )
                : [],
            )

            setDesignJob(Boolean(office.designJob))
            setPrintJob(Boolean(office.printJob))
            setProductionJob(Boolean(office.productionJob))
            setCuttingJob(Boolean(office.cuttingJob))
            setSelectedDesigner(office.designer ?? '')
            setPrintBranch(office.printBranch ?? '')

            setOrderIdLabel(data.orderId ?? '')

            setOriginalOrder({
              statuses: data.statuses ?? {},
              officeInfo: office,
            })
          } catch (error) {
            console.error(
              'Error loading job order:',
              error,
            )

            setMessage('Unable to load the job order.')
            setMessageType('error')
          } finally {
            if (!cancelled) {
              setLoadingOrder(false)
            }
          }
        }

        loadJobOrder()

        return () => {
          cancelled = true
        }
      }, [editId])


      /* =========================================
        ADD ITEM
      ========================================== */

      const handleAddItem = () => {
        const newItem: Item = {
          slNo: items.length + 1,
          name: '',
          width: '',
          height: '',
          qty: '',
          price: '',
          remarks: '',
        }

        setItems(
          (previousItems) => [
            ...previousItems,
            newItem,
          ],
        )
      }


      /* =========================================
        UPDATE ITEM
      ========================================== */

      const handleItemChange = (
        index: number,
        field: keyof Item,
        value: string,
      ) => {
        setItems(
          (previousItems) =>
            previousItems.map(
              (
                item,
                itemIndex,
              ) => {
                if (
                  itemIndex !== index
                ) {
                  return item
                }

                return {
                  ...item,
                  [field]: value,
                }
              },
            ),
        )
      }


      /* =========================================
        REMOVE ITEM
      ========================================== */

      const handleRemoveItem = (
        index: number,
      ) => {
        setItems(
          (previousItems) =>
            previousItems
              .filter(
                (
                  _,
                  itemIndex,
                ) =>
                  itemIndex !== index,
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
        )
      }


      /* =========================================
        CREATE JOB ORDER
      ========================================== */

      const handleSubmit = async (
        event: React.FormEvent<HTMLFormElement>,
      ) => {
        event.preventDefault()

        setMessage('')


        /* -----------------------------------------
          VALIDATION
        ------------------------------------------ */

        if (!branch) {
          setMessage(
            'Please select a branch.',
          )

          setMessageType('error')

          return
        }


        if (!date) {
          setMessage(
            'Please select the entry date.',
          )

          setMessageType('error')

          return
        }


        if (!expectedDeliveryDate) {
          setMessage(
            'Please select the expected delivery date.',
          )

          setMessageType('error')

          return
        }


        if (
          expectedDeliveryDate < date
        ) {
          setMessage(
            'Expected delivery date cannot be before the entry date.',
          )

          setMessageType('error')

          return
        }


        if (!customerName.trim()) {
          setMessage(
            'Please enter the customer name.',
          )

          setMessageType('error')

          return
        }


        if (!phoneNumber.trim()) {
          setMessage(
            'Please enter the phone number.',
          )

          setMessageType('error')

          return
        }


        if (items.length === 0) {
          setMessage(
            'Please add at least one item.',
          )

          setMessageType('error')

          return
        }


        /*
        * IMPORTANT:
        *
        * Cutting is now included here.
        */
        if (
          !designJob &&
          !printJob &&
          !productionJob &&
          !cuttingJob
        ) {
          setMessage(
            'Please select at least one office job type.',
          )

          setMessageType('error')

          return
        }


        if (
          designJob &&
          !selectedDesigner
        ) {
          setMessage(
            'Please select a designer for the design job.',
          )

          setMessageType('error')

          return
        }


        if (
          printJob &&
          !printBranch
        ) {
          setMessage(
            'Please select a branch for the print job.',
          )

          setMessageType('error')

          return
        }


        /* -----------------------------------------
          START SAVING
        ------------------------------------------ */

        /* -----------------------------------------
          EDIT MODE: update the existing job order
          (order ID, branch, delivery state, adviser
          and created date are left untouched)
        ------------------------------------------ */

        if (isEditMode && editId) {
          setSaving(true)

          /*
          * A department keeps its current status if its
          * job stays selected. Newly selected jobs start
          * as Pending; deselected jobs become Finished.
          */
          const nextStatus = (
            enabled: boolean,
            wasEnabled: unknown,
            statusKey: string,
          ) => {
            if (!enabled) {
              return 'Finished'
            }

            return wasEnabled
              ? originalOrder.statuses[statusKey] ?? 'Pending'
              : 'Pending'
          }

          try {
            await updateDoc(
              doc(db, 'job_orders', editId),
              {
                date,
                expectedDeliveryDate,

                'customer.name': customerName.trim(),
                'customer.companyName': companyName.trim(),
                'customer.phoneNumber': phoneNumber.trim(),
                'customer.whatsappNumber':
                  whatsappNumber.trim(),
                'customer.place': place.trim(),

                items,

                'officeInfo.designJob': designJob,
                'officeInfo.designer':
                  designJob ? selectedDesigner : null,
                'officeInfo.printJob': printJob,
                'officeInfo.printBranch':
                  printJob ? printBranch : null,
                'officeInfo.productionJob': productionJob,
                'officeInfo.cuttingJob': cuttingJob,

                'statuses.design': nextStatus(
                  designJob,
                  originalOrder.officeInfo.designJob,
                  'design',
                ),
                'statuses.print': nextStatus(
                  printJob,
                  originalOrder.officeInfo.printJob,
                  'print',
                ),
                'statuses.production': nextStatus(
                  productionJob,
                  originalOrder.officeInfo.productionJob,
                  'production',
                ),
                'statuses.cutting': nextStatus(
                  cuttingJob,
                  originalOrder.officeInfo.cuttingJob,
                  'cutting',
                ),

                updatedAt: serverTimestamp(),

                updatedBy: {
                  name: user.name,
                  username: user.username,
                },
              },
            )

            setMessage(
              `Job Order ${orderIdLabel} updated successfully.`,
            )

            setMessageType('success')

            setTimeout(() => {
              navigate('/departments/sales')
            }, 700)
          } catch (error) {
            console.error(
              'Error updating job order:',
              error,
            )

            setMessage(
              'Unable to update the job order. Please try again.',
            )

            setMessageType('error')
          } finally {
            setSaving(false)
          }

          return
        }


        setSaving(true)

        try {
          /*
          * Each branch has its own counter so order IDs are
          * numbered independently: KPT/1, KDY/1, SBY/1, etc.
          * The transaction prevents duplicate numbers when
          * multiple users create orders simultaneously.
          */

          const branchCode = BRANCH_CODES[branch]
          const counterRef = doc(
            db,
            'counters',
            `jobOrders_${branchCode}`,
          )

          const jobOrderRef = doc(
            collection(db, 'job_orders'),
          )

          let newOrderId = 1

          await runTransaction(
            db,
            async (transaction) => {
              const counterSnapshot = await transaction.get(counterRef)

              if (!counterSnapshot.exists()) {
                newOrderId = 1
                transaction.set(counterRef, {
                  lastOrderId: newOrderId,
                })
              } else {
                const lastOrderId = Number(
                  counterSnapshot.data().lastOrderId,
                )

                newOrderId = Number.isFinite(lastOrderId)
                  ? lastOrderId + 1
                  : 1

                transaction.update(counterRef, {
                  lastOrderId: newOrderId,
                })
              }


              /*
              * Create job order
              */
              transaction.set(
                jobOrderRef,
                {
                  /* =========================
                    ORDER
                  ========================== */

                  orderId:
                    `${branchCode}/${newOrderId}`,


                  /* =========================
                    BRANCH
                  ========================== */

                  branch,


                  /* =========================
                    DATES
                  ========================== */

                  date,

                  expectedDeliveryDate,


                  /* =========================
                    CUSTOMER
                  ========================== */

                  customer: {
                    name:
                      customerName.trim(),

                    companyName:
                      companyName.trim(),

                    phoneNumber:
                      phoneNumber.trim(),

                    whatsappNumber:
                      whatsappNumber.trim(),

                    place:
                      place.trim(),
                  },


                  /* =========================
                    ITEMS
                  ========================== */

                  items,


                  /* =========================
                    OFFICE INFORMATION
                  ========================== */

                  officeInfo: {
                    /*
                    * DESIGN
                    */
                    designJob,

                    designer:
                      designJob
                        ? selectedDesigner
                        : null,


                    /*
                    * PRINT
                    */
                    printJob,

                    printBranch:
                      printJob
                        ? printBranch
                        : null,


                    /*
                    * PRODUCTION
                    */
                    productionJob,


                    /*
                    * CUTTING
                    *
                    * NEW
                    */
                    cuttingJob,
                  },


                  /* =========================
                    STATUSES
                  ========================== */

                  statuses: {
                    /*
                    * DESIGN
                    */
                    design:
                      designJob
                        ? 'Pending'
                        : 'Finished',


                    /*
                    * PRINT
                    */
                    print:
                      printJob
                        ? 'Pending'
                        : 'Finished',


                    /*
                    * PRODUCTION
                    */
                    production:
                      productionJob
                        ? 'Pending'
                        : 'Finished',


                    /*
                    * CUTTING
                    *
                    * NEW
                    */
                    cutting:
                      cuttingJob
                        ? 'Pending'
                        : 'Finished',
                  },


                  /* =========================
                    DELIVERY
                  ========================== */

                  delivered: false,


                  /* =========================
                    CUSTOMER ADVISER
                  ========================== */

                  customerAdviser: {
                    name:
                      user.name,

                    username:
                      user.username,
                  },


                  /* =========================
                    CREATED AT
                  ========================== */

                  createdAt:
                    serverTimestamp(),
                },
              )
            },
          )


          /* -----------------------------------------
            SUCCESS
          ------------------------------------------ */

          setMessage(
            `Job Order #${newOrderId} created successfully.`,
          )

          setMessageType('success')


          /*
          * Return to Sales after
          * displaying success message.
          */
          setTimeout(() => {
            navigate(
              '/departments/sales',
            )
          }, 700)

        } catch (error) {
          console.error(
            'Error creating job order:',
            error,
          )

          setMessage(
            'Unable to create the job order. Please try again.',
          )

          setMessageType('error')
        } finally {
          setSaving(false)
        }
      }


      /* =========================================
        RENDER
      ========================================== */

      return (
        <div className="department-page">

          <div className="department-container">


            {/* =====================================
                HEADER
            ====================================== */}

            <div className="department-header">

              <div>

                <h1>
                  {isEditMode
                    ? `Edit Job Order${
                        orderIdLabel
                          ? ` ${orderIdLabel}`
                          : ''
                      }`
                    : 'Create Job Order'}
                </h1>

                <p>
                  {isEditMode
                    ? 'Update this customer job order'
                    : 'Create a new customer job order'}
                </p>

              </div>


              <button
                type="button"
                className="department-back-button"
                onClick={() =>
                  navigate(
                    '/departments/sales',
                  )
                }
              >
                ← Back to Sales
              </button>
                <button
              type="button"
              className="measurement-go-home-button"
              onClick={() => navigate('/')}
            >
              ← Go to Home
            </button>
            </div>


            {/* =====================================
                BRANCH SELECTION
            ====================================== */}

            {isEditMode && !branch && (loadingOrder || message) && (

              <div className="form-message">
                {loadingOrder
                  ? 'Loading job order...'
                  : message}
              </div>

            )}


            {!branch && !isEditMode && (

              <section className="department-content">

                <div
                  style={{
                    maxWidth:
                      '650px',

                    margin:
                      '0 auto',
                  }}
                >

                  <h2
                    style={{
                      textAlign:
                        'center',

                      marginBottom:
                        '8px',
                    }}
                  >
                    Select Branch
                  </h2>


                  <p
                    style={{
                      textAlign:
                        'center',

                      color:
                        '#64748b',

                      marginBottom:
                        '30px',
                    }}
                  >
                    Select the branch for this job
                    order before continuing.
                  </p>


                  <div
                    style={{
                      display:
                        'grid',

                      gridTemplateColumns:
                        'repeat(3, 1fr)',

                      gap:
                        '15px',
                    }}
                  >

                    {BRANCHES.map(
                      (
                        branchOption,
                      ) => (

                        <button
                          key={
                            branchOption
                          }
                          type="button"
                          onClick={() =>
                            setBranch(
                              branchOption,
                            )
                          }
                          style={{
                            padding:
                              '25px 15px',

                            border:
                              '1px solid #cbd5e1',

                            borderRadius:
                              '12px',

                            background:
                              'white',

                            color:
                              '#172033',

                            fontSize:
                              '16px',

                            fontWeight:
                              600,

                            cursor:
                              'pointer',

                            boxShadow:
                              '0 3px 10px rgba(0,0,0,0.06)',
                          }}
                        >
                          {
                            branchOption
                          }
                        </button>

                      ),
                    )}

                  </div>

                </div>

              </section>

            )}


            {/* =====================================
                MAIN FORM
            ====================================== */}

            {branch && (

              <form
                onSubmit={
                  handleSubmit
                }
              >


                {/* =================================
                    SELECTED BRANCH
                ================================== */}

                <section className="department-section">

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
                    }}
                  >

                    <div>

                      <h2>
                        Branch
                      </h2>

                      <p
                        style={{
                          margin:
                            '5px 0 0',

                          color:
                            '#64748b',
                        }}
                      >
                        {isEditMode
                          ? 'Branch cannot be changed on an existing job order.'
                          : 'Job order will be created under this branch.'}
                      </p>

                    </div>


                    {!isEditMode && (
                      <button
                        type="button"
                        className="department-back-button"
                        onClick={() =>
                          setBranch('')
                        }
                      >
                        Change Branch
                      </button>
                    )}

                  </div>


                  <div
                    style={{
                      marginTop:
                        '15px',

                      padding:
                        '14px 18px',

                      background:
                        '#eff6ff',

                      borderRadius:
                        '10px',

                      color:
                        '#1d4ed8',

                      fontWeight:
                        700,
                    }}
                  >
                    {branch}
                  </div>

                </section>


                {/* =================================
                    CUSTOMER DETAILS
                ================================== */}

                <section className="department-section">

                  <h2>
                    1. Customer Details
                  </h2>


                  <div className="form-grid">


                    {/* ENTRY DATE */}

                    <div className="input-group">

                      <label htmlFor="date">
                        Entry Date
                      </label>

                      <input
                        id="date"
                        type="date"
                        value={
                          date
                        }
                        onChange={(
                          event,
                        ) =>
                          setDate(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* EXPECTED DELIVERY */}

                    <div className="input-group">

                      <label htmlFor="expectedDeliveryDate">
                        Expected Delivery Date
                      </label>

                      <input
                        id="expectedDeliveryDate"
                        type="date"
                        min={date}
                        value={
                          expectedDeliveryDate
                        }
                        onChange={(
                          event,
                        ) =>
                          setExpectedDeliveryDate(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* CUSTOMER NAME */}

                    <div className="input-group">

                      <label htmlFor="customerName">
                        Name of Customer
                      </label>

                      <input
                        id="customerName"
                        type="text"
                        placeholder="Enter customer name"
                        value={
                          customerName
                        }
                        onChange={(
                          event,
                        ) =>
                          setCustomerName(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* COMPANY */}

                    <div className="input-group">

                      <label htmlFor="companyName">
                        Name of Company
                      </label>

                      <input
                        id="companyName"
                        type="text"
                        placeholder="Enter company name"
                        value={
                          companyName
                        }
                        onChange={(
                          event,
                        ) =>
                          setCompanyName(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* PHONE */}

                    <div className="input-group">

                      <label htmlFor="phoneNumber">
                        Phone Number
                      </label>

                      <input
                        id="phoneNumber"
                        type="tel"
                        placeholder="Enter phone number"
                        value={
                          phoneNumber
                        }
                        onChange={(
                          event,
                        ) =>
                          setPhoneNumber(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* WHATSAPP */}

                    <div className="input-group">

                      <label htmlFor="whatsappNumber">
                        WhatsApp Number
                      </label>

                      <input
                        id="whatsappNumber"
                        type="tel"
                        placeholder="Enter WhatsApp number"
                        value={
                          whatsappNumber
                        }
                        onChange={(
                          event,
                        ) =>
                          setWhatsappNumber(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>


                    {/* PLACE */}

                    <div className="input-group">

                      <label htmlFor="place">
                        Place
                      </label>

                      <input
                        id="place"
                        type="text"
                        placeholder="Enter place"
                        value={place}
                        onChange={(
                          event,
                        ) =>
                          setPlace(
                            event.target
                              .value,
                          )
                        }
                      />

                    </div>

                  </div>

                </section>


                {/* =================================
                    ITEMS
                ================================== */}

                <section className="department-section">

                  <div className="section-heading-row">

                    <div>

                      <h2>
                        2. Items Details
                      </h2>

                      <p>
                        Add the items included
                        in this job order.
                      </p>

                    </div>


                    <button
                      type="button"
                      className="add-item-button"
                      onClick={
                        handleAddItem
                      }
                    >
                      + Add Item
                    </button>

                  </div>


                  {items.length === 0 ? (

                    <div className="empty-items">
                      No items added yet.
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
                              Name of Item
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

                          {items.map(
                            (
                              item,
                              index,
                            ) => (

                              <tr
                                key={
                                  item.slNo
                                }
                              >

                                <td className="sl-number">
                                  {
                                    item.slNo
                                  }
                                </td>


                                <td>

                                  <input
                                    type="text"
                                    placeholder="Item name"
                                    value={
                                      item.name
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="Width"
                                    value={
                                      item.width
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    type="number"
                                    min="0"
                                    step="any"
                                    placeholder="Height"
                                    value={
                                      item.height
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    type="number"
                                    min="1"
                                    placeholder="Qty"
                                    value={
                                      item.qty
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    placeholder="Price"
                                    value={
                                      item.price
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    type="text"
                                    placeholder="Remarks"
                                    value={
                                      item.remarks
                                    }
                                    onChange={(
                                      event,
                                    ) =>
                                      handleItemChange(
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
                                    className="remove-item-button"
                                    onClick={() =>
                                      handleRemoveItem(
                                        index,
                                      )
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

                  )}

                </section>


                {/* =================================
                    OFFICE INFORMATION
                ================================== */}

                <section className="department-section">

                  <h2>
                    3. Office Information
                  </h2>


                  <div className="job-options">


                    {/* =================================
                        DESIGN JOB
                    ================================== */}

                    <label className="checkbox-option">

                      <input
                        type="checkbox"
                        checked={
                          designJob
                        }
                        onChange={(
                          event,
                        ) =>
                          setDesignJob(
                            event.target
                              .checked,
                          )
                        }
                      />

                      <span>
                        Design Job
                      </span>

                    </label>


                    {/* =================================
                        PRINT JOB
                    ================================== */}

                    <label className="checkbox-option">

                      <input
                        type="checkbox"
                        checked={
                          printJob
                        }
                        onChange={(
                          event,
                        ) =>
                          setPrintJob(
                            event.target
                              .checked,
                          )
                        }
                      />

                      <span>
                        Print Job
                      </span>

                    </label>


                    {/* =================================
                        PRODUCTION JOB
                    ================================== */}

                    <label className="checkbox-option">

                      <input
                        type="checkbox"
                        checked={
                          productionJob
                        }
                        onChange={(
                          event,
                        ) =>
                          setProductionJob(
                            event.target
                              .checked,
                          )
                        }
                      />

                      <span>
                        Production Job
                      </span>

                    </label>


                    {/* =================================
                        CUTTING JOB
                    ================================== */}

                    <label className="checkbox-option">

                      <input
                        type="checkbox"
                        checked={
                          cuttingJob
                        }
                        onChange={(
                          event,
                        ) =>
                          setCuttingJob(
                            event.target
                              .checked,
                          )
                        }
                      />

                      <span>
                        Cutting Job
                      </span>

                    </label>

                  </div>


                  {/* =================================
                      DESIGNER SELECTION
                  ================================== */}

                  {designJob && (

                    <div className="designer-selection">

                      <label htmlFor="designer">
                        Select Designer
                      </label>


                      <select
                        id="designer"
                        value={
                          selectedDesigner
                        }
                        onChange={(
                          event,
                        ) =>
                          setSelectedDesigner(
                            event.target
                              .value,
                          )
                        }
                        disabled={
                          loadingDesigners
                        }
                      >

                        <option value="">
                          {loadingDesigners
                            ? 'Loading designers...'
                            : 'Select a designer'}
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
                                designer.name
                              }
                            >
                              {
                                designer.name
                              }{' '}
                              (
                              {
                                designer.username
                              }
                              )
                            </option>

                          ),
                        )}

                      </select>


                      {!loadingDesigners &&
                        designers.length ===
                          0 && (

                          <p className="field-help">
                            No designers found.
                          </p>

                        )}

                    </div>

                  )}


                  {/* =================================
                      PRINT BRANCH
                  ================================== */}

                  {printJob && (

                    <div className="designer-selection">

                      <label htmlFor="printBranch">
                        Select Print Branch
                      </label>


                      <select
                        id="printBranch"
                        value={
                          printBranch
                        }
                        onChange={(
                          event,
                        ) =>
                          setPrintBranch(
                            event.target
                              .value as
                              Branch | '',
                          )
                        }
                      >

                        <option value="">
                          Select a print branch
                        </option>


                        {BRANCHES.map(
                          (
                            branchOption,
                          ) => (

                            <option
                              key={
                                branchOption
                              }
                              value={
                                branchOption
                              }
                            >
                              {
                                branchOption
                              }
                            </option>

                          ),
                        )}

                      </select>

                    </div>

                  )}


                  {/* =================================
                      CUSTOMER ADVISER
                  ================================== */}

                  <div className="customer-adviser">

                    <label>
                      Customer Adviser
                    </label>


                    <input
                      type="text"
                      value={
                        user.name
                      }
                      readOnly
                    />


                    <small>
                      Logged in as{' '}
                      {
                        user.username
                      }
                    </small>

                  </div>

                </section>


                {/* =================================
                    MESSAGE
                ================================== */}

                {message && (

                  <div
                    className="form-message"
                    style={{
                      background:
                        messageType ===
                        'success'
                          ? '#dcfce7'
                          : undefined,

                      color:
                        messageType ===
                        'success'
                          ? '#166534'
                          : undefined,
                    }}
                  >
                    {message}
                  </div>

                )}


                {/* =================================
                    FORM ACTIONS
                ================================== */}

                <div className="form-actions">

                  <button
                    type="button"
                    className="cancel-button"
                    onClick={() =>
                      navigate(
                        '/departments/sales',
                      )
                    }
                    disabled={saving}
                  >
                    Cancel
                  </button>


                  <button
                    type="submit"
                    className="submit-job-button"
                    disabled={saving}
                  >
                    {saving
                      ? isEditMode
                        ? 'Saving Changes...'
                        : 'Creating Job Order...'
                      : isEditMode
                        ? 'Save Changes'
                        : 'Create Job Order'}
                  </button>

                </div>

              </form>

            )}

          </div>

        </div>
      )
    }

    export default JobOrder 