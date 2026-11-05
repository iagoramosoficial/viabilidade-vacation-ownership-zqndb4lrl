import React from 'react'
import { Outlet, useLocation, useNavigate, Link, Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  SidebarSeparator,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import {
  Building2,
  FolderKanban,
  ShieldCheck,
  CheckCircle2,
  CheckCircle,
  ChevronDown,
  UserCircle,
  LogOut,
} from 'lucide-react'

const rotulosPapel: Record<string, string> = {
  admin_master: 'Administrador Master',
  admin: 'Admin',
  analista: 'Analista',
  viewer: 'Visualizador',
}

export default function Layout() {
  const { user, empresa, membroRole, logout, empresasDisponiveis, selecionarEmpresa } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Sem sessão, qualquer rota cai no login (tela sozinha, fora do Layout).
  if (!user) return <Navigate to="/login" replace />

  // Se o usuário precisa trocar a senha obrigatoriamente, força ida para /perfil
  if (user.must_change_password && location.pathname !== '/perfil') {
    return <Navigate to="/perfil" replace />
  }

  const tituloPagina = (() => {
    if (location.pathname.startsWith('/admin')) return 'Admin'
    if (location.pathname.startsWith('/testes')) return 'Autoteste do Motor'
    if (location.pathname.startsWith('/estudo/')) return 'Estudo de Viabilidade'
    if (location.pathname === '/perfil') return 'Perfil'
    return 'Meus Estudos de Viabilidade'
  })()

  const itens = [
    { titulo: 'Meus Estudos', caminho: '/', icone: FolderKanban, somenteMaster: false },
    { titulo: 'Admin', caminho: '/admin', icone: ShieldCheck, somenteMaster: true },
    { titulo: 'Autoteste', caminho: '/testes', icone: CheckCircle2, somenteMaster: true },
  ]

  const papelLabel = user.is_master
    ? 'Administrador Master'
    : rotulosPapel[membroRole] || membroRole || null

  const iniciais = (user.name || user.email || '??').slice(0, 2).toUpperCase()

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="offcanvas"
        className="border-r border-sidebar-border/70 bg-sidebar/80 backdrop-blur-md supports-[backdrop-filter]:bg-sidebar/70"
      >
        {/* Marca */}
        <SidebarHeader className="h-20 flex-row items-center gap-3 px-4 border-b border-border/60">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
            VO
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Viabilidade
            </span>
            <span className="text-[11px] text-muted-foreground">Vacation Ownership</span>
          </div>
        </SidebarHeader>

        <SidebarSeparator className="mx-0" />

        {/* Navegação */}
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {itens
                  .filter((item) => !item.somenteMaster || user.is_master)
                  .map((item) => {
                    const ativo =
                      item.caminho === '/'
                        ? location.pathname === '/'
                        : location.pathname.startsWith(item.caminho)
                    const Icone = item.icone
                    return (
                      <SidebarMenuItem key={item.caminho}>
                        <SidebarMenuButton
                          asChild
                          isActive={ativo}
                          tooltip={item.titulo}
                          className="h-11 rounded-lg data-[active=true]:bg-primary/10 data-[active=true]:font-bold data-[active=true]:text-primary data-[active=false]:text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Link to={item.caminho}>
                            <Icone className="size-4" />
                            <span>{item.titulo}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Rodapé: usuário */}
        <SidebarFooter className="border-t border-border/60">
          <div className="flex items-center gap-2 px-1 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
              {iniciais}
            </div>
            <div className="flex-1 min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {user.name || user.email}
              </div>
              {papelLabel && (
                <div className="truncate text-[11px] text-muted-foreground">{papelLabel}</div>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground"
                >
                  <ChevronDown className="h-4 w-4" />
                  <span className="sr-only">Menu do usuário</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="end" className="w-52">
                <DropdownMenuItem onClick={() => navigate('/perfil')} className="cursor-pointer">
                  <UserCircle className="mr-2 h-4 w-4" />
                  Meu Perfil
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    logout()
                    navigate('/login')
                  }}
                  className="text-destructive cursor-pointer"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </SidebarFooter>
      </Sidebar>

      {/* Conteúdo */}
      <SidebarInset className="flex flex-col min-h-svh">
        {/* Barra superior */}
        <header className="sticky top-0 z-20 flex h-20 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background/80 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2 min-w-0">
            <SidebarTrigger className="-ml-1 md:hidden" />
            <h1 className="truncate text-base sm:text-lg font-semibold tracking-tight text-foreground">
              {tituloPagina}
            </h1>
          </div>

          {/* Seletor de empresa (sem "Nova empresa") */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-2 max-w-[180px] sm:max-w-[260px] truncate"
              >
                <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{empresa ? empresa.nome : 'Selecionar Empresa'}</span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                Empresa Selecionada
              </DropdownMenuLabel>
              {empresasDisponiveis.map((e) => (
                <DropdownMenuItem
                  key={e.id}
                  onClick={() => selecionarEmpresa(e.id)}
                  className="flex items-center justify-between cursor-pointer"
                >
                  <span className="truncate font-medium">{e.nome}</span>
                  {empresa?.id === e.id && (
                    <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
