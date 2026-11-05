import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ShieldCheck, Mail, LogOut } from 'lucide-react'

const rotulosPapel: Record<string, string> = {
  admin_master: 'Administrador Master',
  admin: 'Admin',
  analista: 'Analista',
  viewer: 'Visualizador',
}

export default function MeuPerfil() {
  const { user, empresa, membroRole, logout } = useAuth()
  const navigate = useNavigate()

  const papelLabel = user?.is_master
    ? 'Administrador Master'
    : rotulosPapel[membroRole] || membroRole
  const iniciais = (user?.name || user?.email || '??').slice(0, 2).toUpperCase()

  return (
    <div className="container py-8 px-4 sm:px-8 space-y-6 max-w-2xl">
      <Card>
        <CardHeader className="space-y-1.5">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">
              {iniciais}
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl font-bold tracking-tight truncate">
                {user?.name || 'Usuário'}
              </CardTitle>
              <CardDescription className="truncate">{user?.email}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Separator />
          <div className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Papel
              </span>
              <Badge variant="secondary" className="font-mono text-[11px]">
                {papelLabel}
              </Badge>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground flex items-center gap-2">
                <Mail className="h-4 w-4" /> E-mail
              </span>
              <span className="font-medium truncate">{user?.email}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Empresa ativa</span>
              <span className="font-medium truncate">{empresa ? empresa.nome : '—'}</span>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                logout()
                navigate('/login')
              }}
              className="gap-2"
            >
              <LogOut className="h-4 w-4" /> Sair
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
