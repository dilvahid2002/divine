import './attandance.css'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore'

import {
  getDownloadURL,
  ref as storageRef,
  uploadBytes,
} from 'firebase/storage'

import { db, storage } from '../firebase'

/*
=========================================================
 TYPES
=========================================================
*/

type DutyStatus = 'Not Started' | 'Working' | 'Ended'

interface DailyDutyRecord {
  date: string
  startTime: Timestamp | null
  endTime: Timestamp | null
  branch: string
  totalWorkedSeconds?: number
  totalSessions?: number
}

interface DutySession {
  status?: DutyStatus

  dutyDate?: string
  branch?: string
  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null
  totalWorkedSeconds?: number
  totalSessions?: number

  dailySessions?: Record<string, DailyDutyRecord>

  userName?: string
  username?: string

  /*
   * Enrollment face image.
   */
  faceImageUrl?: string
  faceImagePath?: string
  faceImageUpdatedAt?: Timestamp
}

interface Employee {
  id: string
  username: string
  name: string
  branch: string
  faceImageUrl?: string
  faceImagePath?: string
  faceImageUpdatedAt?: Timestamp
  duty: DutySession
}

/*
=========================================================
 CONSTANTS
=========================================================
*/

const DUTY_COLLECTION = 'duty_sessions'

const BRANCHES = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

/*
=========================================================
 DATE
=========================================================
*/

const getTodayDate = () => {
  const now = new Date()

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return formatter.format(now)
}

/*
=========================================================
 IST TIMESTAMP
=========================================================
*/

const createISTTimestamp = (
  dateString: string,
  timeString: string,
) => {
  const [year, month, day] = dateString
    .split('-')
    .map(Number)

  const [hours, minutes] = timeString
    .split(':')
    .map(Number)

  /*
   * Interpret the selected date/time as IST.
   * IST = UTC + 05:30.
   */
  const utcMillis = Date.UTC(
    year,
    month - 1,
    day,
    hours - 5,
    minutes - 30,
  )

  return Timestamp.fromMillis(utcMillis)
}

/*
=========================================================
 FORMAT TIME
=========================================================
*/

const formatTime = (
  timestamp: Timestamp | null | undefined,
) => {
  if (!timestamp) {
    return '-'
  }

  return timestamp.toDate().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  })
}

/*
=========================================================
 FORMAT DATE
=========================================================
*/

const formatDate = (dateString: string) => {
  if (!dateString) {
    return ''
  }

  const parts = dateString.split('-')

  if (parts.length !== 3) {
    return dateString
  }

  return `${parts[2]}-${parts[1]}-${parts[0]}`
}

/*
=========================================================
 FORMAT DURATION
=========================================================
*/

const formatDuration = (seconds: number) => {
  const safeSeconds = Math.max(
    0,
    Math.floor(seconds || 0),
  )

  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor(
    (safeSeconds % 3600) / 60,
  )
  const remainingSeconds = safeSeconds % 60

  return [
    String(hours).padStart(2, '0'),
    String(minutes).padStart(2, '0'),
    String(remainingSeconds).padStart(2, '0'),
  ].join(':')
}

/*
=========================================================
 SANITIZE STORAGE FILE NAME
=========================================================
*/

const sanitizeStorageName = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
}

/*
=========================================================
 MAIN PAGE
=========================================================
*/

