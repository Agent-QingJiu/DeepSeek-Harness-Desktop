# DeepSeek Harness Docker deployment

The docker-deploy branch builds the image in GitHub Actions and publishes it to GHCR. The production server only pulls and runs that image; never build the image on the production server.

## Runtime design

The container runs the official @deepseek-ai/dsh package as UID 10001. It listens only on the dedicated Docker bridge address 172.30.252.2:3080. Compose publishes that listener as 127.0.0.1:3080, so it is not directly reachable from the Internet. The Nginx virtual host terminates HTTPS and proxies requests to the loopback port.

The web UI uses DeepSeek Harness's startup-token exchange and signed browser session cookie. The tokenized startup URL is a login credential. Keep container logs private; do not paste or publish the token URL. Nginx access logging must be disabled for this host because the first token exchange is carried in the query string. The Nginx proxy must set the session cookie Secure over HTTPS and preserve the original Host and WebSocket upgrade headers.

## Persistent data

Compose mounts ./data at /home/agent and ./workspace at /workspace. Create both directories and assign ownership to UID 10001 before starting the service. These directories hold Harness configuration, credentials, profiles, sessions, and workspace files. Back them up before changing or replacing the image.

## Deploy or update

From /opt/deepseek-harness:

1. Place this compose.yaml in the directory.
2. Create the persistent directories and set ownership to UID 10001.
3. Run docker compose pull.
4. Run docker compose up -d --no-build.
5. Check docker compose ps and docker logs DeepSeek-Harness.

The GitHub Actions workflow publishes the mutable docker tag and an immutable sha-<commit> tag. Use the immutable tag to roll back to a known image. No Docker socket or host filesystem is mounted in the container.

## Agent model setup

The Web UI loads without an API key. To run model-backed tasks, configure a provider and API key in Harness Settings → Models. Never place a provider key in this public repository or the image build.
