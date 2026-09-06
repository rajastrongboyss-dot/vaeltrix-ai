# VaeltrixAI -- SATU container: FastAPI menyajikan frontend statis (index.html,
# css/, js/, assets/, fonts/) SEKALIGUS backend API (/api/v1/...) dari satu
# proses yang sama (section 35 master prompt: "jangan butuh developer jalanin
# frontend & backend terpisah cuma buat aplikasinya bisa dipakai").
FROM python:3.12-slim

WORKDIR /app

# Install dependency di layer terpisah dari copy source -- build cache Docker
# gak invalidasi ulang tiap kali cuma source code yang berubah, bukan
# requirements.txt.
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend existing (dipakai app/main.py: StaticFiles mount + FileResponse
# index.html/manifest.json/sw.js -- lihat FRONTEND_DIR di main.py).
COPY index.html manifest.json sw.js ./
COPY css ./css
COPY js ./js
COPY assets ./assets

# Backend.
COPY backend/app backend/app

WORKDIR /app/backend

# Jalan sebagai user non-root (section 25: hardening dasar).
RUN useradd --create-home --shell /bin/false vaeltrix \
    && chown -R vaeltrix:vaeltrix /app
USER vaeltrix

EXPOSE 8000

# Pakai urllib bawaan Python (BUKAN curl/wget) -- python:slim gak nginstall itu
# secara default, dan nambahnya cuma buat healthcheck gak sepadan sama
# tambahan ukuran image-nya.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request as u,sys; sys.exit(0 if u.urlopen('http://localhost:8000/api/v1/health', timeout=3).status == 200 else 1)"

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
