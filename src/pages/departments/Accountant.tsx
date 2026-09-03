import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../../firebase'
import './Department.css'

interface AccountantProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type PaymentStatus = 'Pending' | 'Advance Received' | 'Post Pay' | 'Paid'

interface JobItem {
  slNo?: number
  name?: string
  width?: string | number
  height?: string | number
  qty?: string | number
  price?: string | number
  amount?: string | number
  accountantAmount?: string | number
  remarks?: string
  [key: string]: unknown
}

interface JobOrder {
  id: string
  source: 'job_order' | 'measurement'
  orderId: string
  date: string
  expectedDeliveryDate: string
  branch: string
  customer: {
    name?: string
    companyName?: string
    phoneNumber?: string
    whatsappNumber?: string
    place?: string
  }
  items: JobItem[]
  customerAdviser?: { name?: string; username?: string }
  accountant?: { name?: string; username?: string }
  accounting?: {
    totalAmount?: number
    amountReceivedInAdvance?: number
    advanceStatus?: string
    postPayAmount?: number
    postPayStatus?: string
    paymentStatus?: PaymentStatus | string
    advanceReceivedAt?: Timestamp
    postPayAt?: Timestamp
    updatedAt?: Timestamp
    updatedBy?: { name?: string; username?: string }
  }
  [key: string]: unknown
}

const num = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const money = (value: unknown) =>
  num(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

const str = (value: unknown) =>
  value === undefined || value === null ? '' : String(value)

const clean = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.filter(v => v !== undefined).map(clean)
  if (value && typeof value === 'object' && !(value instanceof Timestamp)) {
    const out: Record<string, unknown> = {}
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      if (v !== undefined) out[k] = clean(v)
    })
    return out
  }
  return value
}

const normalize = (
  source: 'job_order' | 'measurement',
  id: string,
  data: Record<string, any>,
): JobOrder => ({
  ...data,
  id,
  source,
  orderId: str(data.orderId ?? data.measurementId ?? id),
  date: str(data.date),
  expectedDeliveryDate: str(data.expectedDeliveryDate ?? data.deliveryDate),
  branch: str(data.branch ?? data.selectedBranch),
  customer: data.customer || {},
  items: Array.isArray(data.items)
    ? data.items.map((item: JobItem, i: number) => ({
        ...item,
        slNo: item.slNo ?? i + 1,
      }))
    : [],
  customerAdviser: data.customerAdviser || {},
  accountant: data.accountant,
  accounting: data.accounting || {},
})

const itemAmount = (item: JobItem) =>
  num(item.accountantAmount ?? item.amount ?? item.price ?? 0)

