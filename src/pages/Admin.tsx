import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  ShieldAlert,
  ShieldCheck,
  Building2,
  UserPlus,
  Users,
  RefreshCw,
  Plus,
  Mail,
  KeyRound,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'

interface UsuarioAdminItem {
  id: string
  email: string
  name: string
  is_master: boolean
  created: string
  vinculos: {
    id: string
    empresa_id: string
    empresa_nome: string
    role: string
    created: string
  }[]
}

interface EmpresaAdminItem {
  id: string
  nome: string
  cnpj: string
  criador: string
}

export const AdminPage: React.FC = () => {
  const { user, isMaster, isLoading, recarregarEmpresas } = useAuth()

  const [usuarios, setUsuarios] = useState<UsuarioAdminItem[]>([])
  const [empresas, setEmpresas] = useState<EmpresaAdminItem[]>([])
  const [carregando, setCarregando] = useState(true)

  // Modais de Criação
  const [modalNovoUsuario, setModalNovoUsuario] = useState(false)
  const [modalNovaEmpresa, setModalNovaEmpresa] = useState(false)

  // Formulário Novo Usuário
  const [emailNovo, setEmailNovo] = useState('')
  const [nomeNovo, setNomeNovo] = useState('')
  const [senhaNova, setSenhaNova] = useState('')
  const [empresaSelecionadaId, setEmpresaSelecionadaId] = useState<string>('none')
  const [papelSelecionado, setPapelSelecionado] = useState<'admin_master' | 'analista' | 'viewer'>(
    'analista',
  )
  const [isMasterNovo, setIsMasterNovo] = useState(false)
  const [salvandoUsuario, setSalvandoUsuario] = useState(false)

  // Formulário Nova Empresa
  const [nomeEmpresaNova, setNomeEmpresaNova] = useState('')
  const [cnpjEmpresaNova, setCnpjEmpresaNova] = useState('')
  const [usuarioVinculoEmpresaId, setUsuarioVinculoEmpresaId] = useState<string>('self')
  const [papelVinculoEmpresa, setPapelVinculoEmpresa] = useState<
    'admin_master' | 'analista' | 'viewer'
  >('admin_master')
  const [salvandoEmpresa, setSalvandoEmpresa] = useState(false)

  const carregarDados = async () => {
    try {
      setCarregando(true)
      const res = await pb.send('/backend/v1/admin/usuarios', {
        method: 'GET',
      })
      setUsuarios(res.usuarios || [])
      setEmpresas(res.empresas || [])
    } catch (err: unknown) {
      toast.error(
        'Erro ao carregar dados administrativos: ' +
          (err instanceof Error ? err.message : String(err)),
      )
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (isMaster) {
      carregarDados()
    }
  }, [isMaster])

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Gate no cliente (o servidor já valida is_master em todas as rotas e retorna 403)
  if (!user || !isMaster) {
    return (
      <div className="container py-16 px-4 max-w-lg mx-auto text-center space-y-4">
        <div className="h-14 w-14 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto">
          <ShieldAlert className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Acesso Restrito</h1>
        <p className="text-muted-foreground text-sm">
          Esta área é restrita a Administradores Master do sistema. Seu usuário não possui esta
          permissão.
        </p>
        <Button onClick={() => window.history.back()} variant="outline">
          Voltar
        </Button>
      </div>
    )
  }

  const handleCriarUsuario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!emailNovo.trim() || !senhaNova.trim()) {
      toast.error('Preencha e-mail e senha')
      return
    }

    try {
      setSalvandoUsuario(true)
      const body: Record<string, unknown> = {
        email: emailNovo.trim().toLowerCase(),
        password: senhaNova.trim(),
        name: nomeNovo.trim(),
        is_master: isMasterNovo,
      }
      if (empresaSelecionadaId && empresaSelecionadaId !== 'none') {
        body.empresa_id = empresaSelecionadaId
        body.role = papelSelecionado
      }

      await pb.send('/backend/v1/admin/usuarios', {
        method: 'POST',
        body,
      })

      toast.success('Usuário criado com sucesso!')
      setModalNovoUsuario(false)
      setEmailNovo('')
      setNomeNovo('')
      setSenhaNova('')
      setEmpresaSelecionadaId('none')
      setPapelSelecionado('analista')
      setIsMasterNovo(false)
      await carregarDados()
    } catch (err: unknown) {
      toast.error('Erro ao criar usuário: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSalvandoUsuario(false)
    }
  }

  const handleCriarEmpresa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nomeEmpresaNova.trim()) {
      toast.error('Preencha o nome da empresa')
      return
    }

    try {
      setSalvandoEmpresa(true)
      const body: Record<string, unknown> = {
        nome: nomeEmpresaNova.trim(),
        cnpj: cnpjEmpresaNova.trim(),
      }
      if (usuarioVinculoEmpresaId && usuarioVinculoEmpresaId !== 'self') {
        body.usuario_id = usuarioVinculoEmpresaId
        body.role = papelVinculoEmpresa
      }

      await pb.send('/backend/v1/admin/empresas', {
        method: 'POST',
        body,
      })

      toast.success('Empresa criada com sucesso!')
      setModalNovaEmpresa(false)
      setNomeEmpresaNova('')
      setCnpjEmpresaNova('')
      setUsuarioVinculoEmpresaId('self')
      setPapelVinculoEmpresa('admin_master')
      await carregarDados()
      await recarregarEmpresas()
    } catch (err: unknown) {
      toast.error('Erro ao criar empresa: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSalvandoEmpresa(false)
    }
  }

  const roleLabels: Record<string, string> = {
    admin_master: 'Admin Master',
    analista: 'Analista',
    viewer: 'Visualizador',
  }

  return (
    <div className="container py-8 px-4 sm:px-8 space-y-8 max-w-6xl mx-auto">
      {/* Header Administrativo */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-6">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              Painel de Administração
            </h1>
            <Badge variant="default" className="gap-1 bg-emerald-600 hover:bg-emerald-700">
              <ShieldCheck className="h-3 w-3" /> Master
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Gestão centralizada de usuários, empresas e permissões de acesso ao sistema.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={carregando}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          {/* Modal Novo Usuário */}
          <Dialog open={modalNovoUsuario} onOpenChange={setModalNovoUsuario}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <UserPlus className="h-4 w-4" /> Novo Usuário
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <form onSubmit={handleCriarUsuario}>
                <DialogHeader>
                  <DialogTitle>Criar Novo Usuário</DialogTitle>
                  <DialogDescription>
                    Cadastre um usuário com senha provisória e vincule-o a uma empresa com o papel
                    desejado.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="nomeNovo">Nome Completo</Label>
                    <Input
                      id="nomeNovo"
                      placeholder="Ex: Carlos Andrade"
                      value={nomeNovo}
                      onChange={(e) => setNomeNovo(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="emailNovo">E-mail de Acesso *</Label>
                    <Input
                      id="emailNovo"
                      type="email"
                      placeholder="usuario@empresa.com.br"
                      value={emailNovo}
                      onChange={(e) => setEmailNovo(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="senhaNova">Senha Provisória (mínimo 8 dígitos) *</Label>
                    <Input
                      id="senhaNova"
                      type="password"
                      placeholder="••••••••"
                      value={senhaNova}
                      onChange={(e) => setSenhaNova(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="empresaSel">Vincular a Empresa Inicial (opcional)</Label>
                    <Select
                      value={empresaSelecionadaId}
                      onValueChange={(v) => setEmpresaSelecionadaId(v)}
                    >
                      <SelectTrigger id="empresaSel">
                        <SelectValue placeholder="Selecione uma empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhuma (vincular depois)</SelectItem>
                        {empresas.map((emp) => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {empresaSelecionadaId !== 'none' && (
                    <div className="grid gap-2">
                      <Label htmlFor="papelSel">Papel na Empresa</Label>
                      <Select
                        value={papelSelecionado}
                        onValueChange={(v) =>
                          setPapelSelecionado(v as 'admin_master' | 'analista' | 'viewer')
                        }
                      >
                        <SelectTrigger id="papelSel">
                          <SelectValue placeholder="Selecione o papel" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="analista">
                            Analista (edita premissas e cenários)
                          </SelectItem>
                          <SelectItem value="viewer">Visualizador (apenas consulta)</SelectItem>
                          <SelectItem value="admin_master">Admin da Empresa</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t">
                    <input
                      type="checkbox"
                      id="checkIsMaster"
                      checked={isMasterNovo}
                      onChange={(e) => setIsMasterNovo(e.target.checked)}
                      className="rounded border-gray-300 text-primary focus:ring-primary h-4 w-4"
                    />
                    <Label htmlFor="checkIsMaster" className="text-xs font-normal cursor-pointer">
                      Conceder acesso de{' '}
                      <strong className="font-semibold">Admin Master Geral</strong> (gerencia todos
                      os usuários e empresas do sistema)
                    </Label>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setModalNovoUsuario(false)}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={salvandoUsuario}>
                    {salvandoUsuario ? 'Criando...' : 'Criar Usuário'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Modal Nova Empresa */}
          <Dialog open={modalNovaEmpresa} onOpenChange={setModalNovaEmpresa}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" className="gap-1.5">
                <Building2 className="h-4 w-4" /> Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <form onSubmit={handleCriarEmpresa}>
                <DialogHeader>
                  <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
                  <DialogDescription>
                    Crie uma nova organização de estudos e vincule seu responsável.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="nomeEmpresaNovo">Nome da Empresa / Grupo *</Label>
                    <Input
                      id="nomeEmpresaNovo"
                      placeholder="Ex: Resort Sol & Mar Empreendimentos"
                      value={nomeEmpresaNova}
                      onChange={(e) => setNomeEmpresaNova(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="cnpjEmpresaNovo">CNPJ (opcional)</Label>
                    <Input
                      id="cnpjEmpresaNovo"
                      placeholder="00.000.000/0001-00"
                      value={cnpjEmpresaNova}
                      onChange={(e) => setCnpjEmpresaNova(e.target.value)}
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="userVinculo">Vincular a Usuário Existente</Label>
                    <Select
                      value={usuarioVinculoEmpresaId}
                      onValueChange={(v) => setUsuarioVinculoEmpresaId(v)}
                    >
                      <SelectTrigger id="userVinculo">
                        <SelectValue placeholder="Selecione um usuário" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Eu mesmo (Admin Master atual)</SelectItem>
                        {usuarios.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.name ? `${u.name} (${u.email})` : u.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="papelVinculo">Papel no Vínculo</Label>
                    <Select
                      value={papelVinculoEmpresa}
                      onValueChange={(v) =>
                        setPapelVinculoEmpresa(v as 'admin_master' | 'analista' | 'viewer')
                      }
                    >
                      <SelectTrigger id="papelVinculo">
                        <SelectValue placeholder="Selecione o papel" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin_master">Admin da Empresa</SelectItem>
                        <SelectItem value="analista">Analista</SelectItem>
                        <SelectItem value="viewer">Visualizador</SelectItem>
                      </SelectContent>
                    </Select>
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
                  <Button type="submit" disabled={salvandoEmpresa}>
                    {salvandoEmpresa ? 'Cadastrando...' : 'Cadastrar Empresa'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tabs com Lista de Usuários e Empresas */}
      <Tabs defaultValue="usuarios" className="space-y-6">
        <TabsList>
          <TabsTrigger value="usuarios" className="gap-2">
            <Users className="h-4 w-4" /> Usuários ({usuarios.length})
          </TabsTrigger>
          <TabsTrigger value="empresas" className="gap-2">
            <Building2 className="h-4 w-4" /> Empresas ({empresas.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab Usuários */}
        <TabsContent value="usuarios" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Usuários Cadastrados</CardTitle>
              <CardDescription>
                Usuários com acesso ao sistema e suas empresas autorizadas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {usuarios.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Nenhum usuário cadastrado.
                </div>
              ) : (
                <div className="divide-y border rounded-lg overflow-hidden bg-card">
                  {usuarios.map((u) => (
                    <div
                      key={u.id}
                      className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-foreground">
                            {u.name || '(Sem nome)'}
                          </span>
                          <span className="text-xs text-muted-foreground">({u.email})</span>
                          {u.is_master && (
                            <Badge
                              variant="default"
                              className="text-[10px] h-4 px-1.5 bg-emerald-600"
                            >
                              Master
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          ID: <span className="font-mono">{u.id}</span> • Cadastrado em{' '}
                          {new Date(u.created).toLocaleDateString('pt-BR')}
                        </div>
                      </div>

                      {/* Vínculos */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {u.vinculos.length === 0 ? (
                          <span className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900">
                            Sem empresa vinculada
                          </span>
                        ) : (
                          u.vinculos.map((v) => (
                            <Badge
                              key={v.id}
                              variant="outline"
                              className="text-xs py-0.5 gap-1.5 font-normal"
                            >
                              <Building2 className="h-3 w-3 text-muted-foreground" />
                              <span className="font-medium">{v.empresa_nome}</span>
                              <span className="text-muted-foreground">
                                ({roleLabels[v.role] || v.role})
                              </span>
                            </Badge>
                          ))
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab Empresas */}
        <TabsContent value="empresas" className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Empresas Cadastradas</CardTitle>
              <CardDescription>
                Organizações disponíveis para abrigar estudos e cenários.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {empresas.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground text-sm">
                  Nenhuma empresa cadastrada.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {empresas.map((emp) => (
                    <Card key={emp.id} className="p-4 flex flex-col justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-primary" />
                          <h4 className="font-semibold text-sm truncate">{emp.nome}</h4>
                        </div>
                        {emp.cnpj && (
                          <p className="text-xs text-muted-foreground font-mono">
                            CNPJ: {emp.cnpj}
                          </p>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono">ID: {emp.id}</p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
