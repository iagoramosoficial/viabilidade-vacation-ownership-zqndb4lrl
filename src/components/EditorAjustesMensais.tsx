// Monthly Adjuster Modal / Popover component for any ValorMensalConfig
import React, { useState } from 'react'
import type { ValorMensalConfig } from '@/types/viabilidade'
import { Button } from '@/components/ui/button'
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
import { Calendar, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface EditorAjustesMensaisProps {
  titulo: string
  horizonteMeses: number
  mesInicial: string
  valorConfig: ValorMensalConfig
  isPorcentagem?: boolean
  onChange: (novoConfig: ValorMensalConfig) => void
}

export const EditorAjustesMensais: React.FC<EditorAjustesMensaisProps> = ({
  titulo,
  horizonteMeses,
  mesInicial,
  valorConfig,
  isPorcentagem = false,
  onChange,
}) => {
  const [aberto, setAberto] = useState(false)
  const [ajustesTemp, setAjustesTemp] = useState<Record<number, string>>(() => {
    const map: Record<number, string> = {}
    if (valorConfig.ajustes) {
      Object.entries(valorConfig.ajustes).forEach(([m, v]) => {
        const val = isPorcentagem ? Number(v) * 100 : Number(v)
        map[Number(m)] = String(val)
      })
    }
    return map
  })

  // Format month label AAAA-MM + offset
  const getRotuloMes = (offset: number) => {
    const parts = (mesInicial || '2025-01').split('-')
    const ano = parseInt(parts[0], 10) || 2025
    const mes = parseInt(parts[1], 10) || 1
    const totalMeses = ano * 12 + (mes - 1) + offset
    const finalAno = Math.floor(totalMeses / 12)
    const finalMes = (totalMeses % 12) + 1
    return `M${offset} (${String(finalMes).padStart(2, '0')}/${finalAno})`
  }

  const handleSalvar = () => {
    const novosAjustes: Record<number, number> = {}
    Object.entries(ajustesTemp).forEach(([m, str]) => {
      if (str !== undefined && str.trim() !== '') {
        const num = parseFloat(str.replace(',', '.'))
        if (!isNaN(num)) {
          novosAjustes[Number(m)] = isPorcentagem ? num / 100 : num
        }
      }
    })

    onChange({
      base: valorConfig.base,
      ajustes: novosAjustes,
    })
    setAberto(false)
  }

  const countAjustes = valorConfig.ajustes ? Object.keys(valorConfig.ajustes).length : 0

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Calendar className="h-3.5 w-3.5" />
          Ajustes Mensais
          {countAjustes > 0 && (
            <Badge
              variant="secondary"
              className="ml-1 h-5 px-1.5 text-[10px] bg-primary/10 text-primary"
            >
              {countAjustes}
            </Badge>
          )}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Edição Mensal Explícita: {titulo}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Valor base replicado:{' '}
            <strong className="text-foreground">
              {isPorcentagem ? `${(valorConfig.base * 100).toFixed(2)}%` : valorConfig.base}
            </strong>
            . Preencha apenas os meses com sazonalidade/ajuste. O valor{' '}
            <strong className="text-foreground">0</strong> é um override explícito válido. Deixe em
            branco para herdar a base.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: Math.min(horizonteMeses, 36) }).map((_, mIdx) => {
              const val = ajustesTemp[mIdx] ?? ''
              const herdado = valorConfig.base

              return (
                <div key={mIdx} className="space-y-1 p-2 rounded-md border bg-muted/20">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-foreground">{getRotuloMes(mIdx)}</span>
                    <span className="text-muted-foreground text-[10px]">
                      Herdado: {isPorcentagem ? `${(herdado * 100).toFixed(1)}%` : herdado}
                    </span>
                  </div>
                  <Input
                    className="h-8 text-xs font-mono"
                    placeholder={`Herda base (${isPorcentagem ? `${(herdado * 100).toFixed(1)}%` : herdado})`}
                    value={val}
                    onChange={(e) => {
                      const next = { ...ajustesTemp }
                      if (e.target.value === '') {
                        delete next[mIdx]
                      } else {
                        next[mIdx] = e.target.value
                      }
                      setAjustesTemp(next)
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground gap-1"
            onClick={() => setAjustesTemp({})}
          >
            <RotateCcw className="h-3 w-3" /> Limpar todos ajustes
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSalvar}>
              Salvar Ajustes
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
