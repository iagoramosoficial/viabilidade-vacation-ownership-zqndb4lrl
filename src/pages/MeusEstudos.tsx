// Meus Estudos (Dashboard / Listing page)
import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  FolderKanban,
  Plus,
  MapPin,
  Calendar,
  Layers,
  ArrowRight,
  Clock,
  Building2,
  Trash2,
  Copy,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { EstagioEmpreendimento } from '@/types/viabilidade'

export const MeusEstudos: React.FC = () => {
  const { user, empresa, recarregarEmpresas, selecionarEmpresa } = useAuth()
  const navigate = useNavigate()

  const [estudos, setEstudos] = useState<RecordModel[]>([])
  const [cenariosPorEstudo, setCenariosPorEstudo] = useState<Record<string, RecordModel[]>>({})
  const [loading, setLoading] = useState(true)

  // Modal Novo Estudo
  const [modalAberto, setModalAberto] = useState(false)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [uf, setUf] = useState('')
  const [estagio, setEstagio] = useState<EstagioEmpreendimento>('reforma/expansao')
  const [mesInicial, setMesInicial] = useState('2025-01')
  const [horizonteMeses, setHorizonteMeses] = useState(36)
  const [observacoes, setObservacoes] = useState('')
  const [salvando, setSalvando] = useState(false)

  // Modal Duplicar Cenário
  const [cenarioParaDuplicar, setCenarioParaDuplicar] = useState<RecordModel | null>(null)
  const [novoNomeCenario, setNovoNomeCenario] = useState('')
  const [duplicando, setDuplicando] = useState(false)

  const carregarEstudos = useCallback(async () => {
    if (!empresa) {
      setEstudos([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      const list = await pb.collection('estudos').getFullList({
        filter: `empresa = '${empresa.id}'`,
        sort: '-created',
      })
      setEstudos(list)

      // Fetch scenarios for each study
      const mapCenarios: Record<string, RecordModel[]> = {}
      for (const est of list) {
        const cens = await pb.collection('cenarios').getFullList({
          filter: `estudo = '${est.id}'`,
          sort: 'is_base',
        })
        mapCenarios[est.id] = cens
      }
      setCenariosPorEstudo(mapCenarios)
    } catch (err) {
      console.error('Erro ao carregar estudos:', err)
      toast.error('Erro ao buscar estudos da empresa')
    } finally {
      setLoading(false)
    }
  }, [empresa])

  useEffect(() => {
    if (!user) {
      navigate('/login')
      return
    }
    carregarEstudos()
  }, [user, empresa, navigate, carregarEstudos])

  const handleCriarEstudo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!empresa || !user) {
      toast.error('Você precisa ter uma empresa selecionada')
      return
    }

    if (!nome.trim() || !cidade.trim() || !uf.trim()) {
      toast.error('Preencha os campos obrigatórios')
      return
    }

    try {
      setSalvando(true)
      // 1. Create study
      const novoEstudo = await pb.collection('estudos').create({
        empresa: empresa.id,
        nome: nome.trim(),
        cidade: cidade.trim(),
        uf: uf.trim().toUpperCase(),
        estagio: estagio,
        mes_inicial: mesInicial,
        horizonte_meses: horizonteMeses,
        observacoes: observacoes.trim(),
        criador: user.id,
      })

      // 2. Create Base scenario (editable, independent, with structured empty/neutral premissas)
      const premissasIniciais = {
        salas: [
          {
            id: 'sala_' + Math.random().toString(36).substring(2, 7),
            nome: 'Sala Principal',
            capacidade_mensal: { base: 120, ajustes: {} },
            pontos: [
              {
                id: 'pnt_' + Math.random().toString(36).substring(2, 7),
                sala_id: '',
                nome: 'Ponto 01',
                etapa_entrada: 'comparecidos',
                volume_entrada: { base: 100, ajustes: {} },
                taxa_qualificados: { base: 1.0, ajustes: {} },
                taxa_convidados: { base: 1.0, ajustes: {} },
                taxa_comparecimento: { base: 1.0, ajustes: {} },
                taxa_conversao_venda: { base: 0.18, ajustes: {} },
                custo_transporte_unitario: { base: 0, ajustes: {} },
              },
            ],
          },
        ],
        produtos: [
          {
            id: 'prd_' + Math.random().toString(36).substring(2, 7),
            nome: 'Fração Multipropriedade 2Q',
            modalidade: 'multipropriedade',
            preco: { base: 45000, ajustes: {} },
            estoque_disponivel: 150,
          },
        ],
        mix_por_sala: [],
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
            id: 'rem_1',
            nome: 'Comissão sobre VGV',
            tipo: 'perc_vgv',
            valor: { base: 0.12, ajustes: {} },
            adicional_ou_compensavel: 'adicional',
          },
        ],
        custos_despesas: [
          {
            id: 'desp_1',
            nome: 'Equipe e Coordenação da Sala',
            tipo: 'fixo',
            valor: { base: 25000, ajustes: {} },
            responsavel_economico: 'comercializadora',
          },
        ],
        investimentos: [],
        caixa_inicial: {
          comercializadora: 50000,
          empreendimento: 100000,
        },
      }

      // Fix sala_id reference
      premissasIniciais.salas[0].pontos[0].sala_id = premissasIniciais.salas[0].id
      premissasIniciais.mix_por_sala = [
        {
          sala_id: premissasIniciais.salas[0].id,
          produtos: [
            {
              produto_id: premissasIniciais.produtos[0].id,
              percentual: { base: 1.0, ajustes: {} },
            },
          ],
        },
      ]

      const cenarioBase = await pb.collection('cenarios').create({
        estudo: novoEstudo.id,
        nome: 'Cenário Base',
        descricao: 'Cenário base inicial com premissas padrão para edição',
        is_base: true,
        schema_version: 1,
        premissas: premissasIniciais,
        is_stale: true,
      })

      toast.success('Estudo e Cenário Base criados com sucesso!')
      setModalAberto(false)
      navigate(`/estudo/${novoEstudo.id}/cenario/${cenarioBase.id}`)
    } catch (err: unknown) {
      toast.error('Erro ao criar estudo: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setSalvando(false)
    }
  }

  const handleDuplicarCenario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!cenarioParaDuplicar || !novoNomeCenario.trim()) return

    try {
      setDuplicando(true)
      const res = await pb.send('/backend/v1/viabilidade/duplicar-cenario', {
        method: 'POST',
        body: {
          cenario_id: cenarioParaDuplicar.id,
          novo_nome: novoNomeCenario.trim(),
        },
      })

      toast.success('Cenário duplicado com sucesso!')
      setCenarioParaDuplicar(null)
      setNovoNomeCenario('')
      await carregarEstudos()
      if (res?.id) {
        navigate(`/estudo/${cenarioParaDuplicar.estudo}/cenario/${res.id}`)
      }
    } catch (err: unknown) {
      toast.error('Erro ao duplicar cenário: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setDuplicando(false)
    }
  }

  const handleExcluirEstudo = async (estudoId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Deseja realmente excluir este estudo e todos os seus cenários?')) return

    try {
      await pb.collection('estudos').delete(estudoId)
      toast.success('Estudo excluído')
      await carregarEstudos()
    } catch (err: unknown) {
      toast.error('Erro ao excluir: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const estagioBadges: Record<
    EstagioEmpreendimento,
    { label: string; variant: 'default' | 'secondary' | 'outline' }
  > = {
    operando: { label: 'Em Operação', variant: 'default' },
    'reforma/expansao': { label: 'Reforma / Expansão', variant: 'secondary' },
    'novo projeto': { label: 'Novo Projeto (Greenfield)', variant: 'outline' },
    combinado: { label: 'Combinado', variant: 'secondary' },
  }

  return (
    <div className="container py-8 px-4 sm:px-8 space-y-8">
      {/* Top Banner / Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Meus Estudos de Viabilidade
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Empresa ativa:{' '}
            <span className="font-semibold text-foreground">
              {empresa ? empresa.nome : 'Nenhuma selecionada'}
            </span>
          </p>
        </div>

        <Dialog open={modalAberto} onOpenChange={setModalAberto}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" /> Novo Estudo
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCriarEstudo}>
              <DialogHeader>
                <DialogTitle>Cadastro de Novo Estudo</DialogTitle>
                <DialogDescription>
                  Defina os parâmetros estruturais básicos do empreendimento. Um Cenário Base
                  editável será criado automaticamente.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="nome">Nome do Estudo / Empreendimento *</Label>
                  <Input
                    id="nome"
                    placeholder="Ex: Reserva Thermas Resort & Spa"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2 grid gap-2">
                    <Label htmlFor="cidade">Cidade (manual) *</Label>
                    <Input
                      id="cidade"
                      placeholder="Ex: Olímpia"
                      value={cidade}
                      onChange={(e) => setCidade(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="uf">UF *</Label>
                    <Input
                      id="uf"
                      placeholder="SP"
                      maxLength={2}
                      value={uf}
                      onChange={(e) => setUf(e.target.value.toUpperCase())}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="estagio">Estágio do Empreendimento *</Label>
                  <Select
                    value={estagio}
                    onValueChange={(v) => setEstagio(v as EstagioEmpreendimento)}
                  >
                    <SelectTrigger id="estagio">
                      <SelectValue placeholder="Selecione o estágio" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operando">Operando</SelectItem>
                      <SelectItem value="reforma/expansao">
                        Reforma / Expansão (Piloto Hotel)
                      </SelectItem>
                      <SelectItem value="novo projeto">Novo Projeto</SelectItem>
                      <SelectItem value="combinado">Combinado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="mesInicial">Mês Inicial (AAAA-MM) *</Label>
                    <Input
                      id="mesInicial"
                      type="month"
                      value={mesInicial}
                      onChange={(e) => setMesInicial(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="horizonte">Horizonte (meses) *</Label>
                    <Input
                      id="horizonte"
                      type="number"
                      min={6}
                      max={120}
                      value={horizonteMeses}
                      onChange={(e) => setHorizonteMeses(Number(e.target.value))}
                      required
                    />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="obs">Observações e Contexto do Projeto</Label>
                  <Textarea
                    id="obs"
                    placeholder="Histórico, restrições operacionais conhecidas ou detalhes preliminares do projeto..."
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setModalAberto(false)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando ? 'Criando Estudo...' : 'Criar Estudo e Cenário Base'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Aviso de escopo e limites do Blueprint v1.3 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50/70 dark:border-blue-900/40 dark:bg-blue-950/20 p-4 text-xs text-blue-900 dark:text-blue-200 flex items-start gap-3">
        <AlertCircle className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">
            Primeira entrega parcial do Blueprint v1.3 • Premissas e Caixa Separado
          </p>
          <p className="text-muted-foreground dark:text-blue-300">
            Faltam hotelaria completa, direitos/capacidade contratual, tributos, financiamento e
            encargos ainda não modelados (não são zero no negócio real). Os caixas da
            comercializadora e do empreendimento operam com partidas dobradas e transferências
            conciliadas.
          </p>
        </div>
      </div>

      {/* Studies Listing */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Clock className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando estudos...</span>
        </div>
      ) : !empresa ? (
        <Card className="text-center py-12">
          <CardContent className="space-y-4">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <h3 className="font-semibold text-lg">Nenhuma empresa vinculada</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Seu acesso ainda não tem empresa vinculada. Fale com o administrador.
            </p>
          </CardContent>
        </Card>
      ) : estudos.length === 0 ? (
        <Card className="text-center py-12 border-dashed">
          <CardContent className="space-y-4">
            <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground opacity-50" />
            <h3 className="font-semibold text-lg">Nenhum estudo cadastrado ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Comece agora criando seu primeiro estudo de viabilidade com dados manuais para
              simulação rápida.
            </p>
            <Button onClick={() => setModalAberto(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Criar Meu Primeiro Estudo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {estudos.map((estudo) => {
            const cenarios = cenariosPorEstudo[estudo.id] || []
            const badgeInfo = estagioBadges[estudo.estagio as EstagioEmpreendimento] || {
              label: estudo.estagio,
              variant: 'outline',
            }

            return (
              <Card
                key={estudo.id}
                className="flex flex-col justify-between hover:shadow-md transition-shadow"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <Badge variant={badgeInfo.variant} className="text-[11px]">
                      {badgeInfo.label}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={(e) => handleExcluirEstudo(estudo.id, e)}
                      title="Excluir estudo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <CardTitle className="text-lg font-bold mt-2 line-clamp-1">
                    {estudo.nome}
                  </CardTitle>
                  <CardDescription className="flex items-center gap-1 text-xs">
                    <MapPin className="h-3.5 w-3.5" />
                    {estudo.cidade} - {estudo.uf}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground bg-muted/40 p-2.5 rounded-md">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" />
                      <span>Início: {estudo.mes_inicial}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>{estudo.horizonte_meses} meses</span>
                    </div>
                  </div>

                  {estudo.observacoes && (
                    <p className="text-muted-foreground line-clamp-2 italic">
                      {estudo.observacoes}
                    </p>
                  )}

                  {/* Scenarios of this Study */}
                  <div className="space-y-2 pt-2 border-t">
                    <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                      <span className="flex items-center gap-1">
                        <Layers className="h-3.5 w-3.5" /> Cenários ({cenarios.length})
                      </span>
                    </div>

                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {cenarios.map((cen) => (
                        <div
                          key={cen.id}
                          className="flex items-center justify-between p-2 rounded-md bg-background border hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-medium text-xs truncate">{cen.nome}</span>
                            {cen.is_base && (
                              <Badge variant="outline" className="text-[10px] h-5 px-1 font-normal">
                                Base
                              </Badge>
                            )}
                            {cen.is_stale && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] h-5 px-1 bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                              >
                                Desatualizado
                              </Badge>
                            )}
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground hover:text-foreground"
                              title="Duplicar cenário independentemente"
                              onClick={() => {
                                setCenarioParaDuplicar(cen)
                                setNovoNomeCenario(`${cen.nome} (Cópia)`)
                              }}
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <Link to={`/estudo/${estudo.id}/cenario/${cen.id}`}>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs gap-1"
                              >
                                Abrir <ArrowRight className="h-3 w-3" />
                              </Button>
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="pt-2 border-t">
                  {cenarios.length > 0 ? (
                    <Link to={`/estudo/${estudo.id}/cenario/${cenarios[0].id}`} className="w-full">
                      <Button variant="default" className="w-full text-xs h-8">
                        Acessar Cenário Principal
                      </Button>
                    </Link>
                  ) : (
                    <Button variant="outline" disabled className="w-full text-xs h-8">
                      Sem cenários
                    </Button>
                  )}
                </CardFooter>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Duplicar Cenário */}
      <Dialog
        open={!!cenarioParaDuplicar}
        onOpenChange={(open) => !open && setCenarioParaDuplicar(null)}
      >
        <DialogContent>
          <form onSubmit={handleDuplicarCenario}>
            <DialogHeader>
              <DialogTitle>Duplicar Cenário</DialogTitle>
              <DialogDescription>
                A duplicação cria uma cópia 100% independente, com novos identificadores internos.
                Alterações na cópia não afetam o original.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="nomeCopia">Nome do Novo Cenário *</Label>
                <Input
                  id="nomeCopia"
                  value={novoNomeCenario}
                  onChange={(e) => setNovoNomeCenario(e.target.value)}
                  placeholder="Ex: Cenário Otimista Comercial"
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCenarioParaDuplicar(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={duplicando || !novoNomeCenario.trim()}>
                {duplicando ? 'Duplicando...' : 'Confirmar Duplicação'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
