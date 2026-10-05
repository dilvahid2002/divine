import { useEffect, useState, FormEvent } from 'react'
import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import './Department.css'

interface LeadsProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

type Branch =
  | 'Sulthan Bathery'
  | 'Kalpetta'
  | 'Kondotty'

const LEAD_SOURCES = [
  'Just Dial',
  'Google',
  'Site',
  'Work',
  'MD',
  'Staff',
  'Walk-in Customer',
]

const BRANCHES: Branch[] = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

function Leads({ user }: LeadsProps) {
  const navigate = useNavigate()

  /* =========================================
     FORM STATE
  ========================================= */

  const [source, setSource] = useState('')
  const [date, setDate] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [place, setPlace] = useState('')
  const [branch, setBranch] = useState<Branch | ''>('')
  const [remarks, setRemarks] = useState('')

  /* =========================================
     FORM STATUS
  ========================================= */

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [messageType, setMessageType] =
    useState<'success' | 'error'>('error')

  /* =========================================
     SET CURRENT DATE
  ========================================= */

  useEffect(() => {
    const today = new Date()

    const localDate = new Date(
      today.getTime() - today.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .split('T')[0]

    setDate(localDate)
  }, [])

  /* =========================================
     RESET FORM
  ========================================= */

  const resetForm = () => {
    setSource('')
    setCustomerName('')
    setPhoneNumber('')
    setPlace('')
    setBranch('')

    setRemarks('')

    const today = new Date()

    const localDate = new Date(
      today.getTime() - today.getTimezoneOffset() * 60000,
    )
      .toISOString()
      .split('T')[0]

    setDate(localDate)
  }

  /* =========================================
     SAVE LEAD
  ========================================= */

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()

    setMessage('')

    /* -----------------------------------------
       VALIDATION
    ----------------------------------------- */

    if (!source) {
      setMessage('Please select the source of lead.')
      setMessageType('error')
      return
    }

    if (!date) {
      setMessage('Please select the date.')
      setMessageType('error')
      return
    }

    if (!customerName.trim()) {
      setMessage('Please enter the customer name.')
      setMessageType('error')
      return
    }

    if (!phoneNumber.trim()) {
      setMessage('Please enter the phone number.')
      setMessageType('error')
      return
    }

    if (!place.trim()) {
      setMessage('Please enter the place.')
      setMessageType('error')
      return
    }

    if (!branch) {
      setMessage('Please select the branch of entry.')
      setMessageType('error')
      return
    }

    try {
      setSaving(true)

      /*
       * IMPORTANT:
       *
       * The lead number and lead document are created
       * inside one Firestore transaction.
       *
       * This prevents two users creating the same
       * Lead ID at the same time.
       */

      await runTransaction(db, async transaction => {
        const counterRef = doc(db, 'counters', 'leads')

        const counterSnapshot =
          await transaction.get(counterRef)

        let nextNumber = 1

        if (counterSnapshot.exists()) {
          const counterData = counterSnapshot.data()

          nextNumber =
            Number(counterData.nextNumber ?? 1)
        }

        const leadId = `L/${nextNumber}`

        /*
         * Create a new Firestore document reference.
         */
        const leadRef = doc(collection(db, 'leads'))

        /*
         * Create / update counter.
         *
         * The next lead will receive the next number.
         */
        transaction.set(
          counterRef,
          {
            nextNumber: nextNumber + 1,
          },
          {
            merge: true,
          },
        )

        /*
         * Save lead.
         */
        transaction.set(leadRef, {
          leadId,

          source,
          date,

          customer: {
            name: customerName.trim(),
            phoneNumber: phoneNumber.trim(),
            place: place.trim(),
          },

          branch,

          remarks: remarks.trim(),

          createdBy: {
            name: user.name,
            username: user.username,
          },

          createdAt: serverTimestamp(),

          status: 'Hold',

          updates: [],
        })
      })

      setMessage(
        'Lead saved successfully.',
      )
      setMessageType('success')

      resetForm()
    } catch (error) {
      console.error(
        'Error saving lead:',
        error,
      )

      setMessage(
        'Failed to save lead. Please try again.',
      )
      setMessageType('error')
    } finally {
      setSaving(false)
    }
  }

  /* =========================================
     RENDER
  ========================================= */

  return (
    <div className="department-page">
      <div className="department-container">

        {/* =====================================
            HEADER
        ====================================== */}

        <div className="department-header">
          <div>
            <h1>Leads</h1>

            <p>
              Enter and manage customer leads.
            </p>
          </div>

          <button
            type="button"
            className="view-button"
            onClick={() =>
              navigate(
                '/departments/leads-view',
              )
            }
          >
            View Leads
          </button>
        </div>

        {/* =====================================
            MESSAGE
        ====================================== */}

        {message && (
          <div
            className={
              messageType === 'success'
                ? 'success-message'
                : 'error-message'
            }
            style={{
              marginBottom: '20px',
            }}
          >
            {message}
          </div>
        )}

        {/* =====================================
            FORM
        ====================================== */}

        <form
          onSubmit={handleSubmit}
        >

          {/* ===================================
              LEAD INFORMATION
          ==================================== */}

          <section className="department-section">

            <div className="section-heading-row">
              <div>
                <h2>
                  1. Lead Information
                </h2>

                <p>
                  Enter the basic information
                  about the lead.
                </p>
              </div>
            </div>

            <div className="form-grid">

              {/* SOURCE */}

              <div className="input-group">
                <label htmlFor="leadSource">
                  Source of Lead
                </label>

                <select
                  id="leadSource"
                  value={source}
                  onChange={event =>
                    setSource(
                      event.target.value,
                    )
                  }
                >
                  <option value="">
                    Select source
                  </option>

                  {LEAD_SOURCES.map(
                    leadSource => (
                      <option
                        key={leadSource}
                        value={leadSource}
                      >
                        {leadSource}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* DATE */}

              <div className="input-group">
                <label htmlFor="leadDate">
                  Date
                </label>

                <input
                  id="leadDate"
                  type="date"
                  value={date}
                  onChange={event =>
                    setDate(
                      event.target.value,
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
                  value={customerName}
                  onChange={event =>
                    setCustomerName(
                      event.target.value,
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
                  value={phoneNumber}
                  onChange={event =>
                    setPhoneNumber(
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
                  onChange={event =>
                    setPlace(
                      event.target.value,
                    )
                  }
                />
              </div>

              {/* BRANCH */}

              <div className="input-group">
                <label htmlFor="branch">
                  Branch of Entry
                </label>

                <select
                  id="branch"
                  value={branch}
                  onChange={event =>
                    setBranch(
                      event.target.value as Branch,
                    )
                  }
                >
                  <option value="">
                    Select branch
                  </option>

                  {BRANCHES.map(
                    branchName => (
                      <option
                        key={branchName}
                        value={branchName}
                      >
                        {branchName}
                      </option>
                    ),
                  )}
                </select>
              </div>

              {/* REMARKS */}

              <div
                className="input-group"
                style={{
                  gridColumn:
                    '1 / -1',
                }}
              >
                <label htmlFor="remarks">
                  Remarks
                </label>

                <textarea
                  id="remarks"
                  rows={4}
                  placeholder="Enter remarks"
                  value={remarks}
                  onChange={event =>
                    setRemarks(
                      event.target.value,
                    )
                  }
                />
              </div>

            </div>
          </section>

          {/* ===================================
              ACTIONS
          ==================================== */}

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
                ? 'Saving...'
                : 'Save Lead'}
            </button>

          </div>

        </form>
      </div>
    </div>
  )
}

export default Leads