function Accountant({ user }: AccountantProps) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState<JobOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<'my' | 'all'>('my')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'' | PaymentStatus>('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [accepting, setAccepting] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Record<number, string>>>({})
  const [advanceJob, setAdvanceJob] = useState<JobOrder | null>(null)
  const [advanceInput, setAdvanceInput] = useState('')
  const [postJob, setPostJob] = useState<JobOrder | null>(null)
  const [postInput, setPostInput] = useState('')

  useEffect(() => {
    const unsubs: Array<() => void> = []

    const listen = (
      collectionName: 'job_orders' | 'measurements',
      source: 'job_order' | 'measurement',
    ) => {
      const unsub = onSnapshot(
        query(collection(db, collectionName)),
        snapshot => {
          const incoming = snapshot.docs.map(d =>
            normalize(source, d.id, d.data()),
          )
          setJobs(current => [
            ...current.filter(j => j.source !== source),
            ...incoming,
          ])
          setLoading(false)
        },
        err => {
          console.error(err)
          setError(`Unable to load ${collectionName}.`)
          setLoading(false)
        },
      )
      unsubs.push(unsub)
    }

    listen('job_orders', 'job_order')
    listen('measurements', 'measurement')
    return () => unsubs.forEach(u => u())
  }, [])

  const username = user?.username?.trim().toLowerCase() || ''

  const mine = (job: JobOrder) =>
    username !== '' &&
    str(job.accountant?.username).trim().toLowerCase() === username

  const started = (job: JobOrder) =>
    Boolean(
      job.accountant?.username ||
        job.accounting?.advanceStatus ||
        job.accounting?.postPayStatus,
    )

  const total = (job: JobOrder) =>
    job.items.reduce((sum, item) => sum + itemAmount(item), 0)

  const advance = (job: JobOrder) =>
    num(job.accounting?.amountReceivedInAdvance)

  const postPay = (job: JobOrder) =>
    num(job.accounting?.postPayAmount)

  const balance = (job: JobOrder) =>
    Math.max(0, total(job) - advance(job) - postPay(job))

  const status = (job: JobOrder): PaymentStatus => {
    if (job.accounting?.paymentStatus === 'Paid') return 'Paid'
    if (job.accounting?.paymentStatus === 'Post Pay') return 'Post Pay'
    if (
      job.accounting?.paymentStatus === 'Advance Received' ||
      job.accounting?.advanceStatus === 'Advance Received'
    ) {
      return 'Advance Received'
    }
    return 'Pending'
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()

    return jobs
      .filter(job => {
        if (view === 'my' && !mine(job)) return false
        if (view === 'all' && !mine(job) && started(job)) return false
        if (filter && status(job) !== filter) return false
        if (!term) return true

        const text = [
          job.orderId,
          job.date,
          job.expectedDeliveryDate,
          job.branch,
          job.customer?.name,
          job.customer?.companyName,
          job.customer?.phoneNumber,
          job.customer?.whatsappNumber,
          job.customer?.place,
          job.customerAdviser?.name,
          ...job.items.flatMap(item => [
            item.name,
            item.width,
            item.height,
            item.qty,
          ]),
        ]
          .map(str)
          .join(' ')
          .toLowerCase()

        return text.includes(term)
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [jobs, view, search, filter, username])

  const collectionFor = (job: JobOrder) =>
    job.source === 'job_order' ? 'job_orders' : 'measurements'

  const acceptWork = async (job: JobOrder) => {
    if (!user?.username) {
      setError('Accountant login information is missing.')
      return
    }

    setAccepting(job.id)
    try {
      await updateDoc(
        doc(db, collectionFor(job), job.id),
        clean({
          accountant: {
            name: user.name,
            username: user.username,
          },
          accounting: {
            ...(job.accounting || {}),
            paymentStatus: job.accounting?.paymentStatus || 'Pending',
            updatedAt: Timestamp.now(),
            updatedBy: {
              name: user.name,
              username: user.username,
            },
          },
          updatedAt: Timestamp.now(),
        }) as Record<string, unknown>,
      )
    } catch (err) {
      console.error(err)
      setError('Unable to accept work.')
    } finally {
      setAccepting(null)
    }
  }

  const updateAmount = (jobId: string, index: number, value: string) => {
    setDrafts(current => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || {}),
        [index]: value,
      },
    }))
  }

  const saveAmounts = async (job: JobOrder) => {
    const jobDrafts = drafts[job.id] || {}

    const items = job.items.map((item, index) => ({
      ...item,
      accountantAmount: num(
        jobDrafts[index] !== undefined
          ? jobDrafts[index]
          : item.accountantAmount ?? item.amount ?? item.price ?? 0,
      ),
    }))

    const newTotal = items.reduce(
      (sum, item) => sum + num(item.accountantAmount),
      0,
    )

    setSaving(job.id)
    try {
      await updateDoc(
        doc(db, collectionFor(job), job.id),
        clean({
          items,
          accounting: {
            ...(job.accounting || {}),
            totalAmount: newTotal,
            updatedAt: Timestamp.now(),
            updatedBy: user
              ? { name: user.name, username: user.username }
              : undefined,
          },
          updatedAt: Timestamp.now(),
        }) as Record<string, unknown>,
      )

      setDrafts(current => {
        const next = { ...current }
        delete next[job.id]
        return next
      })
      setError('')
    } catch (err) {
      console.error(err)
      setError('Unable to save amounts.')
    } finally {
      setSaving(null)
    }
  }

  const saveAdvance = async () => {
    if (!advanceJob) return
    const amount = num(advanceInput)
    const jobTotal = total(advanceJob)

    if (amount <= 0) {
      setError('Enter a valid advance amount.')
      return
    }

    if (amount > jobTotal) {
      setError('Advance cannot be greater than the total amount.')
      return
    }

    setSaving(advanceJob.id)
    try {
      await updateDoc(
        doc(db, collectionFor(advanceJob), advanceJob.id),
        clean({
          accounting: {
            ...(advanceJob.accounting || {}),
            totalAmount: jobTotal,
            amountReceivedInAdvance: amount,
            advanceStatus: 'Advance Received',
            paymentStatus: 'Advance Received',
            advanceReceivedAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: user
              ? { name: user.name, username: user.username }
              : undefined,
          },
          updatedAt: Timestamp.now(),
        }) as Record<string, unknown>,
      )

      setAdvanceJob(null)
      setAdvanceInput('')
      setError('')
    } catch (err) {
      console.error(err)
      setError('Unable to save advance amount.')
    } finally {
      setSaving(null)
    }
  }

  const savePostPay = async () => {
    if (!postJob) return

    const amount = num(postInput)
    const remaining = balance(postJob)

    if (amount <= 0) {
      setError('Enter a valid Post Pay amount.')
      return
    }

    if (amount > remaining) {
      setError('Post Pay cannot be greater than the remaining balance.')
      return
    }

    setSaving(postJob.id)
    try {
      const newPostPay = postPay(postJob) + amount
      const newBalance = Math.max(
        0,
        total(postJob) - advance(postJob) - newPostPay,
      )

      await updateDoc(
        doc(db, collectionFor(postJob), postJob.id),
        clean({
          accounting: {
            ...(postJob.accounting || {}),
            totalAmount:
              postJob.accounting?.totalAmount ?? total(postJob),
            postPayAmount: newPostPay,
            postPayStatus: 'Post Pay',
            paymentStatus: newBalance === 0 ? 'Paid' : 'Post Pay',
            postPayAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
            updatedBy: user
              ? { name: user.name, username: user.username }
              : undefined,
          },
          updatedAt: Timestamp.now(),
        }) as Record<string, unknown>,
      )

      setPostJob(null)
      setPostInput('')
      setError('')
    } catch (err) {
      console.error(err)
      setError('Unable to save Post Pay.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div
      className="accountant-page"
      style={{
        minHeight: '100vh',
        padding: '24px',
        background: '#f5f7fb',
        boxSizing: 'border-box',
      }}
    >
      <div className="accountant-container" style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div
          className="accountant-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <h1 style={{ margin: 0 }}>Accountant</h1>
            <p style={{ margin: '6px 0 0', color: '#666' }}>
              Manage item amounts, advance payments and Post Pay.
            </p>
          </div>

          <button className="accountant-back-button" type="button" onClick={() => navigate('/departments')}>
            Back
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#ffe7e7',
              border: '1px solid #ffb5b5',
              padding: 12,
              borderRadius: 8,
              marginBottom: 18,
              color: '#9b1c1c',
            }}
          >
            {error}
            <button
              type="button"
              onClick={() => setError('')}
              style={{ float: 'right' }}
            >
              ×
            </button>
          </div>
        )}

        <div
          className="accountant-toolbar"
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 20,
          }}
        >
          <button
            className={view === 'my' ? 'accountant-tab active' : 'accountant-tab'}
            type="button"
            onClick={() => setView('my')}
            style={{ fontWeight: view === 'my' ? 700 : 400 }}
          >
            My Work
          </button>

          <button
            className={view === 'all' ? 'accountant-tab active' : 'accountant-tab'}
            type="button"
            onClick={() => setView('all')}
            style={{ fontWeight: view === 'all' ? 700 : 400 }}
          >
            Show All Work
          </button>

          <input
            className="accountant-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search job, customer or item..."
            style={{
              flex: 1,
              minWidth: 240,
              padding: '10px 12px',
              border: '1px solid #ccc',
              borderRadius: 7,
            }}
          />

          <select
            className="accountant-filter"
            value={filter}
            onChange={e =>
              setFilter(e.target.value as '' | PaymentStatus)
            }
            style={{ padding: '10px 12px', borderRadius: 7 }}
          >
            <option value="">All Payment Status</option>
            <option value="Pending">Pending</option>
            <option value="Advance Received">Advance Received</option>
            <option value="Post Pay">Post Pay</option>
            <option value="Paid">Paid</option>
          </select>
        </div>

        {loading ? (
          <div className="accountant-loading">Loading accountant work...</div>
        ) : filtered.length === 0 ? (
          <div
            className="accountant-empty"
            style={{
              background: '#fff',
              padding: 30,
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            No accountant work available.
          </div>
        ) : (
          <div className="accountant-jobs" style={{ display: 'grid', gap: 16 }}>
            {filtered.map(job => {
              const key = `${job.source}-${job.id}`
              const isOpen = expanded === key
              const isMine = mine(job)
              const jobTotal = total(job)
              const jobAdvance = advance(job)
              const jobPostPay = postPay(job)
              const jobBalance = balance(job)
              const jobStatus = status(job)
              const jobDrafts = drafts[job.id] || {}

              return (
                <div
                  key={key}
                  className="accountant-job-card"
                  style={{
                    background: '#fff',
                    borderRadius: 12,
                    padding: 20,
                    boxShadow: '0 2px 10px rgba(0,0,0,.07)',
                  }}
                >
                  <div
                    className="accountant-job-header"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 16,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div>
                      <h2 style={{ margin: 0 }}>Job #{job.orderId}</h2>
                      <div style={{ marginTop: 5 }}>
                        {job.customer?.name || 'Customer'}
                        {job.customer?.companyName
                          ? ` • ${job.customer.companyName}`
                          : ''}
                      </div>
                    </div>

                    <strong>{jobStatus}</strong>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fit,minmax(160px,1fr))',
                      gap: 12,
                      margin: '18px 0',
                    }}
                  >
                    <div>
                      <small>Entry Date</small>
                      <div>{job.date || '-'}</div>
                    </div>
                    <div>
                      <small>Delivery Date</small>
                      <div>{job.expectedDeliveryDate || '-'}</div>
                    </div>
                    <div>
                      <small>Branch</small>
                      <div>{job.branch || '-'}</div>
                    </div>
                    <div>
                      <small>Customer Adviser</small>
                      <div>{job.customerAdviser?.name || '-'}</div>
                    </div>
                  </div>

                  <div
                    className="accountant-actions"
                    style={{
                      display: 'flex',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    {view === 'all' &&
                      !isMine &&
                      !started(job) && (
                        <button
                          type="button"
                          disabled={accepting === job.id}
                          onClick={() => acceptWork(job)}
                        >
                          {accepting === job.id
                            ? 'Accepting...'
                            : 'Accept Work'}
                        </button>
                      )}

                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : key)}
                    >
                      {isOpen ? 'Hide Details' : 'View Details'}
                    </button>

                    {isMine && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setAdvanceJob(job)
                            setAdvanceInput(
                              str(
                                job.accounting?.amountReceivedInAdvance ??
                                  '',
                              ),
                            )
                          }}
                        >
                          Amount Received in Advance
                        </button>

                        <button
                          type="button"
                          disabled={jobBalance <= 0 || jobStatus === 'Paid'}
                          onClick={() => {
                            setPostJob(job)
                            setPostInput('')
                          }}
                        >
                          Post Pay
                        </button>
                      </>
                    )}
                  </div>

                  {isOpen && (
                    <div style={{ marginTop: 22 }}>
                      <div
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit,minmax(180px,1fr))',
                          gap: 12,
                          marginBottom: 20,
                        }}
                      >
                        <div>
                          <strong>Customer</strong>
                          <div>{job.customer?.name || '-'}</div>
                        </div>
                        <div>
                          <strong>Phone</strong>
                          <div>{job.customer?.phoneNumber || '-'}</div>
                        </div>
                        <div>
                          <strong>WhatsApp</strong>
                          <div>{job.customer?.whatsappNumber || '-'}</div>
                        </div>
                        <div>
                          <strong>Place</strong>
                          <div>{job.customer?.place || '-'}</div>
                        </div>
                      </div>

                      <h3 className="accountant-subheading">Item Amounts</h3>

                      <div className="accountant-table-wrap" style={{ overflowX: 'auto' }}>
                        <table
                          className="accountant-items-table"
                          style={{
                            width: '100%',
                            borderCollapse: 'collapse',
                            minWidth: 760,
                          }}
                        >
                          <thead>
                            <tr>
                              {[
                                'Sl No',
                                'Item',
                                'Size',
                                'Quantity',
                                'Existing Price',
                                'Amount',
                              ].map(title => (
                                <th
                                  key={title}
                                  style={{
                                    border: '1px solid #ddd',
                                    padding: 10,
                                    textAlign: 'left',
                                  }}
                                >
                                  {title}
                                </th>
                              ))}
                            </tr>
                          </thead>

                          <tbody>
                            {job.items.map((item, index) => {
                              const value =
                                jobDrafts[index] !== undefined
                                  ? jobDrafts[index]
                                  : str(
                                      item.accountantAmount ??
                                        item.amount ??
                                        item.price ??
                                        '',
                                    )

                              return (
                                <tr key={`${job.id}-${index}`}>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    {item.slNo ?? index + 1}
                                  </td>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    {item.name || '-'}
                                  </td>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    {item.width || '-'} × {item.height || '-'}
                                  </td>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    {item.qty || '-'}
                                  </td>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    ₹{money(item.price)}
                                  </td>
                                  <td style={{ border: '1px solid #ddd', padding: 10 }}>
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      disabled={!isMine}
                                      value={value}
                                      onChange={e =>
                                        updateAmount(
                                          job.id,
                                          index,
                                          e.target.value,
                                        )
                                      }
                                      placeholder="Enter amount"
                                      style={{
                                        width: '140px',
                                        padding: 8,
                                      }}
                                    />
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>

                          <tfoot>
                            <tr>
                              <th
                                colSpan={5}
                                style={{
                                  border: '1px solid #ddd',
                                  padding: 12,
                                  textAlign: 'right',
                                }}
                              >
                                Total Amount
                              </th>
                              <th
                                style={{
                                  border: '1px solid #ddd',
                                  padding: 12,
                                  textAlign: 'left',
                                }}
                              >
                                ₹{money(jobTotal)}
                              </th>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {isMine && (
                        <button
                          type="button"
                          disabled={saving === job.id}
                          onClick={() => saveAmounts(job)}
                          style={{ marginTop: 12 }}
                        >
                          {saving === job.id ? 'Saving...' : 'Save Amounts'}
                        </button>
                      )}

                      <div
                        className="accountant-summary-grid"
                        style={{
                          display: 'grid',
                          gridTemplateColumns:
                            'repeat(auto-fit,minmax(180px,1fr))',
                          gap: 12,
                          marginTop: 20,
                        }}
                      >
                        <div>
                          <strong>Total Amount</strong>
                          <div>₹{money(jobTotal)}</div>
                        </div>
                        <div>
                          <strong>Advance Received</strong>
                          <div>₹{money(jobAdvance)}</div>
                        </div>
                        <div>
                          <strong>Post Pay</strong>
                          <div>₹{money(jobPostPay)}</div>
                        </div>
                        <div>
                          <strong>Balance</strong>
                          <div>₹{money(jobBalance)}</div>
                        </div>
                        <div>
                          <strong>Payment Status</strong>
                          <div>{jobStatus}</div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {advanceJob && (
          <div
            onClick={() => setAdvanceJob(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              zIndex: 1000,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff',
                padding: 24,
                borderRadius: 12,
                width: 'min(480px,95vw)',
              }}
            >
              <h2>Amount Received in Advance</h2>
              <p>
                Job: <strong>{advanceJob.orderId}</strong>
              </p>
              <p>Total: ₹{money(total(advanceJob))}</p>

              <label>Amount</label>
              <input
                autoFocus
                type="number"
                min="0"
                step="0.01"
                value={advanceInput}
                onChange={e => setAdvanceInput(e.target.value)}
                placeholder="Enter advance amount"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 10,
                  marginTop: 6,
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button type="button" onClick={() => setAdvanceJob(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving === advanceJob.id}
                  onClick={saveAdvance}
                >
                  {saving === advanceJob.id
                    ? 'Saving...'
                    : 'Save Advance'}
                </button>
              </div>
            </div>
          </div>
        )}

        {postJob && (
          <div
            onClick={() => setPostJob(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 20,
              zIndex: 1000,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: '#fff',
                padding: 24,
                borderRadius: 12,
                width: 'min(480px,95vw)',
              }}
            >
              <h2>Post Pay</h2>
              <p>
                Job: <strong>{postJob.orderId}</strong>
              </p>
              <p>Remaining Balance: ₹{money(balance(postJob))}</p>

              <label>Post Pay Amount</label>
              <input
                autoFocus
                type="number"
                min="0"
                step="0.01"
                value={postInput}
                onChange={e => setPostInput(e.target.value)}
                placeholder="Enter payment amount"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: 10,
                  marginTop: 6,
                }}
              />

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 10,
                  marginTop: 20,
                }}
              >
                <button type="button" onClick={() => setPostJob(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving === postJob.id}
                  onClick={savePostPay}
                >
                  {saving === postJob.id ? 'Saving...' : 'Save Post Pay'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Accountant
