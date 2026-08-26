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
COPY control-api.ts ./control-api.ts
COPY driver/Sharp-BP-71C65-ps.ppd ./driver/Sharp-BP-71C65-ps.ppd
COPY cupsd.conf /etc/cups/cupsd.conf
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 631 8631
ENTRYPOINT ["./entrypoint.sh"]
