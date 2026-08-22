FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
# Scripts de manutenção rodam com `docker compose run --rm backend python ...`;
# fora da imagem eles não existiriam no servidor.
COPY criar_usuario.py importar_planilha_financeiro.py ./
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
