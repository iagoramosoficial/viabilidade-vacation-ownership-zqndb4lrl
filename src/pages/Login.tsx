import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ShieldAlert, LogIn, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

export const Login: React.FC = () => {
  const { login, signup } = useAuth()
  const navigate = useNavigate()

  const [activeTab, setActiveTab] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    try {
      setLoading(true)
      await login(email, password)
      toast.success('Autenticado com sucesso!')
      navigate('/')
    } catch (err: unknown) {
      toast.error(
        'Falha no login: ' + (err instanceof Error ? err.message : 'Credenciais inválidas'),
      )
    } finally {
      setLoading(false)
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password || !name) return

    try {
      setLoading(true)
      await signup(email, password, name)
      toast.success('Conta criada com sucesso!')
      navigate('/')
    } catch (err: unknown) {
      toast.error('Erro ao cadastrar: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Viabilidade Vacation Ownership</h1>
          <p className="text-sm text-muted-foreground">
            Acesso ao sistema determinístico e gestão de estudos de viabilidade
          </p>
        </div>

        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle className="text-xs font-semibold">Política de Acesso e Segurança</AlertTitle>
          <AlertDescription className="text-xs mt-1">
            Cada estudo pertence a uma empresa autorizada com titularidade validada no servidor. Não
            é concedido papel privilegiado nem Admin Master arbitrário pelo cliente.
          </AlertDescription>
        </Alert>

        <Card className="shadow-md">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'signup')}>
            <CardHeader className="pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login" className="gap-2">
                  <LogIn className="h-4 w-4" /> Entrar
                </TabsTrigger>
                <TabsTrigger value="signup" className="gap-2">
                  <UserPlus className="h-4 w-4" /> Criar Conta
                </TabsTrigger>
              </TabsList>
            </CardHeader>

            <TabsContent value="login">
              <form onSubmit={handleLogin}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="emailLogin">E-mail</Label>
                    <Input
                      id="emailLogin"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passLogin">Senha</Label>
                    <Input
                      id="passLogin"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Acessando...' : 'Entrar no Sistema'}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="nomeSignup">Nome Completo</Label>
                    <Input
                      id="nomeSignup"
                      placeholder="Seu Nome ou Razão Social"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emailSignup">E-mail Corporativo</Label>
                    <Input
                      id="emailSignup"
                      type="email"
                      placeholder="seu@email.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="passSignup">Senha (mínimo 8 caracteres)</Label>
                    <Input
                      id="passSignup"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      minLength={8}
                      required
                    />
                  </div>
                </CardContent>
                <CardFooter>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Cadastrando...' : 'Cadastrar e Criar Empresa'}
                  </Button>
                </CardFooter>
              </form>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  )
}
