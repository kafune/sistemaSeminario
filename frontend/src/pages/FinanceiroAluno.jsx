import { useCallback, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Button } from '@mui/material'
import PersonOutlineIcon from '@mui/icons-material/PersonOutline'
import { getPerfil } from '../api'
import { TOV } from '../theme'
import { CabecalhoPagina, resetBotao } from '../ui'
import FinanceiroAlunoPainel from './FinanceiroAlunoPainel'

export default function FinanceiroAluno() {
  const { codAlu } = useParams()
  const navigate = useNavigate()
  // O perfil FINANCEIRO não alcança a secretaria: sem ficha cadastral.
  const veFichaDoAluno = getPerfil() !== 'FINANCEIRO'
  const [extrato, setExtrato] = useState(null)
  const receberExtrato = useCallback((dados) => setExtrato(dados), [])

  const aluno = extrato?.aluno
  // O nome da turma já costuma começar com "Turma": não repetir o prefixo.
  const turma = aluno?.turma_nome ? (/^turma\b/i.test(aluno.turma_nome.trim()) ? aluno.turma_nome : `Turma ${aluno.turma_nome}`) : 'Sem turma vinculada'
  const totalCobrancas = extrato?.cobrancas.length ?? 0

  return (
    <Box>
      <Box
        component="button" type="button" onClick={() => navigate('/financeiro')}
        sx={{ ...resetBotao, minHeight: 44, px: 0.5, display: 'inline-flex', alignItems: 'center', fontSize: TOV.type.body, color: TOV.caption, fontWeight: 600, mb: 1.5, '&:hover': { color: TOV.coral } }}
      >
        ‹ Voltar para Financeiro
      </Box>

      <CabecalhoPagina
        eyebrow="Situação financeira"
        titulo={aluno?.nome || 'Carregando…'}
        descricao={turma}
        metadados={extrato ? `${totalCobrancas} ${totalCobrancas === 1 ? 'cobrança' : 'cobranças'} no histórico` : ' '}
        acoes={veFichaDoAluno && (
          <Button variant="outlined" startIcon={<PersonOutlineIcon />} onClick={() => navigate(`/alunos/${codAlu}`)}>
            Ficha do aluno
          </Button>
        )}
      />

      <FinanceiroAlunoPainel codAlu={codAlu} aoCarregarExtrato={receberExtrato} />
    </Box>
  )
}