function AttendanceReg() {
  /*
  =======================================================
  EMPLOYEES
  =======================================================
  */

  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [selectedEmployeeId, setSelectedEmployeeId] =
    useState<string | null>(null)

  /*
  =======================================================
  ENROLLMENT MODAL
  =======================================================
  */

  const [showEnrollment, setShowEnrollment] =
    useState(false)

  const [editingEmployee, setEditingEmployee] =
    useState<Employee | null>(null)

  const [employeeId, setEmployeeId] = useState('')
  const [employeeName, setEmployeeName] = useState('')
  const [branch, setBranch] = useState(BRANCHES[0])

  /*
  =======================================================
  CAMERA
  =======================================================
  */

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  const [cameraStream, setCameraStream] =
    useState<MediaStream | null>(null)

  const [cameraActive, setCameraActive] =
    useState(false)

  const [capturedImage, setCapturedImage] =
    useState<string | null>(null)

  const [cameraError, setCameraError] =
    useState('')

  /*
  =======================================================
  SAVE STATE
  =======================================================
  */

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  /*
  =======================================================
  PUNCH FORM
  =======================================================
  */

  const [punchDate, setPunchDate] =
    useState(getTodayDate())

  const [inTime, setInTime] = useState('')
  const [outTime, setOutTime] = useState('')

  const [showPunchModal, setShowPunchModal] =
    useState(false)

  const [editingPunch, setEditingPunch] =
    useState(false)

  /*
  =======================================================
  LOAD EMPLOYEES
  =======================================================
  */

  useEffect(() => {
    setLoading(true)

    const employeeCollection = collection(
      db,
      DUTY_COLLECTION,
    )

    const unsubscribe = onSnapshot(
      employeeCollection,
      (snapshot) => {
        const result: Employee[] = []

        snapshot.forEach((document) => {
          const duty = document.data() as DutySession

          result.push({
            id: document.id,
            username:
              duty.username ||
              document.id,
            name:
              duty.userName ||
              duty.username ||
              document.id,
            branch:
              duty.branch ||
              'Not Assigned',
            faceImageUrl:
              duty.faceImageUrl,
            faceImagePath:
              duty.faceImagePath,
            faceImageUpdatedAt:
              duty.faceImageUpdatedAt,
            duty,
          })
        })

        result.sort((a, b) =>
          a.name.localeCompare(b.name),
        )

        setEmployees(result)
        setLoading(false)
      },
      (snapshotError) => {
        console.error(
          'Employee loading error:',
          snapshotError,
        )

        setEmployees([])
        setLoading(false)
        setError(
          'Unable to load employees.',
        )
      },
    )

    return () => unsubscribe()
  }, [])

  /*
  =======================================================
  FILTERED EMPLOYEES
  =======================================================
  */

  const filteredEmployees = useMemo(() => {
    const value = search
      .trim()
      .toLowerCase()

    if (!value) {
      return employees
    }

    return employees.filter((employee) => {
      return (
        employee.name
          .toLowerCase()
          .includes(value) ||
        employee.username
          .toLowerCase()
          .includes(value) ||
        employee.branch
          .toLowerCase()
          .includes(value)
      )
    })
  }, [employees, search])

  /*
  =======================================================
  SELECTED EMPLOYEE
  =======================================================
  */

  const selectedEmployee = useMemo(() => {
    return employees.find(
      (employee) =>
        employee.id === selectedEmployeeId,
    ) || null
  }, [employees, selectedEmployeeId])

  /*
  =======================================================
  STOP CAMERA
  =======================================================
  */

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream
        .getTracks()
        .forEach((track) => track.stop())
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraStream(null)
    setCameraActive(false)
  }

  /*
  =======================================================
  START CAMERA
  =======================================================
  */

  const startCamera = async () => {
    setCameraError('')

    if (
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setCameraError(
        'Camera access is not supported by this browser.',
      )
      return
    }

    try {
      stopCamera()

      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            /*
             * "user" requests the front/selfie camera
             * on phones where one is available.
             *
             * On a PC this normally selects the webcam.
             */
            facingMode: {
              ideal: 'user',
            },
            width: {
              ideal: 1280,
            },
            height: {
              ideal: 720,
            },
          },
          audio: false,
        })

      setCameraStream(stream)
      setCameraActive(true)

      if (videoRef.current) {
        videoRef.current.srcObject = stream

        await videoRef.current.play()
      }
    } catch (cameraAccessError) {
      console.error(
        'Camera access error:',
        cameraAccessError,
      )

      setCameraActive(false)

      setCameraError(
        'Camera permission was denied or the camera is unavailable. Please allow camera access and try again.',
      )
    }
  }

  /*
  =======================================================
  CAPTURE PHOTO
  =======================================================
  */

  const capturePhoto = () => {
    const video = videoRef.current
    const canvas = canvasRef.current

    if (!video || !canvas) {
      setCameraError(
        'Camera is not ready yet.',
      )
      return
    }

    if (
      video.videoWidth === 0 ||
      video.videoHeight === 0
    ) {
      setCameraError(
        'Camera video is not ready. Please wait a moment and try again.',
      )
      return
    }

    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const context = canvas.getContext('2d')

    if (!context) {
      setCameraError(
        'Unable to capture the camera image.',
      )
      return
    }

    /*
     * Mirror the captured selfie so it feels natural
     * on a front-facing camera.
     */
    context.save()
    context.translate(
      canvas.width,
      0,
    )
    context.scale(-1, 1)

    context.drawImage(
      video,
      0,
      0,
      canvas.width,
      canvas.height,
    )

    context.restore()

    const image = canvas.toDataURL(
      'image/jpeg',
      0.88,
    )

    setCapturedImage(image)
    setCameraError('')

    stopCamera()
  }

  /*
  =======================================================
  RETAKE PHOTO
  =======================================================
  */

  const retakePhoto = async () => {
    setCapturedImage(null)
    setCameraError('')

    await startCamera()
  }

  /*
  =======================================================
  RESET ENROLLMENT FORM
  =======================================================
  */

  const resetEnrollmentForm = () => {
    stopCamera()

    setEmployeeId('')
    setEmployeeName('')
    setBranch(BRANCHES[0])

    setCapturedImage(null)
    setCameraError('')

    setEditingEmployee(null)

    setSaving(false)
    setMessage('')
    setError('')
  }

  /*
  =======================================================
  OPEN NEW ENROLLMENT
  =======================================================
  */

  const openEnrollment = () => {
    resetEnrollmentForm()

    setShowEnrollment(true)
  }

  /*
  =======================================================
  OPEN EDIT EMPLOYEE
  =======================================================
  */

  const openEditEmployee = (
    employee: Employee,
  ) => {
    stopCamera()

    setEditingEmployee(employee)

    setEmployeeId(employee.username)
    setEmployeeName(employee.name)
    setBranch(employee.branch)

    /*
     * Existing enrolled image is shown as the current
     * image, but the user can capture a new one.
     */
    setCapturedImage(
      employee.faceImageUrl || null,
    )

    setCameraError('')
    setMessage('')
    setError('')

    setShowEnrollment(true)
  }

  /*
  =======================================================
  CLOSE ENROLLMENT
  =======================================================
  */

  const closeEnrollment = () => {
    stopCamera()
    setShowEnrollment(false)

    resetEnrollmentForm()
  }

  /*
  =======================================================
  UPLOAD FACE IMAGE
  =======================================================
  */

  const uploadFaceImage = async (
    username: string,
    imageData: string,
  ) => {
    /*
     * Convert the captured data URL into a Blob.
     */
    const response = await fetch(imageData)
    const blob = await response.blob()

    const safeUsername =
      sanitizeStorageName(username)

    const path =
      `employee_faces/${safeUsername}.jpg`

    const imageStorageRef = storageRef(
      storage,
      path,
    )

    const uploadResult = await uploadBytes(
      imageStorageRef,
      blob,
      {
        contentType: 'image/jpeg',
        cacheControl:
          'public,max-age=31536000',
      },
    )

    const downloadUrl =
      await getDownloadURL(
        uploadResult.ref,
      )

    return {
      downloadUrl,
      path,
    }
  }

  /*
  =======================================================
  SAVE ENROLLMENT
  =======================================================
  */

  const saveEnrollment = async () => {
    setMessage('')
    setError('')

    const cleanEmployeeId =
      employeeId.trim()

    const cleanEmployeeName =
      employeeName.trim()

    if (!cleanEmployeeId) {
      setError(
        'Please enter the employee ID / username.',
      )
      return
    }

    if (!cleanEmployeeName) {
      setError(
        'Please enter the employee name.',
      )
      return
    }

    if (!branch) {
      setError(
        'Please select a branch.',
      )
      return
    }

    /*
     * For a NEW employee, an image is mandatory.
     *
     * For an EXISTING employee, the old image can
     * remain if the user did not capture a new one.
     */
    if (
      !capturedImage &&
      !editingEmployee?.faceImageUrl
    ) {
      setError(
        'Please capture a selfie/webcam photo before saving the enrollment.',
      )
      return
    }

    setSaving(true)

    try {
      const documentId =
        editingEmployee?.id ||
        cleanEmployeeId

      const employeeRef = doc(
        db,
        DUTY_COLLECTION,
        documentId,
      )

      let faceImageUrl =
        editingEmployee?.faceImageUrl || ''

      let faceImagePath =
        editingEmployee?.faceImagePath || ''

      /*
       * Only upload when a new photo has been captured.
       *
       * Existing Firebase URL is not uploaded again.
       */
      const isNewCapturedPhoto =
        capturedImage &&
        !capturedImage.startsWith(
          'http://',
        ) &&
        !capturedImage.startsWith(
          'https://',
        )

      if (
        isNewCapturedPhoto &&
        capturedImage
      ) {
        const uploaded =
          await uploadFaceImage(
            cleanEmployeeId,
            capturedImage,
          )

        faceImageUrl =
          uploaded.downloadUrl

        faceImagePath =
          uploaded.path
      }

      /*
       * Preserve existing attendance data.
       */
      const existingDuty =
        editingEmployee?.duty || {}

      const employeeData: DutySession = {
        ...existingDuty,

        username:
          cleanEmployeeId,

        userName:
          cleanEmployeeName,

        branch,

        faceImageUrl,

        faceImagePath,

        faceImageUpdatedAt:
          isNewCapturedPhoto
            ? Timestamp.now()
            : existingDuty.faceImageUpdatedAt,
      }

      await setDoc(
        employeeRef,
        employeeData,
        {
          merge: true,
        },
      )

      setMessage(
        editingEmployee
          ? 'Employee enrollment updated successfully.'
          : 'Employee enrolled successfully.',
      )

      /*
       * Select the employee after saving.
       */
      setSelectedEmployeeId(
        documentId,
      )

      /*
       * Stop camera after successful save.
       */
      stopCamera()

      /*
       * Close modal after a short moment so the
       * success message is visible.
       */
      window.setTimeout(() => {
        setShowEnrollment(false)
        resetEnrollmentForm()
      }, 700)
    } catch (saveError) {
      console.error(
        'Enrollment save error:',
        saveError,
      )

      setError(
        'Unable to save enrollment. Check Firebase Storage/Firestore configuration and try again.',
      )
    } finally {
      setSaving(false)
    }
  }

  /*
  =======================================================
  DELETE EMPLOYEE
  =======================================================
  */

  const deleteEmployee = async (
    employee: Employee,
  ) => {
    const confirmed =
      window.confirm(
        `Delete ${employee.name} (${employee.username})?\n\nThis deletes the employee Firestore document and its attendance history.`,
      )

    if (!confirmed) {
      return
    }

    try {
      await deleteDoc(
        doc(
          db,
          DUTY_COLLECTION,
          employee.id,
        ),
      )

      if (
        selectedEmployeeId ===
        employee.id
      ) {
        setSelectedEmployeeId(null)
      }

      setMessage(
        'Employee deleted successfully.',
      )
    } catch (deleteError) {
      console.error(
        'Employee delete error:',
        deleteError,
      )

      setError(
        'Unable to delete employee.',
      )
    }
  }

  /*
  =======================================================
  OPEN ADD PUNCH
  =======================================================
  */

  const openAddPunch = (
    employee: Employee,
  ) => {
    setSelectedEmployeeId(employee.id)

    setPunchDate(getTodayDate())
    setInTime('')
    setOutTime('')

    setEditingPunch(false)

    setMessage('')
    setError('')

    setShowPunchModal(true)
  }

  /*
  =======================================================
  OPEN EDIT PUNCH
  =======================================================
  */

  const openEditPunch = (
    employee: Employee,
  ) => {
    const date = getTodayDate()

    const daily =
      employee.duty.dailySessions?.[date]

    setSelectedEmployeeId(employee.id)

    setPunchDate(date)

    setInTime(
      daily?.startTime
        ? daily.startTime
            .toDate()
            .toLocaleTimeString(
              'en-GB',
              {
                timeZone:
                  'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
              },
            )
        : '',
    )

    setOutTime(
      daily?.endTime
        ? daily.endTime
            .toDate()
            .toLocaleTimeString(
              'en-GB',
              {
                timeZone:
                  'Asia/Kolkata',
                hour: '2-digit',
                minute: '2-digit',
              },
            )
        : '',
    )

    setEditingPunch(true)

    setMessage('')
    setError('')

    setShowPunchModal(true)
  }

  /*
  =======================================================
  SAVE PUNCH
  =======================================================
  */

  const savePunch = async () => {
    setMessage('')
    setError('')

    if (!selectedEmployee) {
      setError(
        'Please select an employee.',
      )
      return
    }

    if (!punchDate) {
      setError(
        'Please select a date.',
      )
      return
    }

    if (!inTime) {
      setError(
        'Please enter the in time.',
      )
      return
    }

    try {
      setSaving(true)

      const employeeRef = doc(
        db,
        DUTY_COLLECTION,
        selectedEmployee.id,
      )

      const existingDuty =
        selectedEmployee.duty

      const existingDailySessions =
        existingDuty.dailySessions || {}

      const startTimestamp =
        createISTTimestamp(
          punchDate,
          inTime,
        )

      const endTimestamp =
        outTime
          ? createISTTimestamp(
              punchDate,
              outTime,
            )
          : null

      let totalWorkedSeconds = 0

      if (endTimestamp) {
        totalWorkedSeconds =
          Math.max(
            0,
            Math.floor(
              (
                endTimestamp.toMillis() -
                startTimestamp.toMillis()
              ) / 1000,
            ),
          )
      }

      const dailyRecord: DailyDutyRecord = {
        date: punchDate,

        startTime:
          startTimestamp,

        endTime:
          endTimestamp,

        branch:
          selectedEmployee.branch,

        totalWorkedSeconds,

        totalSessions: 1,
      }

      const updatedDailySessions = {
        ...existingDailySessions,

        [punchDate]:
          dailyRecord,
      }

      await setDoc(
        employeeRef,
        {
          ...existingDuty,

          username:
            selectedEmployee.username,

          userName:
            selectedEmployee.name,

          branch:
            selectedEmployee.branch,

          dailySessions:
            updatedDailySessions,
        },
        {
          merge: true,
        },
      )

      setMessage(
        editingPunch
          ? 'Punch updated successfully.'
          : 'Punch added successfully.',
      )

      setShowPunchModal(false)
    } catch (punchError) {
      console.error(
        'Punch save error:',
        punchError,
      )

      setError(
        'Unable to save punch.',
      )
    } finally {
      setSaving(false)
    }
  }

  /*
  =======================================================
  DELETE PUNCH
  =======================================================
  */

  const deletePunch = async (
    employee: Employee,
    date: string,
  ) => {
    const confirmed =
      window.confirm(
        `Delete attendance for ${employee.name} on ${formatDate(date)}?`,
      )

    if (!confirmed) {
      return
    }

    try {
      const employeeRef = doc(
        db,
        DUTY_COLLECTION,
        employee.id,
      )

      const updatedDailySessions = {
        ...(employee.duty.dailySessions || {}),
      }

      delete updatedDailySessions[date]

      await setDoc(
        employeeRef,
        {
          dailySessions:
            updatedDailySessions,
        },
        {
          merge: true,
        },
      )

      setMessage(
        'Punch deleted successfully.',
      )
    } catch (deleteError) {
      console.error(
        'Punch delete error:',
        deleteError,
      )

      setError(
        'Unable to delete punch.',
      )
    }
  }

  /*
  =======================================================
  CAMERA CLEANUP
  =======================================================
  */

  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream
          .getTracks()
          .forEach((track) =>
            track.stop(),
          )
      }
    }
  }, [cameraStream])

  /*
  =======================================================
  PAGE
  =======================================================
  */

  return (
    <div className="attendance-page">

      {/* ===============================================
          HEADER
      =============================================== */}

      <div className="attendance-header">
        <div>
          <h1>Employee Enrollment</h1>

          <p>
            Register employees and capture their
            enrollment selfie / webcam image.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={openEnrollment}
        >
          + Enroll Employee
        </button>
      </div>

      {/* ===============================================
          GLOBAL MESSAGES
      =============================================== */}

      {message && (
        <div className="success-message">
          {message}
        </div>
      )}

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {/* ===============================================
          SEARCH
      =============================================== */}

      <section className="attendance-section">
        <div className="section-heading">
          <div>
            <h2>Employees</h2>

            <span>
              {employees.length} enrolled employees
            </span>
          </div>

          <input
            type="search"
            className="employee-search"
            placeholder="Search employee..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
          />
        </div>

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Photo</th>
                <th>Employee ID</th>
                <th>Name</th>
                <th>Branch</th>
                <th>Enrollment</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-row"
                  >
                    Loading employees...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="empty-row"
                  >
                    No employees found.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(
                  (employee) => {
                    const today =
                      employee.duty
                        .dailySessions?.[
                        getTodayDate()
                      ]

                    return (
                      <tr
                        key={employee.id}
                        onClick={() =>
                          setSelectedEmployeeId(
                            employee.id,
                          )
                        }
                      >
                        <td>
                          {employee.faceImageUrl ? (
                            <img
                              src={
                                employee.faceImageUrl
                              }
                              alt={
                                employee.name
                              }
                              className="employee-face-thumb"
                            />
                          ) : (
                            <div className="no-face-thumb">
                              No Photo
                            </div>
                          )}
                        </td>

                        <td>
                          <strong>
                            {employee.username}
                          </strong>
                        </td>

                        <td>
                          {employee.name}
                        </td>

                        <td>
                          {employee.branch}
                        </td>

                        <td>
                          {employee.faceImageUrl ? (
                            <span className="status-badge status-enrolled">
                              Photo Saved
                            </span>
                          ) : (
                            <span className="status-badge status-missing">
                              Photo Missing
                            </span>
                          )}
                        </td>

                        <td>
                          <div className="action-buttons">
                            <button
                              type="button"
                              className="small-button"
                              onClick={(
                                event,
                              ) => {
                                event.stopPropagation()
                                openEditEmployee(
                                  employee,
                                )
                              }}
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              className="small-button"
                              onClick={(
                                event,
                              ) => {
                                event.stopPropagation()
                                openAddPunch(
                                  employee,
                                )
                              }}
                            >
                              Add Punch
                            </button>

                            <button
                              type="button"
                              className="small-button"
                              onClick={(
                                event,
                              ) => {
                                event.stopPropagation()
                                openEditPunch(
                                  employee,
                                )
                              }}
                            >
                              Edit Today
                            </button>

                            {today && (
                              <button
                                type="button"
                                className="danger-button"
                                onClick={(
                                  event,
                                ) => {
                                  event.stopPropagation()
                                  deletePunch(
                                    employee,
                                    getTodayDate(),
                                  )
                                }}
                              >
                                Delete Punch
                              </button>
                            )}

                            <button
                              type="button"
                              className="danger-button"
                              onClick={(
                                event,
                              ) => {
                                event.stopPropagation()
                                deleteEmployee(
                                  employee,
                                )
                              }}
                            >
                              Delete Employee
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  },
                )
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ===============================================
          ENROLLMENT MODAL
      =============================================== */}

      {showEnrollment && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              closeEnrollment()
            }
          }}
        >
          <div className="modal-card enrollment-modal">

            <div className="modal-header">
              <div>
                <h2>
                  {editingEmployee
                    ? 'Edit Enrollment'
                    : 'Enroll Employee'}
                </h2>

                <p>
                  Capture one clear face photo for
                  employee identification.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeEnrollment}
              >
                ×
              </button>
            </div>

            <div className="enrollment-layout">

              {/* =====================================
                  EMPLOYEE DETAILS
              ===================================== */}

              <div className="enrollment-details">

                <label>
                  Employee ID / Username

                  <input
                    type="text"
                    value={employeeId}
                    disabled={
                      !!editingEmployee
                    }
                    onChange={(event) =>
                      setEmployeeId(
                        event.target.value,
                      )
                    }
                    placeholder="EMP001"
                  />
                </label>

                <label>
                  Employee Name

                  <input
                    type="text"
                    value={employeeName}
                    onChange={(event) =>
                      setEmployeeName(
                        event.target.value,
                      )
                    }
                    placeholder="Employee name"
                  />
                </label>

                <label>
                  Branch

                  <select
                    value={branch}
                    onChange={(event) =>
                      setBranch(
                        event.target.value,
                      )
                    }
                  >
                    {BRANCHES.map(
                      (branchName) => (
                        <option
                          key={branchName}
                          value={branchName}
                        >
                          {branchName}
                        </option>
                      ),
                    )}
                  </select>
                </label>

                <div className="camera-instruction">
                  <strong>
                    Photo enrollment
                  </strong>

                  <p>
                    On a phone, the front/selfie
                    camera will be requested.
                    On a PC, the available webcam
                    will be used.
                  </p>

                  <p>
                    Make sure the employee's face
                    is clearly visible and well lit.
                  </p>
                </div>
              </div>

              {/* =====================================
                  CAMERA
              ===================================== */}

              <div className="camera-section">

                {!capturedImage ? (
                  <>
                    <div className="camera-preview">

                      {cameraActive ? (
                        <video
                          ref={videoRef}
                          autoPlay
                          muted
                          playsInline
                        />
                      ) : (
                        <div className="camera-placeholder">
                          <div className="camera-icon">
                            📷
                          </div>

                          <strong>
                            Camera not started
                          </strong>

                          <span>
                            Start the camera to
                            capture the enrollment
                            photo.
                          </span>
                        </div>
                      )}

                    </div>

                    <canvas
                      ref={canvasRef}
                      className="hidden-canvas"
                    />

                    {cameraError && (
                      <div className="camera-error">
                        {cameraError}
                      </div>
                    )}

                    <div className="camera-actions">

                      {!cameraActive ? (
                        <button
                          type="button"
                          className="primary-button"
                          onClick={
                            startCamera
                          }
                        >
                          Start Camera
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="capture-button"
                          onClick={
                            capturePhoto
                          }
                        >
                          Capture Photo
                        </button>
                      )}

                    </div>
                  </>
                ) : (
                  <>
                    <div className="captured-photo-wrapper">

                      <img
                        src={capturedImage}
                        alt="Captured enrollment"
                        className="captured-photo"
                      />

                      <div className="photo-saved-label">
                        Photo ready
                      </div>
                    </div>

                    <div className="camera-actions">

                      <button
                        type="button"
                        className="secondary-button"
                        onClick={
                          retakePhoto
                        }
                        disabled={saving}
                      >
                        Retake Photo
                      </button>

                    </div>
                  </>
                )}
              </div>
            </div>

            {/* =======================================
                MODAL MESSAGES
            ======================================= */}

            {error && (
              <div className="error-message">
                {error}
              </div>
            )}

            {message && (
              <div className="success-message">
                {message}
              </div>
            )}

            {/* =======================================
                MODAL FOOTER
            ======================================= */}

            <div className="modal-footer">

              <button
                type="button"
                className="secondary-button"
                onClick={
                  closeEnrollment
                }
                disabled={saving}
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                onClick={
                  saveEnrollment
                }
                disabled={
                  saving ||
                  !employeeId.trim() ||
                  !employeeName.trim() ||
                  !capturedImage &&
                  !editingEmployee?.faceImageUrl
                }
              >
                {saving
                  ? 'Saving...'
                  : editingEmployee
                    ? 'Update Enrollment'
                    : 'Save Enrollment'}
              </button>

            </div>
          </div>
        </div>
      )}

      {/* ===============================================
          PUNCH MODAL
      =============================================== */}

      {showPunchModal &&
        selectedEmployee && (
          <div
            className="modal-backdrop"
            onMouseDown={(event) => {
              if (
                event.target ===
                event.currentTarget
              ) {
                setShowPunchModal(false)
              }
            }}
          >
            <div className="modal-card">

              <div className="modal-header">
                <div>
                  <h2>
                    {editingPunch
                      ? 'Edit Punch'
                      : 'Add Punch'}
                  </h2>

                  <p>
                    {selectedEmployee.name}
                    {' · '}
                    {selectedEmployee.username}
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={() =>
                    setShowPunchModal(false)
                  }
                >
                  ×
                </button>
              </div>

              <div className="form-grid">

                <label>
                  Date

                  <input
                    type="date"
                    value={punchDate}
                    onChange={(event) =>
                      setPunchDate(
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  In Time

                  <input
                    type="time"
                    value={inTime}
                    onChange={(event) =>
                      setInTime(
                        event.target.value,
                      )
                    }
                  />
                </label>

                <label>
                  Out Time

                  <input
                    type="time"
                    value={outTime}
                    onChange={(event) =>
                      setOutTime(
                        event.target.value,
                      )
                    }
                  />
                </label>

              </div>

              <div className="modal-footer">

                <button
                  type="button"
                  className="secondary-button"
                  onClick={() =>
                    setShowPunchModal(false)
                  }
                  disabled={saving}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="primary-button"
                  onClick={savePunch}
                  disabled={saving}
                >
                  {saving
                    ? 'Saving...'
                    : 'Save Punch'}
                </button>

              </div>
            </div>
          </div>
        )}

    </div>
  )
}

export default AttendanceReg