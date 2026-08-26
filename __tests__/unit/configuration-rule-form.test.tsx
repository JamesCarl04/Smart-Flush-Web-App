/** @jest-environment jsdom */

import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ConfigurationPage from '@/app/(dashboard)/configuration/page';
import { apiFetch } from '@/lib/api-client';

let mockUser: { uid: string } | null = null;

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: mockUser }),
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
  beforeEach(() => {
    mockUser = null;
    jest.clearAllMocks();
  });

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

    expect(screen.getByLabelText('Repeat interval')).toHaveValue('10');
    expect(screen.getByRole('option', { name: '1 minute', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: '10 minutes', hidden: true })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Custom', hidden: true })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Repeat interval'), {
      target: { value: 'custom' },
    });
    expect(screen.getByLabelText('Custom repeat interval (minutes)')).toHaveAttribute('min', '1');
    expect(screen.getByLabelText('Custom repeat interval (minutes)')).toHaveAttribute('max', '1440');
  });

  it.each([
    [1, '1'],
    [10, '10'],
    [25, 'custom'],
  ])('loads an existing %d-minute rule into the %s interval preset', async (repeatIntervalMinutes, expectedPreset) => {
    mockUser = { uid: 'admin-1' };
    (apiFetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/devices/')) return Promise.resolve({ success: true, data: {} });
      return Promise.resolve({
        success: true,
        data: [{
          id: 'rule-1',
          group: 'system_alert',
          name: 'Existing alert rule',
          trigger: 'ultrasonic_sensor_fault',
          threshold: 10,
          action: 'Send Warning Email',
          enabled: true,
          repeatIntervalMinutes,
        }],
      });
    });

    render(<ConfigurationPage />);

    await screen.findByText('Existing alert rule');
    fireEvent.click(screen.getByTitle('Edit Rule'));

    expect(screen.getByLabelText('Repeat interval')).toHaveValue(expectedPreset);
    if (expectedPreset === 'custom') {
      expect(screen.getByLabelText('Custom repeat interval (minutes)')).toHaveValue(25);
      fireEvent.click(screen.getByRole('button', { name: 'Update Rule', hidden: true }));
      await waitFor(() =>
        expect(apiFetch).toHaveBeenCalledWith(
          '/api/automation-rules/rule-1',
          mockUser,
          expect.objectContaining({
            method: 'PUT',
            body: expect.stringContaining('"repeatIntervalMinutes":25'),
          }),
        ),
      );
      const updateOptions = (apiFetch as jest.Mock).mock.calls.find(
        ([url]) => url === '/api/automation-rules/rule-1',
      )?.[2] as { body: string };
      expect(JSON.parse(updateOptions.body)).not.toHaveProperty('enabled');
    }
  });
});
