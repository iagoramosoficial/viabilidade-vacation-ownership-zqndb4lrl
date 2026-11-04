import React from 'react'
import { Outlet } from 'react-router-dom'
import { Header } from '@/components/Header'

export default function Layout() {
  return (
    <div className="min-h-screen bg-background flex flex-col font-sans antialiased">
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
