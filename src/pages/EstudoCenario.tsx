// Screen for Premissas & Running Simulation
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import type {
  PremissasEstudo,
  ResultadoSimulacaoViabilidade,
  SalaVendas,
  ProdutoEstudo,
  PontoCaptacao,
  EtapaEntrada,
  TipoRemuneracao,
  TipoCustoDespesa,
  ResponsavelEconomico,
  CategoriaInvestimento,
  CondicaoPagamentoModalidade,
  RegrasCancelamentoInadimplencia,
} from '@/types/viabilidade'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { CampoNumero, CampoPercentual } from '@/components/CamposNumero'
import { EditorAjustesMensais } from '@/components/EditorAjustesMensais'
import { TelaResultados } from '@/components/TelaResultados'
import { vb_validarPremissas } from '@/lib/pocketbase/viabilidade_core.mjs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Calculator,
  Save,
  ArrowLeft,
  Building,
  Plus,
  Trash2,
  Clock,
  AlertTriangle,
  Layers,
  Percent,
  CreditCard,
  UserX,
  BadgeDollarSign,
  Briefcase,
  CheckCircle2,
  Copy,
  Sparkles,
} from 'lucide-react'
import { toast } from 'sonner'

interface ItemPendencia {
  mensagem: string
  caminho?: string
  aba?: string
}

