// Campos numéricos com suporte a "não informado" (null) e percentuais em %.
// Regra: valor null aparece vazio; campo apagado grava null; 0 só existe quando o usuário digita 0.
import React, { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

interface CampoValorProps {
  value: number | null | undefined
  onChange: (valor: number | null) => void
  className?: string
  placeholder?: string
  step?: string
}

const paraTexto = (v: number | null | undefined): string =>
  v === null || v === undefined || Number.isNaN(v) ? '' : String(v)

const fracaoParaTexto = (v: number | null | undefined): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return ''
  return String(Number((v * 100).toFixed(4)))
}

const parseTexto = (t: string): number | null => {
  const limpo = t.trim()
  if (limpo === '') return null
  const num = Number(limpo.replace(',', '.'))
  return Number.isNaN(num) ? null : num
}

// Campo numérico comum: digita 0 -> grava 0; apaga -> grava null (não informado)
export const CampoNumero: React.FC<CampoValorProps> = ({
  value,
  onChange,
  className,
  placeholder,
  step,
}) => {
  const [texto, setTexto] = useState(() => paraTexto(value))
  const [focado, setFocado] = useState(false)

  useEffect(() => {
    if (!focado) setTexto(paraTexto(value))
  }, [value, focado])

  return (
    <Input
      type="number"
      step={step}
      className={className}
      placeholder={placeholder}
      value={texto}
      onFocus={() => setFocado(true)}
      onBlur={() => {
        setFocado(false)
        setTexto(paraTexto(value))
      }}
      onChange={(e) => {
        setTexto(e.target.value)
        onChange(parseTexto(e.target.value))
      }}
    />
  )
}

// Campo percentual: usuário digita 20, a tela mostra "20%" e o sistema grava 0,2.
// Apagar grava null (não informado); digitar 0 grava 0 (válido).
export const CampoPercentual: React.FC<CampoValorProps> = ({
  value,
  onChange,
  className,
  placeholder,
  step = 'any',
}) => {
  const [texto, setTexto] = useState(() => fracaoParaTexto(value))
  const [focado, setFocado] = useState(false)

  useEffect(() => {
    if (!focado) setTexto(fracaoParaTexto(value))
  }, [value, focado])

  return (
    <div className="relative inline-flex w-full items-center">
      <Input
        type="number"
        step={step}
        className={className ? `${className} pr-6` : 'pr-6'}
        placeholder={placeholder}
        value={texto}
        onFocus={() => setFocado(true)}
        onBlur={() => {
          setFocado(false)
          setTexto(fracaoParaTexto(value))
        }}
        onChange={(e) => {
          setTexto(e.target.value)
          const num = parseTexto(e.target.value)
          onChange(num === null ? null : num / 100)
        }}
      />
      <span className="pointer-events-none absolute right-2 text-xs text-muted-foreground">%</span>
    </div>
  )
}
