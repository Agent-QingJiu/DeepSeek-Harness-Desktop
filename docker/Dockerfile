FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git python3 \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global @deepseek-ai/dsh@0.2.2-rc.5 \
    && useradd --create-home --uid 10001 --shell /usr/sbin/nologin agent \
    && mkdir -p /workspace \
    && chown agent:agent /workspace

ENV HOME=/home/agent
ENV DSH_TELEMETRY_MODE=DISABLED
WORKDIR /workspace
USER 10001:10001

EXPOSE 3080
CMD ["dsh", "web", "--host", "172.30.252.2", "--port", "3080", "--public-url", "https://ai.qi521.cn/", "--trusted-host", "ai.qi521.cn", "--no-open"]
