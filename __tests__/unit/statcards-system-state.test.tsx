/** @jest-environment jsdom */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

// Mocks for StatCards
const mockUseSensorData = jest.fn();
const mockUseDeviceStatus = jest.fn();
const mockUseSystemState = jest.fn();

jest.mock('@/hooks/useSensorData', () => ({
  useSensorData: () => mockUseSensorData(),
}));

jest.mock('@/hooks/useDeviceStatus', () => ({
  useDeviceStatus: () => mockUseDeviceStatus(),
}));

jest.mock('@/hooks/useSystemState', () => ({
  useSystemState: () => mockUseSystemState(),
}));

// Mocks for useSystemState tests
const mockUseAuth = jest.fn();
const mockUsePresentationMode = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@/hooks/usePresentationMode', () => ({
  usePresentationMode: () => mockUsePresentationMode(),
}));

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import { StatCards } from '@/components/dashboard/StatCards';

const { useSystemState: actualUseSystemState } = jest.requireActual<
  typeof import('@/hooks/useSystemState')
>('@/hooks/useSystemState');

describe('StatCards Reactive Operating State', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: connected, idle
    mockUseDeviceStatus.mockReturnValue({
      connected: true,
      lastSeen: Date.now() - 1000,
      reason: null,
      loading: false,
    });
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: 80,
      waterFlowRate: 0,
      loading: false,
    });
    mockUseSystemState.mockReturnValue({
      systemState: 'standby',
      loading: false,
    });
  });

  it('renders Offline with "No Signal" badge and "--%" meter when device is disconnected', () => {
    mockUseDeviceStatus.mockReturnValue({
      connected: false,
      lastSeen: Date.now() - 60000,
      reason: 'Heartbeat timeout',
      loading: false,
    });

    render(<StatCards />);

    // Both Card 3 (Device Connection) and Card 4 (Current Mode) display Offline & No Signal
    const offlineElements = screen.getAllByText('Offline');
    expect(offlineElements.length).toBe(2);
    const noSignalElements = screen.getAllByText('No Signal');
    expect(noSignalElements.length).toBe(2);
    expect(screen.getByText('Device disconnected')).toBeTruthy();
    expect(screen.getByText('--%')).toBeTruthy();
  });

  it('reactively switches to "Lid Open" (User Present, 50%) when occupant is detected (<= 30 cm)', () => {
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: 22,
      waterFlowRate: 0,
      loading: false,
    });

    render(<StatCards />);

    expect(screen.getByText('Lid Open')).toBeTruthy();
    expect(screen.getByText('User Present')).toBeTruthy();
    expect(screen.getByText('In use')).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
  });

  it('reactively switches to "Flushing" (Cleaning, 80%) when water flow is active (> 0.05 L/min)', () => {
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: 80,
      waterFlowRate: 1.45,
      loading: false,
    });

    render(<StatCards />);

    expect(screen.getByText('Flushing')).toBeTruthy();
    expect(screen.getByText('Cleaning')).toBeTruthy();
    expect(screen.getByText('Flushing in progress')).toBeTruthy();
    expect(screen.getByText('80%')).toBeTruthy();
  });

  it('prioritizes water flow (Flushing) over occupant presence', () => {
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: 15,
      waterFlowRate: 1.8,
      loading: false,
    });

    render(<StatCards />);

    expect(screen.getByText('Flushing')).toBeTruthy();
    expect(screen.getByText('Cleaning')).toBeTruthy();
    expect(screen.queryByText('Lid Open')).toBeNull();
  });

  it('displays "UV Sanitizing" (Disinfecting, 100%) when systemState is uv_active without active water flow', () => {
    mockUseSystemState.mockReturnValue({
      systemState: 'uv_active',
      loading: false,
    });
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: 80,
      waterFlowRate: 0,
      loading: false,
    });

    render(<StatCards />);

    expect(screen.getByText('UV Sanitizing')).toBeTruthy();
    expect(screen.getByText('Disinfecting')).toBeTruthy();
    expect(screen.getByText('Cleaning in progress')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('renders "Standby" (Ready, 20%) during nominal idle conditions', () => {
    render(<StatCards />);

    expect(screen.getByText('Standby')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Waiting for user')).toBeTruthy();
    expect(screen.getByText('20%')).toBeTruthy();
  });

  it('handles null/undefined sensor values without crashing or false activations', () => {
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: null,
      waterFlowRate: null,
      loading: false,
    });

    render(<StatCards />);

    expect(screen.getByText('Standby')).toBeTruthy();
    expect(screen.getByText('Ready')).toBeTruthy();
    expect(screen.getByText('Waiting for user')).toBeTruthy();
  });

  it('renders skeleton loading in Card 4 when sensorLoading is true', () => {
    mockUseSensorData.mockReturnValue({
      ultrasonicDistance: null,
      waterFlowRate: null,
      loading: true,
    });
    mockUseSystemState.mockReturnValue({
      systemState: 'standby',
      loading: false,
    });

    const { container } = render(<StatCards />);

    // Expect animate-pulse skeleton blocks to be rendered
    const pulseElements = container.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
    expect(screen.queryByText('Standby')).toBeNull();
  });
});

describe('useSystemState staleness verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { uid: 'operator-1' },
      loading: false,
    });
    mockUsePresentationMode.mockReturnValue(false);
  });

  it('sets flushing when a fresh waterflow reading is received (<= 15s old)', async () => {
    const freshTimestampSeconds = Math.floor((Date.now() - 3000) / 1000);
    mockApiFetch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          sensorType: 'waterflow',
          value: 1.5,
          timestamp: { _seconds: freshTimestampSeconds },
        },
      ],
    });

    const { result } = renderHook(() => actualUseSystemState('toilet-01'));

    await waitFor(() => {
      expect(result.current.systemState).toBe('flushing');
    });
  });

  it('does NOT trigger flushing and stays in standby when reading is older than 15s', async () => {
    const staleTimestampSeconds = Math.floor((Date.now() - 25000) / 1000);
    mockApiFetch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          sensorType: 'waterflow',
          value: 2.1,
          timestamp: { _seconds: staleTimestampSeconds },
        },
      ],
    });

    const { result } = renderHook(() => actualUseSystemState('toilet-01'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.systemState).toBe('standby');
  });

  it('defaults to standby when reading has null/missing timestamp', async () => {
    mockApiFetch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          sensorType: 'waterflow',
          value: 2.1,
          timestamp: null,
        },
      ],
    });

    const { result } = renderHook(() => actualUseSystemState('toilet-01'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.systemState).toBe('standby');
  });

  it('does NOT trigger flushing and stays in standby when reading timestamp is in the future (> 15s ahead due to clock drift)', async () => {
    const futureTimestampSeconds = Math.floor((Date.now() + 60000) / 1000);
    mockApiFetch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          sensorType: 'waterflow',
          value: 2.1,
          timestamp: { _seconds: futureTimestampSeconds },
        },
      ],
    });

    const { result } = renderHook(() => actualUseSystemState('toilet-01'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.systemState).toBe('standby');
  });

  it('sets uv_active when a fresh uv sensor reading is received', async () => {
    const freshTimestampSeconds = Math.floor((Date.now() - 2000) / 1000);
    mockApiFetch.mockResolvedValueOnce({
      success: true,
      data: [
        {
          sensorType: 'uv_active',
          value: 1,
          timestamp: { _seconds: freshTimestampSeconds },
        },
      ],
    });

    const { result } = renderHook(() => actualUseSystemState('toilet-01'));

    await waitFor(() => {
      expect(result.current.systemState).toBe('uv_active');
    });
  });
});
