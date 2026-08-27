FROM node:22-bookworm-slim

# cups            -- cupsd itself + lpadmin/lpoptions/lpstat CLI tools
# cups-client     -- lpadmin/lpoptions/lpstat (split out on some Debian
#                     versions; harmless if already pulled in by `cups`)
# cups-filters    -- pstops and friends, the standard filter chain that
#                     handles this queue's PostScript document -- no
#                     vendor-specific binary needed (see gateway/README.md)
# ghostscript, poppler-utils -- PDF/PS conversion filters cups-filters
#                     calls into for documents that arrive as PDF
RUN apt-get update && apt-get install -y --no-install-recommends \
	cups \
	cups-client \
	cups-filters \
	ghostscript \
	poppler-utils \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /opt/gateway

# /etc/cups holds the provisioned queues (printers.conf + ppd/*.ppd). To
# survive redeploys it's a persistent volume (see compose.yaml), but a
# fresh volume/bind-mount starts empty -- which would also lose the
# package's own config files (cups-files.conf, etc.) and refuse to start.
# So snapshot the package default here; the entrypoint seeds an empty
# /etc/cups from it on first boot without clobbering persisted queues.
RUN cp -a /etc/cups /opt/gateway/cups-default

COPY control-api.ts ./control-api.ts
COPY driver/Sharp-BP-71C65-ps.ppd ./driver/Sharp-BP-71C65-ps.ppd
# Our cupsd.conf lives in the seed (not directly in /etc/cups, which the
# volume shadows) and the entrypoint force-refreshes it every boot so
# config changes in the image always take effect.
COPY cupsd.conf /opt/gateway/cups-default/cupsd.conf
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 631 8631
ENTRYPOINT ["./entrypoint.sh"]
