import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'
import {
  ShieldCheck,
  Mail,
  LogOut,
  AlertTriangle,
  KeyRound,
  User,
  CheckCircle2,
  Lock,
} from 'lucide-react'

const rotulosPapel: Record<string, string> = {
  admin_master: 'Administrador Master',
  admin: 'Admin',
  analista: 'Analista',
  viewer: 'Visualizador',
}

export default function MeuPerfil() {
  const { user, empresa, membroRole, logout } = useAuth()
  const navigate = useNavigate()

  // Estado de edição de dados pessoais
  const [nome, setNome] = useState(user?.name || '')
  const [salvandoNome, setSalvandoNome] = useState(false)

  // Estado do formulário de troca de senha
  const [senhaAtual, setSenhaAtual] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmaSenha, setConfirmaSenha] = useState('')
  const [salvandoSenha, setSalvandoSenha] = useState(false)
  const [erroSenha, setErroSenha] = useState<string | null>(null)
  const [sucessoSenha, setSucessoSenha] = useState(false)

  const mustChange = Boolean(user?.must_change_password)

  const papelLabel = user?.is_master
    ? 'Administrador Master'
    : rotulosPapel[membroRole] || membroRole || null
  const iniciais = (user?.name || user?.email || '??').slice(0, 2).toUpperCase()

  const handleSalvarNome = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    const novoNome = nome.trim()
    if (!novoNome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe seu nome.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoNome(true)
    try {
      const atualizado = await pb.collection('users').update(user.id, {
        name: novoNome,
      })
      toast({
        title: 'Perfil atualizado',
        description: 'Seu nome foi alterado com sucesso.',
      })
      // Força sincronização do authStore
      pb.authStore.save(pb.authStore.token, atualizado)
    } catch (err: any) {
      const msg =
        err?.data?.message || err?.message || 'Não foi possível salvar as alterações no nome.'
      toast({
        title: 'Erro ao atualizar nome',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoNome(false)
    }
  }

  const handleTrocarSenha = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroSenha(null)
    setSucessoSenha(false)

    if (!user || !user.email) {
      setErroSenha('Usuário não autenticado.')
      return
    }

    if (!senhaAtual) {
      setErroSenha('Informe sua senha atual.')
      return
    }

    if (!novaSenha) {
      setErroSenha('Informe a nova senha.')
      return
    }

    if (novaSenha.length < 8) {
      setErroSenha('A nova senha deve ter no mínimo 8 caracteres.')
      return
    }

    if (novaSenha !== confirmaSenha) {
      setErroSenha('A confirmação da nova senha não coincide.')
      return
    }

    if (novaSenha === senhaAtual) {
      setErroSenha('A nova senha deve ser diferente da senha atual.')
      return
    }

    setSalvandoSenha(true)

    try {
      // 1. Valida se a senha atual está correta tentando autenticar
      try {
        await pb.collection('users').authWithPassword(user.email, senhaAtual)
      } catch (authErr: any) {
        setErroSenha('A senha atual está incorreta. Verifique e tente novamente.')
        setSalvandoSenha(false)
        return
      }

      // 2. Atualiza a senha no PocketBase e remove a obrigatoriedade de troca
      const payload: Record<string, any> = {
        oldPassword: senhaAtual,
        password: novaSenha,
        passwordConfirm: confirmaSenha,
        must_change_password: false,
      }

      await pb.collection('users').update(user.id, payload)

      // 3. A troca de senha invalida tokens ativos no PocketBase.
      // Reautentica imediatamente com a nova senha para manter a sessão ativa sem deslogar o usuário.
      const novoAuth = await pb.collection('users').authWithPassword(user.email, novaSenha)
      pb.authStore.save(novoAuth.token, novoAuth.record)

      // Limpa os campos
      setSenhaAtual('')
      setNovaSenha('')
      setConfirmaSenha('')
      setSucessoSenha(true)

      toast({
        title: 'Senha alterada com sucesso!',
        description: 'Sua nova senha já está ativa e seu acesso liberado.',
      })

      // Se estava bloqueado por mustChange, após atualizar o authStore navega de volta para a tela inicial
      if (mustChange) {
        setTimeout(() => {
          navigate('/')
        }, 800)
      }
    } catch (updateErr: any) {
      console.error('Erro ao atualizar senha:', updateErr)
      const dataErrors = updateErr?.data?.data
      let detalhe = ''
      if (dataErrors) {
        detalhe = Object.entries(dataErrors)
          .map(([k, v]: [string, any]) => `${k}: ${v?.message || JSON.stringify(v)}`)
          .join(', ')
      }
      const msg =
        detalhe ||
        updateErr?.data?.message ||
        updateErr?.message ||
        'Não foi possível atualizar a senha. Tente novamente.'

      setErroSenha(msg)
      toast({
        title: 'Erro ao trocar senha',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSalvandoSenha(false)
    }
  }

  return (
    <div className="container py-8 px-4 sm:px-8 space-y-6 max-w-2xl">
      {/* Alerta de senha obrigatória */}
      {mustChange && (
        <Alert variant="destructive" className="border-destructive/60 bg-destructive/10">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle className="text-base font-semibold">
            Defina uma nova senha para continuar
          </AlertTitle>
          <AlertDescription className="text-sm mt-1">
            Por motivos de segurança, você precisa alterar sua senha provisória antes de acessar as
            demais funcionalidades do sistema.
          </AlertDescription>
        </Alert>
      )}

      {/* Cartão de Resumo da Conta */}
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
            {papelLabel && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" /> Papel
                </span>
                <Badge variant="secondary" className="font-mono text-[11px]">
                  {papelLabel}
                </Badge>
              </div>
            )}
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

      {/* Formulário: Editar Nome */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Dados Pessoais
          </CardTitle>
          <CardDescription>Atualize seu nome de exibição no sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSalvarNome} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input
                id="nome"
                type="text"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome"
                disabled={salvandoNome}
                required
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={salvandoNome || nome.trim() === (user?.name || '')}>
                {salvandoNome ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Formulário: Trocar Senha */}
      <Card
        className={
          mustChange ? 'border-2 border-primary shadow-md ring-2 ring-primary/20 ring-offset-2' : ''
        }
      >
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-primary" /> Trocar Senha
            </CardTitle>
            {mustChange && (
              <Badge variant="destructive" className="text-xs">
                Obrigatório
              </Badge>
            )}
          </div>
          <CardDescription>
            {mustChange
              ? 'Por segurança, você deve definir sua nova senha antes de navegar no sistema.'
              : 'Defina uma nova senha para acessar sua conta (mínimo de 8 caracteres).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {erroSenha && (
            <Alert variant="destructive" className="mb-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Não foi possível alterar a senha</AlertTitle>
              <AlertDescription>{erroSenha}</AlertDescription>
            </Alert>
          )}

          {sucessoSenha && (
            <Alert className="mb-4 border-emerald-500/50 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <AlertTitle>Senha alterada com sucesso!</AlertTitle>
              <AlertDescription>
                Sua credencial foi atualizada e sua sessão foi reautenticada automaticamente.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleTrocarSenha} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="senhaAtual">Senha Atual</Label>
              <div className="relative">
                <Input
                  id="senhaAtual"
                  type="password"
                  value={senhaAtual}
                  onChange={(e) => setSenhaAtual(e.target.value)}
                  placeholder="Digite sua senha atual"
                  disabled={salvandoSenha}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="novaSenha">Nova Senha</Label>
                <Input
                  id="novaSenha"
                  type="password"
                  value={novaSenha}
                  onChange={(e) => setNovaSenha(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  minLength={8}
                  disabled={salvandoSenha}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmaSenha">Confirmar Nova Senha</Label>
                <Input
                  id="confirmaSenha"
                  type="password"
                  value={confirmaSenha}
                  onChange={(e) => setConfirmaSenha(e.target.value)}
                  placeholder="Repita a nova senha"
                  minLength={8}
                  disabled={salvandoSenha}
                  required
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              A senha deve conter pelo menos 8 caracteres. Após a alteração, sua sessão será
              reautenticada automaticamente.
            </p>

            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={salvandoSenha} className="gap-2">
                <Lock className="h-4 w-4" />
                {salvandoSenha ? 'Alterando senha...' : 'Atualizar Senha'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
