import { useEffect, useRef, useState } from 'react'
import {
  collection,
  doc,
  runTransaction,
  Timestamp,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface MeasurementProps {
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
  image: string
}

function Measurement({
  user,
}: MeasurementProps) {
  const [date, setDate] = useState('')

  const [customerName, setCustomerName] =
    useState('')

  const [companyName, setCompanyName] =
    useState('')

  const [phoneNumber, setPhoneNumber] =
    useState('')

  const [whatsappNumber, setWhatsappNumber] =
    useState('')

  const [place, setPlace] = useState('')

  const [items, setItems] =
    useState<Item[]>([])

  const [designJob, setDesignJob] =
    useState(false)

  const [printJob, setPrintJob] =
    useState(false)

  const [productionJob, setProductionJob] =
    useState(false)

  // CUTTING JOB
  const [cuttingJob, setCuttingJob] =
    useState(false)

  const [message, setMessage] =
    useState('')

  const [saving, setSaving] =
    useState(false)

  /*
   * Hidden file inputs.
   *
   * Each item gets its own file input.
   * On mobile devices, accept="image/*"
   * allows the device to provide camera/gallery
   * options through the native picker.
   */

  const fileInputRefs =
    useRef<(HTMLInputElement | null)[]>([])

  // =========================================
  // SET TODAY'S DATE
  // =========================================

  useEffect(() => {
    const today = new Date()

    const formattedDate =
      today.toISOString().split('T')[0]

    setDate(formattedDate)
  }, [])

  // =========================================
  // ADD ITEM
  // =========================================

  const handleAddItem = () => {
    const newItem: Item = {
      slNo: items.length + 1,
      name: '',
      width: '',
      height: '',
      qty: '',
      price: '',
      remarks: '',
      image: '',
    }

    setItems((previousItems) => [
      ...previousItems,
      newItem,
    ])
  }

  // =========================================
  // UPDATE ITEM
  // =========================================

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

  // =========================================
  // RESIZE IMAGE
  // =========================================

  /*
   * Images from modern phones can be several MB.
   * We resize them before storing them in Firestore.
   */

  const resizeImage = (
    file: File,
  ): Promise<string> => {
    return new Promise(
      (resolve, reject) => {
        const reader = new FileReader()

        reader.onload = () => {
          const image = new Image()

          image.onload = () => {
            const maxWidth = 1000
            const maxHeight = 1000

            let width = image.width
            let height = image.height

            if (
              width > maxWidth ||
              height > maxHeight
            ) {
              const widthRatio =
                maxWidth / width

              const heightRatio =
                maxHeight / height

              const ratio = Math.min(
                widthRatio,
                heightRatio,
              )

              width = Math.round(
                width * ratio,
              )

              height = Math.round(
                height * ratio,
              )
            }

            const canvas =
              document.createElement(
                'canvas',
              )

            canvas.width = width
            canvas.height = height

            const context =
              canvas.getContext('2d')

            if (!context) {
              reject(
                new Error(
                  'Unable to process image.',
                ),
              )

              return
            }

            context.drawImage(
              image,
              0,
              0,
              width,
              height,
            )

            const compressedImage =
              canvas.toDataURL(
                'image/jpeg',
                0.75,
              )

            resolve(
              compressedImage,
            )
          }

          image.onerror = () => {
            reject(
              new Error(
                'Unable to load image.',
              ),
            )
          }

          image.src =
            reader.result as string
        }

        reader.onerror = () => {
          reject(
            new Error(
              'Unable to read image.',
            ),
          )
        }

        reader.readAsDataURL(file)
      },
    )
  }

  // =========================================
  // SELECT ITEM IMAGE
  // =========================================

  const handleImageChange = async (
    index: number,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file =
      event.target.files?.[0]

    if (!file) {
      return
    }

    // Make sure the selected file is an image.
    if (!file.type.startsWith('image/')) {
      setMessage(
        'Please select an image file.',
      )

      event.target.value = ''

      return
    }

    try {
      const compressedImage =
        await resizeImage(file)

      setItems((previousItems) =>
        previousItems.map(
          (item, itemIndex) => {
            if (itemIndex !== index) {
              return item
            }

            return {
              ...item,
              image: compressedImage,
            }
          },
        ),
      )

      setMessage('')
    } catch (error) {
      console.error(
        'Error processing image:',
        error,
      )

      setMessage(
        'Unable to process the selected image.',
      )
    }

    // Allows the user to select the same image again.
    event.target.value = ''
  }

  // =========================================
  // OPEN IMAGE PICKER
  // =========================================

  const handleSelectImage = (
    index: number,
  ) => {
    fileInputRefs.current[
      index
    ]?.click()
  }

  // =========================================
  // REMOVE ITEM IMAGE
  // =========================================

  const handleRemoveImage = (
    index: number,
  ) => {
    setItems((previousItems) =>
      previousItems.map(
        (item, itemIndex) => {
          if (itemIndex !== index) {
            return item
          }

          return {
            ...item,
            image: '',
          }
        },
      ),
    )
  }

  // =========================================
  // REMOVE ITEM
  // =========================================

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

  // =========================================
  // SUBMIT MEASUREMENT
  // =========================================

  const handleSubmit = async (
    event: React.FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()

    setMessage('')

    // ---------------------------------------
    // VALIDATION
    // ---------------------------------------

    if (!customerName.trim()) {
      setMessage(
        'Please enter the customer name.',
      )

      return
    }

    if (!phoneNumber.trim()) {
      setMessage(
        'Please enter the phone number.',
      )

      return
    }

    if (items.length === 0) {
      setMessage(
        'Please add at least one item.',
      )

      return
    }

    if (
      !designJob &&
      !printJob &&
      !productionJob &&
      !cuttingJob
    ) {
      setMessage(
        'Please select at least one office job type.',
      )

      return
    }

    // ---------------------------------------
    // START SAVING
    // ---------------------------------------

    setSaving(true)

    try {
      // =====================================
      // FIRESTORE COUNTER
      // =====================================
      //
      // This document stores the last
      // generated Measurement number.
      //
      // Example:
      //
      // settings
      //    measurementsCounter
      //       lastNumber: 5
      //
      // Next ID will be M/6
      //
      // =====================================

      const counterRef = doc(
        db,
        'settings',
        'measurementsCounter',
      )

      // =====================================
      // CREATE MEASUREMENT DOCUMENT REF
      // =====================================

      const measurementRef = doc(
        collection(db, 'measurements'),
      )

      // =====================================
      // FIRESTORE TRANSACTION
      // =====================================

      const measurementId =
        await runTransaction(
          db,
          async (transaction) => {
            // Read current counter
            const counterSnapshot =
              await transaction.get(
                counterRef,
              )

            let nextNumber = 1

            // If counter already exists
            if (
              counterSnapshot.exists()
            ) {
              const currentNumber =
                counterSnapshot.data()
                  .lastNumber

              if (
                typeof currentNumber ===
                'number'
              ) {
                nextNumber =
                  currentNumber + 1
              }
            }

            // =================================
            // UPDATE COUNTER
            // =================================

            transaction.set(
              counterRef,
              {
                lastNumber:
                  nextNumber,
              },
              {
                merge: true,
              },
            )

            // =================================
            // GENERATE MEASUREMENT ID
            // =================================

            const generatedId =
              `M/${nextNumber}`

            // =================================
            // MEASUREMENT DATA
            // =================================

            const measurement = {
              // Measurement ID
              measurementId:
                generatedId,

              // Measurement date
              date,

              // =================================
              // CUSTOMER DETAILS
              // =================================

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

              // =================================
              // ITEMS
              // =================================

              items,

              // =================================
              // OFFICE INFORMATION
              // =================================

              officeInfo: {
                designJob,
                printJob,
                productionJob,
                cuttingJob,
              },

              // =================================
              // CUSTOMER ADVISER
              // CURRENT LOGGED-IN USER
              // =================================

              customerAdviser: {
                name: user.name,
                username: user.username,
              },

              // =================================
              // CREATED TIME
              // =================================

              createdAt:
                Timestamp.now(),
            }

            // =================================
            // SAVE MEASUREMENT
            // =================================

            transaction.set(
              measurementRef,
              measurement,
            )

            return generatedId
          },
        )

      // =====================================
      // RESET FORM
      // =====================================

      setCustomerName('')
      setCompanyName('')
      setPhoneNumber('')
      setWhatsappNumber('')
      setPlace('')

      setItems([])

      setDesignJob(false)
      setPrintJob(false)
      setProductionJob(false)
      setCuttingJob(false)

      // Reset date to today
      const today = new Date()

      setDate(
        today
          .toISOString()
          .split('T')[0],
      )

      // =====================================
      // SUCCESS MESSAGE
      // =====================================

      setMessage(
        `Measurement ${measurementId} created successfully.`,
      )
    } catch (error) {
      console.error(
        'Error creating measurement:',
        error,
      )

      setMessage(
        'Unable to create measurement. Please try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  // =========================================
  // UI
  // =========================================

  return (
    <div className="department-page">

      <div className="department-container">

        {/* =====================================
            HEADER
        ====================================== */}

        <div className="department-header">

          <div>

            <h1>
              Measurement
            </h1>

            <p>
              Create a new customer measurement
            </p>

          </div>

        </div>

        <form onSubmit={handleSubmit}>

          {/* =====================================
              SECTION 1 - CUSTOMER DETAILS
          ====================================== */}

          <section className="department-section">

            <h2>
              1. Customer Details
            </h2>

            <div className="form-grid">

              {/* DATE */}

              <div className="input-group">

                <label htmlFor="measurement-date">
                  Date
                </label>

                <input
                  id="measurement-date"
                  type="date"
                  value={date}
                  onChange={(event) =>
                    setDate(
                      event.target.value,
                    )
                  }
                />

              </div>

              {/* CUSTOMER NAME */}

              <div className="input-group">

                <label htmlFor="customer-name">
                  Name of Customer
                </label>

                <input
                  id="customer-name"
                  type="text"
                  placeholder="Enter customer name"
                  value={customerName}
                  onChange={(event) =>
                    setCustomerName(
                      event.target.value,
                    )
                  }
                />

              </div>

              {/* COMPANY NAME */}

              <div className="input-group">

                <label htmlFor="company-name">
                  Name of Company
                </label>

                <input
                  id="company-name"
                  type="text"
                  placeholder="Enter company name"
                  value={companyName}
                  onChange={(event) =>
                    setCompanyName(
                      event.target.value,
                    )
                  }
                />

              </div>

              {/* PHONE */}

              <div className="input-group">

                <label htmlFor="phone-number">
                  Phone Number
                </label>

                <input
                  id="phone-number"
                  type="tel"
                  placeholder="Enter phone number"
                  value={phoneNumber}
                  onChange={(event) =>
                    setPhoneNumber(
                      event.target.value,
                    )
                  }
                />

              </div>

              {/* WHATSAPP */}

              <div className="input-group">

                <label htmlFor="whatsapp-number">
                  WhatsApp Number
                </label>

                <input
                  id="whatsapp-number"
                  type="tel"
                  placeholder="Enter WhatsApp number"
                  value={whatsappNumber}
                  onChange={(event) =>
                    setWhatsappNumber(
                      event.target.value,
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
                  onChange={(event) =>
                    setPlace(
                      event.target.value,
                    )
                  }
                />

              </div>

            </div>

          </section>


          {/* =====================================
              SECTION 2 - ITEMS DETAILS
          ====================================== */}

          <section className="department-section">

            <div className="section-heading-row">

              <div>

                <h2>
                  2. Items Details
                </h2>

                <p>
                  Add the items included in this
                  measurement.
                </p>

              </div>

              <button
                type="button"
                className="add-item-button"
                onClick={handleAddItem}
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
                        Image
                      </th>

                      <th>
                        Action
                      </th>

                    </tr>

                  </thead>


                  <tbody>

                    {items.map(
                      (item, index) => (

                        <tr
                          key={item.slNo}
                        >

                          {/* SL NO */}

                          <td className="sl-number">

                            {item.slNo}

                          </td>


                          {/* ITEM */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* WIDTH */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* HEIGHT */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* QTY */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* PRICE */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* REMARKS */}

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
                                  event.target.value,
                                )
                              }
                            />

                          </td>


                          {/* =================================
                              ITEM IMAGE
                          ================================== */}

                          <td>

                            <input
                              ref={(element) => {
                                fileInputRefs.current[
                                  index
                                ] = element
                              }}
                              type="file"
                              accept="image/*"
                              onChange={(
                                event,
                              ) =>
                                handleImageChange(
                                  index,
                                  event,
                                )
                              }
                              style={{
                                display:
                                  'none',
                              }}
                            />


                            {item.image ? (

                              <div
                                style={{
                                  display:
                                    'flex',
                                  flexDirection:
                                    'column',
                                  alignItems:
                                    'center',
                                  gap: '6px',
                                }}
                              >

                                <img
                                  src={
                                    item.image
                                  }
                                  alt={`Item ${item.slNo}`}
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
                                      '1px solid #ccc',
                                  }}
                                />


                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSelectImage(
                                      index,
                                    )
                                  }
                                  style={{
                                    fontSize:
                                      '12px',
                                  }}
                                >
                                  Change
                                </button>


                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveImage(
                                      index,
                                    )
                                  }
                                  style={{
                                    fontSize:
                                      '12px',
                                    color:
                                      '#d00',
                                  }}
                                >
                                  Remove
                                </button>

                              </div>

                            ) : (

                              <button
                                type="button"
                                className="select-image-button"
                                onClick={() =>
                                  handleSelectImage(
                                    index,
                                  )
                                }
                              >
                                📷 Select Image
                              </button>

                            )}

                          </td>


                          {/* REMOVE ITEM */}

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


          {/* =====================================
              SECTION 3 - OFFICE INFORMATION
          ====================================== */}

          <section className="department-section">

            <h2>
              3. Office Information
            </h2>

            <div className="job-options">

              {/* DESIGN JOB */}

              <label className="checkbox-option">

                <input
                  type="checkbox"
                  checked={designJob}
                  onChange={(event) =>
                    setDesignJob(
                      event.target.checked,
                    )
                  }
                />

                <span>
                  Design Job
                </span>

              </label>


              {/* PRINT JOB */}

              <label className="checkbox-option">

                <input
                  type="checkbox"
                  checked={printJob}
                  onChange={(event) =>
                    setPrintJob(
                      event.target.checked,
                    )
                  }
                />

                <span>
                  Print Job
                </span>

              </label>


              {/* PRODUCTION JOB */}

              <label className="checkbox-option">

                <input
                  type="checkbox"
                  checked={
                    productionJob
                  }
                  onChange={(event) =>
                    setProductionJob(
                      event.target.checked,
                    )
                  }
                />

                <span>
                  Production Job
                </span>

              </label>


              {/* CUTTING JOB */}

              <label className="checkbox-option">

                <input
                  type="checkbox"
                  checked={
                    cuttingJob
                  }
                  onChange={(event) =>
                    setCuttingJob(
                      event.target.checked,
                    )
                  }
                />

                <span>
                  Cutting Job
                </span>

              </label>

            </div>


            {/* =================================
                CUSTOMER ADVISER
            ================================== */}

            <div className="customer-adviser">

              <label>
                Customer Adviser
              </label>

              <input
                type="text"
                value={user.name}
                readOnly
              />

              <small>
                Logged in as{' '}
                {user.username}
              </small>

            </div>

          </section>


          {/* =====================================
              MESSAGE
          ====================================== */}

          {message && (

            <div className="form-message">

              {message}

            </div>

          )}


          {/* =====================================
              SUBMIT
          ====================================== */}

          <div className="form-actions">

            <button
              type="submit"
              className="submit-job-button"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : 'Create Measurement'}
            </button>

          </div>

        </form>

      </div>

    </div>
  )
}

export default Measurement