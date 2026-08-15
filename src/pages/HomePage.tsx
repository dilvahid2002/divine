import './HomePage.css'
import { useNavigate } from 'react-router-dom'

interface HomePageProps {
  user: {
    name: string
    username: string
    roles: string[]
  }
}

const availableRoles = [
  'Sales',
  'Designer',
  'Printer',
  'Production',
  'Production Manager',
  'Sales Manager',
  'Accountant',
  'MD',
  'HR',
]

const departmentPaths: Record<string, string> = {
  Sales: '/departments/sales',

  Designer: '/departments/designer',

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
}

function HomePage({ user }: HomePageProps) {
  const navigate = useNavigate()

  /*
   * Navigate to department
   */
  const handleDepartmentClick = (
    role: string,
  ) => {
    const path = departmentPaths[role]

    if (path) {
      navigate(path)
    }
  }

  /*
   * Navigate to Sales Statistics
   */
  const handleSalesStatisticsClick = () => {
    navigate(
      '/departments/sales-statistics',
    )
  }

  return (
    <div className="home-page">

      {/* =========================================
          HEADER
      ========================================== */}

      <header className="home-header">

        <div>
          <h1>
            Work Manager
          </h1>

          <p>
            Welcome, <strong>{user.name}</strong>
          </p>
        </div>

        <div className="user-info">
          {user.username}
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
              user.roles.includes(role)

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
                  handleDepartmentClick(role)
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
              OTHER DEPARTMENTS
          ======================================== */}

          {availableRoles
            .filter(
              (role) =>
                role !== 'Sales',
            )
            .map((role) => {

              const isActive =
                user.roles.includes(role)

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