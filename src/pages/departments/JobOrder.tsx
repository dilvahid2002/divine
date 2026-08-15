import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

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

function JobOrder({ user }: JobOrderProps) {
  const navigate = useNavigate()

  /* =========================================
     BRANCH
  ========================================== */

  const [branch, setBranch] = useState<Branch | ''>('')


  /* =========================================
     CUSTOMER DETAILS
  ========================================== */

  const [date, setDate] = useState('')
  const [expectedDeliveryDate, setExpectedDeliveryDate] =
    useState('')

  const [customerName, setCustomerName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [place, setPlace] = useState('')


  /* =========================================
     ITEMS
  ========================================== */

  const [items, setItems] = useState<Item[]>([])


  /* =========================================
     OFFICE INFORMATION
  ========================================== */

  const [designJob, setDesignJob] = useState(false)
  const [printJob, setPrintJob] = useState(false)
  const [productionJob, setProductionJob] = useState(false)


  /* =========================================
     DESIGNER
  ========================================== */

  const [designers, setDesigners] = useState<Designer[]>([])
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

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
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
        const usersRef = collection(db, 'users')

        const designerQuery = query(
          usersRef,
          where(
            'roles',
            'array-contains',
            'designer',
          ),
        )

        const snapshot =
          await getDocs(designerQuery)

        const designerList: Designer[] =
          snapshot.docs.map((document) => {
            const data = document.data()

            return {
              id: document.id,
              name: data.name || '',
              username: data.username || '',
            }
          })

        /*
         * Some existing users may have "Designer"
         * with a capital D depending on older data.
         *
         * If the first query returned nothing, try
         * the capitalized version as well.
         */
        if (designerList.length === 0) {
          const capitalDesignerQuery = query(
            usersRef,
            where(
              'roles',
              'array-contains',
              'Designer',
            ),
          )

          const capitalSnapshot =
            await getDocs(capitalDesignerQuery)

          const capitalDesignerList: Designer[] =
            capitalSnapshot.docs.map(
              (document) => {
                const data = document.data()

                return {
                  id: document.id,
                  name: data.name || '',
                  username:
                    data.username || '',
                }
              },
            )

          setDesigners(capitalDesignerList)
        } else {
          setDesigners(designerList)
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

    setItems((previousItems) => [
      ...previousItems,
      newItem,
    ])
  }


  /* =========================================
     UPDATE ITEM
  ========================================== */

  const handleItemChange = (
    index: number,
    field: keyof Item,
    value: string,
  ) => {
    setItems((previousItems) =>
      previousItems.map(
        (item, itemIndex) => {
          if (itemIndex !== index) {
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
    setItems((previousItems) =>
      previousItems
        .filter(
          (_, itemIndex) =>
            itemIndex !== index,
        )
        .map((item, itemIndex) => ({
          ...item,
          slNo: itemIndex + 1,
        })),
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

    if (
      !designJob &&
      !printJob &&
      !productionJob
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

    setSaving(true)

    try {
      /*
       * We use a dedicated counter document.
       *
       * Document:
       * counters/jobOrders
       *
       * The first order will be 0.
       * Every following order gets +1.
       *
       * Transaction makes this safer when multiple
       * users create orders at the same time.
       */

      const counterRef = doc(
        db,
        'counters',
        'jobOrders',
      )

      const jobOrderRef =
        doc(collection(db, 'job_orders'))

      let newOrderId = 0

      await runTransaction(
        db,
        async (transaction) => {
          const counterSnapshot =
            await transaction.get(
              counterRef,
            )

          if (!counterSnapshot.exists()) {
            newOrderId = 0

            transaction.set(
              counterRef,
              {
                lastOrderId: 0,
              },
            )
          } else {
            const counterData =
              counterSnapshot.data()

            const lastOrderId =
              Number(
                counterData.lastOrderId,
              )

            newOrderId =
              Number.isFinite(lastOrderId)
                ? lastOrderId + 1
                : 0

            transaction.update(
              counterRef,
              {
                lastOrderId: newOrderId,
              },
            )
          }

          transaction.set(
            jobOrderRef,
            {
              orderId: newOrderId,

              branch,

              date,

              expectedDeliveryDate,

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

              items,

              officeInfo: {
                designJob,

                designer:
                  designJob
                    ? selectedDesigner
                    : null,

                printJob,

                printBranch:
                  printJob
                    ? printBranch
                    : null,

                productionJob,
              },

              statuses: {
                design:
                  designJob
                    ? 'Pending'
                    : 'Finished',

                print:
                  printJob
                    ? 'Pending'
                    : 'Finished',

                production:
                  productionJob
                    ? 'Pending'
                    : 'Finished',
              },

              delivered: false,

              customerAdviser: {
                name: user.name,
                username:
                  user.username,
              },

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
       * Give the user a moment to see the success
       * message, then return to Sales.
       */
      setTimeout(() => {
        navigate('/departments/sales')
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
              Create Job Order
            </h1>

            <p>
              Create a new customer job order
            </p>
          </div>

          <button
            type="button"
            className="department-back-button"
            onClick={() =>
              navigate('/departments/sales')
            }
          >
            ← Back to Sales
          </button>

        </div>


        {/* =====================================
            BRANCH SELECTION
        ====================================== */}

        {!branch && (
          <section className="department-content">

            <div
              style={{
                maxWidth: '650px',
                margin: '0 auto',
              }}
            >

              <h2
                style={{
                  textAlign: 'center',
                  marginBottom: '8px',
                }}
              >
                Select Branch
              </h2>

              <p
                style={{
                  textAlign: 'center',
                  color: '#64748b',
                  marginBottom: '30px',
                }}
              >
                Select the branch for this job
                order before continuing.
              </p>


              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns:
                    'repeat(3, 1fr)',
                  gap: '15px',
                }}
              >

                {BRANCHES.map(
                  (branchOption) => (
                    <button
                      key={branchOption}
                      type="button"
                      onClick={() =>
                        setBranch(
                          branchOption,
                        )
                      }
                      style={{
                        padding: '25px 15px',
                        border:
                          '1px solid #cbd5e1',
                        borderRadius: '12px',
                        background:
                          'white',
                        color:
                          '#172033',
                        fontSize: '16px',
                        fontWeight: 600,
                        cursor:
                          'pointer',
                        boxShadow:
                          '0 3px 10px rgba(0,0,0,0.06)',
                      }}
                    >
                      {branchOption}
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
            onSubmit={handleSubmit}
          >

            {/* =================================
                SELECTED BRANCH
            ================================== */}

            <section className="department-section">

              <div
                style={{
                  display: 'flex',
                  justifyContent:
                    'space-between',
                  alignItems: 'center',
                  gap: '15px',
                  flexWrap: 'wrap',
                }}
              >

                <div>
                  <h2>
                    Branch
                  </h2>

                  <p
                    style={{
                      margin: '5px 0 0',
                      color:
                        '#64748b',
                    }}
                  >
                    Job order will be created
                    under this branch.
                  </p>
                </div>

                <button
                  type="button"
                  className="department-back-button"
                  onClick={() =>
                    setBranch('')
                  }
                >
                  Change Branch
                </button>

              </div>

              <div
                style={{
                  marginTop: '15px',
                  padding: '14px 18px',
                  background:
                    '#eff6ff',
                  borderRadius: '10px',
                  color:
                    '#1d4ed8',
                  fontWeight: 700,
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

                <div className="input-group">

                  <label htmlFor="date">
                    Entry Date
                  </label>

                  <input
                    id="date"
                    type="date"
                    value={date}
                    onChange={(event) =>
                      setDate(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


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
                    onChange={(event) =>
                      setExpectedDeliveryDate(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


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
                    onChange={(event) =>
                      setCustomerName(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


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
                    onChange={(event) =>
                      setCompanyName(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


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
                    onChange={(event) =>
                      setPhoneNumber(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


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
                    onChange={(event) =>
                      setWhatsappNumber(
                        event.target
                          .value,
                      )
                    }
                  />

                </div>


                <div className="input-group">

                  <label htmlFor="place">
                    Place
                  </label>

                  <input
                    id="place"
                    type="text"
                    placeholder="Enter place"
                    value={place}
                    onChange={(event) =>
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
                              {item.slNo}
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

                {/* DESIGN */}

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


                {/* PRINT */}

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


                {/* PRODUCTION */}

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
                SUBMIT
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
                  ? 'Creating Job Order...'
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