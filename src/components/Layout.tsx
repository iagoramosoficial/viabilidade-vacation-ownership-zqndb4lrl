import React from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from '@/components/Header'

export default function Layout() {
  const location = useLocation()
  const isLoginPage = location.pathname === '/login'

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans antialiased">
      {!isLoginPage && <Header />}
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
