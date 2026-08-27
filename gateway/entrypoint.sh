#!/bin/bash
# Starts cupsd and the control API side by side in this one container.
# If either dies, the container exits (via `wait -n`) so compose/Docker
# restarts it rather than limping along with only half the gateway
# working. Needs bash (not /bin/sh/dash) for `wait -n`.
set -e

# /etc/cups is a persistent volume so provisioned queues survive redeploys.
# On first boot it's empty -- seed it from the image snapshot (package
# config files + our cupsd.conf) WITHOUT clobbering anything already
# persisted (-n). Then always force-refresh cupsd.conf so image config
# changes take effect on every deploy.
mkdir -p /etc/cups
cp -an /opt/gateway/cups-default/. /etc/cups/ 2>/dev/null || true
cp -f /opt/gateway/cups-default/cupsd.conf /etc/cups/cupsd.conf

mkdir -p /run/cups /var/log/cups /var/spool/cups /etc/cups/ppd

echo "[gateway] starting cupsd..."
/usr/sbin/cupsd -c /etc/cups/cupsd.conf -f &
CUPSD_PID=$!

echo "[gateway] starting control API..."
node --experimental-strip-types /opt/gateway/control-api.ts &
API_PID=$!

wait -n "$CUPSD_PID" "$API_PID"
