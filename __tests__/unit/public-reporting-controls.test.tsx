/** @jest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';

jest.mock('qrcode', () => ({ toDataURL: jest.fn().mockResolvedValue('data:image/png;base64,qr') }));

import { PublicReportingControls } from '@/components/configuration/PublicReportingControls';

const user = { uid: 'admin-1' } as never;
const device = { id: 'stall-1', name: 'Men\'s Stall 1', location: '4F Restroom', publicReportingEnabled: true };

describe('administrator public reporting controls', () => {
  it('renders no QR or mutation controls for supervisors', () => {
    const { container } = render(<PublicReportingControls user={user} role="supervisor" device={device} siteUrl="https://klir.example" onUpdated={jest.fn()} />);
    expect(container.childElementCount).toBe(0);
  });

  it('shows the absolute payload, restroom label, flag, and download for admins', async () => {
    render(<PublicReportingControls user={user} role="admin" device={device} siteUrl="https://klir.example" onUpdated={jest.fn()} />);
    expect(screen.getByText('Public issue reporting')).toBeTruthy();
    expect(screen.getByText("Men's Stall 1")).toBeTruthy();
    expect(screen.getByText('4F Restroom')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: /download printable png/i })).toBeTruthy();
    await waitFor(() => expect(screen.getByAltText(/public issue report qr/i)).toBeTruthy());
    expect(screen.getByText('https://klir.example/report/stall-1')).toBeTruthy();
  });
});
