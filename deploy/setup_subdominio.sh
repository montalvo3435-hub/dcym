#!/bin/bash
# Publica DCYM en un subdominio con su propio vhost y su propio certificado.
# No toca conectamunicipio: solo crea archivos dcym-* y recarga Apache (graceful).
# Uso: bash setup_subdominio.sh dcym.midominio.com
set -euo pipefail
DOMAIN="${1:?Uso: $0 subdominio.dominio.com}"
ACME=/var/www/dcym-acme
SITE=/etc/apache2/sites-available/dcym-app.conf
mkdir -p "$ACME"

IP_PUBLICA=$(curl -s -4 https://ifconfig.me || true)
IP_DNS=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
echo "DNS $DOMAIN -> ${IP_DNS:-sin registro} (esta VPS: $IP_PUBLICA)"
[ "$IP_DNS" = "$IP_PUBLICA" ] || { echo "El DNS aún no apunta a esta VPS. Revisa el registro A en Cloudflare (nube gris)."; exit 1; }

# 1) Solo HTTP, para que Let's Encrypt valide el dominio
cat > "$SITE" <<CONF
# DCYM S.A.S — centro de control de drones. Proyecto independiente.
<VirtualHost *:80>
    ServerName $DOMAIN
    Alias /.well-known/acme-challenge/ $ACME/.well-known/acme-challenge/
    <Directory $ACME>
        Require all granted
    </Directory>
    RewriteEngine On
    RewriteCond %{REQUEST_URI} !^/\.well-known/acme-challenge/
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
    ErrorLog \${APACHE_LOG_DIR}/dcym-app-error.log
    CustomLog \${APACHE_LOG_DIR}/dcym-app-access.log combined
</VirtualHost>
CONF
a2ensite -q dcym-app
apache2ctl configtest && systemctl reload apache2

# 2) Certificado propio del subdominio
certbot certonly --webroot -w "$ACME" -d "$DOMAIN" --non-interactive --agree-tos \
  --register-unsafely-without-email --keep-until-expiring \
  --deploy-hook "systemctl reload apache2"

# 3) HTTPS + proxy a la app (WebSockets incluidos)
cat >> "$SITE" <<CONF

<VirtualHost *:443>
    ServerName $DOMAIN
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/$DOMAIN/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/$DOMAIN/privkey.pem
    Include /etc/letsencrypt/options-ssl-apache.conf

    ProxyPreserveHost On
    ProxyTimeout 120
    RequestHeader set X-Forwarded-Proto "https"
    ProxyPass        /ws/ http://127.0.0.1:8100/ws/ upgrade=websocket
    ProxyPass        /    http://127.0.0.1:8100/
    ProxyPassReverse /    http://127.0.0.1:8100/

    Header always set Strict-Transport-Security "max-age=31536000"
    Header always set X-Content-Type-Options "nosniff"
    Header always set Referrer-Policy "same-origin"
    Header always set Permissions-Policy "camera=(self), microphone=()"

    ErrorLog \${APACHE_LOG_DIR}/dcym-app-error.log
    CustomLog \${APACHE_LOG_DIR}/dcym-app-access.log combined
</VirtualHost>
CONF
[ -f /etc/letsencrypt/options-ssl-apache.conf ] || sed -i '/options-ssl-apache.conf/d' "$SITE"
apache2ctl configtest && systemctl reload apache2
echo "Listo: https://$DOMAIN"
