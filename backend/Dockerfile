FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /app
RUN pip install --no-cache-dir tzdata && useradd --system --uid 10001 greenops
COPY *.py schema-v13.json factors.json challenge-policy.json ./
COPY templates ./templates
COPY frontend ./frontend
COPY demo-data ./demo-data
RUN python app.py build
USER 10001
EXPOSE 8765
ENTRYPOINT ["python", "app.py", "serve"]
CMD ["--host", "0.0.0.0", "--accounts", "/config/accounts.json", "--data", "/data", "--state", "/state/greenops.sqlite3"]
