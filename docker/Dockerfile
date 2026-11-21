FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates python3 && rm -rf /var/lib/apt/lists/*
RUN npm install -g @deepseek-ai/dsh@0.2.2-rc.5
RUN useradd -m -u 10001 agent && mkdir -p /data /workspace && chown -R agent:agent /data /workspace
USER agent
ENV HOME=/home/agent
WORKDIR /workspace
EXPOSE 3080
CMD ["dsh","web","--host","0.0.0.0","--port","3080"]
