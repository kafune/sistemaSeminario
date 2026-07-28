import unittest
from types import SimpleNamespace

from app.routers.whatsapp import (
    RODAPE_OPTOUT,
    _aplicar_contadores_pasta,
    _aplicar_optout,
    _eh_optout,
    _mensagem_uazapi,
    _mensagens_uazapi,
    _template_permitido,
    normalizar_celular,
    personalizar_mensagem,
)
from app.services.uazapi import (
    criptografar_token,
    descriptografar_token,
    sanitizar_resposta,
)


class NormalizacaoCelularTest(unittest.TestCase):
    def test_adiciona_ddi_em_celular_com_ddd(self):
        self.assertEqual(normalizar_celular("(11) 99999-8888"), ("5511999998888", None))

    def test_preserva_numero_com_ddi(self):
        self.assertEqual(normalizar_celular("+55 11 99999-8888"), ("5511999998888", None))

    def test_rejeita_vazio_e_numero_curto(self):
        self.assertEqual(normalizar_celular(""), (None, "Celular não informado"))
        numero, motivo = normalizar_celular("9999-8888")
        self.assertIsNone(numero)
        self.assertIn("formato", motivo)

    def test_rejeita_outro_pais(self):
        numero, motivo = normalizar_celular("+1 212 555 0100")
        self.assertIsNone(numero)
        self.assertIn("+55", motivo)


class PersonalizacaoTest(unittest.TestCase):
    def test_substitui_nome_completo_e_primeiro_nome(self):
        texto = personalizar_mensagem(
            "Olá {{primeiro_nome}}. Cadastro: {{nome}}.", "Maria da Silva"
        )
        self.assertEqual(texto, "Olá Maria. Cadastro: Maria da Silva.")

    def test_nome_ausente_nao_quebra(self):
        self.assertEqual(personalizar_mensagem("Olá {{nome}}", None), "Olá ")

    def test_monta_botao_personalizado_para_campanha(self):
        mensagem = _mensagem_uazapi(
            {
                "tipo": "button",
                "mensagem": "Olá {{primeiro_nome}}",
                "botoes": [
                    {"texto": "Abrir site", "tipo": "URL", "valor": "https://example.com"},
                    {"texto": "Confirmar", "tipo": "REPLY", "valor": "confirmar"},
                ],
            },
            "5511999998888",
            "Maria da Silva",
        )
        self.assertEqual(mensagem["text"], "Olá Maria")
        self.assertEqual(
            mensagem["choices"],
            ["Abrir site|https://example.com", "Confirmar|reply:confirmar"],
        )

    def test_monta_carrossel_com_imagem_e_botao(self):
        mensagem = _mensagem_uazapi(
            {
                "tipo": "carousel",
                "mensagem": "Novidades",
                "carousel": [
                    {
                        "texto": "Olá {{primeiro_nome}}",
                        "arquivo": {"url": "https://example.com/imagem.jpg"},
                        "botoes": [{"texto": "Ver", "tipo": "URL", "valor": "https://example.com"}],
                    }
                ],
            },
            "5511999998888",
            "Maria da Silva",
        )
        self.assertEqual(
            mensagem["choices"],
            ["[Olá Maria]", "{https://example.com/imagem.jpg}", "Ver|https://example.com"],
        )

    def test_monta_sequencia_na_ordem_e_personaliza_cada_etapa(self):
        mensagens = _mensagens_uazapi(
            {
                "tipo": "text",
                "mensagem": "Olá {{primeiro_nome}}",
                "sequencia": [
                    {"tipo": "text", "mensagem": "Segundo passo, {{nome}}"},
                    {
                        "tipo": "poll",
                        "mensagem": "Você confirma?",
                        "enquete_opcoes": ["Sim", "Não"],
                        "enquete_selecionaveis": 1,
                    },
                ],
            },
            "5511999998888",
            "Maria da Silva",
        )
        self.assertEqual(len(mensagens), 3)
        self.assertEqual(mensagens[0]["text"], "Olá Maria")
        self.assertEqual(mensagens[1]["text"], "Segundo passo, Maria da Silva")
        self.assertEqual(mensagens[2]["choices"], ["Sim", "Não"])

    def test_optout_e_incluido_uma_unica_vez_no_fim_da_sequencia(self):
        conteudo = {
            "tipo": "text",
            "mensagem": "Primeira",
            "sequencia": [{"tipo": "text", "mensagem": "Última"}],
        }
        ajustado = _aplicar_optout(conteudo)
        self.assertNotIn(RODAPE_OPTOUT, ajustado["mensagem"])
        self.assertEqual(
            ajustado["sequencia"][0]["mensagem"].count(RODAPE_OPTOUT),
            1,
        )
        self.assertEqual(
            _aplicar_optout(ajustado)["sequencia"][0]["mensagem"].count(
                RODAPE_OPTOUT
            ),
            1,
        )

    def test_reconhece_optout_sem_acentos_e_nao_confunde_frase(self):
        self.assertTrue(_eh_optout("SAIR"))
        self.assertTrue(_eh_optout("não quero"))
        self.assertFalse(_eh_optout("Quero sair da turma atual e entrar em outra"))


class SanitizacaoTest(unittest.TestCase):
    def test_criptografia_do_token(self):
        cifrado = criptografar_token("token-secreto")
        self.assertNotIn("token-secreto", cifrado)
        self.assertEqual(descriptografar_token(cifrado), "token-secreto")

    def test_remove_tokens_aninhados(self):
        resposta = {
            "token": "segredo",
            "instance": {"id": "1", "token": "outro"},
            "items": [{"admintoken": "admin", "status": "ok"}],
        }
        self.assertEqual(
            sanitizar_resposta(resposta),
            {"instance": {"id": "1"}, "items": [{"status": "ok"}]},
        )


class SegregacaoTemplateTest(unittest.TestCase):
    def test_marketing_e_secretaria_enxergam_apenas_seus_templates(self):
        self.assertTrue(_template_permitido("ADMIN", "MARKETING", "COMERCIAL"))
        self.assertTrue(_template_permitido("MARKETING", "MARKETING", "NUTRICAO"))
        self.assertFalse(_template_permitido("MARKETING", "UTILIDADE", "OPERACIONAL"))
        self.assertTrue(_template_permitido("SECRETARIA", "UTILIDADE", "OPERACIONAL"))
        self.assertFalse(_template_permitido("SECRETARIA", "MARKETING", "COMERCIAL"))


class SincronizacaoCampanhaTest(unittest.TestCase):
    def test_aplica_metricas_de_entrega_leitura_e_reproducao(self):
        disparo = SimpleNamespace(
            total_mensagens=10,
            total_validos=10,
            total_enviados=0,
            total_falhos=0,
            total_entregues=0,
            total_lidos=0,
            total_reproduzidos=0,
            total_agendados=10,
            agendado_para=None,
            status="NA_FILA",
            atualizado_em=None,
        )
        _aplicar_contadores_pasta(disparo, {
            "log_total": 10,
            "log_sucess": 8,
            "log_failed": 2,
            "log_delivered": 7,
            "log_read": 6,
            "log_played": 3,
            "status": "done",
        })
        self.assertEqual(disparo.status, "CONCLUIDO_COM_FALHAS")
        self.assertEqual(
            (disparo.total_entregues, disparo.total_lidos, disparo.total_reproduzidos),
            (7, 6, 3),
        )


if __name__ == "__main__":
    unittest.main()
