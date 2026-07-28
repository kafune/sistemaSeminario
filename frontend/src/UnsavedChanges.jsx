import { createContext, useContext, useEffect } from 'react'

export const UnsavedChangesContext = createContext(() => {})

/**
 * Registra alterações que não podem ser descartadas silenciosamente ao trocar
 * de seção. O Layout usa a mensagem para confirmar a navegação.
 */
export function useUnsavedChanges(ativo, mensagem) {
  const registrar = useContext(UnsavedChangesContext)

  useEffect(() => {
    registrar(ativo ? mensagem : null)
    return () => registrar(null)
  }, [ativo, mensagem, registrar])
}
