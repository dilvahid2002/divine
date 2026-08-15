import { useState } from 'react'
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom'

import LoginPage from './pages/LoginPage'
import UserManager from './pages/UserManager'
import HomePage from './pages/HomePage'

import JobOrder from './pages/departments/JobOrder'
import Sales from './pages/departments/Sales'
import SalesStatistics from './pages/departments/SalesStatistics'
import Designer from './pages/departments/Designer'
import Printer from './pages/departments/Printer'
import Production from './pages/departments/Production'
import ProductionManager from './pages/departments/ProductionManager'
import SalesManager from './pages/departments/SalesManager'
import Accountant from './pages/departments/Accountant'
import MD from './pages/departments/MD'
import HR from './pages/departments/HR'

import './App.css'

interface User {
  name: string
  username: string
  password: string
  roles: string[]
}

interface DepartmentRouteProps {
  user: User
  role: string
  children: React.ReactNode
}

function DepartmentRoute({
  user,
  role,
  children,
}: DepartmentRouteProps) {
  /*
   * Check whether the logged-in user
   * has access to this department.
   */
  if (!user.roles.includes(role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function App() {
  const [currentUser, setCurrentUser] =
    useState<User | null>(null)

  /*
   * Called after successful login.
   */
  const handleLogin = (user: User) => {
    setCurrentUser(user)
  }

  /*
   * User is not logged in.
   */
  if (!currentUser) {
    return (
      <BrowserRouter>
        <LoginPage onLogin={handleLogin} />
      </BrowserRouter>
    )
  }

  return (
    <BrowserRouter>

      <Routes>

        {/* =========================================
            HOME
        ========================================== */}

        <Route
          path="/"
          element={
            currentUser.username === 'admin' &&
            currentUser.password === 'admin' ? (
              <UserManager />
            ) : (
              <HomePage user={currentUser} />
            )
          }
        />


        {/* =========================================
            JOB ORDER
        ========================================== */}

        <Route
          path="/departments/job-order"
          element={
            <JobOrder user={currentUser} />
          }
        />


        {/* =========================================
            SALES
        ========================================== */}

        <Route
          path="/departments/sales"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Sales"
            >
              <Sales user={currentUser} />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            SALES STATISTICS
        ========================================== */}

        <Route
          path="/departments/sales-statistics"
          element={
            <SalesStatistics
              user={currentUser}
            />
          }
        />


        {/* =========================================
            DESIGNER
        ========================================== */}

        <Route
          path="/departments/designer"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Designer"
            >
              <Designer user={currentUser} />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            PRINTER
        ========================================== */}

        <Route
          path="/departments/printer"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Printer"
            >
              <Printer />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            PRODUCTION
        ========================================== */}

        <Route
          path="/departments/production"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Production"
            >
              <Production />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            PRODUCTION MANAGER
        ========================================== */}

        <Route
          path="/departments/production-manager"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Production Manager"
            >
              <ProductionManager />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            SALES MANAGER
        ========================================== */}

        <Route
          path="/departments/sales-manager"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Sales Manager"
            >
              <SalesManager />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            ACCOUNTANT
        ========================================== */}

        <Route
          path="/departments/accountant"
          element={
            <DepartmentRoute
              user={currentUser}
              role="Accountant"
            >
              <Accountant />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            MD
        ========================================== */}

        <Route
          path="/departments/md"
          element={
            <DepartmentRoute
              user={currentUser}
              role="MD"
            >
              <MD />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            HR
        ========================================== */}

        <Route
          path="/departments/hr"
          element={
            <DepartmentRoute
              user={currentUser}
              role="HR"
            >
              <HR />
            </DepartmentRoute>
          }
        />


        {/* =========================================
            UNKNOWN URL
        ========================================== */}

        <Route
          path="*"
          element={
            <Navigate to="/" replace />
          }
        />

      </Routes>

    </BrowserRouter>
  )
}

export default App