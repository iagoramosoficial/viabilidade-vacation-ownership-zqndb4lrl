// Types for Viabilidade Vacation Ownership
export type ModalidadeProduto = 'multipropriedade' | 'timeshare'

export type EtapaEntrada = 'abordados' | 'qualificados' | 'convidados' | 'comparecidos'

export type EstagioEmpreendimento = 'operando' | 'reforma/expansao' | 'novo projeto' | 'combinado'

export type PapelUsuario = 'admin_master' | 'analista' | 'viewer'

export interface ValorMensalConfig {
  base: number | null // null = não informado (vira pendência); zero explícito digitado é válido
  ajustes?: Record<number, number> // mesIndex -> valor manual override (zero is valid!)
}

export interface PontoCaptacao {
  id: string
  sala_id: string
  nome: string
  etapa_entrada: EtapaEntrada
  volume_entrada: ValorMensalConfig
  taxa_qualificados?: ValorMensalConfig // Abordados -> Qualificados (0..1)
  taxa_convidados?: ValorMensalConfig // Qualificados -> Convidados (0..1)
  taxa_comparecimento?: ValorMensalConfig // Convidados -> Comparecidos (0..1)
  taxa_conversao_venda: ValorMensalConfig // Comparecidos Efetivos -> Venda (0..1)
  custo_transporte_unitario: ValorMensalConfig
  responsavel_transporte?: ResponsavelEconomico | null // null = não informado (pendência quando custo > 0)
}

export interface SalaVendas {
  id: string
  nome: string
  capacidade_mensal: ValorMensalConfig
  pontos: PontoCaptacao[]
}

export interface ProdutoEstudo {
  id: string
  nome: string
  modalidade: ModalidadeProduto
  preco: ValorMensalConfig
  estoque_disponivel: number | null // Informado manualmente pelo usuário; UI avisa que não foi validado por hotelaria/direitos
}

export interface MixProdutoSala {
  produto_id: string
  percentual: ValorMensalConfig // 0..1, soma 100% por nível ativo
}

export interface MixSala {
  sala_id: string
  produtos: MixProdutoSala[]
}

export interface CondicaoPagamentoModalidade {
  perc_entrada: number | null // ex: 0.20; null = não informado (pendência)
  parcelas_entrada: number | null // ex: 1 ou 2
  mes_primeira_saldo: number | null // relativo à venda (ex: 1 para mês seguinte, 2 para 2 meses depois)
  parcelas_saldo: number | null // quantidade de parcelas nominais
}

export interface CancelamentoModalidade {
  taxa: number | null // taxa de cancelamento (0..1); null = não informado (pendência)
  mes_medio: number | null
  taxa_devolucao: number | null // devolução sobre elegíveis recebidos (0..1)
  prazo_devolucao: number | null // meses após cancelamento
}

export interface InadimplenciaModalidade {
  taxa: number | null // inadimplência sobre cobranças ativas (0..1)
  parcela_recuperavel: number | null // fração que é recuperada (0..1)
  prazo_recuperacao: number | null // meses de atraso para recuperação
}

export interface RegrasCancelamentoInadimplencia {
  cancelamento: CancelamentoModalidade
  inadimplencia: InadimplenciaModalidade
}

export type TipoRemuneracao = 'fixo' | 'perc_vgv' | 'perc_recebimento' | 'retencao_entrada'

export interface RemuneracaoComercial {
  id: string
  nome: string
  tipo: TipoRemuneracao
  valor: ValorMensalConfig
  adicional_ou_compensavel: 'adicional' | 'compensavel'
}

export type TipoCustoDespesa = 'fixo' | 'por_atendimento' | 'por_venda' | 'perc_vgv'
export type ResponsavelEconomico = 'comercializadora' | 'empreendimento'

export interface CustoDespesa {
  id: string
  nome: string
  tipo: TipoCustoDespesa
  valor: ValorMensalConfig
  responsavel_economico: ResponsavelEconomico
  sala_id?: string
  ponto_id?: string
}

export type CategoriaInvestimento =
  | 'obra/reforma'
  | 'mobiliario/equipamentos'
  | 'projetos e implantacao'

