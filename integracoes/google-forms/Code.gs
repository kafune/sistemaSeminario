const WEBHOOK_URL =
  'https://centro-tov.kafune.xyz/api/integracoes/google-forms/pre-cadastro';
const PROPRIEDADE_SEGREDO = 'TOV_WEBHOOK_SECRET';

/**
 * Instala o gatilho na planilha vinculada ao Google Forms.
 * Execute esta função uma única vez pelo editor do Apps Script.
 */
function instalarGatilho() {
  const planilha = SpreadsheetApp.getActive();
  const jaInstalado = ScriptApp.getProjectTriggers().some(
    (gatilho) =>
      gatilho.getHandlerFunction() === 'enviarPreCadastro' &&
      gatilho.getEventType() === ScriptApp.EventType.ON_FORM_SUBMIT,
  );

  if (!jaInstalado) {
    ScriptApp.newTrigger('enviarPreCadastro')
      .forSpreadsheet(planilha)
      .onFormSubmit()
      .create();
  }
}

/**
 * Recebe o evento de envio do Forms e encaminha os campos ao Centro TOV.
 */
function enviarPreCadastro(e) {
  if (!e || !e.namedValues || !e.range) {
    throw new Error('Esta função deve ser executada pelo gatilho da planilha.');
  }

  const valor = (cabecalho) => {
    const resposta = e.namedValues[cabecalho];
    return resposta && resposta.length ? String(resposta[0]).trim() : '';
  };

  const origem = [
    e.source.getId(),
    e.range.getSheet().getSheetId(),
    e.range.getRow(),
    valor('Carimbo de data/hora'),
    valor('E-mail'),
    valor('CPF'),
  ].join('|');

  const payload = {
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

  const segredo = PropertiesService.getScriptProperties().getProperty(
    PROPRIEDADE_SEGREDO,
  );
  if (!segredo) {
    throw new Error(
      `Configure a propriedade de script ${PROPRIEDADE_SEGREDO}.`,
    );
  }

  const resposta = UrlFetchApp.fetch(WEBHOOK_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Webhook-Secret': segredo },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const status = resposta.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error(
      `Centro TOV respondeu HTTP ${status}: ${resposta.getContentText()}`,
    );
  }

  console.log(resposta.getContentText());
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
