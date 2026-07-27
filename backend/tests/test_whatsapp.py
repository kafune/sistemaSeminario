import unittest

from app.routers.whatsapp import normalizar_celular, personalizar_mensagem
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


if __name__ == "__main__":
    unittest.main()
