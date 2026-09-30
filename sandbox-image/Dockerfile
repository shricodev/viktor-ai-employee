FROM python:3.12-slim-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git jq unzip zip \
      fonts-dejavu fonts-liberation fontconfig \
      libreoffice-writer-nogui libreoffice-calc-nogui libreoffice-impress-nogui \
      poppler-utils pandoc \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*

RUN pip install \
      numpy pandas polars pyarrow \
      matplotlib seaborn plotly kaleido \
      openpyxl xlsxwriter python-docx python-pptx \
      reportlab weasyprint pypdf pdfplumber markdown \
      requests httpx beautifulsoup4 lxml \
      python-dateutil pytz tabulate jinja2

RUN useradd --create-home --uid 1000 --shell /bin/bash viktor \
 && mkdir -p /workspace \
 && chown viktor:viktor /workspace

USER viktor
WORKDIR /workspace

# Packages installed at runtime land in the persistent volume.
ENV HOME=/workspace \
    PYTHONUSERBASE=/workspace/.local \
    PIP_USER=1 \
    NPM_CONFIG_PREFIX=/workspace/.npm-global \
    PATH=/workspace/.local/bin:/workspace/.npm-global/bin:$PATH \
    MPLBACKEND=Agg

CMD ["sleep", "infinity"]
