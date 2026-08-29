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
  beforeAll(() => {
    if (typeof global.URL.createObjectURL === 'undefined') {
      Object.defineProperty(global.URL, 'createObjectURL', {
        value: jest.fn(() => 'blob:mock-evidence-url'),
        writable: true,
      });
    }
    if (typeof global.URL.revokeObjectURL === 'undefined') {
      Object.defineProperty(global.URL, 'revokeObjectURL', {
        value: jest.fn(),
        writable: true,
      });
    }
  });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders the public device location and camera-only evidence controls', () => {
    render(<PublicIssueReportForm device={device} />);

    expect(screen.getByRole('heading', { name: 'North Restroom' })).toBeInTheDocument();
    expect(screen.getAllByText(/Klir/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Annex.*4th Floor.*North Wing/)).toBeInTheDocument();
    expect(screen.getByLabelText('Issue category')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveAttribute('maxlength', '500');
    expect(screen.getByRole('button', { name: 'Open camera' })).toBeInTheDocument();
    expect(screen.queryByText('Report a restroom issue')).not.toBeInTheDocument();
    expect(screen.queryByText('Operational & In Service')).not.toBeInTheDocument();
    const fileInput = document.querySelector('input[type="file"]');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('accept', 'image/*');
    expect(fileInput).toHaveAttribute('capture', 'environment');
    expect(document.querySelector('input[name="startedAt"]')).toHaveValue('1800000000000');
    expect(document.querySelector('input[name="website"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it('allows a no-photo fallback when user selects continue without photo', async () => {
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

  it('renders native camera input with capture="environment" to directly open the camera app', () => {
    render(<PublicIssueReportForm device={device} />);

    const fileInput = screen.getByLabelText('Capture photo with camera app');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveAttribute('accept', 'image/*');
    expect(fileInput).toHaveAttribute('capture', 'environment');
    expect(fileInput).toHaveClass('hidden');

    expect(screen.getByRole('button', { name: 'Open camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue without photo' })).toBeInTheDocument();
  });

  it('displays captured photo thumbnail and allows retaking photo', async () => {
    render(<PublicIssueReportForm device={device} />);

    const fileInput = screen.getByLabelText('Capture photo with camera app');
    const mockFile = new File(['fake-evidence'], 'evidence.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText('Photo attached')).toBeInTheDocument();
      expect(screen.getByText('Ready to submit')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument();
      expect(screen.getByAltText('Captured restroom issue')).toBeInTheDocument();
    });

    // Verify zero AR elements exist
    expect(screen.queryByText('AR LIVE VIEW')).not.toBeInTheDocument();
    expect(screen.queryByText('SDCA ANNEX')).not.toBeInTheDocument();
  });

  it('submits issue report with the photo captured from the native camera app', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          referenceCode: 'IR-CAM12345',
          confirmation: 'Your report with photo has been received.',
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
      target: { value: 'lid_malfunction' },
    });

    const fileInput = screen.getByLabelText('Capture photo with camera app');
    const mockFile = new File(['fake-photo-data'], 'issue.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() => {
      expect(screen.getByText('Photo attached')).toBeInTheDocument();
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Submit report' }).closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('IR-CAM12345')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/issue-reports',
      expect.objectContaining({ method: 'POST', body: expect.any(FormData) }),
    );
    const submitted = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(submitted.get('deviceId')).toBe('toilet-01');
    expect(submitted.get('category')).toBe('lid_malfunction');
    expect(submitted.get('photoCaptureStatus')).toBe('captured');
    expect(submitted.get('photo')).toBeInstanceOf(File);
  });
});
