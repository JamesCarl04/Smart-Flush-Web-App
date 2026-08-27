export function buildPublicReportUrl(siteUrl: string, deviceId: string): string {
  const origin = new URL(siteUrl).origin;
  return new URL(`/report/${encodeURIComponent(deviceId)}`, origin).toString();
}

export function sanitizeQrLabelFilename(name: string): string {
  const stem = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'device';
  return `${stem}-issue-report-qr.png`;
}
