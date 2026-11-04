import React, { createContext, useContext, useEffect, useState } from 'react'
import pb from '@/lib/pocketbase/client'
import type { RecordModel } from 'pocketbase'

interface AuthContextType {
  user: RecordModel | null
  isLoading: boolean
  isMaster: boolean
  empresa: RecordModel | null
  membroRole: string
  login: (email: string, pass: string) => Promise<void>
  signup: (email: string, pass: string, name: string) => Promise<void>
  logout: () => void
  selecionarEmpresa: (empresaId: string) => Promise<void>
  empresasDisponiveis: RecordModel[]
  recarregarEmpresas: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<RecordModel | null>(pb.authStore.record)
  const [isLoading, setIsLoading] = useState(true)
  const [empresa, setEmpresa] = useState<RecordModel | null>(null)
  const [membroRole, setMembroRole] = useState<string>('admin_master')
  const [empresasDisponiveis, setEmpresasDisponiveis] = useState<RecordModel[]>([])

  const carregarEmpresasDoUsuario = async (userId: string) => {
    try {
      // Find companies where user is creator or member
      const criadas = await pb.collection('empresas').getFullList({
        filter: `criador = '${userId}'`,
        sort: '-created',
      })

      const membros = await pb.collection('empresa_membros').getFullList({
        filter: `user = '${userId}'`,
        expand: 'empresa',
      })

      const empIds = new Set(criadas.map((c) => c.id))
      const todas: RecordModel[] = [...criadas]

      for (const m of membros) {
        if (m.expand?.empresa && !empIds.has(m.expand.empresa.id)) {
          empIds.add(m.expand.empresa.id)
          todas.push(m.expand.empresa)
        }
      }

      setEmpresasDisponiveis(todas)

      if (todas.length > 0) {
        // Pick first or keep current if valid
        const selecionada = todas[0]
        setEmpresa(selecionada)
        if (selecionada.criador === userId) {
          setMembroRole('admin_master')
        } else {
          const m = membros.find((item) => item.empresa === selecionada.id)
          setMembroRole(m?.role || 'viewer')
        }
      } else {
        setEmpresa(null)
      }
    } catch (err) {
      console.error('Erro ao carregar empresas:', err)
    }
  }

  useEffect(() => {
    const unsub = pb.authStore.onChange((_token, model) => {
      setUser(model)
      if (model) {
        carregarEmpresasDoUsuario(model.id)
      } else {
        setEmpresa(null)
        setEmpresasDisponiveis([])
      }
    })

    if (pb.authStore.isValid && pb.authStore.record) {
      setUser(pb.authStore.record)
      carregarEmpresasDoUsuario(pb.authStore.record.id).finally(() => {
        setIsLoading(false)
      })
    } else {
      setIsLoading(false)
    }

    return () => {
      unsub()
    }
  }, [])

  const login = async (email: string, pass: string) => {
    const authData = await pb.collection('users').authWithPassword(email, pass)
    setUser(authData.record)
    await carregarEmpresasDoUsuario(authData.record.id)
  }

  const signup = async (email: string, pass: string, name: string) => {
    await pb.collection('users').create({
      email,
      password: pass,
      passwordConfirm: pass,
      name,
    })
    await login(email, pass)
  }

  const logout = () => {
    pb.authStore.clear()
    setUser(null)
    setEmpresa(null)
    setEmpresasDisponiveis([])
  }

  const selecionarEmpresa = async (empresaId: string) => {
    const emp = empresasDisponiveis.find((e) => e.id === empresaId)
    if (emp && user) {
      setEmpresa(emp)
      if (emp.criador === user.id) {
        setMembroRole('admin_master')
      } else {
        try {
          const m = await pb
            .collection('empresa_membros')
            .getFirstListItem(`empresa = '${emp.id}' && user = '${user.id}'`)
          setMembroRole(m.role)
        } catch {
          setMembroRole('viewer')
        }
      }
    }
  }

  const recarregarEmpresas = async () => {
    if (user) {
      await carregarEmpresasDoUsuario(user.id)
    }
  }

  const isMaster = Boolean(user?.is_master)

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isMaster,
        empresa,
        membroRole,
        login,
        signup,
        logout,
        selecionarEmpresa,
        empresasDisponiveis,
        recarregarEmpresas,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within an AuthProvider')
  return context
}
