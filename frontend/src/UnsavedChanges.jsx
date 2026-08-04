import { createContext, useCallback, useContext, useEffect, useRef } from 'react'

export const UnsavedChangesContext = createContext(() => {})

/**
 * Registra alterações que não podem ser descartadas silenciosamente ao trocar
 * de seção. O Layout usa a mensagem para confirmar a navegação.
 */
export function useUnsavedChanges(ativo, mensagem) {
  const registrar = useContext(UnsavedChangesContext)
  const liberar = useCallback(() => registrar(null), [registrar])

  useEffect(() => {
    registrar(ativo ? mensagem : null)
    return () => registrar(null)
  }, [ativo, mensagem, registrar])

  // Cobre recarregar, fechar a aba e navegações externas, além das trocas de
  // seção interceptadas pelo Layout.
  useEffect(() => {
    if (!ativo) return undefined
    const impedirSaida = (evento) => {
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', impedirSaida)
    return () => window.removeEventListener('beforeunload', impedirSaida)
  }, [ativo])

  return liberar
}

export function useClearUnsavedChanges() {
  const registrar = useContext(UnsavedChangesContext)
  return useCallback(() => registrar(null), [registrar])
}

/** Detecta alterações desde a abertura de um formulário/modal e as registra. */
export function useDirtyForm(aberto, valor, mensagem) {
  const estavaAberto = useRef(false)
  const valorInicial = useRef(null)
  const serializado = aberto ? JSON.stringify(valor) : null

  if (aberto && !estavaAberto.current) valorInicial.current = serializado
  if (!aberto) valorInicial.current = null

  const alterado = aberto && valorInicial.current != null && serializado !== valorInicial.current
  useUnsavedChanges(alterado, mensagem)

  useEffect(() => {
    estavaAberto.current = aberto
  }, [aberto])

  return alterado
}
