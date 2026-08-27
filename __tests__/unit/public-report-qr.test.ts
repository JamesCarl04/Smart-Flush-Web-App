import {
  buildPublicReportUrl,
  sanitizeQrLabelFilename,
} from '@/lib/public-report-qr';

describe('public report QR labels', () => {
  it('encodes an absolute configured report URL', () => {
    expect(buildPublicReportUrl('https://klir.example/base/', 'stall 1/a')).toBe(
      'https://klir.example/report/stall%201%2Fa',
    );
  });

  it('sanitizes printable PNG filenames', () => {
    expect(sanitizeQrLabelFilename('4F Men\'s / Restroom: Stall #1')).toBe(
      '4F-Mens-Restroom-Stall-1-issue-report-qr.png',
    );
  });
});
