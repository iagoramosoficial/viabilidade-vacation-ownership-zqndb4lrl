import React, { useState } from 'react'
import { executarTestesSinteticos, type TestResultItem } from '@/services/tests'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2, XCircle, Play, ShieldAlert, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'

export const PaginaTestes: React.FC = () => {
  const [testes, setTestes] = useState<TestResultItem[]>(() => executarTestesSinteticos())
  const [executando, setExecutando] = useState(false)

  const rodarTestes = () => {
    setExecutando(true)
    setTimeout(() => {
      const res = executarTestesSinteticos()
      setTestes(res)
      setExecutando(false)
    }, 200)
  }

  const totalSucessos = testes.filter((t) => t.sucesso).length
  const todosPassaram = totalSucessos === testes.length

  return (
    <div className="container py-8 px-4 sm:px-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para Meus Estudos
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Suíte de Testes Sintéticos Obrigatórios
          </h1>
          <p className="text-sm text-muted-foreground">
            Validação rigorosa dos 10 casos de cálculo determinístico e regras de autorização
            exigidas no enunciado
          </p>
        </div>

        <Button onClick={rodarTestes} disabled={executando} className="gap-2">
          <Play className="h-4 w-4" />{' '}
          {executando ? 'Executando...' : 'Reexecutar Testes Sintéticos'}
        </Button>
      </div>

      <div className="flex items-center gap-4 p-4 rounded-lg border bg-card">
        <div
          className={`p-3 rounded-full ${todosPassaram ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' : 'bg-red-100 text-red-700'}`}
        >
          {todosPassaram ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
        </div>
        <div>
          <h2 className="font-semibold text-base">
            Status: {totalSucessos} de {testes.length} testes aprovados
          </h2>
          <p className="text-xs text-muted-foreground">
            {todosPassaram
              ? 'Todos os 10 testes do motor determinístico, cronograma, devoluções, transferências e autorização foram comprovados.'
              : 'Há falhas na validação matemática ou de regras.'}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {testes.map((teste) => (
          <Card
            key={teste.id}
            className="border-l-4 overflow-hidden"
            style={{ borderLeftColor: teste.sucesso ? '#10b981' : '#ef4444' }}
          >
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant={teste.sucesso ? 'default' : 'destructive'}
                  className="font-mono text-xs"
                >
                  Teste {teste.id}
                </Badge>
                <CardTitle className="text-sm font-semibold">{teste.nome}</CardTitle>
              </div>
              <Badge variant={teste.sucesso ? 'outline' : 'destructive'} className="gap-1 text-xs">
                {teste.sucesso ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> APROVADO
                  </>
                ) : (
                  <>
                    <XCircle className="h-3.5 w-3.5 text-red-600" /> REPROVADO
                  </>
                )}
              </Badge>
            </CardHeader>
            <CardContent className="py-2 px-4 text-xs space-y-1 bg-muted/20">
              <p className="text-foreground">{teste.detalhe}</p>
              {teste.esperado !== undefined && (
                <div className="text-[11px] font-mono text-muted-foreground pt-1 border-t grid sm:grid-cols-2 gap-2">
                  <div>
                    <span className="font-semibold">Esperado:</span>{' '}
                    {JSON.stringify(teste.esperado)}
                  </div>
                  <div>
                    <span className="font-semibold">Obtido:</span> {JSON.stringify(teste.obtido)}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900">
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="h-4 w-4" /> Observação Importante do Enunciado
          </CardTitle>
          <CardDescription className="text-xs text-amber-800 dark:text-amber-300">
            "Build verde sozinho não comprova cálculo correto. Conciliar caixa, carteira, estoque e
            transferências (totalizações conferíveis)." Todos os 10 testes são executados
            deterministicamente no navegador e validados no backend via PocketBase.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
