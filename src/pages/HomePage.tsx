import './HomePage.css'

import { useEffect, useMemo, useState } from 'react'

import { useNavigate } from 'react-router-dom'

import {
  doc,
  onSnapshot,
  setDoc,
  Timestamp,
} from 'firebase/firestore'

import { db } from '../firebase'

interface HomePageProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

type DutyStatus =
  | 'Not Started'
  | 'Working'
  | 'Ended'

interface DailyDutyRecord {
  date: string
  startTime: Timestamp | null
  endTime: Timestamp | null
  branch: string
  totalWorkedSeconds?: number
  totalSessions?: number
}

interface DutySession {
  status: DutyStatus

  /*
   * IMPORTANT:
   * dutyDate is the date the current/last duty
   * session belongs to.
   *
   * It does NOT automatically change at midnight
   * while the employee is still working.
   */
  dutyDate: string

  branch: string

  currentSessionStartedAt?: Timestamp | null
  lastStartedAt?: Timestamp | null
  lastEndedAt?: Timestamp | null

  totalWorkedSeconds: number
  totalSessions: number

  dailySessions: Record<
    string,
    DailyDutyRecord
  >

  updatedAt?: Timestamp | null

  userName?: string
  username?: string
}

const dutyCollection = 'duty_sessions'

const dutyBranches = [
  'Sulthan Bathery',
  'Kalpetta',
  'Kondotty',
]

const availableRoles = [
  'Sales',
  'Designer',
  'Cutting',
  'Printer',
  'Production',
  'Production Manager',
  'Sales Manager',
  'Accountant',
  'MD',
  'HR',
]

const departmentPaths: Record<
  string,
  string
> = {
  Sales: '/departments/sales',
  Designer: '/departments/designer',
  Cutting: '/departments/cutting',
  Printer: '/departments/printer',
  Production: '/departments/production',
  'Production Manager':
    '/departments/production-manager',
  'Sales Manager':
    '/departments/sales-manager',
  Accountant: '/departments/accountant',
  MD: '/departments/md',
  HR: '/departments/hr',
  'Live Production':
    '/departments/live-production',
}

/*
 * =========================================================
 * DATE HELPERS
 * =========================================================
 */

