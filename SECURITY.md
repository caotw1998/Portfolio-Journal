# Security Policy

## Supported versions

Security fixes are provided for the latest tagged release only. Private deployments should upgrade only after creating and verifying a PostgreSQL backup.

## Reporting a vulnerability

Use GitHub's private vulnerability reporting flow under the repository **Security** tab. If that flow is unavailable, open an issue that requests a private contact channel, but do not include credentials, personal research data, database dumps, exploit details or private deployment URLs in the issue.

## Deployment boundary

Portfolio Journal is designed for one owner on a private Tailscale network. Do not expose the application port with router forwarding, a public reverse proxy or Tailscale Funnel. The PostgreSQL service must remain on the internal Docker network.

Never commit `.env`, database dumps, research snapshots, backup archives, access tokens or Tailscale credentials. Rotate credentials immediately if any secret is exposed.
