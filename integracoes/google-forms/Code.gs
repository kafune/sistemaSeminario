// URL padrão de produção. Para apontar para homologação sem editar o script,
// defina a propriedade de script TOV_API_BASE (Configurações do projeto).
const API_BASE_PADRAO = 'https://centro-tov.kafune.xyz/api/integracoes/google-forms';
const PROPRIEDADE_API_BASE = 'TOV_API_BASE';
const PROPRIEDADE_SEGREDO = 'TOV_WEBHOOK_SECRET';

/**
 * Cabeçalhos das perguntas do Forms. Cada campo aceita mais de um texto,
 * comparados sem acento, sem pontuação e sem caixa — renomear a pergunta
 * deixa de zerar o campo em silêncio, e `montarPayload` avisa quando algum
 * cabeçalho obrigatório não foi encontrado.
 */
const CABECALHOS = {
  nome: ['Nome', 'Nome completo'],
  turma_interesse: ['Qual a turma de interesse?', 'Turma de interesse'],
  telefone: ['Telefone:', 'Telefone', 'Celular', 'WhatsApp'],
  e_mail: ['E-mail', 'Email', 'E-mail:'],
  rg: ['RG'],
  cpf: ['CPF'],
  escolaridade: ['Escolaridade'],
  igreja: ['Igreja da qual é membro?', 'Igreja'],
  endereco_igreja: ['Endereço Completo da igreja - Incluindo Bairro e Cidade', 'Endereço da igreja'],
  nome_pastor: ['Nome do Pastor', 'Pastor'],
  cur_teologicos: ['Você já fez algum curso anterior de Teologia? Se sim, onde?', 'Cursos de teologia'],
  nome_conjuge: [
    'Seu cônjuge participará junto? (50% de desconto na mensalidade do cônjuge). Se sim, deixe aqui o nome dele(a).',
    'Nome do cônjuge',
  ],
  carimbo: ['Carimbo de data/hora', 'Timestamp'],
};
const OBRIGATORIOS = ['nome', 'telefone', 'e_mail'];

function normalizarCabecalho(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Lê a resposta de uma pergunta aceitando qualquer um dos cabeçalhos conhecidos. */
function lerCampo(valores, campo) {
  const alvos = (CABECALHOS[campo] || []).map(normalizarCabecalho);
  const chaves = Object.keys(valores || {});
  for (const chave of chaves) {
    if (alvos.includes(normalizarCabecalho(chave))) {
      const resposta = valores[chave];
      return resposta && resposta.length ? String(resposta[0]).trim() : '';
    }
  }
  return '';
}

function cabecalhosAusentes(valores) {
  return OBRIGATORIOS.filter((campo) => {
    const alvos = CABECALHOS[campo].map(normalizarCabecalho);
    return !Object.keys(valores || {}).some((chave) => alvos.includes(normalizarCabecalho(chave)));
  });
}

function apiBase() {
  const configurada = PropertiesService.getScriptProperties().getProperty(PROPRIEDADE_API_BASE);
  return (configurada || API_BASE_PADRAO).replace(/\/+$/, '');
}
const PROPRIEDADE_PLANILHA = 'TOV_SPREADSHEET_ID';
const PROPRIEDADE_ABA = 'TOV_SHEET_ID';

/**
 * Instala o envio imediato e a verificação periódica de importações.
 * Antes de executar, deixe aberta a aba que recebe as respostas do Forms.
 */
function instalarGatilho() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  const aba = planilha.getActiveSheet();
  const propriedades = PropertiesService.getScriptProperties();
  propriedades.setProperties({
    [PROPRIEDADE_PLANILHA]: planilha.getId(),
    [PROPRIEDADE_ABA]: String(aba.getSheetId()),
  });

  const gatilhos = ScriptApp.getProjectTriggers();
  const temEnvio = gatilhos.some(
    (gatilho) =>
      gatilho.getHandlerFunction() === 'enviarPreCadastro' &&
      gatilho.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT,
  );
  const temImportacao = gatilhos.some(
    (gatilho) =>
      gatilho.getHandlerFunction() === 'processarImportacoesPendentes' &&
      gatilho.getEventType() === ScriptApp.EventType.CLOCK,
  );

  if (!temEnvio) {
    ScriptApp.newTrigger('enviarPreCadastro')
      .forSpreadsheet(planilha)
      .onFormSubmit()
      .create();
  }
  if (!temImportacao) {
    ScriptApp.newTrigger('processarImportacoesPendentes')
      .timeBased()
      .everyMinutes(5)
      .create();
  }
}

/** Envia uma nova resposta assim que o Forms a grava na planilha. */
function enviarPreCadastro(e) {
  if (!e || !e.namedValues || !e.range) {
    throw new Error('Esta função deve ser executada pelo gatilho da planilha.');
  }

  const origem = identidadeLinha(
    e.source.getId(),
    e.range.getSheet().getSheetId(),
    e.range.getRow(),
    e.namedValues,
  );
  const payload = montarPayload(e.namedValues, origem);
  chamarApi('/pre-cadastro', payload);
}

