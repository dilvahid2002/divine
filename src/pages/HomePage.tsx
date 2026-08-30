import './HomePage.css'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

interface HomePageProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

/*
 * =========================================
 * AVAILABLE ROLES
 * =========================================
 */

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

/*
 * =========================================
 * DEPARTMENT PATHS
 * =========================================
 */

const departmentPaths: Record<string, string> = {
  Sales: '/departments/sales',

  Designer: '/departments/designer',

  Cutting: '/departments/cutting',

  Printer: '/departments/printer',

  Production: '/departments/production',

  'Production Manager':
    '/departments/production-manager',

  'Sales Manager':
    '/departments/sales-manager',

  Accountant:
    '/departments/accountant',

  MD: '/departments/md',

  HR: '/departments/hr',

  'Live Production':
    '/departments/live-production',
}

/*
 * =========================================
 * HOME PAGE
 * =========================================
 */

function HomePage({
  user,
}: HomePageProps) {

  const navigate = useNavigate()

  /*
   * =========================================
   * USER MENU STATE
   * =========================================
   *
   * false = menu closed
   * true  = menu open
   */

  const [showUserMenu, setShowUserMenu] =
    useState(false)


  /*
   * =========================================
   * CHECK USER ROLE
   * =========================================
   *
   * Case-insensitive role checking.
   *
   * Examples:
   *
   * Live Production
   * live production
   * LIVE PRODUCTION
   *
   * All will work.
   */

  const hasRole = (role: string) => {

    return user.roles.some(
      (userRole) =>
        userRole.trim().toLowerCase() ===
        role.trim().toLowerCase(),
    )
  }


  /*
   * =========================================
   * NAVIGATE TO DEPARTMENT
   * =========================================
   */

  const handleDepartmentClick = (
    role: string,
  ) => {

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
   * =========================================
   * NAVIGATE TO SALES STATISTICS
   * =========================================
   */

  const handleSalesStatisticsClick = () => {

    navigate(
      '/departments/sales-statistics',
    )
  }


  /*
   * =========================================
   * LOGOUT
   * =========================================
   *
   * We are NOT using Firebase logout here.
   *
   * We are also NOT changing App.tsx.
   *
   * Reloading "/" causes App.tsx to start again
   * with:
   *
   * currentUser = null
   *
   * Therefore LoginPage will be displayed.
   */

  const handleLogout = () => {

    setShowUserMenu(false)

    window.location.href = '/'
  }


  /*
   * =========================================
   * PAGE
   * =========================================
   */

  return (
    <div className="home-page">


      {/* =========================================
          HEADER
      ========================================== */}

      <header className="home-header">


        {/* =======================================
            TITLE / WELCOME
        ======================================== */}

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


        {/* =======================================
            USER MENU
        ======================================== */}

        <div className="user-menu-container">


          {/* =====================================
              USER NAME BUTTON
          ====================================== */}

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


          {/* =====================================
              USER DROPDOWN
          ====================================== */}

          {showUserMenu && (

            <div className="user-dropdown">


              {/* =================================
                  LOGOUT
              ================================== */}

              {/* ================================= 
    LOGOUT
================================== */}

          <button
            type="button"
            className="logout-button"
            onClick={handleLogout}
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


      {/* =========================================
          MAIN CONTENT
      ========================================== */}

      <main className="home-content">


        {/* =========================================
            PAGE TITLE
        ========================================== */}

        <div className="home-title">

          <h2>
            Departments
          </h2>

          <p>
            Select a department to continue
          </p>

        </div>


        {/* =========================================
            DEPARTMENT GRID
        ========================================== */}

        <div className="department-grid">


          {/* =======================================
              SALES
          ======================================== */}

          {(() => {

            const role = 'Sales'

            const isActive =
              hasRole(role)

            return (

              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={!isActive}
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
                    : 'No Access'}

                </div>

              </button>

            )

          })()}


          {/* =======================================
              SALES STATISTICS
          ======================================== */}

          <button
            type="button"
            className="department-card active"
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
              Available
            </div>

          </button>


          {/* =======================================
              LIVE PRODUCTION
          ======================================== */}

          {(() => {

            const role =
              'Live Production'

            const isActive =
              hasRole(role)

            return (

              <button
                key={role}
                type="button"
                className={`department-card ${
                  isActive
                    ? 'active'
                    : 'disabled'
                }`}
                disabled={!isActive}
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
                    : 'No Access'}

                </div>

              </button>

            )

          })()}


          {/* =======================================
              OTHER DEPARTMENTS
          ======================================== */}

          {availableRoles
            .filter(
              (role) =>
                role !== 'Sales',
            )
            .map((role) => {

              const isActive =
                hasRole(role)

              return (

                <button
                  key={role}
                  type="button"
                  className={`department-card ${
                    isActive
                      ? 'active'
                      : 'disabled'
                  }`}
                  disabled={!isActive}
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