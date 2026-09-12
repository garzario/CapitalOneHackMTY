#!/bin/bash
# What the Vultr instance runs on first boot, as root, through cloud-init.
#
# This file is the BODY. scripts/deploy-vultr.ts prepends a generated header
# that exports SENTRYONE_BRANCH, SENTRYONE_REPO and SENTRYONE_SSH_KEY and writes
# /srv/sentryone/.env, then sends header plus body as the instance user data.
# Splitting it that way keeps the part with the secrets in it generated and
# short, and keeps the part a human has to read plain, reviewable bash.
#
# It is idempotent on purpose: rerunning it over SSH is the repair path when the
# first boot half-finished.
set -euo pipefail

LOG=/var/log/sentryone-cloud-init.log
exec >>"$LOG" 2>&1
echo "=== sentryone cloud-init start $(date -Is) ==="

ENV_FILE=/srv/sentryone/.env
REPO_DIR=/srv/sentryone/repo

# 1. A key we hold, so a boot that half-finishes can be diagnosed instead of
#    guessed at. Optional: with no key the instance is still reachable through
#    the Vultr console.
if [ -n "${SENTRYONE_SSH_KEY:-}" ]; then
	install -d -m 700 /root/.ssh
	touch /root/.ssh/authorized_keys
	grep -qxF "$SENTRYONE_SSH_KEY" /root/.ssh/authorized_keys || echo "$SENTRYONE_SSH_KEY" >>/root/.ssh/authorized_keys
	chmod 600 /root/.ssh/authorized_keys
fi

# 2. Docker from the Ubuntu archive rather than a piped install script: pinned
#    by the distribution, signed by apt, and no curl into bash on a box that is
#    about to hold production keys.
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
	ca-certificates curl git docker.io docker-compose-v2
systemctl enable --now docker

# 3. The instance learns its own public address, and that becomes the name the
#    certificate is issued for. The metadata service is authoritative; the
#    hostname fallback covers a metadata service that is slow on first boot.
IP="$(curl -fsS --max-time 5 http://169.254.169.254/v1/interfaces/0/ipv4/address || true)"
if [ -z "$IP" ]; then
	IP="$(hostname -I | awk '{print $1}')"
fi
echo "public ip: $IP"

# Appended rather than written: the header already wrote the secrets into this
# file and they are not repeated here.
sed -i '/^SENTRYONE_API_HOST=/d;/^PUBLIC_API_URL=/d' "$ENV_FILE"
{
	echo "SENTRYONE_API_HOST=api.${IP}.sslip.io"
	echo "PUBLIC_API_URL=https://api.${IP}.sslip.io"
} >>"$ENV_FILE"
chmod 600 "$ENV_FILE"

# 4. The public repo, shallow. Nothing here writes to it, so a detached checkout
#    at the tip of the branch is the whole story.
rm -rf "$REPO_DIR"
git clone --depth 1 --branch "${SENTRYONE_BRANCH:-main}" "${SENTRYONE_REPO:-https://github.com/garzario/CapitalOneHackMTY.git}" "$REPO_DIR"

# 5. The repair and update path, so moving the box to another branch after a
#    merge is one command over SSH and not a second provision:
#
#      ssh root@<ip> /srv/sentryone/refresh.sh dev
#
cat >/srv/sentryone/refresh.sh <<'REFRESH'
#!/bin/bash
# Repoint this instance at a branch and rebuild. Keeps /srv/sentryone/.env,
# keeps the Caddy certificate volume, keeps the IP.
set -euo pipefail
BRANCH="${1:-main}"
cd /srv/sentryone/repo
git remote set-branches origin "$BRANCH"
git fetch --depth 1 origin "$BRANCH"
git checkout -B "$BRANCH" "origin/$BRANCH"
cd /srv/sentryone/repo/deploy
docker compose --env-file /srv/sentryone/.env up -d --build
docker image prune -f
echo "refreshed onto $BRANCH"
REFRESH
chmod +x /srv/sentryone/refresh.sh

# 6. Up. --build because the image is built from the clone on the box: there is
#    no registry in this setup and nothing to push to one.
cd "$REPO_DIR/deploy"
docker compose --env-file "$ENV_FILE" up -d --build

docker compose --env-file "$ENV_FILE" ps
echo "=== sentryone cloud-init done $(date -Is) ==="
