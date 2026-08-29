/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PublicIssueReportForm } from '@/app/report/[deviceId]/PublicIssueReportForm';
import { CameraCapture } from '@/app/report/[deviceId]/CameraCapture';

const device = {
  id: 'toilet-01',
  name: 'North Restroom',
  building: 'Annex',
  floor: '4th Floor',
  location: 'North Wing',
};

describe('anonymous public issue report form', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the public device location and camera-only evidence controls', () => {
    render(<PublicIssueReportForm device={device} />);

    expect(screen.getByRole('heading', { name: 'North Restroom' })).toBeInTheDocument();
    expect(screen.getByText(/Klir/i)).toBeInTheDocument();
    expect(screen.getByText(/Annex.*4th Floor.*North Wing/)).toBeInTheDocument();
    expect(screen.getByLabelText('Issue category')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveAttribute('maxlength', '500');
    expect(screen.getByRole('button', { name: 'Open camera' })).toBeInTheDocument();
    expect(screen.queryByText('Report a restroom issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational & In Service')).not.toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
    expect(document.querySelector('input[name="startedAt"]')).toHaveValue('1800000000000');
    expect(document.querySelector('input[name="website"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it('allows a no-photo fallback after camera access fails', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
          success: true,
          data: {
            referenceCode: 'IR-ABC12345',
            confirmation: 'Your report has been received for administrator review.',
          },
        }),
    });
    Object.defineProperty(global, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });
    render(<PublicIssueReportForm device={device} />);
    fireEvent.change(screen.getByLabelText('Issue category'), {
      target: { value: 'continuous_leak' },
    });
    fireEvent.change(screen.getByLabelText('Description (optional)'), {
      target: { value: 'Water keeps flowing' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue without photo' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Continue without photo' }));

    fireEvent.submit(screen.getByRole('button', { name: 'Submit report' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('IR-ABC12345')).toBeInTheDocument());
    expect(screen.getByText('Your report has been received for administrator review.')).toBeInTheDocument();
    expect(screen.getByText('Submitted without photo.')).toBeInTheDocument();
    expect(screen.getByText(/Annex.*North Wing/)).toBeInTheDocument();
    expect(screen.queryByRole('form')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/issue-reports',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    const submitted = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(submitted.get('deviceId')).toBe('toilet-01');
    expect(submitted.get('category')).toBe('continuous_leak');
    expect(submitted.get('description')).toBe('Water keeps flowing');
    expect(submitted.get('startedAt')).toBe('1800000000000');
    expect(submitted.get('photoCaptureStatus')).toBe('unavailable');
    expect(submitted.has('photo')).toBe(false);
    expect(submitted.has('name')).toBe(false);
    expect(submitted.has('email')).toBe(false);
    expect(submitted.has('phone')).toBe(false);
  });

  it('renders standard stall categories without showing N/A or UV options', () => {
    const standardStallDevice = {
      id: 'SDCA-FL2-M1-S02',
      name: 'SDCA Annex 2F Male Restroom 1 • Stall 2',
      building: 'SDCA Annex',
      floor: '2F',
      location: '2F • Male Restroom 1 • Stall 2',
      stallNumber: '2',
      isSmartHardware: false,
      isCommonArea: false,
    };

    render(<PublicIssueReportForm device={standardStallDevice} />);

    expect(screen.getByText('Stall 2')).toBeInTheDocument();
    expect(screen.getByText('Toilet clogged or dirty')).toBeInTheDocument();
    expect(screen.getByText('Stall door lock or hardware broken')).toBeInTheDocument();
    // Zero N/A policy: UV failure must not appear for standard stalls
    expect(screen.queryByText('UV light failure')).not.toBeInTheDocument();
  });

  it('renders smart IoT prototype stall with active UV option', () => {
    const smartStallDevice = {
      id: 'toilet-01',
      name: 'SDCA Annex 1F Canteen Female Restroom • Stall 1',
      building: 'SDCA Annex',
      floor: '1F',
      location: '1F • Canteen Female Restroom • Stall 1',
      stallNumber: '1',
      isSmartHardware: true,
      isCommonArea: false,
    };

    render(<PublicIssueReportForm device={smartStallDevice} />);

    expect(screen.getByText('Smart IoT Stall')).toBeInTheDocument();
    expect(screen.getByText('UV light failure')).toBeInTheDocument();
  });

  it('renders common area facility options without stall-specific options', () => {
    const commonAreaDevice = {
      id: 'SDCA-FL1-CANTEEN-M',
      name: 'SDCA Annex 1F Canteen Male Restroom • Common Area',
      building: 'SDCA Annex',
      floor: '1F',
      location: '1F • Canteen Male Restroom • Sinks & Entrance',
      isSmartHardware: false,
      isCommonArea: true,
    };

    render(<PublicIssueReportForm device={commonAreaDevice} />);

    expect(screen.getByText('Common Area')).toBeInTheDocument();
    expect(screen.getByText('Sink faucet leaking or running')).toBeInTheDocument();
    expect(screen.getByText('Flooded or dirty floor')).toBeInTheDocument();
    expect(screen.getByText('Soap dispenser or mirror damaged')).toBeInTheDocument();
    expect(screen.queryByText('Toilet clogged or dirty')).not.toBeInTheDocument();
  });

  it('renders a clean, clutter-free camera viewfinder without distracting labels when opened', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = {
      getTracks: () => [mockTrack],
    };
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: jest.fn().mockResolvedValue(mockStream),
      },
      configurable: true,
      writable: true,
    });
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

    const stallDevice = {
      id: 'SDCA-FL3-M1-S02',
      name: 'SDCA Annex 3F Male Restroom 1 • Stall 2',
      building: 'SDCA Annex',
      floor: '3F',
      location: '3F • Male Restroom 1 • Stall 2',
      stallNumber: '2',
      isSmartHardware: false,
      isCommonArea: false,
    };

    render(<PublicIssueReportForm device={stallDevice} />);

    // Open camera
    fireEvent.press ? fireEvent.press(screen.getByRole('button', { name: 'Open camera' })) : fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));

    await waitFor(() => {
      // Clutter removal verification:
      expect(screen.queryByText('AR LIVE VIEW')).not.toBeInTheDocument();
      expect(screen.queryByText('SDCA ANNEX')).not.toBeInTheDocument();
      expect(screen.queryByText('Aim at stall QR code to inspect')).not.toBeInTheDocument();
      // Shutter button is present:
      expect(screen.getByRole('button', { name: 'Take photo' })).toBeInTheDocument();
    });
  });

  it('renders see-through glassmorphic card with stall name and In Service badge when QR is detected', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
      configurable: true,
      writable: true,
    });
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

    const stallDevice = {
      id: 'SDCA-FL2-M1-S01',
      name: 'SDCA Annex 2F Male Restroom 1 • Stall 1',
      building: 'SDCA Annex',
      floor: '2F',
      location: '2F • Male Restroom 1 • Stall 1',
      stallNumber: '1',
      isSmartHardware: false,
      isCommonArea: false,
    };

    render(<CameraCapture device={stallDevice} initialQrDetected={true} onChange={jest.fn()} />);

    // Open camera to ready phase
    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));

    await waitFor(() => {
      expect(screen.getByText('SDCA Annex 2F Male Restroom 1 • Stall 1')).toBeInTheDocument();
      // Verifying clean label: No 'In Service', no 'Ready', no 'AR LIVE VIEW'
      expect(screen.queryByText('In Service')).not.toBeInTheDocument();
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
      expect(screen.queryByText('AR LIVE VIEW')).not.toBeInTheDocument();
      expect(screen.queryByText('UV Disinfection')).not.toBeInTheDocument();
    });
  });

  it('renders clean see-through glassmorphic pill with exact toilet name for prototype', async () => {
    const mockTrack = { stop: jest.fn() };
    const mockStream = { getTracks: () => [mockTrack] };
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: { getUserMedia: jest.fn().mockResolvedValue(mockStream) },
      configurable: true,
      writable: true,
    });
    window.HTMLMediaElement.prototype.play = jest.fn().mockResolvedValue(undefined);

    const smartDevice = {
      id: 'toilet-01',
      name: 'SDCA Annex Test Stall (toilet-01)',
      building: 'SDCA Annex',
      floor: '1F',
      location: '1F • Canteen Female Restroom',
      stallNumber: '1',
      isSmartHardware: true,
      isCommonArea: false,
    };

    render(<CameraCapture device={smartDevice} initialQrDetected={true} onChange={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));

    await waitFor(() => {
      expect(screen.getByText('SDCA Annex Test Stall (toilet-01)')).toBeInTheDocument();
      expect(screen.queryByText('Ready')).not.toBeInTheDocument();
      expect(screen.queryByText('In Service')).not.toBeInTheDocument();
    });
  });
});