export const EstudoCenario: React.FC = () => {
  const { estudoId, cenarioId } = useParams<{ estudoId: string; cenarioId: string }>()
  const { user, isMaster } = useAuth()
  const navigate = useNavigate()

  const [estudo, setEstudo] = useState<RecordModel | null>(null)
  const [cenario, setCenario] = useState<RecordModel | null>(null)
  const [todosCenarios, setTodosCenarios] = useState<RecordModel[]>([])
  const [premissas, setPremissas] = useState<PremissasEstudo | null>(null)
  const [resultado, setResultado] = useState<ResultadoSimulacaoViabilidade | null>(null)
  const [isStale, setIsStale] = useState(false)
  const [isExemplo, setIsExemplo] = useState(false)

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [calculando, setCalculando] = useState(false)
  const [carregandoExemplo, setCarregandoExemplo] = useState(false)
  const [abaAtiva, setAbaAtiva] = useState('funil')
  const [mostrarResultados, setMostrarResultados] = useState(false)

  const horizonte = estudo?.horizonte_meses || 36
  const mesIni = estudo?.mes_inicial || '2025-01'

  // Validação determinística incondicional de premissas (vb_validarPremissas)
  // Agrupa pendências pelo texto da mensagem para nunca exibir itens repetidos.
  const pendenciasValidacao = useMemo<ItemPendencia[]>(() => {
    if (!premissas) {
      return [{ mensagem: 'Premissas não carregadas', caminho: '', aba: 'funil' }]
    }
    const res = vb_validarPremissas(premissas, horizonte)
    if (!Array.isArray(res)) return []

    const mapa = new Map<string, ItemPendencia>()
    for (const item of res) {
      let mensagem = 'Pendência não especificada'
      let caminho = ''
      let aba = 'funil'

      if (typeof item === 'string') {
        mensagem = item
      } else if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        mensagem = String(obj.mensagem || 'Pendência não especificada')
        caminho = typeof obj.caminho === 'string' ? obj.caminho : ''
        aba = typeof obj.aba === 'string' ? obj.aba : 'funil'
      }

      const existente = mapa.get(mensagem)
      if (!existente) {
        mapa.set(mensagem, { mensagem, caminho, aba })
      } else if (caminho && !existente.caminho?.includes(caminho)) {
        // Concatena caminhos adicionais no tooltip para master
        existente.caminho = existente.caminho ? `${existente.caminho}, ${caminho}` : caminho
      }
    }

    return Array.from(mapa.values())
  }, [premissas, horizonte])

  const temPendencias = pendenciasValidacao.length > 0

  const carregarDados = useCallback(async () => {
    if (!estudoId || !cenarioId) return
    try {
      setLoading(true)
      const est = await pb.collection('estudos').getOne(estudoId)
      const cen = await pb.collection('cenarios').getOne(cenarioId)
      const cens = await pb.collection('cenarios').getFullList({
        filter: `estudo = '${estudoId}'`,
        sort: 'is_base',
      })

      setEstudo(est)
      setCenario(cen)
      setTodosCenarios(cens)
      setIsStale(cen.is_stale || false)
      setIsExemplo(Boolean(cen.is_exemplo))

      const rawP = (cen.premissas || {}) as Partial<PremissasEstudo>

      // Heurística para cenários antigos: a normalização anterior gravava 0 em
      // TODA a estrutura quando o campo estava ausente. Esse padrão ("estrutura
      // inteira zerada") é tratado como não informado (null). Um 0 isolado em
      // um campo específico é zero legítimo digitado e continua sendo exibido.
      const estruturaZerada = (obj?: object | null): boolean =>
        Boolean(obj) &&
        Object.keys(obj as object).length > 0 &&
        Object.values(obj as Record<string, unknown>).every((v) => v === 0)

      const normalizarCondicao = (
        cond?: Partial<CondicaoPagamentoModalidade> | null,
      ): CondicaoPagamentoModalidade => {
        const zerada = estruturaZerada(cond)
        return {
          perc_entrada: zerada ? null : (cond?.perc_entrada ?? null),
          parcelas_entrada: zerada ? null : (cond?.parcelas_entrada ?? null),
          mes_primeira_saldo: zerada ? null : (cond?.mes_primeira_saldo ?? null),
          parcelas_saldo: zerada ? null : (cond?.parcelas_saldo ?? null),
        }
      }

      const normalizarCancInad = (
        ci?: Partial<RegrasCancelamentoInadimplencia> | null,
      ): RegrasCancelamentoInadimplencia => {
        const zeradoCanc = estruturaZerada(ci?.cancelamento)
        const zeradoInad = estruturaZerada(ci?.inadimplencia)
        return {
          cancelamento: {
            taxa: zeradoCanc ? null : (ci?.cancelamento?.taxa ?? null),
            mes_medio: zeradoCanc ? null : (ci?.cancelamento?.mes_medio ?? null),
            taxa_devolucao: zeradoCanc ? null : (ci?.cancelamento?.taxa_devolucao ?? null),
            prazo_devolucao: zeradoCanc ? null : (ci?.cancelamento?.prazo_devolucao ?? null),
          },
          inadimplencia: {
            taxa: zeradoInad ? null : (ci?.inadimplencia?.taxa ?? null),
            parcela_recuperavel: zeradoInad
              ? null
              : (ci?.inadimplencia?.parcela_recuperavel ?? null),
            prazo_recuperacao: zeradoInad ? null : (ci?.inadimplencia?.prazo_recuperacao ?? null),
          },
        }
      }

      const p: PremissasEstudo = {
        salas: Array.isArray(rawP.salas) ? rawP.salas : [],
        produtos: Array.isArray(rawP.produtos) ? rawP.produtos : [],
        mix_por_sala: Array.isArray(rawP.mix_por_sala) ? rawP.mix_por_sala : [],
        condicoes_pagamento: {
          multipropriedade: normalizarCondicao(rawP.condicoes_pagamento?.multipropriedade),
          timeshare: normalizarCondicao(rawP.condicoes_pagamento?.timeshare),
        },
        cancelamentos_inadimplencia: {
          multipropriedade: normalizarCancInad(rawP.cancelamentos_inadimplencia?.multipropriedade),
          timeshare: normalizarCancInad(rawP.cancelamentos_inadimplencia?.timeshare),
        },
        remuneracoes: Array.isArray(rawP.remuneracoes) ? rawP.remuneracoes : [],
        custos_despesas: Array.isArray(rawP.custos_despesas) ? rawP.custos_despesas : [],
        investimentos: Array.isArray(rawP.investimentos) ? rawP.investimentos : [],
        caixa_inicial: estruturaZerada(rawP.caixa_inicial)
          ? { comercializadora: null, empreendimento: null }
          : {
              comercializadora: rawP.caixa_inicial?.comercializadora ?? null,
              empreendimento: rawP.caixa_inicial?.empreendimento ?? null,
            },
      }
      setPremissas(p)

      // Try fetching latest successful simulation for this scenario
      try {
        const ultimaSim = await pb
          .collection('simulacoes')
          .getFirstListItem(`cenario = '${cenarioId}' && status = 'sucesso'`, {
            sort: '-created',
          })
        if (ultimaSim && ultimaSim.resultado) {
          setResultado(ultimaSim.resultado as ResultadoSimulacaoViabilidade)
          if (!cen.is_stale) {
            setMostrarResultados(true)
          }
        }
      } catch {
        setResultado(null)
      }
    } catch (err) {
      console.error('Erro ao carregar dados do cenário:', err)
      toast.error('Erro ao abrir o estudo')
    } finally {
      setLoading(false)
    }
  }, [estudoId, cenarioId])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  // Mark scenario as stale when modifying premissas
  const atualizarPremissas = (novas: PremissasEstudo) => {
    setPremissas(novas)
    if (!isStale) {
      setIsStale(true)
    }
  }

  const salvarRascunho = async () => {
    if (!cenarioId || !premissas) return
    try {
      setSalvando(true)
      await pb.collection('cenarios').update(cenarioId, {
        premissas: premissas,
        is_stale: true,
      })
      setIsStale(true)
      toast.success('Rascunho salvo com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao salvar rascunho: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSalvando(false)
    }
  }

  const carregarExemploDemonstrativo = async () => {
    if (!cenarioId) return
    try {
      setCarregandoExemplo(true)
      const premissasExemplo: PremissasEstudo = {
        salas: [
          {
            id: 'sal_exemplo_1',
            nome: 'Sala Principal - Resort (Exemplo)',
            capacidade_mensal: { base: 120, ajustes: {} },
            pontos: [
              {
                id: 'pnt_exemplo_1',
                sala_id: 'sal_exemplo_1',
                nome: 'Recepção / Lobby (Exemplo Fictício)',
                etapa_entrada: 'comparecidos',
                volume_entrada: { base: 80, ajustes: {} },
                taxa_qualificados: { base: 1.0, ajustes: {} },
                taxa_convidados: { base: 1.0, ajustes: {} },
                taxa_conversao_venda: { base: 0.2, ajustes: {} },
                custo_transporte_unitario: { base: 0, ajustes: {} },
              },
            ],
          },
        ],
        produtos: [
          {
            id: 'prd_exemplo_1',
            nome: 'Fração 2 Quartos Luxo (Exemplo)',
            modalidade: 'multipropriedade',
            preco: { base: 45000, ajustes: {} },
            estoque_disponivel: 120,
          },
        ],
        mix_por_sala: [
          {
            sala_id: 'sal_exemplo_1',
            produtos: [
              {
                produto_id: 'prd_exemplo_1',
                percentual: { base: 1.0, ajustes: {} },
              },
            ],
          },
        ],
        condicoes_pagamento: {
          multipropriedade: {
            perc_entrada: 0.15,
            parcelas_entrada: 2,
            mes_primeira_saldo: 2,
            parcelas_saldo: 48,
          },
          timeshare: {
            perc_entrada: 0.2,
            parcelas_entrada: 1,
            mes_primeira_saldo: 1,
            parcelas_saldo: 24,
          },
        },
        cancelamentos_inadimplencia: {
          multipropriedade: {
            cancelamento: { taxa: 0.08, mes_medio: 2, taxa_devolucao: 0.7, prazo_devolucao: 1 },
            inadimplencia: { taxa: 0.05, parcela_recuperavel: 0.6, prazo_recuperacao: 2 },
          },
          timeshare: {
            cancelamento: { taxa: 0.05, mes_medio: 1, taxa_devolucao: 0.5, prazo_devolucao: 1 },
            inadimplencia: { taxa: 0.04, parcela_recuperavel: 0.5, prazo_recuperacao: 2 },
          },
        },
        remuneracoes: [
          {
            id: 'rem_exemplo_1',
            nome: 'Comissão Comercial Padrão (Exemplo)',
            tipo: 'perc_vgv',
            valor: { base: 0.12, ajustes: {} },
            adicional_ou_compensavel: 'adicional',
          },
        ],
        custos_despesas: [
          {
            id: 'desp_exemplo_1',
            nome: 'Custo Fixo Sala / Administrativo (Exemplo)',
            tipo: 'fixo',
            valor: { base: 15000, ajustes: {} },
            responsavel_economico: 'comercializadora',
          },
        ],
        investimentos: [],
        caixa_inicial: { comercializadora: 50000, empreendimento: 100000 },
      }

      await pb.collection('cenarios').update(cenarioId, {
        premissas: premissasExemplo,
        is_exemplo: true,
        is_stale: true,
      })
      setPremissas(premissasExemplo)
      setIsExemplo(true)
      setIsStale(true)
      toast.success('Exemplo demonstrativo carregado com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao carregar exemplo: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setCarregandoExemplo(false)
    }
  }

  const removerMarcacaoExemplo = async () => {
    if (!cenarioId) return
    try {
      await pb.collection('cenarios').update(cenarioId, {
        is_exemplo: false,
      })
      setIsExemplo(false)
      toast.success('Marcação de exemplo removida.')
    } catch (err: unknown) {
      toast.error(
        'Erro ao atualizar marcação: ' + (err instanceof Error ? err.message : String(err)),
      )
    }
  }

  const calcularSimulacao = async () => {
    if (!cenarioId || !premissas) return
    try {
      setCalculando(true)
      // First save current premissas to DB so server has latest state
      await pb.collection('cenarios').update(cenarioId, {
        premissas: premissas,
      })

      // Call deterministic calculation endpoint on backend (sending premissas explicitly)
      const res = await pb.send('/backend/v1/viabilidade/simular', {
        method: 'POST',
        body: { cenario_id: cenarioId, premissas: premissas },
      })

      if (res.status === 'sucesso' && res.resultado) {
        setResultado(res.resultado as ResultadoSimulacaoViabilidade)
        setIsStale(false)
        setMostrarResultados(true)
        toast.success('Premissas salvas e cálculo atualizado')
      } else {
        toast.error('Falha no cálculo: ' + (res.error || 'Erro desconhecido'))
      }
    } catch (err: unknown) {
      console.error(err)
      toast.error(
        'Erro no cálculo determinístico: ' + (err instanceof Error ? err.message : String(err)),
      )
    } finally {
      setCalculando(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          Carregando premissas do cenário...
        </span>
      </div>
    )
  }

  if (!estudo || !cenario || !premissas) {
    return (
      <div className="container py-12 text-center">
        <p className="text-muted-foreground">Estudo ou cenário não encontrado.</p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="outline">Voltar para Meus Estudos</Button>
        </Link>
      </div>
    )
  }

  // Handlers for Premissas Tabs
  const adicionarSala = () => {
    const novaId = 'sal_' + Math.random().toString(36).substring(2, 7)
    const novaSala: SalaVendas = {
      id: novaId,
      nome: `Sala de Vendas ${premissas.salas.length + 1}`,
      capacidade_mensal: { base: null, ajustes: {} },
      pontos: [
        {
          id: 'pnt_' + Math.random().toString(36).substring(2, 7),
          sala_id: novaId,
          nome: 'Ponto de Captação Principal',
          etapa_entrada: 'comparecidos',
          volume_entrada: { base: null, ajustes: {} },
          taxa_qualificados: { base: null, ajustes: {} },
          taxa_convidados: { base: null, ajustes: {} },
          taxa_comparecimento: { base: null, ajustes: {} },
          taxa_conversao_venda: { base: null, ajustes: {} },
          custo_transporte_unitario: { base: null, ajustes: {} },
        },
      ],
    }
    const salasNovas = [...premissas.salas, novaSala]

    // Create mix config for new sala
    const mixNovos = [...premissas.mix_por_sala]
    if (premissas.produtos.length > 0) {
      const percCada = 1.0 / premissas.produtos.length
      mixNovos.push({
        sala_id: novaId,
        produtos: premissas.produtos.map((p) => ({
          produto_id: p.id,
          percentual: { base: percCada, ajustes: {} },
        })),
      })
    }

    atualizarPremissas({
      ...premissas,
      salas: salasNovas,
      mix_por_sala: mixNovos,
    })
  }

  const removerSala = (salaId: string) => {
    atualizarPremissas({
      ...premissas,
      salas: premissas.salas.filter((s) => s.id !== salaId),
      mix_por_sala: premissas.mix_por_sala.filter((m) => m.sala_id !== salaId),
    })
  }

  const adicionarPonto = (salaId: string) => {
    const novoPonto: PontoCaptacao = {
      id: 'pnt_' + Math.random().toString(36).substring(2, 7),
      sala_id: salaId,
      nome: 'Novo Ponto de Captação',
      etapa_entrada: 'comparecidos',
      volume_entrada: { base: null, ajustes: {} },
      taxa_qualificados: { base: null, ajustes: {} },
      taxa_convidados: { base: null, ajustes: {} },
      taxa_comparecimento: { base: null, ajustes: {} },
      taxa_conversao_venda: { base: null, ajustes: {} },
      custo_transporte_unitario: { base: null, ajustes: {} },
    }

    const salasNovas = premissas.salas.map((s) => {
      if (s.id === salaId) {
        return { ...s, pontos: [...s.pontos, novoPonto] }
      }
      return s
    })

    atualizarPremissas({ ...premissas, salas: salasNovas })
  }

  const removerPonto = (salaId: string, pontoId: string) => {
    const salasNovas = premissas.salas.map((s) => {
      if (s.id === salaId) {
        return { ...s, pontos: s.pontos.filter((p) => p.id !== pontoId) }
      }
      return s
    })
    atualizarPremissas({ ...premissas, salas: salasNovas })
  }

  const adicionarProduto = () => {
    const novoProdId = 'prd_' + Math.random().toString(36).substring(2, 7)
    const novoProduto: ProdutoEstudo = {
      id: novoProdId,
      nome: 'Novo Produto / Cota',
      modalidade: 'multipropriedade',
      preco: { base: null, ajustes: {} },
      estoque_disponivel: null,
    }

    const produtosNovos = [...premissas.produtos, novoProduto]

    // Update mix for all rooms
    const mixNovos = premissas.mix_por_sala.map((ms) => ({
      ...ms,
      produtos: [...ms.produtos, { produto_id: novoProdId, percentual: { base: 0, ajustes: {} } }],
    }))

    atualizarPremissas({
      ...premissas,
      produtos: produtosNovos,
      mix_por_sala: mixNovos,
    })
  }

  const removerProduto = (prodId: string) => {
    atualizarPremissas({
      ...premissas,
      produtos: premissas.produtos.filter((p) => p.id !== prodId),
      mix_por_sala: premissas.mix_por_sala.map((ms) => ({
        ...ms,
        produtos: ms.produtos.filter((mp) => mp.produto_id !== prodId),
      })),
    })
  }

  return (
    <div className="container py-6 px-4 sm:px-8 space-y-6">
      {/* Scenario Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to="/"
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <ArrowLeft className="h-3 w-3" /> Meus Estudos
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-xs font-medium text-foreground">{estudo.nome}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{cenario.nome}</h1>
            {cenario.is_base && (
              <Badge variant="outline" className="text-xs font-normal">
                Cenário Base
              </Badge>
            )}
            {isStale && (
              <Badge
                variant="secondary"
                className="bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 gap-1 text-xs"
              >
                <AlertTriangle className="h-3 w-3" /> Cálculo desatualizado
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {estudo.cidade} - {estudo.uf} • Estágio:{' '}
            {estudo.estagio === 'operando'
              ? 'Operando'
              : estudo.estagio === 'reforma/expansao'
                ? 'Reforma e expansão'
                : estudo.estagio === 'novo projeto'
                  ? 'Novo projeto'
                  : estudo.estagio === 'combinado'
                    ? 'Combinado'
                    : estudo.estagio || 'Não informado'}{' '}
            • Início: {estudo.mes_inicial} • {estudo.horizonte_meses} meses
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Botão Carregar Exemplo Demonstrativo */}
          <Button
            variant="outline"
            size="sm"
            onClick={carregarExemploDemonstrativo}
            disabled={carregandoExemplo}
            className="gap-1.5 text-xs h-9 border-dashed border-amber-500/80 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-amber-900 dark:text-amber-200"
            title="Preencher com números fictícios de demonstração"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            {carregandoExemplo ? 'Carregando Exemplo...' : 'Carregar exemplo demonstrativo'}
          </Button>

          {/* Scenario Selector Dropdown */}
          <Select
            value={cenario.id}
            onValueChange={(val) => {
              navigate(`/estudo/${estudoId}/cenario/${val}`)
            }}
          >
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Mudar Cenário" />
            </SelectTrigger>
            <SelectContent>
              {todosCenarios.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-xs">
                  {c.nome} {c.is_base ? '(Base)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={salvarRascunho}
            disabled={salvando}
            className="gap-1.5 text-xs h-9"
          >
            <Save className="h-4 w-4" />
            {salvando ? 'Salvando...' : 'Salvar Rascunho'}
          </Button>

          <Button
            variant={temPendencias ? 'outline' : isStale || !resultado ? 'default' : 'secondary'}
            size="sm"
            onClick={calcularSimulacao}
            disabled={calculando || temPendencias}
            title={
              temPendencias
                ? 'Preencha as premissas obrigatórias para habilitar o cálculo'
                : 'Salvar e calcular'
            }
            className="gap-1.5 text-xs h-9 font-semibold shadow-sm"
          >
            <Calculator className="h-4 w-4" />
            {calculando ? 'Calculando no Backend...' : 'Salvar e calcular'}
          </Button>

          {resultado && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarResultados(!mostrarResultados)}
              className="gap-1.5 text-xs h-9"
            >
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {mostrarResultados ? 'Ocultar Resultados' : 'Ver Resultados'}
            </Button>
          )}
        </div>
      </div>

      {/* Selo fixo de Exemplo Demonstrativo no topo do Cenário */}
      {isExemplo && (
        <Alert className="border-amber-400 bg-amber-500/15 text-amber-950 dark:text-amber-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-amber-600 bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200 font-semibold text-xs uppercase tracking-wider"
            >
              Exemplo demonstrativo — números fictícios
            </Badge>
            <span className="text-xs text-muted-foreground hidden sm:inline">
              Premissas preenchidas com valores fictícios para demonstração. O usuário pode editar
              tudo.
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={removerMarcacaoExemplo}
            className="h-7 text-xs bg-background/80 hover:bg-background border-amber-300 dark:border-amber-800 shrink-0"
          >
            Remover marcação de exemplo
          </Button>
        </Alert>
      )}

      {/* Bloco de Pendências de Validação de Premissas */}
      {temPendencias && (
        <Alert className="border-rose-300 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/30 text-rose-950 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5" />
          <div className="space-y-1.5 w-full">
            <div className="flex items-center justify-between">
              <AlertTitle className="text-xs font-bold text-rose-900 dark:text-rose-200 flex items-center gap-2">
                <span>
                  Pendências obrigatórias antes de calcular ({pendenciasValidacao.length})
                </span>
                <Badge
                  variant="outline"
                  className="text-[10px] border-rose-300 text-rose-700 dark:text-rose-300"
                >
                  Bloqueante
                </Badge>
              </AlertTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={carregarExemploDemonstrativo}
                className="h-6 text-[11px] text-rose-800 dark:text-rose-300 hover:text-rose-950 hover:bg-rose-100 dark:hover:bg-rose-900/40 p-1 font-medium"
              >
                Preencher com exemplo demonstrativo →
              </Button>
            </div>
            <AlertDescription className="text-xs text-rose-800 dark:text-rose-300 space-y-1">
              <p className="text-[11px]">
                O botão <strong>Salvar e calcular</strong> permanece desabilitado enquanto houver
                pendências no preenchimento das premissas:
              </p>
              <ul className="max-h-48 overflow-y-auto pl-1 space-y-1 text-[11px] bg-background/50 p-2 rounded border border-rose-200/50 dark:border-rose-900/50">
                {pendenciasValidacao.map((item, idx) => {
                  const conteudo = (
                    <button
                      type="button"
                      onClick={() => {
                        if (item.aba) {
                          setAbaAtiva(item.aba)
                        }
                      }}
                      className="group flex items-start gap-1.5 text-left w-full hover:bg-rose-100/60 dark:hover:bg-rose-900/30 p-1 rounded transition-colors"
                      title={item.aba ? `Ir para a aba ${item.aba}` : undefined}
                    >
                      <span className="text-rose-500 font-bold shrink-0 mt-0.5">•</span>
                      <span className="flex-1 font-sans text-rose-900 dark:text-rose-100 group-hover:underline cursor-pointer">
                        {item.mensagem}
                      </span>
                    </button>
                  )

                  if (isMaster && item.caminho) {
                    return (
                      <li key={idx} className="list-none">
                        <Tooltip>
                          <TooltipTrigger asChild>{conteudo}</TooltipTrigger>
                          <TooltipContent
                            side="top"
                            className="text-xs font-mono max-w-md break-all"
                          >
                            <p className="font-semibold text-[11px] mb-0.5">
                              Caminho técnico (master):
                            </p>
                            <p className="text-[10px] text-muted-foreground">{item.caminho}</p>
                            {item.aba && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Aba: {item.aba}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </li>
                    )
                  }

                  return (
                    <li key={idx} className="list-none">
                      {conteudo}
                    </li>
                  )
                })}
              </ul>
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Main Results View (when available and toggled) */}
      {mostrarResultados && resultado && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              Simulação Comercial e Financeira Preliminar
            </h2>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => setMostrarResultados(false)}
            >
              Recolher para editar premissas
            </Button>
          </div>
          <TelaResultados
            resultado={resultado}
            isStale={isStale}
            onRecalcular={calcularSimulacao}
            isExemplo={isExemplo}
            onRemoverExemplo={removerMarcacaoExemplo}
          />
        </div>
      )}

      {/* Premissas Tab Navigation & Form */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold tracking-tight">
            Premissas do Cenário (Edição Manual e Mensal)
          </h2>
          <span className="text-xs text-muted-foreground">
            Valores replicados com suporte a ajustes explícitos por mês
          </span>
        </div>

        <Tabs value={abaAtiva} onValueChange={setAbaAtiva} className="w-full">
          <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto p-1 gap-1">
            <TabsTrigger value="funil" className="text-xs py-2 gap-1.5">
              <Layers className="h-3.5 w-3.5" /> 1. Salas e Funil
            </TabsTrigger>
            <TabsTrigger value="produtos" className="text-xs py-2 gap-1.5">
              <Building className="h-3.5 w-3.5" /> 2. Produtos e Mix
            </TabsTrigger>
            <TabsTrigger value="pagamento" className="text-xs py-2 gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> 3. Pagamento
            </TabsTrigger>
            <TabsTrigger value="cancelamento" className="text-xs py-2 gap-1.5">
              <UserX className="h-3.5 w-3.5" /> 4. Cancelamentos
            </TabsTrigger>
            <TabsTrigger value="remuneracao" className="text-xs py-2 gap-1.5">
              <BadgeDollarSign className="h-3.5 w-3.5" /> 5. Remuneração
            </TabsTrigger>
            <TabsTrigger value="custos" className="text-xs py-2 gap-1.5">
              <Briefcase className="h-3.5 w-3.5" /> 6. Custos & Invest.
            </TabsTrigger>
          </TabsList>

          {/* ABA 1: SALAS, PONTOS E FUNIL */}
          <TabsContent value="funil" className="space-y-6 pt-4">
            <Alert className="bg-muted/40 border-muted">
              <AlertTitle className="text-xs font-semibold">
                Regra de Rateio Proporcional de Capacidade
              </AlertTitle>
              <AlertDescription className="text-xs">
                A capacidade mensal da sala limita atendimentos efetivos. Quando a demanda combinada
                dos pontos ultrapassa a capacidade da sala, é realizado o{' '}
                <strong>rateio proporcional explícito</strong> entre os pontos daquela sala. Casal
                que não chegou não gera venda, mas computa custo de captação.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              {premissas.salas.map((sala, salaIdx) => (
                <Card key={sala.id} className="border shadow-sm">
                  <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Input
                        className="font-bold text-sm h-8 w-60"
                        value={sala.nome}
                        onChange={(e) => {
                          const salasNovas = [...premissas.salas]
                          salasNovas[salaIdx].nome = e.target.value
                          atualizarPremissas({ ...premissas, salas: salasNovas })
                        }}
                      />
                      <div className="flex items-center gap-1.5 text-xs">
                        <Label className="text-xs text-muted-foreground">
                          Capacidade Base/mês:
                        </Label>
                        <CampoNumero
                          className="h-8 w-24 text-xs font-mono"
                          value={sala.capacidade_mensal.base}
                          onChange={(valor) => {
                            const salasNovas = [...premissas.salas]
                            salasNovas[salaIdx].capacidade_mensal.base = valor
                            atualizarPremissas({ ...premissas, salas: salasNovas })
                          }}
                        />
                        <EditorAjustesMensais
                          titulo={`Capacidade: ${sala.nome}`}
                          horizonteMeses={horizonte}
                          mesInicial={mesIni}
                          valorConfig={sala.capacidade_mensal}
                          onChange={(novo) => {
                            const salasNovas = [...premissas.salas]
                            salasNovas[salaIdx].capacidade_mensal = novo
                            atualizarPremissas({ ...premissas, salas: salasNovas })
                          }}
                        />
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive h-8 px-2 text-xs"
                      onClick={() => removerSala(sala.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1" /> Excluir Sala
                    </Button>
                  </CardHeader>

                  <CardContent className="p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Pontos de Captação / Funil da Sala ({sala.pontos.length})
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        onClick={() => adicionarPonto(sala.id)}
                      >
                        <Plus className="h-3 w-3" /> Adicionar Ponto
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {sala.pontos.map((ponto, pIdx) => (
                        <div key={ponto.id} className="p-3 rounded-lg border bg-card space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <Input
                              className="font-medium text-xs h-8 w-52"
                              value={ponto.nome}
                              onChange={(e) => {
                                const salasNovas = [...premissas.salas]
                                salasNovas[salaIdx].pontos[pIdx].nome = e.target.value
                                atualizarPremissas({ ...premissas, salas: salasNovas })
                              }}
                            />
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] text-muted-foreground">
                                Etapa de Entrada Conhecida:
                              </span>
                              <Select
                                value={ponto.etapa_entrada}
                                onValueChange={(val) => {
                                  const salasNovas = [...premissas.salas]
                                  salasNovas[salaIdx].pontos[pIdx].etapa_entrada =
                                    val as EtapaEntrada
                                  atualizarPremissas({ ...premissas, salas: salasNovas })
                                }}
                              >
                                <SelectTrigger className="h-8 w-36 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="comparecidos">Comparecidos</SelectItem>
                                  <SelectItem value="convidados">Convidados / Agendados</SelectItem>
                                  <SelectItem value="qualificados">Qualificados</SelectItem>
                                  <SelectItem value="abordados">Abordados</SelectItem>
                                </SelectContent>
                              </Select>

                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                                onClick={() => removerPonto(sala.id, ponto.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Point metrics row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="space-y-1">
                              <Label className="text-[11px]">Volume Entrada Base</Label>
                              <div className="flex items-center gap-1">
                                <CampoNumero
                                  className="h-8 text-xs font-mono"
                                  value={ponto.volume_entrada.base}
                                  onChange={(valor) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].volume_entrada.base = valor
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                                <EditorAjustesMensais
                                  titulo={`Vol. Entrada: ${ponto.nome}`}
                                  horizonteMeses={horizonte}
                                  mesInicial={mesIni}
                                  valorConfig={ponto.volume_entrada}
                                  onChange={(novo) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].volume_entrada = novo
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                              </div>
                            </div>

                            {ponto.etapa_entrada === 'abordados' && (
                              <div className="space-y-1">
                                <Label className="text-[11px] truncate">
                                  Taxa Qualificados (denom: Abord.)
                                </Label>
                                <CampoPercentual
                                  className="h-8 text-xs font-mono"
                                  placeholder="100"
                                  value={ponto.taxa_qualificados?.base}
                                  onChange={(valor) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].taxa_qualificados = {
                                      base: valor,
                                      ajustes: ponto.taxa_qualificados?.ajustes,
                                    }
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                              </div>
                            )}

                            {(ponto.etapa_entrada === 'abordados' ||
                              ponto.etapa_entrada === 'qualificados') && (
                              <div className="space-y-1">
                                <Label className="text-[11px] truncate">
                                  Taxa Agendados (denom: Qual.)
                                </Label>
                                <CampoPercentual
                                  className="h-8 text-xs font-mono"
                                  placeholder="100"
                                  value={ponto.taxa_convidados?.base}
                                  onChange={(valor) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].taxa_convidados = {
                                      base: valor,
                                      ajustes: ponto.taxa_convidados?.ajustes,
                                    }
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                              </div>
                            )}

                            {ponto.etapa_entrada !== 'comparecidos' && (
                              <div className="space-y-1">
                                <Label className="text-[11px] truncate">
                                  Taxa Comparecimento (denom: Conv.)
                                </Label>
                                <CampoPercentual
                                  className="h-8 text-xs font-mono"
                                  placeholder="100"
                                  value={ponto.taxa_comparecimento?.base}
                                  onChange={(valor) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].taxa_comparecimento = {
                                      base: valor,
                                      ajustes: ponto.taxa_comparecimento?.ajustes,
                                    }
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                              </div>
                            )}

                            <div className="space-y-1">
                              <Label className="text-[11px]">
                                Conversão Venda (denom: Efetivos)
                              </Label>
                              <div className="flex items-center gap-1">
                                <CampoPercentual
                                  className="h-8 text-xs font-mono"
                                  value={ponto.taxa_conversao_venda.base}
                                  onChange={(valor) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].taxa_conversao_venda.base =
                                      valor
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                                <EditorAjustesMensais
                                  titulo={`Conversão: ${ponto.nome}`}
                                  horizonteMeses={horizonte}
                                  mesInicial={mesIni}
                                  valorConfig={ponto.taxa_conversao_venda}
                                  isPorcentagem
                                  onChange={(novo) => {
                                    const salasNovas = [...premissas.salas]
                                    salasNovas[salaIdx].pontos[pIdx].taxa_conversao_venda = novo
                                    atualizarPremissas({ ...premissas, salas: salasNovas })
                                  }}
                                />
                              </div>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-[11px]">Custo Transporte Unit. (R$)</Label>
                              <CampoNumero
                                className="h-8 text-xs font-mono"
                                value={ponto.custo_transporte_unitario.base}
                                onChange={(valor) => {
                                  const salasNovas = [...premissas.salas]
                                  salasNovas[salaIdx].pontos[pIdx].custo_transporte_unitario.base =
                                    valor
                                  atualizarPremissas({ ...premissas, salas: salasNovas })
                                }}
                              />
                            </div>

                            <div className="space-y-1 col-span-2 sm:col-span-4">
                              <Label className="text-[11px]">Quem paga o transporte</Label>
                              <Select
                                value={ponto.responsavel_transporte || ''}
                                onValueChange={(val) => {
                                  const salasNovas = [...premissas.salas]
                                  salasNovas[salaIdx].pontos[pIdx].responsavel_transporte =
                                    val === 'comercializadora' || val === 'empreendimento'
                                      ? (val as ResponsavelEconomico)
                                      : null
                                  atualizarPremissas({ ...premissas, salas: salasNovas })
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs max-w-xs">
                                  <SelectValue placeholder="Selecione quem paga o transporte..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="comercializadora">Comercializadora</SelectItem>
                                  <SelectItem value="empreendimento">Empreendimento</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}

              <Button
                onClick={adicionarSala}
                variant="outline"
                className="w-full gap-2 border-dashed"
              >
                <Plus className="h-4 w-4" /> Cadastrar Nova Sala de Vendas
              </Button>
            </div>
          </TabsContent>

          {/* ABA 2: PRODUTOS E MIX */}
          <TabsContent value="produtos" className="space-y-6 pt-4">
            <Alert className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 text-amber-900 dark:text-amber-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-semibold">
                Aviso Obrigatório de Estoque e Direitos
              </AlertTitle>
              <AlertDescription className="text-xs">
                O estoque comercial informado é manual para o cenário e{' '}
                <strong>NÃO foi validado por capacidade de direitos/hospedagem</strong>. Vendas que
                excedem o estoque informado são recusadas sem gerar VGV excedente.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Produtos Cadastrados ({premissas.produtos.length})
                </h3>
                <Button onClick={adicionarProduto} size="sm" className="gap-1.5 h-8 text-xs">
                  <Plus className="h-3.5 w-3.5" /> Adicionar Produto
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {premissas.produtos.map((prod, prodIdx) => (
                  <Card key={prod.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Input
                        className="font-bold text-xs h-8 max-w-[200px]"
                        value={prod.nome}
                        onChange={(e) => {
                          const prodsNovos = [...premissas.produtos]
                          prodsNovos[prodIdx].nome = e.target.value
                          atualizarPremissas({ ...premissas, produtos: prodsNovos })
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removerProduto(prod.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <Label className="text-[11px]">Modalidade</Label>
                        <Select
                          value={prod.modalidade}
                          onValueChange={(val) => {
                            const prodsNovos = [...premissas.produtos]
                            prodsNovos[prodIdx].modalidade = val as any
                            atualizarPremissas({ ...premissas, produtos: prodsNovos })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="multipropriedade">Multipropriedade</SelectItem>
                            <SelectItem value="timeshare">Time Share</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px]">Estoque Disponível (Cotas)</Label>
                        <CampoNumero
                          className="h-8 text-xs font-mono"
                          value={prod.estoque_disponivel}
                          onChange={(valor) => {
                            const prodsNovos = [...premissas.produtos]
                            prodsNovos[prodIdx].estoque_disponivel = valor
                            atualizarPremissas({ ...premissas, produtos: prodsNovos })
                          }}
                        />
                      </div>

                      <div className="col-span-2">
                        <Label className="text-[11px]">Preço Unitário Base (R$)</Label>
                        <div className="flex items-center gap-1.5">
                          <CampoNumero
                            className="h-8 text-xs font-mono"
                            value={prod.preco.base}
                            onChange={(valor) => {
                              const prodsNovos = [...premissas.produtos]
                              prodsNovos[prodIdx].preco.base = valor
                              atualizarPremissas({ ...premissas, produtos: prodsNovos })
                            }}
                          />
                          <EditorAjustesMensais
                            titulo={`Preço: ${prod.nome}`}
                            horizonteMeses={horizonte}
                            mesInicial={mesIni}
                            valorConfig={prod.preco}
                            onChange={(novo) => {
                              const prodsNovos = [...premissas.produtos]
                              prodsNovos[prodIdx].preco = novo
                              atualizarPremissas({ ...premissas, produtos: prodsNovos })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>

              {/* Mix per Room */}
              <div className="pt-4 border-t space-y-4">
                <h3 className="text-sm font-semibold">
                  Mix Percentual de Vendas por Sala (Soma 100%)
                </h3>
                {premissas.salas.map((sala) => {
                  const mixSala = premissas.mix_por_sala.find((ms) => ms.sala_id === sala.id)
                  const somaMix = (mixSala?.produtos || []).reduce(
                    (acc, p) => acc + (p.percentual.base || 0),
                    0,
                  )

                  return (
                    <Card key={sala.id} className="p-4 space-y-3 bg-muted/10">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-xs">{sala.nome}</span>
                        <Badge
                          variant={Math.abs(somaMix - 1.0) < 0.001 ? 'default' : 'destructive'}
                          className="text-[10px]"
                        >
                          Soma: {(somaMix * 100).toFixed(1)}%
                        </Badge>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        {premissas.produtos.map((prod) => {
                          const prodMix = mixSala?.produtos.find((mp) => mp.produto_id === prod.id)
                          const percBase = prodMix?.percentual.base ?? 0

                          return (
                            <div
                              key={prod.id}
                              className="p-2 border rounded-md flex items-center justify-between text-xs bg-background"
                            >
                              <span className="truncate max-w-[150px]">{prod.nome}</span>
                              <CampoPercentual
                                step="5"
                                className="h-7 w-20 text-xs font-mono"
                                value={prodMix?.percentual.base}
                                onChange={(novoPerc) => {
                                  const mixNovos = premissas.mix_por_sala.map((ms) => {
                                    if (ms.sala_id === sala.id) {
                                      const exist = ms.produtos.find(
                                        (p) => p.produto_id === prod.id,
                                      )
                                      let prodsAtualizados
                                      if (exist) {
                                        prodsAtualizados = ms.produtos.map((p) =>
                                          p.produto_id === prod.id
                                            ? {
                                                ...p,
                                                percentual: { ...p.percentual, base: novoPerc },
                                              }
                                            : p,
                                        )
                                      } else {
                                        prodsAtualizados = [
                                          ...ms.produtos,
                                          {
                                            produto_id: prod.id,
                                            percentual: { base: novoPerc ?? 0, ajustes: {} },
                                          },
                                        ]
                                      }
                                      return { ...ms, produtos: prodsAtualizados }
                                    }
                                    return ms
                                  })
                                  atualizarPremissas({ ...premissas, mix_por_sala: mixNovos })
                                }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </Card>
                  )
                })}
              </div>
            </div>
          </TabsContent>

          {/* ABA 3: CONDIÇÃO MÉDIA DE PAGAMENTO */}
          <TabsContent value="pagamento" className="space-y-6 pt-4">
            <Alert className="bg-muted/30 border">
              <AlertTitle className="text-xs font-semibold">
                Valores Nominais Sem Juros/Correção
              </AlertTitle>
              <AlertDescription className="text-xs">
                Nesta entrega preliminar, o fluxo financeiro de contratos trabalha exclusivamente
                com <strong>valores nominais</strong>. Parcelas que ultrapassam o horizonte de
                simulação são consolidadas como carteira pendente além do horizonte.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              {/* Multipropriedade */}
              <Card className="p-4 space-y-4">
                <CardHeader className="p-0 pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Multipropriedade</span>
                    <Badge variant="outline" className="text-[10px]">
                      Longo Prazo
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <div className="space-y-3 text-xs">
                  <div>
                    <Label className="text-[11px]">Entrada Percentual (%)</Label>
                    <CampoPercentual
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.multipropriedade.perc_entrada}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            multipropriedade: {
                              ...premissas.condicoes_pagamento.multipropriedade,
                              perc_entrada: valor,
                            },
                          },
                        })
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">Ex: 15 para 15%</span>
                  </div>

                  <div>
                    <Label className="text-[11px]">Parcelas da Entrada (qtd meses)</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.multipropriedade.parcelas_entrada}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            multipropriedade: {
                              ...premissas.condicoes_pagamento.multipropriedade,
                              parcelas_entrada: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px]">Mês Relativo da 1ª Parcela do Saldo</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.multipropriedade.mes_primeira_saldo}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            multipropriedade: {
                              ...premissas.condicoes_pagamento.multipropriedade,
                              mes_primeira_saldo: valor,
                            },
                          },
                        })
                      }}
                    />
                    <span className="text-[10px] text-muted-foreground">
                      Ex: 2 inicia 2 meses após a venda
                    </span>
                  </div>

                  <div>
                    <Label className="text-[11px]">Quantidade de Parcelas do Saldo</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.multipropriedade.parcelas_saldo}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            multipropriedade: {
                              ...premissas.condicoes_pagamento.multipropriedade,
                              parcelas_saldo: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>
                </div>
              </Card>

              {/* Time Share */}
              <Card className="p-4 space-y-4">
                <CardHeader className="p-0 pb-2">
                  <CardTitle className="text-sm font-bold flex items-center justify-between">
                    <span>Time Share</span>
                    <Badge variant="outline" className="text-[10px]">
                      Médio Prazo
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <div className="space-y-3 text-xs">
                  <div>
                    <Label className="text-[11px]">Entrada Percentual (%)</Label>
                    <CampoPercentual
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.timeshare.perc_entrada}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            timeshare: {
                              ...premissas.condicoes_pagamento.timeshare,
                              perc_entrada: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px]">Parcelas da Entrada (qtd meses)</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.timeshare.parcelas_entrada}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            timeshare: {
                              ...premissas.condicoes_pagamento.timeshare,
                              parcelas_entrada: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px]">Mês Relativo da 1ª Parcela do Saldo</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.timeshare.mes_primeira_saldo}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            timeshare: {
                              ...premissas.condicoes_pagamento.timeshare,
                              mes_primeira_saldo: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>

                  <div>
                    <Label className="text-[11px]">Quantidade de Parcelas do Saldo</Label>
                    <CampoNumero
                      className="h-8 text-xs font-mono"
                      value={premissas.condicoes_pagamento.timeshare.parcelas_saldo}
                      onChange={(valor) => {
                        atualizarPremissas({
                          ...premissas,
                          condicoes_pagamento: {
                            ...premissas.condicoes_pagamento,
                            timeshare: {
                              ...premissas.condicoes_pagamento.timeshare,
                              parcelas_saldo: valor,
                            },
                          },
                        })
                      }}
                    />
                  </div>
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* ABA 4: CANCELAMENTOS E INADIMPLÊNCIA */}
          <TabsContent value="cancelamento" className="space-y-6 pt-4">
            <Alert className="bg-muted/30 border">
              <AlertTitle className="text-xs font-semibold">
                Regras Financeiras de Cancelamento e Devolução
              </AlertTitle>
              <AlertDescription className="text-xs">
                O cancelamento cessa faturamentos futuros da fração cancelada. A devolução de
                valores elegíveis recebidos ocorre como{' '}
                <strong>pagamento posterior separado</strong> (não deduz novamente a receita passada
                do caixa). Taxa zero é uma hipótese válida; ausência de valor é marcada como
                pendência.
              </AlertDescription>
            </Alert>

            <div className="grid gap-6 md:grid-cols-2">
              {['multipropriedade', 'timeshare'].map((modKey) => {
                const mod = modKey as 'multipropriedade' | 'timeshare'
                const conf = premissas.cancelamentos_inadimplencia[mod]

                return (
                  <Card key={mod} className="p-4 space-y-4">
                    <CardHeader className="p-0 pb-2">
                      <CardTitle className="text-sm font-bold uppercase tracking-wider">
                        {mod === 'multipropriedade' ? 'Multipropriedade' : 'Time Share'}
                      </CardTitle>
                    </CardHeader>

                    <div className="space-y-4 text-xs">
                      <div className="p-3 border rounded-md space-y-2 bg-muted/10">
                        <span className="font-semibold text-[11px] block text-foreground">
                          Cancelamento e Devolução
                        </span>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px]">Taxa de Cancelamento</Label>
                            <CampoPercentual
                              className="h-8 text-xs font-mono"
                              value={conf.cancelamento.taxa}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].cancelamento.taxa = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground">Ex: 8 (8%)</span>
                          </div>
                          <div>
                            <Label className="text-[10px]">Mês Médio Cancel.</Label>
                            <CampoNumero
                              className="h-8 text-xs font-mono"
                              value={conf.cancelamento.mes_medio}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].cancelamento.mes_medio = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Devolução s/ Recebido</Label>
                            <CampoPercentual
                              className="h-8 text-xs font-mono"
                              value={conf.cancelamento.taxa_devolucao}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].cancelamento.taxa_devolucao = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                            <span className="text-[10px] text-muted-foreground">Ex: 70 (70%)</span>
                          </div>
                          <div>
                            <Label className="text-[10px]">Prazo Devolução (meses)</Label>
                            <CampoNumero
                              className="h-8 text-xs font-mono"
                              value={conf.cancelamento.prazo_devolucao}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].cancelamento.prazo_devolucao = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="p-3 border rounded-md space-y-2 bg-muted/10">
                        <span className="font-semibold text-[11px] block text-foreground">
                          Inadimplência e Recuperação
                        </span>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px]">Taxa Inadimplência</Label>
                            <CampoPercentual
                              className="h-8 text-xs font-mono"
                              value={conf.inadimplencia.taxa}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].inadimplencia.taxa = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Parcela Recuperável</Label>
                            <CampoPercentual
                              className="h-8 text-xs font-mono"
                              value={conf.inadimplencia.parcela_recuperavel}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].inadimplencia.parcela_recuperavel = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px]">Prazo Recup. (meses)</Label>
                            <CampoNumero
                              className="h-8 text-xs font-mono"
                              value={conf.inadimplencia.prazo_recuperacao}
                              onChange={(valor) => {
                                const next = { ...premissas.cancelamentos_inadimplencia }
                                next[mod].inadimplencia.prazo_recuperacao = valor
                                atualizarPremissas({
                                  ...premissas,
                                  cancelamentos_inadimplencia: next,
                                })
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          </TabsContent>

          {/* ABA 5: REMUNERAÇÃO E REPASSES */}
          <TabsContent value="remuneracao" className="space-y-6 pt-4">
            <Alert className="bg-muted/30 border">
              <AlertTitle className="text-xs font-semibold">
                Partidas Dobradas e Conciliação Interna
              </AlertTitle>
              <AlertDescription className="text-xs">
                Toda remuneração ou retenção possui pagador e receptor conciliados. A retenção ou
                repasse à comercializadora reduz o caixa disponível ao empreendimento com impacto
                consolidado nulo entre as duas partes.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Componentes de Remuneração da Comercializadora ({premissas.remuneracoes.length})
                </h3>
                <Button
                  onClick={() => {
                    const novaRem = {
                      id: 'rem_' + Math.random().toString(36).substring(2, 7),
                      nome: 'Novo Componente de Remuneração',
                      tipo: 'perc_vgv' as TipoRemuneracao,
                      valor: { base: null, ajustes: {} },
                      adicional_ou_compensavel: 'adicional' as const,
                    }
                    atualizarPremissas({
                      ...premissas,
                      remuneracoes: [...premissas.remuneracoes, novaRem],
                    })
                  }}
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Componente
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {premissas.remuneracoes.map((rem, rIdx) => (
                  <Card key={rem.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Input
                        className="font-bold text-xs h-8 max-w-[220px]"
                        value={rem.nome}
                        onChange={(e) => {
                          const rems = [...premissas.remuneracoes]
                          rems[rIdx].nome = e.target.value
                          atualizarPremissas({ ...premissas, remuneracoes: rems })
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          atualizarPremissas({
                            ...premissas,
                            remuneracoes: premissas.remuneracoes.filter((r) => r.id !== rem.id),
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <Label className="text-[11px]">Tipo de Base</Label>
                        <Select
                          value={rem.tipo}
                          onValueChange={(val) => {
                            const rems = [...premissas.remuneracoes]
                            rems[rIdx].tipo = val as TipoRemuneracao
                            atualizarPremissas({ ...premissas, remuneracoes: rems })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="perc_vgv">% sobre VGV de Vendas</SelectItem>
                            <SelectItem value="perc_recebimento">% sobre Recebimentos</SelectItem>
                            <SelectItem value="retencao_entrada">Retenção de Entrada</SelectItem>
                            <SelectItem value="fixo">Fixo Mensal (R$)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px]">Relação</Label>
                        <Select
                          value={rem.adicional_ou_compensavel}
                          onValueChange={(val) => {
                            const rems = [...premissas.remuneracoes]
                            rems[rIdx].adicional_ou_compensavel = val as any
                            atualizarPremissas({ ...premissas, remuneracoes: rems })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="adicional">Adicional</SelectItem>
                            <SelectItem value="compensavel">Compensável</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label className="text-[11px]">
                          Valor Base ({rem.tipo === 'fixo' ? 'R$' : '%'})
                        </Label>
                        <div className="flex items-center gap-1.5">
                          {rem.tipo === 'fixo' ? (
                            <CampoNumero
                              className="h-8 text-xs font-mono"
                              value={rem.valor.base}
                              onChange={(valor) => {
                                const rems = [...premissas.remuneracoes]
                                rems[rIdx].valor.base = valor
                                atualizarPremissas({ ...premissas, remuneracoes: rems })
                              }}
                            />
                          ) : (
                            <CampoPercentual
                              className="h-8 text-xs font-mono"
                              value={rem.valor.base}
                              onChange={(valor) => {
                                const rems = [...premissas.remuneracoes]
                                rems[rIdx].valor.base = valor
                                atualizarPremissas({ ...premissas, remuneracoes: rems })
                              }}
                            />
                          )}
                          <EditorAjustesMensais
                            titulo={`Remuneração: ${rem.nome}`}
                            horizonteMeses={horizonte}
                            mesInicial={mesIni}
                            valorConfig={rem.valor}
                            isPorcentagem={rem.tipo !== 'fixo'}
                            onChange={(novo) => {
                              const rems = [...premissas.remuneracoes]
                              rems[rIdx].valor = novo
                              atualizarPremissas({ ...premissas, remuneracoes: rems })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ABA 6: CUSTOS E INVESTIMENTOS */}
          <TabsContent value="custos" className="space-y-6 pt-4">
            <Alert className="bg-muted/30 border">
              <AlertTitle className="text-xs font-semibold">
                Equipe Agregada, Custos e Investimentos
              </AlertTitle>
              <AlertDescription className="text-xs">
                O investimento afeta o caixa diretamente no mês indicado, mas{' '}
                <strong>NÃO constitui custo operacional</strong>. Não existe financiamento
                automático para zerar caixa negativo nesta etapa.
              </AlertDescription>
            </Alert>

            {/* Initial Cash */}
            <Card className="p-4 bg-muted/10 space-y-3">
              <CardTitle className="text-xs font-bold uppercase tracking-wider">
                Caixa Inicial por Parte (R$)
              </CardTitle>
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <Label className="text-[11px]">Comercializadora</Label>
                  <CampoNumero
                    className="h-8 text-xs font-mono"
                    value={premissas.caixa_inicial.comercializadora}
                    onChange={(valor) => {
                      atualizarPremissas({
                        ...premissas,
                        caixa_inicial: {
                          ...premissas.caixa_inicial,
                          comercializadora: valor,
                        },
                      })
                    }}
                  />
                </div>
                <div>
                  <Label className="text-[11px]">Empreendimento</Label>
                  <CampoNumero
                    className="h-8 text-xs font-mono"
                    value={premissas.caixa_inicial.empreendimento}
                    onChange={(valor) => {
                      atualizarPremissas({
                        ...premissas,
                        caixa_inicial: {
                          ...premissas.caixa_inicial,
                          empreendimento: valor,
                        },
                      })
                    }}
                  />
                </div>
              </div>
            </Card>

            {/* Operational Costs */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Custos e Despesas Operacionais ({premissas.custos_despesas.length})
                </h3>
                <Button
                  onClick={() => {
                    const novoCusto = {
                      id: 'desp_' + Math.random().toString(36).substring(2, 7),
                      nome: 'Despesa Operacional',
                      tipo: 'fixo' as TipoCustoDespesa,
                      valor: { base: null, ajustes: {} },
                      responsavel_economico: null,
                    }
                    atualizarPremissas({
                      ...premissas,
                      custos_despesas: [...premissas.custos_despesas, novoCusto],
                    })
                  }}
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Despesa
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {premissas.custos_despesas.map((custo, cIdx) => (
                  <Card key={custo.id} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Input
                        className="font-bold text-xs h-8 max-w-[200px]"
                        value={custo.nome}
                        onChange={(e) => {
                          const cd = [...premissas.custos_despesas]
                          cd[cIdx].nome = e.target.value
                          atualizarPremissas({ ...premissas, custos_despesas: cd })
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => {
                          atualizarPremissas({
                            ...premissas,
                            custos_despesas: premissas.custos_despesas.filter(
                              (c) => c.id !== custo.id,
                            ),
                          })
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div>
                        <Label className="text-[11px]">Tipo de Cálculo</Label>
                        <Select
                          value={custo.tipo}
                          onValueChange={(val) => {
                            const cd = [...premissas.custos_despesas]
                            cd[cIdx].tipo = val as TipoCustoDespesa
                            atualizarPremissas({ ...premissas, custos_despesas: cd })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixo">Fixo Mensal (R$)</SelectItem>
                            <SelectItem value="por_atendimento">Por Atendimento Efetivo</SelectItem>
                            <SelectItem value="por_venda">Por Venda Admitida</SelectItem>
                            <SelectItem value="perc_vgv">% sobre VGV</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-[11px]">Responsável Econômico</Label>
                        <Select
                          value={custo.responsavel_economico || ''}
                          onValueChange={(val) => {
                            const cd = [...premissas.custos_despesas]
                            cd[cIdx].responsavel_economico =
                              val === 'comercializadora' || val === 'empreendimento'
                                ? (val as ResponsavelEconomico)
                                : null
                            atualizarPremissas({ ...premissas, custos_despesas: cd })
                          }}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue placeholder="Selecione o responsável..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="comercializadora">Comercializadora</SelectItem>
                            <SelectItem value="empreendimento">Empreendimento</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="col-span-2">
                        <Label className="text-[11px]">Valor Base</Label>
                        <div className="flex items-center gap-1.5">
                          <CampoNumero
                            className="h-8 text-xs font-mono"
                            value={custo.valor.base}
                            onChange={(valor) => {
                              const cd = [...premissas.custos_despesas]
                              cd[cIdx].valor.base = valor
                              atualizarPremissas({ ...premissas, custos_despesas: cd })
                            }}
                          />
                          <EditorAjustesMensais
                            titulo={`Custo: ${custo.nome}`}
                            horizonteMeses={horizonte}
                            mesInicial={mesIni}
                            valorConfig={custo.valor}
                            onChange={(novo) => {
                              const cd = [...premissas.custos_despesas]
                              cd[cIdx].valor = novo
                              atualizarPremissas({ ...premissas, custos_despesas: cd })
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>

            {/* Investments Table */}
            <div className="pt-4 border-t space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold">
                    Tabela de Investimentos e Desembolsos ({premissas.investimentos.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Obra, reformas, equipamentos e implantação por mês e parte
                  </p>
                </div>
                <Button
                  onClick={() => {
                    const novoInv = {
                      id: 'inv_' + Math.random().toString(36).substring(2, 7),
                      descricao: 'Reforma / Adequação Hotel',
                      categoria: 'obra/reforma' as CategoriaInvestimento,
                      mes: null,
                      valor: null,
                      parte: 'empreendimento' as ResponsavelEconomico,
                    }
                    atualizarPremissas({
                      ...premissas,
                      investimentos: [...premissas.investimentos, novoInv],
                    })
                  }}
                  size="sm"
                  className="gap-1.5 h-8 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" /> Adicionar Desembolso
                </Button>
              </div>

              {premissas.investimentos.length === 0 ? (
                <div className="p-4 border rounded-md text-center text-xs text-muted-foreground">
                  Nenhum investimento cadastrado. O fluxo considerará apenas a operação comercial e
                  recebimentos.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="p-2">Descrição</th>
                        <th className="p-2">Categoria</th>
                        <th className="p-2">Mês (0..N)</th>
                        <th className="p-2">Parte</th>
                        <th className="p-2">Valor (R$)</th>
                        <th className="p-2 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {premissas.investimentos.map((inv, iIdx) => (
                        <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="p-2">
                            <Input
                              className="h-7 text-xs"
                              value={inv.descricao}
                              onChange={(e) => {
                                const invs = [...premissas.investimentos]
                                invs[iIdx].descricao = e.target.value
                                atualizarPremissas({ ...premissas, investimentos: invs })
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={inv.categoria}
                              onValueChange={(val) => {
                                const invs = [...premissas.investimentos]
                                invs[iIdx].categoria = val as CategoriaInvestimento
                                atualizarPremissas({ ...premissas, investimentos: invs })
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs w-36">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="obra/reforma">Obra / Reforma</SelectItem>
                                <SelectItem value="mobiliario/equipamentos">
                                  Mobiliário / Equipamentos
                                </SelectItem>
                                <SelectItem value="projetos e implantacao">
                                  Projetos e Implantação
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <CampoNumero
                              className="h-7 text-xs font-mono w-16"
                              value={inv.mes}
                              onChange={(valor) => {
                                const invs = [...premissas.investimentos]
                                invs[iIdx].mes = valor
                                atualizarPremissas({ ...premissas, investimentos: invs })
                              }}
                            />
                          </td>
                          <td className="p-2">
                            <Select
                              value={inv.parte}
                              onValueChange={(val) => {
                                const invs = [...premissas.investimentos]
                                invs[iIdx].parte = val as ResponsavelEconomico
                                atualizarPremissas({ ...premissas, investimentos: invs })
                              }}
                            >
                              <SelectTrigger className="h-7 text-xs w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="empreendimento">Empreendimento</SelectItem>
                                <SelectItem value="comercializadora">Comercializadora</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="p-2">
                            <CampoNumero
                              className="h-7 text-xs font-mono w-28"
                              value={inv.valor}
                              onChange={(valor) => {
                                const invs = [...premissas.investimentos]
                                invs[iIdx].valor = valor
                                atualizarPremissas({ ...premissas, investimentos: invs })
                              }}
                            />
                          </td>
                          <td className="p-2 text-right">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-destructive"
                              onClick={() => {
                                atualizarPremissas({
                                  ...premissas,
                                  investimentos: premissas.investimentos.filter(
                                    (item) => item.id !== inv.id,
                                  ),
                                })
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
