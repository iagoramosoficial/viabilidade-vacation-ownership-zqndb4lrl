import React, { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, RefreshCw, Cpu, ShieldCheck, AlertTriangle } from 'lucide-react'

interface AutotesteCaso {
  id: number
  nome: string
  esperado: unknown
  obtido: unknown
  passou: boolean
  detalhe?: string
}

interface AutotesteResponse {
  motor_versao: string
  total_casos: number
  total_passou: number
  todos_passaram: boolean
  casos: AutotesteCaso[]
  error?: string
}

export const PaginaTestes: React.FC = () => {
  const { user, isMaster, isLoading: authLoading } = useAuth()
  const [dados, setDados] = useState<AutotesteResponse | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const executarAutoteste = async () => {
    setCarregando(true)
    setErro(null)
    try {
      const res = (await pb.send('/backend/v1/viabilidade/autoteste', {
        method: 'GET',
      })) as AutotesteResponse
      setDados(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao executar autoteste no servidor'
      setErro(msg)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    if (isMaster) {
      executarAutoteste()
    }
  }, [isMaster])

  if (authLoading) {
    return (
      <div className="container mx-auto px-4 py-12 flex justify-center items-center">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user || !isMaster) {
    return <Navigate to="/" replace />
  }

  function formatarValor(val: unknown): string {
    if (val === null || val === undefined) return '-'
    if (typeof val === 'number') {
      return Number.isInteger(val) ? String(val) : val.toFixed(2)
    }
    if (typeof val === 'string') return val
    if (typeof val === 'boolean') return val ? 'true' : 'false'
    try {
      return JSON.stringify(val)
    } catch {
      return String(val)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Autoteste do Motor</h1>
            <Badge variant="outline" className="gap-1 border-emerald-500/40 text-emerald-600">
              <ShieldCheck className="h-3 w-3" />
              Master Only
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Resultados executados no servidor pelo endpoint oficial{' '}
            <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
              GET /backend/v1/viabilidade/autoteste
            </code>
          </p>
        </div>

        <Button onClick={executarAutoteste} disabled={carregando} className="gap-2 shrink-0">
          <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          {carregando ? 'Executando no servidor...' : 'Reexecutar Autoteste'}
        </Button>
      </div>

      {erro && (
        <Card className="border-destructive/40 bg-destructive/10">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-destructive">Erro na execução do autoteste</p>
              <p className="text-sm text-muted-foreground mt-1">{erro}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {dados && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Cpu className="h-4 w-4" />
                  Versão do Motor
                </CardDescription>
                <CardTitle className="text-2xl font-mono text-primary">
                  {dados.motor_versao || 'v1.4.0'}
                </CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Total de Casos</CardDescription>
                <CardTitle className="text-2xl">{dados.total_casos}</CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Casos Aprovados</CardDescription>
                <CardTitle className="text-2xl text-emerald-600">{dados.total_passou}</CardTitle>
              </CardHeader>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Status Global</CardDescription>
                <CardTitle className="text-xl">
                  {dados.todos_passaram ? (
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" /> 100% Aprovado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <XCircle className="h-5 w-5" /> Falhas Detectadas
                    </span>
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Casos de Teste do Motor de Viabilidade</CardTitle>
              <CardDescription>
                Exibe exatamente os dados retornados pela rota do servidor para cada caso de
                validação.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left border-b font-medium">
                    <tr>
                      <th className="p-3 w-12 text-center">#</th>
                      <th className="p-3">Caso / Descrição</th>
                      <th className="p-3 min-w-[200px]">Esperado</th>
                      <th className="p-3 min-w-[200px]">Obtido</th>
                      <th className="p-3 w-28 text-center">Passou</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {dados.casos.map((caso) => (
                      <tr
                        key={caso.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          !caso.passou ? 'bg-destructive/5' : ''
                        }`}
                      >
                        <td className="p-3 font-mono text-center text-xs font-semibold text-muted-foreground">
                          {caso.id}
                        </td>
                        <td className="p-3">
                          <div className="font-medium text-foreground">{caso.nome}</div>
                          {caso.detalhe && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {caso.detalhe}
                            </div>
                          )}
                        </td>
                        <td className="p-3 font-mono text-xs text-muted-foreground break-all">
                          {formatarValor(caso.esperado)}
                        </td>
                        <td className="p-3 font-mono text-xs break-all">
                          <span
                            className={
                              caso.passou
                                ? 'text-emerald-700 font-medium'
                                : 'text-destructive font-semibold'
                            }
                          >
                            {formatarValor(caso.obtido)}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          {caso.passou ? (
                            <Badge
                              variant="outline"
                              className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 gap-1"
                            >
                              <CheckCircle2 className="h-3 w-3" />
                              Passou
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="gap-1">
                              <XCircle className="h-3 w-3" />
                              Falhou
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
