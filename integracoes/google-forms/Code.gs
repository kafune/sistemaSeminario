const API_BASE = 'https://centro-tov.kafune.xyz/api/integracoes/google-forms';
const PROPRIEDADE_SEGREDO = 'TOV_WEBHOOK_SECRET';
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
      .everyMinutes(1)
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
  const solicitacao = chamarApi('/proxima-importacao', {});
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
    if (matriz.length > 1) {
      const cabecalhos = matriz[0];
      const itens = matriz.slice(1)
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
  const valor = (cabecalho) => {
    const resposta = valores[cabecalho];
    return resposta && resposta.length ? String(resposta[0]).trim() : '';
  };

  return {
    inscricao_id: sha256(origem),
    nome: valor('Nome'),
    turma_interesse: valor('Qual a turma de interesse?'),
    telefone: valor('Telefone:'),
    e_mail: valor('E-mail'),
    rg: valor('RG'),
    cpf: valor('CPF'),
    escolaridade: valor('Escolaridade'),
    igreja: valor('Igreja da qual é membro?'),
    endereco_igreja: valor(
      'Endereço Completo da igreja - Incluindo Bairro e Cidade',
    ),
    nome_pastor: valor('Nome do Pastor'),
    cur_teologicos: valor(
      'Você já fez algum curso anterior de Teologia? Se sim, onde?',
    ),
    nome_conjuge: valor(
      'Seu cônjuge participará junto? (50% de desconto na mensalidade do cônjuge). Se sim, deixe aqui o nome dele(a).',
    ),
  };
}

function identidadeLinha(planilhaId, abaId, numeroLinha, valores) {
  const valor = (cabecalho) => {
    const resposta = valores[cabecalho];
    return resposta && resposta.length ? String(resposta[0]).trim() : '';
  };
  return [
    planilhaId,
    abaId,
    numeroLinha,
    valor('Carimbo de data/hora'),
    valor('E-mail'),
    valor('CPF'),
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
    url: `${API_BASE}${caminho}`,
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
