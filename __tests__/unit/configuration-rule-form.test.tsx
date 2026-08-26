/** @jest-environment jsdom */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import ConfigurationPage from '@/app/(dashboard)/configuration/page';

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: null }),
}));

jest.mock('@/hooks/useSensorData', () => ({
  useSensorData: () => ({ ultrasonicDistance: undefined }),
}));

jest.mock('@/hooks/useDeviceStatus', () => ({
  useDeviceStatus: () => ({
    status: 'offline',
    connected: false,
    reason: null,
    lastSeen: null,
    loading: false,
  }),
}));

jest.mock('@/lib/api-client', () => ({ apiFetch: jest.fn() }));

jest.mock('firebase/auth', () => ({
  EmailAuthProvider: { credential: jest.fn() },
  reauthenticateWithCredential: jest.fn(),
}));

describe('configuration automation-rule form', () => {
  it('shows only canonical creation triggers and adds the no-water wait setting contextually', () => {
    render(<ConfigurationPage />);

    const trigger = screen.getByLabelText('Trigger Condition');
    expect(
      within(trigger).queryByRole('option', {
        name: 'Flush Count Exceeded',
        hidden: true,
      }),
    ).toBeNull();
    expect(
      within(trigger).getByRole('option', {
        name: 'Ultrasonic Sensor Fault',
        hidden: true,
      }),
    ).toBeInTheDocument();
    expect(
      within(trigger).getByRole('option', {
        name: 'Routine Toilet Check',
        hidden: true,
      }),
    ).toBeInTheDocument();

    fireEvent.change(trigger, { target: { value: 'no_water_after_flush' } });

    expect(screen.getByLabelText('Consecutive dry cycles')).toHaveAttribute('min', '1');
    expect(screen.getByText(/Allowed range: 1–20 cycles/)).toBeInTheDocument();
    expect(screen.getByLabelText('Water wait time')).toHaveAttribute('value', '8');
    expect(
      screen.getByText(/Wait this long after each flush before checking for water flow/),
    ).toBeInTheDocument();
  });
});
