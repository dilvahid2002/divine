
import { useEffect, useMemo, useState } from 'react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  addDoc,
  where,
  getDocs,
} from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import { db } from '../../firebase'
import './Department.css'

interface LeadsViewProps {
  user?: {
    name: string
    username: string
    roles: string[]
  }
}

type LeadStatus =
  | 'Hold'
  | 'Measurement Schedule'
  | 'Job Order'
  | 'Measurement'
  | 'Dropped Work'

type UpdateMode =
  | 'Call'
  | 'Site Visit'
  | 'Office Visit'

interface LeadUpdate {
  mode: UpdateMode
  nextUpdateDate: string
  remark: string
  updatedAt?: Timestamp
  updatedBy?: {
    name: string
    username: string
  }
}

interface Lead {
  id: string
  leadId?: string

  source: string
  date: string

  customer: {
    name: string
    phoneNumber: string
    place: string
  }

  branch: string

  createdBy: {
    name: string
    username: string
  }

  createdAt?: Timestamp

  status: LeadStatus

  updates: LeadUpdate[]
}

const STATUSES: LeadStatus[] = [
  'Hold',
  'Measurement Schedule',
  'Job Order',
  'Measurement',
  'Dropped Work',
]

const MODES: UpdateMode[] = [
  'Call',
  'Site Visit',
  'Office Visit',
]

const SOURCES = [
  'Just Dial',
  'Google',
  'Site',
  'Work',
  'MD',
  'Staff',
  'Walk-in Customer',
]

const BRANCHES = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

const getTimestampDateString = (
  timestamp?: Timestamp,
) => {
  if (!timestamp || !timestamp.toDate) {
    return ''
  }

  const date = timestamp.toDate()

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

const getTodayString = () => {
  const today = new Date()

  return `${today.getFullYear()}-${String(
    today.getMonth() + 1,
  ).padStart(2, '0')}-${String(
    today.getDate(),
  ).padStart(2, '0')}`
}

const normalizeLead = (
  id: string,
  data: any,
): Lead => {
  return {
    id,

    leadId:
      typeof data.leadId === 'string'
        ? data.leadId
        : undefined,

    source: data.source ?? '',

    date: data.date ?? '',

    customer: {
      name: data.customer?.name ?? '',
      phoneNumber:
        data.customer?.phoneNumber ?? '',
      place: data.customer?.place ?? '',
    },

    branch: data.branch ?? '',

    createdBy: {
      name: data.createdBy?.name ?? '',
      username:
        data.createdBy?.username ?? '',
    },

    createdAt: data.createdAt,

    status: (
      STATUSES.includes(data.status)
        ? data.status
        : 'Hold'
    ) as LeadStatus,

    updates: Array.isArray(data.updates)
      ? data.updates
      : [],
  }
}

function EditIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  )
}