export interface DesembolsoInvestimento {
  id: string
  descricao: string
  categoria: CategoriaInvestimento
  mes: number // 0-based
  valor: number
  parte: ResponsavelEconomico
}

export interface CaixaInicialPartes {
  comercializadora: number | null
  empreendimento: number | null
}

export interface PremissasEstudo {
  salas: SalaVendas[]
  produtos: ProdutoEstudo[]
  mix_por_sala: MixSala[]
  condicoes_pagamento: {
    multipropriedade: CondicaoPagamentoModalidade
    timeshare: CondicaoPagamentoModalidade
  }
  cancelamentos_inadimplencia: {
    multipropriedade: RegrasCancelamentoInadimplencia
    timeshare: RegrasCancelamentoInadimplencia
  }
  remuneracoes: RemuneracaoComercial[]
  custos_despesas: CustoDespesa[]
  investimentos: DesembolsoInvestimento[]
  caixa_inicial: CaixaInicialPartes
}

// Result types
export interface PontoFunilResultado {
  ponto_id: string
  nome: string
  etapa_entrada: EtapaEntrada
  volume_entrada: number
  comparecidos_demanda: number
  atendimentos_efetivos: number
  demanda_nao_atendida: number
  taxa_conversao_venda: number
  vendas_potenciais: number
  custo_transporte_total: number
}

export interface SalaFunilResultado {
  sala_id: string
  nome: string
  capacidade: number
  demanda_total: number
  atendimentos_efetivos: number
  demanda_nao_atendida: number
  vendas_potenciais: number
  pontos: PontoFunilResultado[]
}

export interface MesFunilResultado {
  mes: number
  salas: SalaFunilResultado[]
  total_vgv_mes: number
  total_vendas_mes: number
  total_atendimentos_mes: number
}

export interface VendaMesProdutoResultado {
  mes: number
  sala_id: string
  produto_id: string
  modalidade: ModalidadeProduto
  nome_produto: string
  potencial: number
  admitido: number
  nao_atendido_estoque: number
  preco_unitario: number
  vgv: number
}

export interface FluxoMensalComercializadora {
  mes: number
  receita_remuneracao: number
  custos_operacionais: number
  investimentos: number
  fluxo_liquido: number
  saldo_acumulado: number
}

export interface FluxoMensalEmpreendimento {
  mes: number
  recebimentos_brutos: number
  repasse_comercial: number
  custos_proprios: number
  devolucoes: number
  investimentos: number
  fluxo_liquido: number
  saldo_acumulado: number
}

export interface TransferenciaInternaConciliada {
  mes: number
  de: ResponsavelEconomico
  para: ResponsavelEconomico
  valor: number
  descricao: string
}

export interface ResultadoSimulacaoViabilidade {
  titulo: string
  schema_version: number
  horizonte_meses: number
  mes_inicial: string
  resumo_global: {
    vgv_total: number
    vendas_potenciais_total: number
    vendas_admitidas_total: number
    vendas_recusadas_capacidade_total: number
    vendas_recusadas_estoque_total: number
    recebimentos_compradores_total: number
    devolucoes_total: number
    carteira_alem_horizonte: {
      multipropriedade: number
      timeshare: number
      total: number
    }
    estoque_restante_por_produto: Record<string, number>
  }
  comercializadora: {
    caixa_inicial: number
    total_receita_propria: number
    total_custos_assumidos: number
    resultado_gerencial_comercial: number
    saldo_final: number
    maior_deficit: number
    mes_maior_deficit: number
    fluxos_mensais: FluxoMensalComercializadora[]
  }
  empreendimento: {
    caixa_inicial: number
    recebimentos_brutos_total: number
    repasses_comercializadora_total: number
    custos_proprios_total: number
    devolucoes_total: number
    investimentos_total: number
    saldo_final: number
    maior_deficit: number
    mes_maior_deficit: number
    fluxos_mensais: FluxoMensalEmpreendimento[]
  }
  funil_mensal: MesFunilResultado[]
  vendas_mes_produto: VendaMesProdutoResultado[]
  transferencias_internas: TransferenciaInternaConciliada[]
  avisos_escopo: string[]
}
