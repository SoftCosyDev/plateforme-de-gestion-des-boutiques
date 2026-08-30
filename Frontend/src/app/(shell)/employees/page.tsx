'use client'

import { useState } from 'react'
import { UserCog, Users, Clock, Wallet } from 'lucide-react'
import EmployeesTab from '@/components/employees/employees-tab'
import AttendanceTab from '@/components/employees/attendance-tab'
import PayrollTab from '@/components/employees/payroll-tab'

type Tab = 'employees' | 'attendance' | 'payroll'

const TABS: { id: Tab; label: string; icon: typeof Users }[] = [
  { id: 'employees', label: 'Employés', icon: Users },
  { id: 'attendance', label: 'Absences & Retards', icon: Clock },
  { id: 'payroll', label: 'Paie', icon: Wallet },
]

export default function EmployeesPage() {
  const [tab, setTab] = useState<Tab>('employees')

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground flex items-center gap-3">
          <UserCog className="w-8 h-8 text-primary" />
          Employés
        </h1>
        <p className="text-muted-foreground mt-1 text-sm font-medium">Équipe, présence et paie — tout au même endroit</p>
      </div>

      <div className="border-b border-border/50 flex gap-1 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-bold border-b-2 whitespace-nowrap transition-colors ${
                active ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'employees' && <EmployeesTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'payroll' && <PayrollTab />}
    </div>
  )
}