/** Atende às importações solicitadas pelo botão da plataforma. */
function processarImportacoesPendentes() {
  const solicitacao = chamarApi(
    '/proxima-importacao?suporta_previa=true',
    {},
  );
  if (!solicitacao.id) return;

  const totais = {
    criados: 0,
    atualizados: 0,
    ja_cadastrados: 0,
    ja_processados: 0,
    erros: 0,
    mensagem: null,
  };
  const mensagens = [];

  try {
    const propriedades = PropertiesService.getScriptProperties();
    const planilhaId = propriedades.getProperty(PROPRIEDADE_PLANILHA);
    const abaId = Number(propriedades.getProperty(PROPRIEDADE_ABA));
    if (!planilhaId || !abaId) {
      throw new Error('Execute instalarGatilho novamente na aba de respostas.');
    }

    const planilha = SpreadsheetApp.openById(planilhaId);
    const aba = planilha.getSheets().find(
      (planilhaAba) => planilhaAba.getSheetId() === abaId,
    );
    if (!aba) throw new Error('A aba de respostas configurada não foi encontrada.');

    const matriz = aba.getDataRange().getDisplayValues();
    let itens = [];
    if (matriz.length > 1) {
      const cabecalhos = matriz[0];
      itens = matriz.slice(1)
        .map((linha, indice) => {
          const valores = valoresNomeados(cabecalhos, linha);
          const numeroLinha = indice + 2;
          const origem = identidadeLinha(
            planilhaId,
            abaId,
            numeroLinha,
            valores,
          );
          return { numeroLinha, payload: montarPayload(valores, origem) };
        })
        .filter((item) => item.payload.nome);

      if (solicitacao.tipo === 'PREVIA') {
        chamarApi(`/importacoes/${solicitacao.id}/previa`, {
          itens: itens.map((item) => item.payload),
        });
        return;
      }

      for (let inicio = 0; inicio < itens.length; inicio += 50) {
        const lote = itens.slice(inicio, inicio + 50);
        const respostas = UrlFetchApp.fetchAll(
          lote.map((item) => opcoesRequisicao('/pre-cadastro', item.payload)),
        );
        respostas.forEach((resposta, indice) => {
          const status = resposta.getResponseCode();
          if (status < 200 || status >= 300) {
            totais.erros += 1;
            mensagens.push(
              `Linha ${lote[indice].numeroLinha}: HTTP ${status}`,
            );
            return;
          }
          const resultado = JSON.parse(resposta.getContentText());
          const campo = {
            pre_cadastro_criado: 'criados',
            pre_cadastro_atualizado: 'atualizados',
            ja_cadastrado: 'ja_cadastrados',
            ja_processado: 'ja_processados',
          }[resultado.acao];
          if (campo) totais[campo] += 1;
        });
      }
    } else if (solicitacao.tipo === 'PREVIA') {
      chamarApi(`/importacoes/${solicitacao.id}/previa`, { itens: [] });
      return;
    }
  } catch (erro) {
    totais.erros += 1;
    mensagens.push(String(erro.message || erro));
  }

  totais.mensagem = mensagens.slice(0, 5).join('; ').slice(0, 255) || null;
  chamarApi(`/importacoes/${solicitacao.id}/concluir`, totais);
}

function valoresNomeados(cabecalhos, linha) {
  return cabecalhos.reduce((resultado, cabecalho, indice) => {
    resultado[cabecalho] = [linha[indice] || ''];
    return resultado;
  }, {});
}

function montarPayload(valores, origem) {
  const ausentes = cabecalhosAusentes(valores);
  if (ausentes.length) {
    throw new Error(
      `Cabeçalhos não encontrados na planilha: ${ausentes.join(', ')}. ` +
        'Confira os nomes das perguntas no Forms ou ajuste CABECALHOS no script.',
    );
  }
  const valor = (campo) => lerCampo(valores, campo);
  return {
    inscricao_id: sha256(origem),
    nome: valor('nome'),
    turma_interesse: valor('turma_interesse'),
    telefone: valor('telefone'),
    e_mail: valor('e_mail'),
    rg: valor('rg'),
    cpf: valor('cpf'),
    escolaridade: valor('escolaridade'),
    igreja: valor('igreja'),
    endereco_igreja: valor('endereco_igreja'),
    nome_pastor: valor('nome_pastor'),
    cur_teologicos: valor('cur_teologicos'),
    nome_conjuge: valor('nome_conjuge'),
  };
}

/**
 * Identidade estável da resposta: planilha, aba, carimbo, e-mail e CPF.
 * O número da linha ficou de fora de propósito — inserir ou excluir uma linha
 * mudava o `inscricao_id` de todas as linhas abaixo e a reimportação criava
 * pré-cadastros duplicados.
 */
function identidadeLinha(planilhaId, abaId, numeroLinha, valores) {
  return [
    planilhaId,
    abaId,
    lerCampo(valores, 'carimbo'),
    lerCampo(valores, 'e_mail'),
    lerCampo(valores, 'cpf'),
  ].join('|');
}

function segredoWebhook() {
  const segredo = PropertiesService.getScriptProperties().getProperty(
    PROPRIEDADE_SEGREDO,
  );
  if (!segredo) {
    throw new Error(
      `Configure a propriedade de script ${PROPRIEDADE_SEGREDO}.`,
    );
  }
  return segredo;
}

function opcoesRequisicao(caminho, payload) {
  return {
    url: `${apiBase()}${caminho}`,
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': segredoWebhook() },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
}

function chamarApi(caminho, payload) {
  const opcoes = opcoesRequisicao(caminho, payload);
  const url = opcoes.url;
  delete opcoes.url;
  const resposta = UrlFetchApp.fetch(url, opcoes);
  const status = resposta.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(
      `Centro TOV respondeu HTTP ${status}: ${resposta.getContentText()}`,
    );
  }
  return JSON.parse(resposta.getContentText());
}

function sha256(texto) {
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8,
  )
    .map((byte) => (`0${(byte & 0xff).toString(16)}`).slice(-2))
    .join('');
}
