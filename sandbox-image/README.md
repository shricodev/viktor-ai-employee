# Sandbox image

Each Slack workspace gets one long-lived container built from this image. It is Viktor's
"own computer": the agent runs Python, Node and shell commands here to analyse data and
produce files (PDF, XLSX, DOCX, PPTX, charts), which are then uploaded back to Slack.

```sh
docker build -t viktor-sandbox:latest sandbox-image
```

The container runs as an unprivileged user with a read-only root filesystem, no Linux
capabilities and CPU/memory/PID limits. `/workspace` is a per-workspace Docker volume, so
files and packages installed with `pip install` persist between conversations. No secrets
are ever passed into the container.