function LeadsView({
  user,
}: LeadsViewProps) {

  const navigate = useNavigate()

  const currentUser =
    user ?? {
      name: '',
      username: '',
      roles: [],
    }

  const [leads, setLeads] =
    useState<Lead[]>([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [advisorFilter, setAdvisorFilter] =
    useState('all')

  const [dateFilter, setDateFilter] =
    useState('')

  const [createdDateFilter, setCreatedDateFilter] =
    useState('')

  const [nextUpdateDateFilter, setNextUpdateDateFilter] =
    useState('')

  const [statusFilter, setStatusFilter] =
    useState<'all' | LeadStatus>('all')

  const [sourceFilter, setSourceFilter] =
    useState('all')

  const [branchFilter, setBranchFilter] =
    useState('all')

  const [expandedLead, setExpandedLead] =
    useState<string | null>(null)

  const [addingUpdate, setAddingUpdate] =
    useState<string | null>(null)

  const [savingUpdate, setSavingUpdate] =
    useState<string | null>(null)

  const [updateMode, setUpdateMode] =
    useState<UpdateMode>('Call')

  const [nextUpdateDate, setNextUpdateDate] =
    useState(getTodayString())

  const [remark, setRemark] =
    useState('')

  const [savingStatus, setSavingStatus] =
    useState<string | null>(null)

  const [selectedStatus, setSelectedStatus] =
    useState<Record<string, LeadStatus>>({})

  const [editingLead, setEditingLead] =
    useState<Lead | null>(null)

  const [savingEdit, setSavingEdit] =
    useState(false)

  const [editSource, setEditSource] =
    useState('')

  const [editDate, setEditDate] =
    useState('')

  const [editCustomerName, setEditCustomerName] =
    useState('')

  const [editPhoneNumber, setEditPhoneNumber] =
    useState('')

  const [editPlace, setEditPlace] =
    useState('')

  const [editBranch, setEditBranch] =
    useState('')

  const [deletingLead, setDeletingLead] =
    useState<string | null>(null)

  /*
   * Load leads
   */
  useEffect(() => {

    const leadsQuery = query(
      collection(db, 'leads'),
      orderBy('createdAt', 'desc'),
    )

    return onSnapshot(
      leadsQuery,
      snapshot => {

        const loadedLeads =
          snapshot.docs.map(item =>
            normalizeLead(
              item.id,
              item.data(),
            ),
          )

        setLeads(loadedLeads)
        setLoading(false)
        setError('')
      },
      firebaseError => {

        console.error(
          'Error fetching leads:',
          firebaseError,
        )

        setError(
          'Unable to load leads.',
        )

        setLoading(false)
      },
    )

  }, [])

  const advisors = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map(
              lead =>
                lead.createdBy.name,
            )
            .filter(Boolean),
        ),
      ).sort(),
    [leads],
  )

  const sources = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map(lead => lead.source)
            .filter(Boolean),
        ),
      ).sort(),
    [leads],
  )

  const branches = useMemo(
    () =>
      Array.from(
        new Set(
          leads
            .map(lead => lead.branch)
            .filter(Boolean),
        ),
      ).sort(),
    [leads],
  )

  const filteredLeads = useMemo(() => {

    const searchText =
      search.trim().toLowerCase()

    return leads.filter(lead => {

      if (
        advisorFilter !== 'all' &&
        lead.createdBy.name !==
          advisorFilter
      ) {
        return false
      }

      if (
        dateFilter &&
        lead.date !== dateFilter
      ) {
        return false
      }

      if (
        createdDateFilter &&
        getTimestampDateString(
          lead.createdAt,
        ) !== createdDateFilter
      ) {
        return false
      }

      if (nextUpdateDateFilter) {
        const latestUpdate =
          lead.updates.length > 0
            ? lead.updates[lead.updates.length - 1]
            : undefined

        if (
          latestUpdate?.nextUpdateDate !==
          nextUpdateDateFilter
        ) {
          return false
        }
      }

      if (
        statusFilter !== 'all' &&
        lead.status !== statusFilter
      ) {
        return false
      }

      if (
        sourceFilter !== 'all' &&
        lead.source !== sourceFilter
      ) {
        return false
      }

      if (
        branchFilter !== 'all' &&
        lead.branch !== branchFilter
      ) {
        return false
      }

      if (searchText) {

        const searchableText =
          [
            lead.leadId,
            lead.id,
            lead.source,
            lead.date,
            lead.customer.name,
            lead.customer.phoneNumber,
            lead.customer.place,
            lead.branch,
            lead.createdBy.name,
            lead.createdBy.username,
            lead.status,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()

        if (
          !searchableText.includes(
            searchText,
          )
        ) {
          return false
        }
      }

      return true
    })

  }, [
    leads,
    search,
    advisorFilter,
    dateFilter,
    createdDateFilter,
    nextUpdateDateFilter,
    statusFilter,
    sourceFilter,
    branchFilter,
  ])

  const counts = useMemo(
    () => ({
      all: leads.length,

      hold: leads.filter(
        lead =>
          lead.status === 'Hold',
      ).length,

      schedule: leads.filter(
        lead =>
          lead.status ===
          'Measurement Schedule',
      ).length,

      jobOrder: leads.filter(
        lead =>
          lead.status === 'Job Order',
      ).length,

      measurement: leads.filter(
        lead =>
          lead.status === 'Measurement',
      ).length,

      dropped: leads.filter(
        lead =>
          lead.status ===
          'Dropped Work',
      ).length,
    }),
    [leads],
  )

  const formatTimestamp = (
    timestamp?: Timestamp,
  ) => {

    if (
      !timestamp ||
      !timestamp.toDate
    ) {
      return '-'
    }

    return timestamp
      .toDate()
      .toLocaleString()
  }

  const openUpdateForm = (
    lead: Lead,
  ) => {

    setExpandedLead(lead.id)
    setAddingUpdate(lead.id)
    setUpdateMode('Call')
    setNextUpdateDate(
      getTodayString(),
    )
    setRemark('')
  }

  const saveUpdate = async (
    lead: Lead,
  ) => {

    if (!nextUpdateDate) {
      alert(
        'Please select the next update date.',
      )
      return
    }

    if (!remark.trim()) {
      alert(
        'Please enter a remark.',
      )
      return
    }

    setSavingUpdate(lead.id)

    try {

      const newUpdate: LeadUpdate = {

        mode: updateMode,

        nextUpdateDate,

        remark:
          remark.trim(),

        updatedAt:
          Timestamp.now(),

        updatedBy: {
          name:
            currentUser.name,

          username:
            currentUser.username,
        },
      }

      await updateDoc(
        doc(
          db,
          'leads',
          lead.id,
        ),
        {
          updates: [
            ...lead.updates,
            newUpdate,
          ],

          updatedAt:
            Timestamp.now(),

          updatedBy: {
            name:
              currentUser.name,

            username:
              currentUser.username,
          },
        },
      )

      setAddingUpdate(null)
      setRemark('')

    } catch (firebaseError) {

      console.error(
        'Error saving lead update:',
        firebaseError,
      )

      alert(
        'Unable to save the lead update.',
      )

    } finally {

      setSavingUpdate(null)
    }
  }

  const openEditForm = (
    lead: Lead,
  ) => {

    setEditingLead(lead)

    setEditSource(
      lead.source,
    )

    setEditDate(
      lead.date,
    )

    setEditCustomerName(
      lead.customer.name,
    )

    setEditPhoneNumber(
      lead.customer.phoneNumber,
    )

    setEditPlace(
      lead.customer.place,
    )

    setEditBranch(
      lead.branch,
    )
  }

  const cancelEdit = () => {

    if (savingEdit) {
      return
    }

    setEditingLead(null)
  }

  const saveEdit = async () => {

    if (!editingLead) {
      return
    }

    if (!editCustomerName.trim()) {
      alert(
        'Please enter the customer name.',
      )
      return
    }

    if (!editPhoneNumber.trim()) {
      alert(
        'Please enter the phone number.',
      )
      return
    }

    if (!editDate) {
      alert(
        'Please select the date.',
      )
      return
    }

    setSavingEdit(true)

    try {

      await updateDoc(
        doc(
          db,
          'leads',
          editingLead.id,
        ),
        {
          source:
            editSource.trim(),

          date:
            editDate,

          customer: {
            name:
              editCustomerName.trim(),

            phoneNumber:
              editPhoneNumber.trim(),

            place:
              editPlace.trim(),
          },

          branch:
            editBranch,

          editedAt:
            Timestamp.now(),

          editedBy: {
            name:
              currentUser.name,

            username:
              currentUser.username,
          },
        },
      )

      setEditingLead(null)

    } catch (firebaseError) {

      console.error(
        'Error editing lead:',
        firebaseError,
      )

      alert(
        'Unable to save the lead changes.',
      )

    } finally {

      setSavingEdit(false)
    }
  }

  const deleteLead = async (
    lead: Lead,
  ) => {

    const displayId =
      lead.leadId ||
      lead.id

    const confirmed =
      window.confirm(
        `Are you sure you want to delete lead ${displayId}?\n\nThis action cannot be undone.`,
      )

    if (!confirmed) {
      return
    }

    setDeletingLead(lead.id)

    try {

      await deleteDoc(
        doc(
          db,
          'leads',
          lead.id,
        ),
      )

      if (
        expandedLead === lead.id
      ) {
        setExpandedLead(null)
      }

    } catch (firebaseError) {

      console.error(
        'Error deleting lead:',
        firebaseError,
      )

      alert(
        'Unable to delete the lead.',
      )

    } finally {

      setDeletingLead(null)
    }
  }


  /*
   * ========================================================
   * CREATE MEASUREMENT SCHEDULE
   * ========================================================
   *
   * This creates a completely separate document in:
   *
   * measurementSchedules/{newDocumentId}
   *
   * The original lead remains in the leads collection.
   */
  const createMeasurementSchedule = async (
    lead: Lead,
  ) => {

    /*
     * Check whether this lead already has
     * a measurement schedule.
     *
     * This prevents duplicate schedules if
     * the user clicks Send to Measurement twice.
     */
    const existingScheduleQuery =
      query(
        collection(
          db,
          'measurementSchedules',
        ),
        where(
          'leadId',
          '==',
          lead.id,
        ),
      )

    const existingSnapshot =
      await getDocs(
        existingScheduleQuery,
      )

    if (
      !existingSnapshot.empty
    ) {

      return existingSnapshot
        .docs[0].id
    }


    /*
     * Create new schedule.
     */
    const scheduleRef =
      await addDoc(
        collection(
          db,
          'measurementSchedules',
        ),
        {

          leadId:
            lead.leadId ||
            lead.id,

          leadDocumentId:
            lead.id,

          customerName:
            lead.customer.name,

          phoneNumber:
            lead.customer.phoneNumber,

          place:
            lead.customer.place,

          branch:
            lead.branch,

          source:
            lead.source,

          leadDate:
            lead.date,

          createdAt:
            Timestamp.now(),

          createdBy: {
            name:
              currentUser.name,

            username:
              currentUser.username,
          },

          status:
            'Scheduled',

          /*
           * Empty until a measurement
           * date/time is assigned.
           */
          measurementDate:
            '',

          measurementTime:
            '',

          assignedTo:
            '',

          remarks:
            '',

        },
      )

    return scheduleRef.id
  }


  /*
   * ========================================================
   * NAVIGATE TO DEPARTMENT
   * ========================================================
   */
  const navigateToDepartment = async (
    lead: Lead,
    status: LeadStatus,
  ) => {

    const navigationState = {

      leadId:
        lead.leadId ||
        lead.id,

      customerName:
        lead.customer.name,

      phoneNumber:
        lead.customer.phoneNumber,

      place:
        lead.customer.place,

      branch:
        lead.branch,
    }


    /*
     * JOB ORDER
     */
    if (
      status === 'Job Order'
    ) {

      navigate(
        '/departments/job-order',
        {
          state:
            navigationState,
        },
      )

      return
    }


    /*
     * MEASUREMENT
     *
     * Open the Measurement entry page and
     * carry the selected lead information with it.
     */
    if (
      status === 'Measurement'
    ) {

      navigate(
        '/departments/measurement',
        {
          state: navigationState,
        },
      )

      return
    }


    /*
     * MEASUREMENT SCHEDULE
     *
     * If the user explicitly chooses this
     * existing status, simply open the page.
     */
    if (
      status ===
      'Measurement Schedule'
    ) {

      navigate(
        '/departments/measurement-scheduler',
        {
          state:
            navigationState,
        },
      )
    }
  }


  /*
   * ========================================================
   * STATUS UPDATE
   * ========================================================
   */
  const handleStatusUpdate = async (
    lead: Lead,
  ) => {

    const nextStatus =
      selectedStatus[lead.id] ??
      lead.status

    /*
     * If status has not changed, still
     * allow navigation for department statuses.
     */
    if (
      nextStatus === lead.status
    ) {

      if (
        nextStatus === 'Job Order' ||
        nextStatus === 'Measurement' ||
        nextStatus ===
          'Measurement Schedule'
      ) {

        setSavingStatus(lead.id)

        try {

          await navigateToDepartment(
            lead,
            nextStatus,
          )

        } finally {

          setSavingStatus(null)
        }
      }

      return
    }


    setSavingStatus(lead.id)

    try {

      /*
       * First update the lead status.
       */
      await updateDoc(
        doc(
          db,
          'leads',
          lead.id,
        ),
        {

          status:
            nextStatus,

          statusUpdatedAt:
            Timestamp.now(),

          statusUpdatedBy: {
            name:
              currentUser.name,

            username:
              currentUser.username,
          },
        },
      )


      /*
       * Then perform the destination action.
       */
      if (
        nextStatus === 'Job Order' ||
        nextStatus === 'Measurement' ||
        nextStatus ===
          'Measurement Schedule'
      ) {

        await navigateToDepartment(
          lead,
          nextStatus,
        )
      }

    } catch (firebaseError) {

      console.error(
        'Error updating lead status:',
        firebaseError,
      )

      alert(
        'Unable to update the lead status.',
      )

    } finally {

      setSavingStatus(null)
    }
  }


  const clearFilters = () => {

    setSearch('')
    setAdvisorFilter('all')
    setDateFilter('')
    setCreatedDateFilter('')
    setNextUpdateDateFilter('')
    setStatusFilter('all')
    setSourceFilter('all')
    setBranchFilter('all')
  }


  return (

    <div className="department-page">

      <div className="department-container">

        <div className="department-header">

          <div>

            <h1>
              Leads
            </h1>

            <p>
              View, update and move
              customer leads through
              the sales process.
            </p>

          </div>

        </div>


        {error && (
          <div className="form-message">
            {error}
          </div>
        )}


        <div className="statistics-dashboard">

          {[
            [
              'All Leads',
              counts.all,
              'all',
            ],
            [
              'Hold',
              counts.hold,
              'Hold',
            ],
            [
              'Measurement Schedule',
              counts.schedule,
              'Measurement Schedule',
            ],
            [
              'Job Order',
              counts.jobOrder,
              'Job Order',
            ],
            [
              'Measurement',
              counts.measurement,
              'Measurement',
            ],
            [
              'Dropped Work',
              counts.dropped,
              'Dropped Work',
            ],
          ].map(
            ([
              label,
              value,
              status,
            ]) => (

              <button
                key={String(status)}
                type="button"
                className={
                  statusFilter === status
                    ? 'statistics-card selected'
                    : 'statistics-card'
                }
                onClick={() =>
                  setStatusFilter(
                    status as
                      | 'all'
                      | LeadStatus,
                  )
                }
              >

                <div className="statistics-card-label">
                  {label}
                </div>

                <div className="statistics-card-value">
                  {value}
                </div>

                <div className="statistics-card-help">
                  Lead records
                </div>

              </button>
            ),
          )}

        </div>


        <div
          className="statistics-filter-bar"
          style={{
            display: 'grid',
            gridTemplateColumns:
              'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '12px',
          }}
        >

          <div
            className="input-group"
            style={{
              gridColumn:
                '1 / -1',
            }}
          >

            <label>
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value,
                )
              }
              placeholder="Search lead ID, customer, phone, place, adviser..."
            />

          </div>


          <div className="input-group">

            <label>
              Adviser / Entry User
            </label>

            <select
              value={advisorFilter}
              onChange={event =>
                setAdvisorFilter(
                  event.target.value,
                )
              }
            >

              <option value="all">
                All Advisers
              </option>

              {advisors.map(
                advisor => (

                  <option
                    key={advisor}
                    value={advisor}
                  >
                    {advisor}
                  </option>

                ),
              )}

            </select>

          </div>


          <div className="input-group">

            <label>
              Lead Date
            </label>

            <input
              type="date"
              value={dateFilter}
              onChange={event =>
                setDateFilter(
                  event.target.value,
                )
              }
            />

          </div>


          <div className="input-group">

            <label>
              Created Date
            </label>

            <input
              type="date"
              value={createdDateFilter}
              onChange={event =>
                setCreatedDateFilter(
                  event.target.value,
                )
              }
            />

          </div>


          <div className="input-group">

            <label>
              Next Update Date
            </label>

            <input
              type="date"
              value={nextUpdateDateFilter}
              onChange={event =>
                setNextUpdateDateFilter(
                  event.target.value,
                )
              }
            />

          </div>


          <div className="input-group">

            <label>
              Status
            </label>

            <select
              value={statusFilter}
              onChange={event =>
                setStatusFilter(
                  event.target.value as
                    | 'all'
                    | LeadStatus,
                )
              }
            >

              <option value="all">
                All Statuses
              </option>

              {STATUSES.map(
                status => (

                  <option
                    key={status}
                    value={status}
                  >
                    {status}
                  </option>

                ),
              )}

            </select>

          </div>


          <div className="input-group">

            <label>
              Source
            </label>

            <select
              value={sourceFilter}
              onChange={event =>
                setSourceFilter(
                  event.target.value,
                )
              }
            >

              <option value="all">
                All Sources
              </option>

              {(sources.length > 0
                ? sources
                : SOURCES
              ).map(
                source => (

                  <option
                    key={source}
                    value={source}
                  >
                    {source}
                  </option>

                ),
              )}

            </select>

          </div>


          <div className="input-group">

            <label>
              Branch
            </label>

            <select
              value={branchFilter}
              onChange={event =>
                setBranchFilter(
                  event.target.value,
                )
              }
            >

              <option value="all">
                All Branches
              </option>

              {(branches.length > 0
                ? branches
                : BRANCHES
              ).map(
                branch => (

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

        </div>


        <div
          className="statistics-filter-bar"
          style={{
            display: 'flex',
            justifyContent:
              'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >

          <div>

            <strong>
              Showing:
            </strong>{' '}

            {filteredLeads.length}

            {' '}of{' '}

            {leads.length}

            {' '}leads

          </div>


          <button
            type="button"
            className="view-button"
            onClick={clearFilters}
          >
            Clear Filters
          </button>

        </div>


        <div className="department-section">

          <div className="section-heading-row">

            <div>

              <h2>
                Lead Records
              </h2>

              <p>
                All information currently
                entered for each lead.
              </p>

            </div>

          </div>


          {loading && (
            <div className="empty-items">
              Loading leads...
            </div>
          )}


          {!loading &&
            filteredLeads.length ===
              0 && (
              <div className="empty-items">

                <h3>
                  No Leads Found
                </h3>

                <p>
                  No leads match
                  the current filters.
                </p>

              </div>
            )}


          {!loading &&
            filteredLeads.length >
              0 && (

              <div className="statistics-orders-list">

                {filteredLeads.map(
                  lead => {

                    const isExpanded =
                      expandedLead ===
                      lead.id

                    const isAddingUpdate =
                      addingUpdate ===
                      lead.id

                    const currentStatus =
                      selectedStatus[
                        lead.id
                      ] ??
                      lead.status

                    const displayLeadId =
                      lead.leadId ||
                      lead.id

                    return (

                      <div
                        key={lead.id}
                        className="statistics-order-card"
                      >

                        <div
                          className="statistics-order-header"
                          style={{
                            display:
                              'flex',
                            justifyContent:
                              'space-between',
                            alignItems:
                              'flex-start',
                            gap:
                              '20px',
                          }}
                        >

                          <div
                            style={{
                              minWidth:
                                0,
                              flex:
                                1,
                            }}
                          >

                            <div
                              className="job-order-id"
                              style={{
                                fontSize:
                                  '15px',
                                fontWeight:
                                  700,
                                marginBottom:
                                  '5px',
                              }}
                            >
                              Lead ID: {displayLeadId}
                            </div>

                            <h3>
                              {lead.customer.name ||
                                'Unnamed Customer'}
                            </h3>

                            <p>
                              {lead.customer.phoneNumber ||
                                'No phone number'}
                            </p>

                          </div>


                          <div
                            style={{
                              display:
                                'flex',
                              flexDirection:
                                'column',
                              alignItems:
                                'flex-end',
                              gap:
                                '12px',
                              flexShrink:
                                0,
                            }}
                          >

                            <div
                              style={{
                                display:
                                  'flex',
                                alignItems:
                                  'center',
                                gap:
                                  '8px',
                                flexWrap:
                                  'wrap',
                                justifyContent:
                                  'flex-end',
                              }}
                            >

                              <button
                                type="button"
                                onClick={() =>
                                  openEditForm(
                                    lead,
                                  )
                                }
                                disabled={
                                  savingEdit
                                }
                                style={{
                                  display:
                                    'inline-flex',
                                  alignItems:
                                    'center',
                                  justifyContent:
                                    'center',
                                  gap:
                                    '6px',
                                  padding:
                                    '8px 12px',
                                  border:
                                    '1px solid #bfdbfe',
                                  borderRadius:
                                    '7px',
                                  background:
                                    '#eff6ff',
                                  color:
                                    '#1d4ed8',
                                  cursor:
                                    'pointer',
                                  fontWeight:
                                    600,
                                  fontSize:
                                    '13px',
                                }}
                              >

                                <EditIcon />

                                <span>
                                  Edit
                                </span>

                              </button>


                              <button
                                type="button"
                                onClick={() =>
                                  deleteLead(
                                    lead,
                                  )
                                }
                                disabled={
                                  deletingLead ===
                                  lead.id
                                }
                                style={{
                                  display:
                                    'inline-flex',
                                  alignItems:
                                    'center',
                                  justifyContent:
                                    'center',
                                  gap:
                                    '6px',
                                  padding:
                                    '8px 12px',
                                  border:
                                    '1px solid #fecaca',
                                  borderRadius:
                                    '7px',
                                  background:
                                    '#fef2f2',
                                  color:
                                    '#dc2626',
                                  cursor:
                                    'pointer',
                                  fontWeight:
                                    600,
                                  fontSize:
                                    '13px',
                                  opacity:
                                    deletingLead ===
                                    lead.id
                                      ? 0.65
                                      : 1,
                                }}
                              >

                                <DeleteIcon />

                                <span>
                                  {deletingLead ===
                                  lead.id
                                    ? 'Deleting...'
                                    : 'Delete'}
                                </span>

                              </button>

                            </div>


                            <div className="statistics-order-meta">

                              <span>
                                Date:{' '}
                                {lead.date ||
                                  '-'}
                              </span>

                              <span>
                                Source:{' '}
                                {lead.source ||
                                  '-'}
                              </span>

                              <span>
                                Status:{' '}
                                {lead.status}
                              </span>

                            </div>

                          </div>

                        </div>


                        <div className="statistics-order-summary">

                          <div>
                            <strong>
                              Place
                            </strong>
                            <span>
                              {lead.customer.place ||
                                '-'}
                            </span>
                          </div>

                          <div>
                            <strong>
                              Branch
                            </strong>
                            <span>
                              {lead.branch ||
                                '-'}
                            </span>
                          </div>

                          <div>
                            <strong>
                              Adviser
                            </strong>
                            <span>
                              {lead.createdBy.name ||
                                '-'}
                            </span>
                          </div>

                          <div>
                            <strong>
                              Entered At
                            </strong>
                            <span>
                              {formatTimestamp(
                                lead.createdAt,
                              )}
                            </span>
                          </div>

                        </div>


                        <div className="statistics-order-actions">

                          <button
                            type="button"
                            className="view-button"
                            onClick={() =>
                              setExpandedLead(
                                isExpanded
                                  ? null
                                  : lead.id,
                              )
                            }
                          >
                            {isExpanded
                              ? 'Hide Details'
                              : 'View Details'}
                          </button>


                          <button
                            type="button"
                            className="add-item-button"
                            onClick={() =>
                              openUpdateForm(
                                lead,
                              )
                            }
                          >
                            Add Update
                          </button>

                        </div>


                        {isExpanded && (

                          <div className="statistics-order-details">

                            <h4>
                              Lead Details
                            </h4>

                            <div className="details-grid">

                              <div>
                                <strong>
                                  Lead ID
                                </strong>
                                <span>
                                  {displayLeadId}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Source
                                </strong>
                                <span>
                                  {lead.source ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Date
                                </strong>
                                <span>
                                  {lead.date ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Customer
                                </strong>
                                <span>
                                  {lead.customer.name ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Phone
                                </strong>
                                <span>
                                  {lead.customer.phoneNumber ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Place
                                </strong>
                                <span>
                                  {lead.customer.place ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Branch
                                </strong>
                                <span>
                                  {lead.branch ||
                                    '-'}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Status
                                </strong>
                                <span>
                                  {lead.status}
                                </span>
                              </div>

                              <div>
                                <strong>
                                  Entered By
                                </strong>
                                <span>
                                  {lead.createdBy.name ||
                                    '-'}
                                </span>
                              </div>

                            </div>


                            <h4
                              style={{
                                marginTop:
                                  '24px',
                              }}
                            >
                              Update History
                            </h4>


                            {lead.updates.length ===
                              0 ? (

                              <p>
                                No updates
                                added yet.
                              </p>

                            ) : (

                              <div className="details-grid">

                                {lead.updates.map(
                                  (
                                    update,
                                    index,
                                  ) => (

                                    <div
                                      key={`${lead.id}-update-${index}`}
                                    >

                                      <strong>
                                        {update.mode}
                                        {' '}•
                                        {' '}
                                        Next:{' '}
                                        {
                                          update.nextUpdateDate
                                        }
                                      </strong>

                                      <span>
                                        {
                                          update.remark
                                        }

                                        <br />

                                        By:{' '}
                                        {
                                          update.updatedBy
                                            ?.name ||
                                          '-'
                                        }

                                        {' '}•

                                        {' '}

                                        {
                                          formatTimestamp(
                                            update.updatedAt,
                                          )
                                        }
                                      </span>

                                    </div>

                                  ),
                                )}

                              </div>
                            )}


                            {isAddingUpdate && (

                              <div
                                style={{
                                  marginTop:
                                    '24px',
                                  padding:
                                    '18px',
                                  border:
                                    '1px solid #e2e8f0',
                                  borderRadius:
                                    '10px',
                                  background:
                                    '#f8fafc',
                                }}
                              >

                                <h4>
                                  Add Update
                                </h4>

                                <div className="form-grid">

                                  <div className="input-group">

                                    <label>
                                      Mode
                                    </label>

                                    <select
                                      value={
                                        updateMode
                                      }
                                      onChange={
                                        event =>
                                          setUpdateMode(
                                            event.target.value as UpdateMode,
                                          )
                                      }
                                    >

                                      {MODES.map(
                                        mode => (
                                          <option
                                            key={mode}
                                            value={mode}
                                          >
                                            {mode}
                                          </option>
                                        ),
                                      )}

                                    </select>

                                  </div>


                                  <div className="input-group">

                                    <label>
                                      Next Update Date
                                    </label>

                                    <input
                                      type="date"
                                      value={
                                        nextUpdateDate
                                      }
                                      onChange={
                                        event =>
                                          setNextUpdateDate(
                                            event.target.value,
                                          )
                                      }
                                    />

                                  </div>


                                  <div
                                    className="input-group"
                                    style={{
                                      gridColumn:
                                        '1 / -1',
                                    }}
                                  >

                                    <label>
                                      Remark
                                    </label>

                                    <textarea
                                      value={
                                        remark
                                      }
                                      onChange={
                                        event =>
                                          setRemark(
                                            event.target.value,
                                          )
                                      }
                                      rows={4}
                                      placeholder="Enter update remark"
                                    />

                                  </div>

                                </div>


                                <div className="form-actions">

                                  <button
                                    type="button"
                                    className="cancel-button"
                                    onClick={() =>
                                      setAddingUpdate(
                                        null,
                                      )
                                    }
                                  >
                                    Cancel
                                  </button>


                                  <button
                                    type="button"
                                    className="submit-job-button"
                                    onClick={() =>
                                      saveUpdate(
                                        lead,
                                      )
                                    }
                                    disabled={
                                      savingUpdate ===
                                      lead.id
                                    }
                                  >
                                    {savingUpdate ===
                                    lead.id
                                      ? 'Saving...'
                                      : 'Save Update'}
                                  </button>

                                </div>

                              </div>
                            )}

                          </div>
                        )}


                        <div
                          style={{
                            marginTop:
                              '18px',
                            padding:
                              '18px',
                            border:
                              '1px solid #e2e8f0',
                            borderRadius:
                              '10px',
                            background:
                              '#f8fafc',
                          }}
                        >

                          <h4
                            style={{
                              marginTop:
                                0,
                            }}
                          >
                            Lead Status
                          </h4>

                          <div className="form-grid">

                            <div className="input-group">

                              <label>
                                Send Lead To
                              </label>

                              <select
                                value={
                                  currentStatus
                                }
                                onChange={
                                  event =>
                                    setSelectedStatus(
                                      previous => ({
                                        ...previous,
                                        [lead.id]:
                                          event.target.value as LeadStatus,
                                      }),
                                    )
                                }
                              >

                                <option value="Hold">
                                  Send to Hold
                                </option>

                                <option value="Measurement Schedule">
                                  Send to Measurement Schedule
                                </option>

                                <option value="Job Order">
                                  Send to Job Order
                                </option>

                                <option value="Measurement">
                                  Send to Measurement
                                </option>

                                <option value="Dropped Work">
                                  Send to Dropped Work
                                </option>

                              </select>

                            </div>

                          </div>


                          <div className="form-actions">

                            <button
                              type="button"
                              className="submit-job-button"
                              onClick={() =>
                                handleStatusUpdate(
                                  lead,
                                )
                              }
                              disabled={
                                savingStatus ===
                                lead.id
                              }
                            >

                              {savingStatus ===
                              lead.id
                                ? 'Opening...'
                                : selectedStatus[lead.id] ===
                                    'Measurement'
                                  ? 'Open Measurement'
                                  : selectedStatus[lead.id] ===
                                      'Measurement Schedule'
                                    ? 'Open Measurement Schedule'
                                    : selectedStatus[lead.id] ===
                                        'Job Order'
                                      ? 'Open Job Order'
                                      : 'Update Status'}

                            </button>

                          </div>

                        </div>

                      </div>
                    )
                  },
                )}

              </div>
            )}

        </div>

      </div>


      {editingLead && (

        <div
          style={{
            position:
              'fixed',
            inset: 0,
            background:
              'rgba(15, 23, 42, 0.55)',
            display:
              'flex',
            alignItems:
              'center',
            justifyContent:
              'center',
            padding:
              '20px',
            zIndex:
              1000,
          }}
          onMouseDown={event => {

            if (
              event.target ===
              event.currentTarget
            ) {
              cancelEdit()
            }

          }}
        >

          <div
            style={{
              width:
                '100%',
              maxWidth:
                '760px',
              maxHeight:
                '90vh',
              overflowY:
                'auto',
              background:
                '#ffffff',
              borderRadius:
                '12px',
              padding:
                '24px',
            }}
          >

            <div
              style={{
                display:
                  'flex',
                justifyContent:
                  'space-between',
                alignItems:
                  'flex-start',
                marginBottom:
                  '20px',
              }}
            >

              <div>

                <h2>
                  Edit Lead
                </h2>

                <p>
                  Lead ID:{' '}
                  {editingLead.leadId ||
                    editingLead.id}
                </p>

              </div>

              <button
                type="button"
                onClick={
                  cancelEdit
                }
                disabled={
                  savingEdit
                }
              >
                ×
              </button>

            </div>


            <div className="form-grid">

              <div className="input-group">

                <label>
                  Source of Lead
                </label>

                <select
                  value={
                    editSource
                  }
                  onChange={
                    event =>
                      setEditSource(
                        event.target.value,
                      )
                  }
                >

                  <option value="">
                    Select Source
                  </option>

                  {SOURCES.map(
                    source => (

                      <option
                        key={source}
                        value={source}
                      >
                        {source}
                      </option>

                    ),
                  )}

                </select>

              </div>


              <div className="input-group">

                <label>
                  Date
                </label>

                <input
                  type="date"
                  value={
                    editDate
                  }
                  onChange={
                    event =>
                      setEditDate(
                        event.target.value,
                      )
                  }
                />

              </div>


              <div className="input-group">

                <label>
                  Name of Customer
                </label>

                <input
                  type="text"
                  value={
                    editCustomerName
                  }
                  onChange={
                    event =>
                      setEditCustomerName(
                        event.target.value,
                      )
                  }
                />

              </div>


              <div className="input-group">

                <label>
                  Phone Number
                </label>

                <input
                  type="tel"
                  value={
                    editPhoneNumber
                  }
                  onChange={
                    event =>
                      setEditPhoneNumber(
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
                    editPlace
                  }
                  onChange={
                    event =>
                      setEditPlace(
                        event.target.value,
                      )
                  }
                />

              </div>


              <div className="input-group">

                <label>
                  Branch of Entry
                </label>

                <select
                  value={
                    editBranch
                  }
                  onChange={
                    event =>
                      setEditBranch(
                        event.target.value,
                      )
                  }
                >

                  <option value="">
                    Select Branch
                  </option>

                  {BRANCHES.map(
                    branch => (

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

            </div>


            <div className="form-actions">

              <button
                type="button"
                className="cancel-button"
                onClick={
                  cancelEdit
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="submit-job-button"
                onClick={
                  saveEdit
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

export default LeadsView

