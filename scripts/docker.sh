#!/bin/sh
# Use Docker from PATH, or Docker Desktop's CLI when the daemon is installed but PATH is not set yet.
set -e
if command -v docker >/dev/null 2>&1; then
  exec docker "$@"
fi
MAC_DOCKER="/Applications/Docker.app/Contents/Resources/bin/docker"
if [ -x "$MAC_DOCKER" ]; then
  exec "$MAC_DOCKER" "$@"
fi
echo "docker: not found. Install Docker Desktop (https://www.docker.com/products/docker-desktop/)"
echo "  or add Docker's CLI to your PATH, then run this command again."
exit 127
