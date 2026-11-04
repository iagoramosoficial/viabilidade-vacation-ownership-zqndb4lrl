// Navigation & Header Component
import React, { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Building2,
  LogOut,
  Plus,
  ShieldCheck,
  FolderKanban,
  CheckCircle2,
  ChevronDown,
  CheckCircle,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { toast } from 'sonner'

export const Header: React.FC = () => {
  const {
    user,
    empresa,
    membroRole,
    logout,
    empresasDisponiveis,
    selecionarEmpresa,
    recarregarEmpresas,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [modalNovaEmpresa, setModalNovaEmpresa] = useState(false)
  const [nomeNovaEmpresa, setNomeNovaEmpresa] = useState('')
  const [cnpjNovaEmpresa, setCnpjNovaEmpresa] = useState('')
  const [criandoEmpresa, setCriandoEmpresa] = useState(false)

  const handleCriarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nomeNovaEmpresa.trim() || !user) return

    try {
      setCriandoEmpresa(true)
      const nova = await pb.collection('empresas').create({
        nome: nomeNovaEmpresa.trim(),
        cnpj: cnpjNovaEmpresa.trim(),
        criador: user.id,
      })

      // Create owner membership
      await pb.collection('empresa_membros').create({
        empresa: nova.id,
        user: user.id,
        role: 'admin_master',
      })

      await recarregarEmpresas()
      await selecionarEmpresa(nova.id)
      setModalNovaEmpresa(false)
      setNomeNovaEmpresa('')
      setCnpjNovaEmpresa('')
      toast.success('Empresa criada com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao criar empresa: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCriandoEmpresa(false)
    }
  }

  const roleLabels: Record<string, string> = {
    admin_master: 'Admin Master',
    analista: 'Analista',
    viewer: 'Visualizador',
  }

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4 sm:px-8">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
              VO
            </div>
            <div className="flex flex-col">
              <span className="font-semibold tracking-tight text-foreground text-sm sm:text-base leading-none">
                Viabilidade Vacation Ownership
              </span>
              <span className="text-[11px] text-muted-foreground mt-0.5">
                Blueprint v1.3 • Motor Determinístico
              </span>
            </div>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-4 text-sm font-medium">
              <Link
                to="/"
                className={`transition-colors hover:text-foreground/80 flex items-center gap-1.5 ${
                  location.pathname === '/' ? 'text-foreground font-semibold' : 'text-foreground/60'
                }`}
              >
                <FolderKanban className="h-4 w-4" />
                Meus Estudos
              </Link>
              <Link
                to="/testes"
                className={`transition-colors hover:text-foreground/80 flex items-center gap-1.5 ${
                  location.pathname === '/testes'
                    ? 'text-foreground font-semibold'
                    : 'text-foreground/60'
                }`}
              >
                <CheckCircle2 className="h-4 w-4" />
                Testes Sintéticos (10)
              </Link>
            </nav>
          )}
        </div>

        <div className="flex items-center gap-3">
          {user ? (
            <>
              {/* Seletor de Empresa */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-9 gap-2 max-w-[200px] sm:max-w-[260px] truncate"
                  >
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">
                      {empresa ? empresa.nome : 'Selecionar Empresa'}
                    </span>
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
                  <DropdownMenuSeparator />
                  <Dialog open={modalNovaEmpresa} onOpenChange={setModalNovaEmpresa}>
                    <DialogTrigger asChild>
                      <DropdownMenuItem
                        onSelect={(e) => e.preventDefault()}
                        className="cursor-pointer text-primary font-medium"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Nova Empresa
                      </DropdownMenuItem>
                    </DialogTrigger>
                    <DialogContent>
                      <form onSubmit={handleCriarEmpresa}>
                        <DialogHeader>
                          <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
                          <DialogDescription>
                            Cada estudo pertence a uma empresa autorizada. O criador se torna Admin
                            Master da empresa.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                          <div className="grid gap-2">
                            <Label htmlFor="nomeEmpresa">Nome da Empresa / Grupo *</Label>
                            <Input
                              id="nomeEmpresa"
                              placeholder="Ex: Grupo Hoteleiro Sol & Mar"
                              value={nomeNovaEmpresa}
                              onChange={(e) => setNomeNovaEmpresa(e.target.value)}
                              required
                            />
                          </div>
                          <div className="grid gap-2">
                            <Label htmlFor="cnpjEmpresa">CNPJ (opcional)</Label>
                            <Input
                              id="cnpjEmpresa"
                              placeholder="00.000.000/0001-00"
                              value={cnpjNovaEmpresa}
                              onChange={(e) => setCnpjNovaEmpresa(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setModalNovaEmpresa(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            type="submit"
                            disabled={criandoEmpresa || !nomeNovaEmpresa.trim()}
                          >
                            {criandoEmpresa ? 'Cadastrando...' : 'Cadastrar Empresa'}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Papel do Usuário */}
              <Badge
                variant="secondary"
                className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] h-7 px-2"
              >
                <ShieldCheck className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
                {roleLabels[membroRole] || membroRole}
              </Badge>

              {/* Menu do Usuário */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 px-2 gap-2">
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center font-medium text-xs">
                      {user.name
                        ? user.name.slice(0, 2).toUpperCase()
                        : user.email.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="hidden sm:inline text-xs font-medium max-w-[120px] truncate">
                      {user.name || user.email}
                    </span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div className="font-medium text-sm">{user.name || 'Usuário'}</div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/testes')} className="cursor-pointer">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Testes Sintéticos (10)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      logout()
                      navigate('/login')
                    }}
                    className="text-destructive cursor-pointer"
                  >
                    <LogOut className="h-4 w-4 mr-2" />
                    Sair da Conta
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : (
            <Link to="/login">
              <Button size="sm">Entrar / Acessar</Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
