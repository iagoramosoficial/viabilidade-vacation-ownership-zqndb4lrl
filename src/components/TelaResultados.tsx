// Results Presentation Component
import React from 'react'
import type { ResultadoSimulacaoViabilidade } from '@/types/viabilidade'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  vb_formatarBRL as formatarBRL,
  vb_formatarPorcentagem as formatarPorcentagem,
} from '@/lib/pocketbase/viabilidade_core.mjs'
import {
  TrendingUp,
  DollarSign,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  RotateCw,
  Building2,
  Briefcase,
  HelpCircle,
  FileSpreadsheet,
  Wallet,
} from 'lucide-react'

interface TelaResultadosProps {
  resultado: ResultadoSimulacaoViabilidade
  isStale: boolean
  onRecalcular: () => void
}

export const TelaResultados: React.FC<TelaResultadosProps> = ({
  resultado,
  isStale,
  onRecalcular,
}) => {
  const {
    resumo_global,
    comercializadora,
    empreendimento,
    avisos_escopo,
    funil_mensal,
    transferencias_internas,
  } = resultado

  return (
    <div className="space-y-6 pt-2">
      {/* Stale Warning Bar */}
      {isStale && (
        <Alert className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <div className="flex items-center justify-between w-full">
            <div>
              <AlertTitle className="text-xs font-bold">Premissas foram alteradas</AlertTitle>
              <AlertDescription className="text-xs">
                Os números abaixo referem-se à última simulação salva. Clique em recalcular para
                atualizar os resultados no servidor.
              </AlertDescription>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={onRecalcular}
              className="gap-1.5 h-8 text-xs border-amber-400"
            >
              <RotateCw className="h-3.5 w-3.5" /> Recalcular Agora
            </Button>
          </div>
        </Alert>
      )}

      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              VGV Total Admitido
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold font-mono">
              {formatarBRL(resumo_global.vgv_total)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {resumo_global.vendas_admitidas_total.toFixed(1)} vendas de{' '}
              {resumo_global.vendas_potenciais_total.toFixed(1)} potenciais
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Recebimentos no Horizonte
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {formatarBRL(resumo_global.recebimentos_compradores_total)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Devoluções pagas: {formatarBRL(resumo_global.devolucoes_total)}
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Caixa Comercializadora
            </CardTitle>
            <Briefcase className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
              {formatarBRL(comercializadora.saldo_final)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Maior déficit: {formatarBRL(comercializadora.maior_deficit)} (Mês{' '}
              {comercializadora.mes_maior_deficit})
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between pb-1">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Caixa Empreendimento
            </CardTitle>
            <Building2 className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="text-xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
              {formatarBRL(empreendimento.saldo_final)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Maior déficit: {formatarBRL(empreendimento.maior_deficit)} (Mês{' '}
              {empreendimento.mes_maior_deficit})
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Carteira além do horizonte & Limitações */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4 bg-muted/20 border md:col-span-1 space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Wallet className="h-4 w-4 text-primary" /> Carteira Além do Horizonte
          </span>
          <div className="text-lg font-bold font-mono text-foreground">
            {formatarBRL(resumo_global.carteira_alem_horizonte.total)}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Valores contratuais a receber após o mês {resultado.horizonte_meses}. Não antecipados
            ficticiamente no último mês.
          </p>
        </Card>

        <div className="p-4 rounded-lg border border-amber-200/80 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 md:col-span-2 text-xs text-amber-900 dark:text-amber-200 space-y-1.5">
          <div className="font-semibold flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            Limites Obrigatórios do Escopo Preliminar (Blueprint v1.3)
          </div>
          <ul className="list-disc list-inside space-y-1 text-[11px] text-muted-foreground dark:text-amber-300">
            {avisos_escopo.map((aviso, idx) => (
              <li key={idx}>{aviso}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Tabs with Detailed Breakdown: Cash Flow per Party, Funnel, and Monthly Grid */}
      <Tabs defaultValue="caixas" className="w-full">
        <TabsList className="grid grid-cols-3 w-full max-w-md">
          <TabsTrigger value="caixas" className="text-xs">
            Caixa por Parte
          </TabsTrigger>
          <TabsTrigger value="funil" className="text-xs">
            Funil e Vendas
          </TabsTrigger>
          <TabsTrigger value="tabela" className="text-xs">
            Tabela Mensal Consolidada
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: CAIXAS SEPARADOS E CONCILIAÇÃO */}
        <TabsContent value="caixas" className="space-y-4 pt-4">
          <div className="grid gap-6 md:grid-cols-2">
            {/* Comercializadora */}
            <Card className="border shadow-sm">
              <CardHeader className="py-3 px-4 bg-blue-50/50 dark:bg-blue-950/20 border-b">
                <CardTitle className="text-sm font-bold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                  <Briefcase className="h-4 w-4" /> Caixa da Comercializadora
                </CardTitle>
                <CardDescription className="text-xs">
                  Caixa inicial: {formatarBRL(comercializadora.caixa_inicial)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Receita Própria (Remuneração):</span>
                  <span className="font-mono font-medium">
                    {formatarBRL(comercializadora.total_receita_propria)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Custos Operacionais Assumidos:</span>
                  <span className="font-mono font-medium text-destructive">
                    -{formatarBRL(comercializadora.total_custos_assumidos)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground font-semibold">
                    Resultado Gerencial Comercial:
                  </span>
                  <span className="font-mono font-bold">
                    {formatarBRL(comercializadora.resultado_gerencial_comercial)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Maior Déficit de Caixa:</span>
                  <span className="font-mono font-medium text-destructive">
                    {formatarBRL(comercializadora.maior_deficit)} (Mês{' '}
                    {comercializadora.mes_maior_deficit})
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-sm bg-muted/20 px-2 rounded">
                  <span>Saldo de Caixa Final:</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400">
                    {formatarBRL(comercializadora.saldo_final)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Empreendimento */}
            <Card className="border shadow-sm">
              <CardHeader className="py-3 px-4 bg-indigo-50/50 dark:bg-indigo-950/20 border-b">
                <CardTitle className="text-sm font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Caixa do Empreendimento
                </CardTitle>
                <CardDescription className="text-xs">
                  Caixa inicial: {formatarBRL(empreendimento.caixa_inicial)}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">
                    Recebimentos Brutos dos Compradores:
                  </span>
                  <span className="font-mono font-medium">
                    {formatarBRL(empreendimento.recebimentos_brutos_total)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Repasses / Remuneração Comercial:</span>
                  <span className="font-mono font-medium text-destructive">
                    -{formatarBRL(empreendimento.repasses_comercializadora_total)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Custos Próprios do Empreendimento:</span>
                  <span className="font-mono font-medium text-destructive">
                    -{formatarBRL(empreendimento.custos_proprios_total)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Devoluções Pagas por Cancelamentos:</span>
                  <span className="font-mono font-medium text-destructive">
                    -{formatarBRL(empreendimento.devolucoes_total)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">
                    Investimentos (Obra, Reforma, Equipamentos):
                  </span>
                  <span className="font-mono font-medium text-destructive">
                    -{formatarBRL(empreendimento.investimentos_total)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-muted-foreground">Maior Déficit de Caixa:</span>
                  <span className="font-mono font-medium text-destructive">
                    {formatarBRL(empreendimento.maior_deficit)} (Mês{' '}
                    {empreendimento.mes_maior_deficit})
                  </span>
                </div>
                <div className="flex justify-between py-2 pt-3 font-bold text-sm bg-muted/20 px-2 rounded">
                  <span>Saldo de Caixa Final:</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    {formatarBRL(empreendimento.saldo_final)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className="p-4 bg-muted/10 border text-xs">
            <span className="font-semibold text-foreground block mb-1">
              Partidas Dobradas e Conciliação de Transferências Internas
            </span>
            <p className="text-muted-foreground">
              Total de repasses do Empreendimento para a Comercializadora no período:{' '}
              <strong className="text-foreground">
                {formatarBRL(empreendimento.repasses_comercializadora_total)}
              </strong>
              . Na visão consolidada, transferências internas cancelam-se mutuamente com efeito
              líquido zero, evitando dupla contagem de caixa.
            </p>
          </Card>
        </TabsContent>

        {/* TAB 2: FUNIL E VENDAS */}
        <TabsContent value="funil" className="space-y-4 pt-4">
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="p-2.5">Mês</th>
                  <th className="p-2.5">Sala de Vendas</th>
                  <th className="p-2.5">Demanda Comparecidos</th>
                  <th className="p-2.5">Capacidade da Sala</th>
                  <th className="p-2.5">Atendimentos Efetivos</th>
                  <th className="p-2.5">Não Atendidos (Capacidade)</th>
                  <th className="p-2.5">Vendas Potenciais</th>
                  <th className="p-2.5">VGV Gerado</th>
                </tr>
              </thead>
              <tbody>
                {funil_mensal.slice(0, 12).map((m) => (
                  <React.Fragment key={m.mes}>
                    {m.salas.map((s, sIdx) => (
                      <tr key={`${m.mes}_${s.sala_id}`} className="border-b hover:bg-muted/10">
                        <td className="p-2.5 font-mono">{sIdx === 0 ? `Mês ${m.mes}` : ''}</td>
                        <td className="p-2.5 font-medium">{s.nome}</td>
                        <td className="p-2.5 font-mono">{s.demanda_total.toFixed(1)}</td>
                        <td className="p-2.5 font-mono">{s.capacidade}</td>
                        <td className="p-2.5 font-mono font-semibold">
                          {s.atendimentos_efetivos.toFixed(1)}
                        </td>
                        <td className="p-2.5 font-mono text-destructive">
                          {s.demanda_nao_atendida > 0 ? s.demanda_nao_atendida.toFixed(1) : '-'}
                        </td>
                        <td className="p-2.5 font-mono">{s.vendas_potenciais.toFixed(1)}</td>
                        <td className="p-2.5 font-mono font-bold text-foreground">
                          {formatarBRL(m.total_vgv_mes)}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {funil_mensal.length > 12 && (
            <p className="text-[11px] text-muted-foreground text-center">
              Mostrando os primeiros 12 meses. Veja a Tabela Mensal Consolidada para todo o período
              de {resultado.horizonte_meses} meses.
            </p>
          )}
        </TabsContent>

        {/* TAB 3: TABELA MENSAL CONSOLIDADA */}
        <TabsContent value="tabela" className="space-y-4 pt-4">
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="p-2">Mês</th>
                  <th className="p-2">VGV Vendas</th>
                  <th className="p-2">Receb. Comprador</th>
                  <th className="p-2">Receita Com.</th>
                  <th className="p-2">Custo Com.</th>
                  <th className="p-2">Saldo Acum. Com.</th>
                  <th className="p-2">Repasse Emp.</th>
                  <th className="p-2">Custo Emp.</th>
                  <th className="p-2">Devoluções</th>
                  <th className="p-2">Invest. Emp.</th>
                  <th className="p-2">Saldo Acum. Emp.</th>
                </tr>
              </thead>
              <tbody>
                {funil_mensal.map((f, idx) => {
                  const fc = comercializadora.fluxos_mensais[idx]
                  const fe = empreendimento.fluxos_mensais[idx]

                  return (
                    <tr
                      key={idx}
                      className="border-b last:border-0 hover:bg-muted/10 font-mono text-[11px]"
                    >
                      <td className="p-2 font-semibold">M{idx}</td>
                      <td className="p-2">{formatarBRL(f.total_vgv_mes)}</td>
                      <td className="p-2 text-emerald-600">
                        {formatarBRL(fe.recebimentos_brutos)}
                      </td>
                      <td className="p-2 text-blue-600">{formatarBRL(fc.receita_remuneracao)}</td>
                      <td className="p-2 text-destructive">
                        -{formatarBRL(fc.custos_operacionais)}
                      </td>
                      <td
                        className={`p-2 font-bold ${fc.saldo_acumulado < 0 ? 'text-destructive' : 'text-blue-600'}`}
                      >
                        {formatarBRL(fc.saldo_acumulado)}
                      </td>
                      <td className="p-2 text-destructive">-{formatarBRL(fe.repasse_comercial)}</td>
                      <td className="p-2 text-destructive">-{formatarBRL(fe.custos_proprios)}</td>
                      <td className="p-2 text-destructive">
                        {fe.devolucoes > 0 ? `-${formatarBRL(fe.devolucoes)}` : '-'}
                      </td>
                      <td className="p-2 text-destructive">
                        {fe.investimentos > 0 ? `-${formatarBRL(fe.investimentos)}` : '-'}
                      </td>
                      <td
                        className={`p-2 font-bold ${fe.saldo_acumulado < 0 ? 'text-destructive' : 'text-indigo-600'}`}
                      >
                        {formatarBRL(fe.saldo_acumulado)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
