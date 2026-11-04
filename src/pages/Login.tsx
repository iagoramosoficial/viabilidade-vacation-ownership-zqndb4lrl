import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Mail, Lock, ArrowRight, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

export const Login: React.FC = () => {
  const { login } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    try {
      setLoading(true)
      await login(email.trim().toLowerCase(), password)
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50/60 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm space-y-6">
        <Card className="border border-border/60 bg-card shadow-sm">
          <CardHeader className="space-y-1.5 text-center pb-6">
            <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold shadow-sm">
              VO
            </div>
            <CardTitle className="text-xl font-bold tracking-tight">
              Viabilidade Vacation Ownership
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Entre com suas credenciais para acessar a plataforma
            </CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emailLogin" className="text-xs font-medium">
                  E-mail
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="emailLogin"
                    type="email"
                    placeholder="seu.email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 text-sm"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="passLogin" className="text-xs font-medium">
                    Senha
                  </Label>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="passLogin"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 text-sm"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full gap-2 mt-2" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