const getTodayDate = () => {
  const now = new Date()

  const year = now.getFullYear()

  const month = String(
    now.getMonth() + 1,
  ).padStart(2, '0')

  const day = String(
    now.getDate(),
  ).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/*
 * =========================================================
 * COMPONENT
 * =========================================================
 */

function HomePage({
  user,
}: HomePageProps) {
  const navigate = useNavigate()

  /*
   * =========================================================
   * TODAY'S CALENDAR DATE
   * =========================================================
   */

  const [todayDate, setTodayDate] =
    useState(getTodayDate())

  /*
   * =========================================================
   * DUTY STATE
   * =========================================================
   */

  const [duty, setDuty] =
    useState<DutySession>({
      status: 'Not Started',

      dutyDate: todayDate,

      branch: '',

      currentSessionStartedAt:
        null,

      lastStartedAt: null,

      lastEndedAt: null,

      totalWorkedSeconds: 0,

      totalSessions: 0,

      dailySessions: {},
    })

  const [dutyLoading, setDutyLoading] =
    useState(true)

  const [dutyBusy, setDutyBusy] =
    useState(false)

  const [dutyMessage, setDutyMessage] =
    useState('')

  const [selectedBranch, setSelectedBranch] =
    useState('')

  const [
    showBranchDropdown,
    setShowBranchDropdown,
  ] = useState(false)

  const [showUserMenu, setShowUserMenu] =
    useState(false)

  /*
   * =========================================================
   * FIRESTORE DUTY DOCUMENT
   *
   * duty_sessions/{username}
   * =========================================================
   */

  const dutyRef = useMemo(
    () =>
      doc(
        db,
        dutyCollection,
        user.username
          .trim()
          .toLowerCase(),
      ),
    [user.username],
  )

  /*
   * =========================================================
   * KEEP CALENDAR DATE UPDATED
   *
   * Checks once per minute.
   *
   * IMPORTANT:
   * This only changes todayDate.
   * It does NOT automatically end or reset
   * an active duty session.
   * =========================================================
   */

  useEffect(() => {
    const intervalId =
      window.setInterval(() => {
        const currentDate =
          getTodayDate()

        setTodayDate(
          (previousDate) =>
            previousDate ===
            currentDate
              ? previousDate
              : currentDate,
        )
      }, 60 * 1000)

    return () => {
      window.clearInterval(
        intervalId,
      )
    }
  }, [])

  /*
   * =========================================================
   * LOAD DUTY FROM FIRESTORE
   *
   * IMPORTANT OVERNIGHT LOGIC:
   *
   * If:
   *
   * Monday 10 PM = started
   * Tuesday 1 AM = still working
   *
   * Firestore still has:
   *
   * status = Working
   * dutyDate = Monday
   * currentSessionStartedAt = Monday 10 PM
   *
   * We therefore DO NOT require:
   *
   * dutyDate === todayDate
   *
   * to decide whether the employee is working.
   * =========================================================
   */

  useEffect(() => {
    setDutyLoading(true)
    setDutyMessage('')

    const unsubscribe =
      onSnapshot(
        dutyRef,

        (snapshot) => {
          const today = todayDate

          /*
           * =================================================
           * NO FIRESTORE DOCUMENT
           * =================================================
           */

          if (!snapshot.exists()) {
            setDuty({
              status: 'Not Started',

              dutyDate: today,

              branch: '',

              currentSessionStartedAt:
                null,

              lastStartedAt: null,

              lastEndedAt: null,

              totalWorkedSeconds: 0,

              totalSessions: 0,

              dailySessions: {},

              userName: user.name,

              username:
                user.username,
            })

            setSelectedBranch('')

            setShowBranchDropdown(false)

            setDutyLoading(false)

            return
          }

          const data =
            snapshot.data() as Partial<DutySession>

          /*
           * =================================================
           * DAILY HISTORY
           * =================================================
           */

          const dailySessions =
            data.dailySessions &&
            typeof data.dailySessions ===
              'object'
              ? data.dailySessions
              : {}

          /*
           * =================================================
           * DETERMINE WHETHER THERE IS AN ACTIVE SESSION
           *
           * DO NOT COMPARE dutyDate WITH today.
           *
           * This is what allows overnight duty.
           * =================================================
           */

          const isWorking =
            data.status === 'Working' &&
            !!data.currentSessionStartedAt

          /*
           * =================================================
           * ACTIVE DUTY DATE
           *
           * If employee is currently working, use the
           * original dutyDate.
           *
           * Example:
           *
           * Monday 22:00
           * dutyDate = Monday
           *
           * Tuesday 00:30
           * dutyDate STILL = Monday
           * =================================================
           */

          const activeDutyDate =
            isWorking &&
            data.dutyDate
              ? data.dutyDate
              : today

          /*
           * =================================================
           * GET TODAY'S RECORD
           * =================================================
           */

          const todayRecord =
            dailySessions[today]

          /*
           * =================================================
           * GET ACTIVE DUTY RECORD
           *
           * During an overnight session this will point
           * to Monday's record while today is Tuesday.
           * =================================================
           */

          const activeRecord =
            data.dutyDate
              ? dailySessions[
                  data.dutyDate
                ]
              : undefined

          /*
           * =================================================
           * BACKWARD COMPATIBILITY
           *
           * Supports the old single-day document format.
           * =================================================
           */

          const legacyTodayRecord =
            !todayRecord &&
            data.dutyDate === today
              ? {
                  date: today,

                  startTime:
                    data.lastStartedAt ||
                    null,

                  endTime:
                    data.lastEndedAt ||
                    null,

                  branch:
                    data.branch || '',

                  totalWorkedSeconds:
                    Number(
                      data.totalWorkedSeconds ||
                        0,
                    ),

                  totalSessions:
                    Number(
                      data.totalSessions ||
                        0,
                    ),
                }
              : undefined

          /*
           * =================================================
           * OVERNIGHT LEGACY / ACTIVE RECORD
           * =================================================
           */

          const legacyActiveRecord =
            !activeRecord &&
            isWorking &&
            data.dutyDate
              ? {
                  date:
                    data.dutyDate,

                  startTime:
                    data.lastStartedAt ||
                    data.currentSessionStartedAt ||
                    null,

                  endTime: null,

                  branch:
                    data.branch || '',

                  totalWorkedSeconds:
                    Number(
                      data.totalWorkedSeconds ||
                        0,
                    ),

                  totalSessions:
                    Number(
                      data.totalSessions ||
                        1,
                    ),
                }
              : undefined

          /*
           * =================================================
           * CHOOSE THE RECORD
           *
           * If working, prioritize the active duty record.
           * Otherwise look for today's record.
           * =================================================
           */

          const record =
            isWorking
              ? activeRecord ||
                legacyActiveRecord
              : todayRecord ||
                legacyTodayRecord

          /*
           * =================================================
           * ACTIVE WORKING DUTY
           * =================================================
           */

          if (isWorking) {
            const workingRecord =
              record

            /*
             * Even if there is no dailySessions entry,
             * the top-level Firestore data still tells us
             * that the employee is actively working.
             */

            const branch =
              workingRecord?.branch ||
              data.branch ||
              ''

            const workedSeconds =
              Number(
                workingRecord?.totalWorkedSeconds ??
                  data.totalWorkedSeconds ??
                  0,
              )

            const totalSessions =
              Number(
                workingRecord?.totalSessions ??
                  data.totalSessions ??
                  1,
              )

            setDuty({
              status: 'Working',

              /*
               * KEEP ORIGINAL DUTY DATE.
               *
               * This can be yesterday if the employee
               * is working after midnight.
               */
              dutyDate:
                data.dutyDate ||
                today,

              branch,

              currentSessionStartedAt:
                data.currentSessionStartedAt ||
                null,

              lastStartedAt:
                workingRecord?.startTime ||
                data.lastStartedAt ||
                data.currentSessionStartedAt ||
                null,

              lastEndedAt:
                data.lastEndedAt ||
                null,

              totalWorkedSeconds:
                workedSeconds,

              totalSessions:
                totalSessions,

              dailySessions,

              updatedAt:
                data.updatedAt ||
                null,

              userName:
                data.userName ||
                user.name,

              username:
                data.username ||
                user.username,
            })

            setSelectedBranch(branch)

            /*
             * IMPORTANT:
             * Do NOT reset branch dropdown merely because
             * the calendar date changed while working.
             */

            setDutyLoading(false)

            return
          }

          /*
           * =================================================
           * NO ACTIVE SESSION
           * =================================================
           *
           * Now we only care about TODAY.
           *
           * If there is no record for today, this is a new
           * duty day and Start Duty becomes available.
           * =================================================
           */

          if (!todayRecord && !legacyTodayRecord) {
            setDuty({
              status: 'Not Started',

              dutyDate: today,

              branch: '',

              currentSessionStartedAt:
                null,

              lastStartedAt: null,

              lastEndedAt: null,

              totalWorkedSeconds: 0,

              totalSessions: 0,

              dailySessions,

              userName:
                data.userName ||
                user.name,

              username:
                data.username ||
                user.username,

              updatedAt:
                data.updatedAt ||
                null,
            })

            setSelectedBranch('')

            setShowBranchDropdown(false)

            setDutyLoading(false)

            return
          }

          /*
           * =================================================
           * TODAY HAS A RECORD
           * =================================================
           */

          const todayDuty =
            todayRecord ||
            legacyTodayRecord

          if (!todayDuty) {
            setDuty({
              status: 'Not Started',

              dutyDate: today,

              branch: '',

              currentSessionStartedAt:
                null,

              lastStartedAt: null,

              lastEndedAt: null,

              totalWorkedSeconds: 0,

              totalSessions: 0,

              dailySessions,
            })

            setSelectedBranch('')

            setDutyLoading(false)

            return
          }

          /*
           * =================================================
           * DETERMINE TODAY'S STATUS
           * =================================================
           */

          const status: DutyStatus =
            todayDuty.endTime
              ? 'Ended'
              : todayDuty.startTime
                ? 'Not Started'
                : 'Not Started'

          /*
           * =================================================
           * IMPORTANT:
           *
           * A historical Ended record should not become
           * the active status on a new date.
           *
           * We are already inside today's record here,
           * so this is safe.
           * =================================================
           */

          setDuty({
            status,

            dutyDate: today,

            branch:
              todayDuty.branch || '',

            currentSessionStartedAt:
              null,

            lastStartedAt:
              todayDuty.startTime ||
              data.lastStartedAt ||
              null,

            lastEndedAt:
              todayDuty.endTime ||
              data.lastEndedAt ||
              null,

            totalWorkedSeconds:
              Number(
                todayDuty.totalWorkedSeconds ||
                  0,
              ),

            totalSessions:
              Number(
                todayDuty.totalSessions ||
                  0,
              ),

            dailySessions,

            updatedAt:
              data.updatedAt ||
              null,

            userName:
              data.userName ||
              user.name,

            username:
              data.username ||
              user.username,
          })

          setSelectedBranch(
            todayDuty.branch || '',
          )

          setDutyLoading(false)
        },

        (firebaseError) => {
          console.error(
            'Load duty status failed:',
            firebaseError,
          )

          setDutyLoading(false)

          setDutyMessage(
            'Unable to load duty status.',
          )
        },
      )

    return unsubscribe
  }, [
    dutyRef,
    todayDate,
    user.name,
    user.username,
  ])

  /*
   * =========================================================
   * LIVE TIMER
   *
   * This continues working after midnight.
   *
   * Example:
   *
   * Monday 23:59:59
   * Tuesday 00:00:00
   * Tuesday 01:00:00
   *
   * The timer keeps counting because it uses
   * currentSessionStartedAt rather than today's date.
   * =========================================================
   */

  useEffect(() => {
    const intervalId =
      window.setInterval(() => {
        setDuty((current) => {
          if (
            current.status !==
              'Working' ||
            !current.currentSessionStartedAt
          ) {
            return current
          }

          /*
           * Force a state refresh every second.
           *
           * The actual elapsed time is calculated from
           * currentSessionStartedAt.
           */
          return {
            ...current,
          }
        })
      }, 1000)

    return () => {
      window.clearInterval(
        intervalId,
      )
    }
  }, [])

  /*
   * =========================================================
   * FORMAT TIME
   * =========================================================
   */

  const formatDuration = (
    seconds: number,
  ) => {
    const safe = Math.max(
      0,
      Math.floor(seconds || 0),
    )

    const hours = String(
      Math.floor(safe / 3600),
    ).padStart(2, '0')

    const minutes = String(
      Math.floor(
        (safe % 3600) / 60,
      ),
    ).padStart(2, '0')

    const secondsPart = String(
      safe % 60,
    ).padStart(2, '0')

    return `${hours}:${minutes}:${secondsPart}`
  }

  /*
   * =========================================================
   * CURRENT WORKED TIME
   *
   * Works across midnight.
   * =========================================================
   */

  const currentWorkedSeconds = () => {
    const stored =
      Number(
        duty.totalWorkedSeconds || 0,
      )

    if (
      duty.status === 'Working' &&
      duty.currentSessionStartedAt
    ) {
      const runningSeconds =
        Math.max(
          0,
          Math.floor(
            (
              Date.now() -
              duty.currentSessionStartedAt.toMillis()
            ) / 1000,
          ),
        )

      return (
        stored +
        runningSeconds
      )
    }

    return stored
  }

  /*
   * =========================================================
   * START DUTY
   * =========================================================
   */

  const handleStartDuty =
    async () => {
      if (dutyBusy) return

      const today =
        getTodayDate()

      /*
       * NEVER allow Start Duty while an active session
       * exists, even if that session started yesterday.
       */
      if (
        duty.status === 'Working'
      ) {
        setDutyMessage(
          'You already have an active duty session.',
        )

        return
      }

      /*
       * Ended today's duty can only be resumed.
       */
      if (
        duty.status === 'Ended'
      ) {
        setDutyMessage(
          "Today's duty has already ended. Use 'Resume Duty' to continue today's duty.",
        )

        return
      }

      /*
       * Branch required.
       */
      if (!selectedBranch) {
        setShowBranchDropdown(true)

        setDutyMessage(
          'Please select a branch before starting duty.',
        )

        return
      }

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        const existingDailySessions =
          duty.dailySessions || {}

        /*
         * =================================================
         * DO NOT OVERWRITE TODAY'S RECORD
         * =================================================
         */

        if (
          existingDailySessions[
            today
          ]
        ) {
          setDutyMessage(
            "Today's duty record already exists. Use 'Resume Duty' if it has ended.",
          )

          return
        }

        const dailyRecord: DailyDutyRecord =
          {
            date: today,

            startTime: now,

            endTime: null,

            branch:
              selectedBranch,

            totalWorkedSeconds: 0,

            totalSessions: 1,
          }

        const dailySessions = {
          ...existingDailySessions,

          [today]:
            dailyRecord,
        }

        /*
         * =================================================
         * WRITE NEW DUTY
         * =================================================
         */

        await setDoc(
          dutyRef,
          {
            status: 'Working',

            /*
             * This is the date the duty was started.
             */
            dutyDate: today,

            branch:
              selectedBranch,

            currentSessionStartedAt:
              now,

            lastStartedAt: now,

            lastEndedAt: null,

            totalWorkedSeconds: 0,

            totalSessions: 1,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        setShowBranchDropdown(false)

        setDutyMessage(
          `Duty started at ${selectedBranch}.`,
        )
      } catch (error) {
        console.error(
          'Start duty failed:',
          error,
        )

        setDutyMessage(
          'Could not start duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================================
   * END DUTY
   *
   * IMPORTANT OVERNIGHT FIX:
   *
   * We DO NOT use getTodayDate() as the dailySessions key.
   *
   * Instead we use duty.dutyDate.
   *
   * Example:
   *
   * Started Monday 22:00
   * Ended Tuesday 01:00
   *
   * The record updated is:
   *
   * dailySessions["Monday"]
   *
   * NOT:
   *
   * dailySessions["Tuesday"]
   * =========================================================
   */

  const handleEndDuty =
    async () => {
      if (
        dutyBusy ||
        duty.status !== 'Working'
      ) {
        return
      }

      /*
       * IMPORTANT:
       * This is the original date on which the duty
       * was started.
       */
      const dutyDate =
        duty.dutyDate

      if (!dutyDate) {
        setDutyMessage(
          'Duty date could not be determined. Please refresh and try again.',
        )

        return
      }

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        /*
         * =================================================
         * FIND THE ORIGINAL DUTY RECORD
         * =================================================
         */

        const existingDailySessions =
          duty.dailySessions || {}

        const currentRecord =
          existingDailySessions[
            dutyDate
          ]

        /*
         * =================================================
         * FALLBACK
         *
         * In case an older document doesn't contain the
         * dailySessions entry, we can still construct it
         * from the top-level data.
         * =================================================
         */

        const fallbackRecord: DailyDutyRecord =
          {
            date: dutyDate,

            startTime:
              duty.lastStartedAt ||
              duty.currentSessionStartedAt ||
              now,

            endTime: null,

            branch:
              duty.branch ||
              selectedBranch ||
              '',

            totalWorkedSeconds:
              Number(
                duty.totalWorkedSeconds ||
                  0,
              ),

            totalSessions:
              Number(
                duty.totalSessions ||
                  1,
              ),
          }

        const record =
          currentRecord ||
          fallbackRecord

        /*
         * =================================================
         * CURRENT SESSION START
         * =================================================
         */

        const started =
          duty.currentSessionStartedAt
            ?.toMillis() ??
          record.startTime?.toMillis() ??
          now.toMillis()

        /*
         * =================================================
         * CURRENT SESSION DURATION
         *
         * This works even if:
         *
         * started = Monday 22:00
         * now     = Tuesday 01:00
         *
         * Difference = 3 hours
         * =================================================
         */

        const sessionSeconds =
          Math.max(
            0,
            Math.floor(
              (
                now.toMillis() -
                started
              ) / 1000,
            ),
          )

        /*
         * =================================================
         * PREVIOUSLY COMPLETED WORK
         * =================================================
         */

        const previousWorkedSeconds =
          Number(
            record.totalWorkedSeconds ||
              duty.totalWorkedSeconds ||
              0,
          )

        /*
         * =================================================
         * NEW TOTAL
         * =================================================
         */

        const newTotalWorkedSeconds =
          previousWorkedSeconds +
          sessionSeconds

        /*
         * =================================================
         * SESSION COUNT
         * =================================================
         */

        const existingSessions =
          Number(
            record.totalSessions ||
              duty.totalSessions ||
              1,
          )

        /*
         * =================================================
         * UPDATE ORIGINAL DAY RECORD
         * =================================================
         */

        const updatedDailyRecord: DailyDutyRecord =
          {
            ...record,

            date: dutyDate,

            branch:
              record.branch ||
              duty.branch ||
              selectedBranch ||
              '',

            /*
             * Keep original first start time.
             */
            startTime:
              record.startTime ||
              duty.lastStartedAt ||
              duty.currentSessionStartedAt ||
              null,

            /*
             * End timestamp can be on the NEXT day.
             */
            endTime: now,

            totalWorkedSeconds:
              newTotalWorkedSeconds,

            totalSessions:
              existingSessions,
          }

        const dailySessions = {
          ...existingDailySessions,

          /*
           * CRITICAL:
           *
           * Use dutyDate, not today.
           */
          [dutyDate]:
            updatedDailyRecord,
        }

        /*
         * =================================================
         * SAVE
         * =================================================
         */

        await setDoc(
          dutyRef,
          {
            /*
             * Duty is now ended.
             */
            status: 'Ended',

            /*
             * Keep the original duty date.
             *
             * This allows the attendance record to remain
             * attached to the day the duty started.
             */
            dutyDate,

            branch:
              updatedDailyRecord.branch,

            currentSessionStartedAt:
              null,

            lastStartedAt:
              updatedDailyRecord.startTime,

            lastEndedAt:
              now,

            totalWorkedSeconds:
              newTotalWorkedSeconds,

            totalSessions:
              updatedDailyRecord.totalSessions,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        /*
         * =================================================
         * MESSAGE
         * =================================================
         */

        setDutyMessage(
          `Duty ended. Total worked time for ${dutyDate}: ${formatDuration(
            newTotalWorkedSeconds,
          )}.`,
        )
      } catch (error) {
        console.error(
          'End duty failed:',
          error,
        )

        setDutyMessage(
          'Could not end duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================================
   * RESUME DUTY
   * =========================================================
   *
   * Resume is allowed only when:
   *
   * 1. Today's duty has ended
   * 2. dutyDate === today's date
   *
   * Therefore:
   *
   * Monday 10 PM → Tuesday 1 AM
   *
   * After ending at Tuesday 1 AM:
   *
   * Monday record = Ended
   * Tuesday = new day
   *
   * Resume will NOT appear as an active option for
   * Monday's session.
   *
   * Tuesday can start a fresh duty.
   * =========================================================
   */

  const handleResumeDuty =
    async () => {
      if (
        dutyBusy ||
        duty.status !== 'Ended'
      ) {
        return
      }

      const today =
        getTodayDate()

      /*
       * Resume only today's ended duty.
       */

      if (
        duty.dutyDate !== today
      ) {
        setDutyMessage(
          "The previous duty belongs to an earlier date. Please start today's duty.",
        )

        return
      }

      const currentRecord =
        duty.dailySessions?.[
          today
        ]

      if (!currentRecord) {
        setDutyMessage(
          "Today's duty record was not found. Please refresh and try again.",
        )

        return
      }

      /*
       * Branch should normally already exist.
       */

      if (
        !currentRecord.branch &&
        !selectedBranch
      ) {
        setShowBranchDropdown(true)

        setDutyMessage(
          'Please select a branch before resuming duty.',
        )

        return
      }

      setDutyBusy(true)
      setDutyMessage('')

      try {
        const now =
          Timestamp.now()

        /*
         * =================================================
         * PRESERVE PREVIOUSLY COMPLETED TIME
         * =================================================
         */

        const previousWorkedSeconds =
          Number(
            currentRecord.totalWorkedSeconds ||
              duty.totalWorkedSeconds ||
              0,
          )

        /*
         * =================================================
         * INCREMENT SESSION COUNT
         * =================================================
         */

        const previousSessions =
          Number(
            currentRecord.totalSessions ||
              duty.totalSessions ||
              0,
          )

        const dailyRecord: DailyDutyRecord =
          {
            ...currentRecord,

            date: today,

            startTime:
              currentRecord.startTime,

            branch:
              currentRecord.branch ||
              selectedBranch,

            /*
             * Clear previous end because the new session
             * is active.
             */
            endTime: null,

            totalWorkedSeconds:
              previousWorkedSeconds,

            totalSessions:
              previousSessions + 1,
          }

        const dailySessions = {
          ...(duty.dailySessions ||
            {}),

          [today]:
            dailyRecord,
        }

        /*
         * =================================================
         * SAVE RESUMED DUTY
         * =================================================
         */

        await setDoc(
          dutyRef,
          {
            status: 'Working',

            dutyDate: today,

            branch:
              dailyRecord.branch,

            currentSessionStartedAt:
              now,

            lastStartedAt: now,

            /*
             * Previous session end time is no longer the
             * active end time.
             */
            lastEndedAt:
              currentRecord.endTime ||
              null,

            totalWorkedSeconds:
              previousWorkedSeconds,

            totalSessions:
              dailyRecord.totalSessions,

            dailySessions,

            userName: user.name,

            username:
              user.username,

            updatedAt: now,
          },
          {
            merge: true,
          },
        )

        setDutyMessage(
          "Duty resumed. You're continuing today's duty.",
        )
      } catch (error) {
        console.error(
          'Resume duty failed:',
          error,
        )

        setDutyMessage(
          'Could not resume duty. Please try again.',
        )
      } finally {
        setDutyBusy(false)
      }
    }

  /*
   * =========================================================
   * DUTY ACTIVE
   * =========================================================
   */

  const dutyActive =
    duty.status === 'Working'

  /*
   * =========================================================
   * ROLE CHECK
   * =========================================================
   */

  const hasRole = (
    role: string,
  ) => {
    return user.roles.some(
      (userRole) =>
        userRole
          .trim()
          .toLowerCase() ===
        role
          .trim()
          .toLowerCase(),
    )
  }

  /*
   * =========================================================
   * DEPARTMENT NAVIGATION
   * =========================================================
   */

  const handleDepartmentClick =
    (role: string) => {
      if (!dutyActive) {
        setDutyMessage(
          'Start or resume your duty before opening department work.',
        )

        return
      }

      if (!hasRole(role)) {
        return
      }

      const path =
        departmentPaths[role]

      if (path) {
        navigate(path)
      }
    }

  /*
   * =========================================================
   * SALES STATISTICS
   * =========================================================
   */

  const handleSalesStatisticsClick =
    () => {
      if (!dutyActive) {
        setDutyMessage(
          'Start or resume your duty before opening department work.',
        )

        return
      }

      navigate(
        '/departments/sales-statistics',
      )
    }

  /*
   * =========================================================
   * MY ATTENDANCE
   * =========================================================
   */

  const handleMyAttendanceClick =
    () => {
      navigate('/my-attandance')
    }

  /*
   * =========================================================
   * LOGOUT
   * =========================================================
   */

  const handleLogout = () => {
    setShowUserMenu(false)

    window.location.href = '/'
  }

  /*
   * =========================================================
   * DEPARTMENT ACTIVE
   * =========================================================
   */

  const isDepartmentActive = (
    role: string,
  ) => {
    return (
      dutyActive &&
      hasRole(role)
    )
  }

  /*
   * =========================================================
   * DISPLAY DUTY DATE
   *
   * During overnight duty this may show yesterday's date.
   *
   * Example:
   *
   * Today = Tuesday
   * Duty date = Monday
   *
   * That is intentional.
   * =========================================================
   */

  const displayDutyDate =
    duty.dutyDate || todayDate

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

  return (
    <div className="home-page">

      {/* ===================================================
          HEADER
          =================================================== */}

      <header className="home-header">

        <div>
          <h1>
            Work Manager
          </h1>

          <p>
            Welcome{' '}
            <strong>
              {user.name}
            </strong>
          </p>
        </div>

        {/* =================================================
            DUTY CONTROL
            ================================================= */}

        <div
          className={`duty-control ${duty.status
            .toLowerCase()
            .replace(
              /\s+/g,
              '-',
            )}`}
        >

          <div className="duty-control-info">

            <span className="duty-label">
              Duty
            </span>

            <strong className="duty-status">
              {dutyLoading
                ? 'Checking...'
                : duty.status}
            </strong>

            {!dutyLoading && (
              <>
                <span className="duty-time">
                  Date{' '}
                  {displayDutyDate}
                </span>

                <span className="duty-time">
                  Branch{' '}
                  {duty.branch ||
                    '-'}
                </span>

                <span className="duty-time">
                  Worked{' '}
                  {formatDuration(
                    currentWorkedSeconds(),
                  )}
                </span>
              </>
            )}

          </div>

          <div className="duty-buttons">

            {/* =============================================
                WORKING
                ============================================= */}

            {duty.status ===
            'Working' ? (

              <button
                type="button"
                className="duty-button end-duty-button"
                onClick={
                  handleEndDuty
                }
                disabled={
                  dutyLoading ||
                  dutyBusy
                }
              >
                {dutyBusy
                  ? 'Updating...'
                  : 'End Duty'}
              </button>

            ) : duty.status ===
              'Not Started' ? (

              <>
                {/* =========================================
                    START DUTY
                    ========================================= */}

                <button
                  type="button"
                  className="duty-button start-duty-button"
                  onClick={() => {
                    setShowBranchDropdown(
                      !showBranchDropdown,
                    )

                    setDutyMessage('')
                  }}
                  disabled={
                    dutyLoading ||
                    dutyBusy
                  }
                >
                  Start Duty
                </button>

                {showBranchDropdown && (

                  <div>

                    <label htmlFor="duty-branch">
                      Branch
                    </label>

                    <select
                      id="duty-branch"
                      value={
                        selectedBranch
                      }
                      onChange={(
                        event,
                      ) =>
                        setSelectedBranch(
                          event.target
                            .value,
                        )
                      }
                      disabled={
                        dutyBusy
                      }
                    >

                      <option value="">
                        Select Branch
                      </option>

                      {dutyBranches.map(
                        (branch) => (
                          <option
                            key={branch}
                            value={
                              branch
                            }
                          >
                            {branch}
                          </option>
                        ),
                      )}

                    </select>

                    <button
                      type="button"
                      className="duty-button not-started"
                      onClick={
                        handleStartDuty
                      }
                      disabled={
                        dutyLoading ||
                        dutyBusy ||
                        !selectedBranch
                      }
                    >
                      {dutyBusy
                        ? 'Updating...'
                        : 'Confirm Start'}
                    </button>

                  </div>
                )}

              </>

            ) : null}

            {/* =============================================
                RESUME DUTY
                ============================================= */}

            <button
              type="button"
              className="duty-button resume-duty-button"
              onClick={
                handleResumeDuty
              }
              disabled={
                dutyLoading ||
                dutyBusy ||
                duty.status !==
                  'Ended' ||
                duty.dutyDate !==
                  getTodayDate()
              }
            >
              {dutyBusy &&
              duty.status ===
                'Ended'
                ? 'Updating...'
                : 'Resume Duty'}
            </button>

          </div>

        </div>

        {/* =================================================
            DUTY MESSAGE
            ================================================= */}

        {dutyMessage && (
          <div
            className="duty-message"
            role="status"
          >
            {dutyMessage}
          </div>
        )}

        {/* =================================================
            USER MENU
            ================================================= */}

        <div className="user-menu-container">

          <button
            type="button"
            className="user-info"
            onClick={() =>
              setShowUserMenu(
                !showUserMenu,
              )
            }
          >

            <span>
              {user.name}
            </span>

            <span className="user-arrow">
              {showUserMenu
                ? '▲'
                : '▼'}
            </span>

          </button>

          {showUserMenu && (

            <div className="user-dropdown">

              {/* =========================================
                  MY ATTENDANCE
                  ========================================= */}

              <button
                type="button"
                className="my-attendance-button"
                onClick={
                  handleMyAttendanceClick
                }
              >
                My Attendance
              </button>

              {/* =========================================
                  LOGOUT
                  ========================================= */}

              <button
                type="button"
                className="logout-button"
                onClick={
                  handleLogout
                }
              >

                <span className="logout-icon">
                  ↪
                </span>

                <span>
                  Logout
                </span>

              </button>

            </div>

          )}

        </div>

      </header>

      {/* ===================================================
          MAIN CONTENT
          =================================================== */}

      <main className="home-content">

        <div className="home-title">

          <h2>
            Departments
          </h2>

          <p>
            {dutyActive
              ? 'You are on duty. Select a department to continue.'
              : duty.status ===
                'Ended'
                ? 'Duty ended. Resume today’s duty to continue working, or start a new duty day.'
                : 'Start your duty to enable department work.'}
          </p>

        </div>

        {/* =================================================
            DUTY REQUIRED
            ================================================= */}

        {!dutyActive &&
          !dutyLoading && (

            <div className="duty-required-banner">

              <strong>
                Duty required
              </strong>

              <span>
                {duty.status ===
                'Ended'
                  ? 'Your duty has ended. Click “Resume Duty” to continue today, or “Start Duty” for a new duty day.'
                  : 'Click “Start Duty” to begin a new duty day.'}
              </span>

            </div>

          )}

        {/* =================================================
            DEPARTMENT GRID
            ================================================= */}

        <div className="department-grid">

          {/* =================================================
              SALES
              ================================================= */}

          {(() => {
            const role = 'Sales'

            const isActive =
              isDepartmentActive(
                role,
              )

            return (

              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={
                  !isActive
                }
                onClick={() =>
                  handleDepartmentClick(
                    role,
                  )
                }
              >

                <div className="department-icon">
                  {role.charAt(0)}
                </div>

                <div className="department-name">
                  {role}
                </div>

                <div className="department-status">
                  {isActive
                    ? 'Available'
                    : hasRole(role)
                      ? 'Duty Required'
                      : 'No Access'}
                </div>

              </button>

            )
          })()}

          {/* =================================================
              SALES STATISTICS
              ================================================= */}

          <button
            type="button"
            className={`department-card ${
              dutyActive
                ? 'active'
                : 'disabled'
            }`}
            disabled={
              !dutyActive
            }
            onClick={
              handleSalesStatisticsClick
            }
          >

            <div className="department-icon">
              S
            </div>

            <div className="department-name">
              Sales Statistics
            </div>

            <div className="department-status">
              {dutyActive
                ? 'Available'
                : 'Duty Required'}
            </div>

          </button>

          {/* =================================================
              LIVE PRODUCTION
              ================================================= */}

          {(() => {
            const role =
              'Live Production'

            const isActive =
              isDepartmentActive(
                role,
              )

            return (

              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={
                  !isActive
                }
                onClick={() =>
                  handleDepartmentClick(
                    role,
                  )
                }
              >

                <div className="department-icon">
                  {role.charAt(0)}
                </div>

                <div className="department-name">
                  {role}
                </div>

                <div className="department-status">
                  {isActive
                    ? 'Available'
                    : hasRole(role)
                      ? 'Duty Required'
                      : 'No Access'}
                </div>

              </button>

            )
          })()}

          {/* =================================================
              OTHER DEPARTMENTS
              ================================================= */}

          {availableRoles
            .filter(
              (role) =>
                role !== 'Sales',
            )
            .map((role) => {

              const isActive =
                isDepartmentActive(
                  role,
                )

              return (

                <button
                  key={role}
                  type="button"
                  className={`department-card ${
                    isActive
                      ? 'active'
                      : 'disabled'
                  }`}
                  disabled={
                    !isActive
                  }
                  onClick={() =>
                    handleDepartmentClick(
                      role,
                    )
                  }
                >

                  <div className="department-icon">
                    {role.charAt(0)}
                  </div>

                  <div className="department-name">
                    {role}
                  </div>

                  <div className="department-status">
                    {isActive
                      ? 'Available'
                      : hasRole(role)
                        ? 'Duty Required'
                        : 'No Access'}
                  </div>

                </button>

              )
            })}

        </div>

      </main>

    </div>
  )
}

export default HomePage