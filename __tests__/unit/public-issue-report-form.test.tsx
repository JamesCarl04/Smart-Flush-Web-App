/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  PublicIssueReportForm,
  getDisplayRoomTitle,
  getDisplayBreadcrumb,
  getDisplayStallBadge,
  getDisplayReceiptLocation,
} from '@/app/report/[deviceId]/PublicIssueReportForm';

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
    expect(screen.getByText('Annex · 4th Floor')).toBeInTheDocument();
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

  it('submits successfully directly without photo without having to click continue without photo', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          referenceCode: 'IR-DIRECT123',
          confirmation: 'Direct report received.',
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
      target: { value: 'no_water' },
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Submit report' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('IR-DIRECT123')).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/issue-reports',
      expect.objectContaining({ method: 'POST' }),
    );
    const submitted = (fetchMock.mock.calls[0][1] as RequestInit).body as FormData;
    expect(submitted.get('photoCaptureStatus')).toBe('unavailable');
    expect(submitted.has('photo')).toBe(false);
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

    expect(screen.getByText('Automated Restroom Stall')).toBeInTheDocument();
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

  describe('zero repetition display hierarchy (1F to 4F)', () => {
    it('renders 4F Right Wing Female Restroom Stall 5 with zero repetition', () => {
      const stallDevice = {
        id: 'SDCA-FL4-F2-S05',
        name: '4F Right Wing Female Restroom • Stall 5',
        building: 'SDCA Annex',
        floor: '4F',
        location: '4F · Right Wing Female Restroom · Stall 5',
        stallId: 'SDCA-FL4-F2-S05',
        stallNumber: '5',
        isSmartHardware: false,
        isCommonArea: false,
      };

      render(<PublicIssueReportForm device={stallDevice} />);

      // Badge displays Stall 5
      expect(screen.getByText('Stall 5')).toBeInTheDocument();
      // Main heading displays clean room title without floor prefix or stall suffix
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Right Wing Female Restroom');
      expect(heading).not.toHaveTextContent('4F');
      expect(heading).not.toHaveTextContent('Stall 5');
      // Subtitle breadcrumb displays building and floor
      expect(screen.getByText('SDCA Annex · 4F')).toBeInTheDocument();
    });

    it('renders 1F Canteen Male Restroom Stall 1 with clean labels', () => {
      const stallDevice = {
        id: 'SDCA-FL1-CANTEEN-M-S01',
        name: '1F Canteen Male Restroom • Stall 1',
        building: 'SDCA Annex',
        floor: '1F',
        location: '1F · Canteen Male Restroom · Stall 1',
        stallId: 'SDCA-FL1-CANTEEN-M-S01',
        stallNumber: '1',
        isSmartHardware: false,
        isCommonArea: false,
      };

      render(<PublicIssueReportForm device={stallDevice} />);

      expect(screen.getByText('Stall 1')).toBeInTheDocument();
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Canteen Male Restroom');
      expect(screen.getByText('SDCA Annex · 1F')).toBeInTheDocument();
    });

    it('renders 2F PWD single stall with Single Stall badge and clean room title', () => {
      const pwdDevice = {
        id: 'SDCA-FL2-PWD1-S01',
        name: '2F Left Wing PWD Restroom • Single Stall',
        building: 'SDCA Annex',
        floor: '2F',
        location: '2F · Left Wing PWD Restroom · Single Stall',
        stallId: 'SDCA-FL2-PWD1-S01',
        stallNumber: '1',
        isSmartHardware: false,
        isCommonArea: false,
      };

      render(<PublicIssueReportForm device={pwdDevice} />);

      expect(screen.getByText('Single Stall')).toBeInTheDocument();
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Left Wing PWD Restroom');
      expect(screen.getByText('SDCA Annex · 2F')).toBeInTheDocument();
    });

    it('renders 3F common area with Common Area badge and clean room title', () => {
      const commonAreaDevice = {
        id: 'SDCA-FL3-M2',
        name: '3F Right Wing Male Restroom • Common Area',
        building: 'SDCA Annex',
        floor: '3F',
        location: '3F · Right Wing Male Restroom · Common Area',
        isSmartHardware: false,
        isCommonArea: true,
      };

      render(<PublicIssueReportForm device={commonAreaDevice} />);

      expect(screen.getByText('Common Area')).toBeInTheDocument();
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Right Wing Male Restroom');
      expect(screen.getByText('SDCA Annex · 3F')).toBeInTheDocument();
    });

    it('renders non-repetitive receipt location on successful submission', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            referenceCode: 'IR-TEST4F05',
            confirmation: 'Report received.',
          },
        }),
      });
      Object.defineProperty(global, 'fetch', {
        configurable: true,
        writable: true,
        value: fetchMock,
      });

      const stallDevice = {
        id: 'SDCA-FL4-F2-S05',
        name: '4F Right Wing Female Restroom • Stall 5',
        building: 'SDCA Annex',
        floor: '4F',
        location: '4F · Right Wing Female Restroom · Stall 5',
        stallId: 'SDCA-FL4-F2-S05',
        stallNumber: '5',
        isSmartHardware: false,
        isCommonArea: false,
      };

      render(<PublicIssueReportForm device={stallDevice} />);

      fireEvent.change(screen.getByLabelText('Issue category'), {
        target: { value: 'blockage_or_dirty' },
      });

      fireEvent.submit(screen.getByRole('button', { name: 'Submit report' }).closest('form')!);

      await waitFor(() => expect(screen.getByText('IR-TEST4F05')).toBeInTheDocument());
      // Expect clean canonical path without duplication
      expect(
        screen.getByText('SDCA Annex · 4F · Right Wing Female Restroom · Stall 5'),
      ).toBeInTheDocument();
    });
  });

  describe('display presentation helpers', () => {
    it('getDisplayRoomTitle strips floor prefixes and stall suffixes', () => {
      expect(
        getDisplayRoomTitle({
          id: 'SDCA-FL4-F2-S05',
          name: '4F Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '4F · Right Wing Female Restroom · Stall 5',
        }),
      ).toBe('Right Wing Female Restroom');

      expect(
        getDisplayRoomTitle({
          id: 'SDCA-FL1-CANTEEN-M-S01',
          name: '1F Canteen Male Restroom • Stall 1',
          building: 'SDCA Annex',
          floor: '1F',
          location: '1F · Canteen Male Restroom · Stall 1',
        }),
      ).toBe('Canteen Male Restroom');

      expect(
        getDisplayRoomTitle({
          id: 'SDCA-FL1-FACULTY-F-S02',
          name: '1F Faculty Female Restroom • Stall 2',
          building: 'SDCA Annex',
          floor: '1F',
          location: '1F · Faculty Female Restroom · Stall 2',
        }),
      ).toBe('Faculty Female Restroom');

      expect(
        getDisplayRoomTitle({
          id: 'SDCA-FL2-PWD1-S01',
          name: '2F Left Wing PWD Restroom • Single Stall',
          building: 'SDCA Annex',
          floor: '2F',
          location: '2F · Left Wing PWD Restroom · Single Stall',
        }),
      ).toBe('Left Wing PWD Restroom');

      expect(
        getDisplayRoomTitle({
          id: 'toilet-01',
          name: 'North Restroom',
          building: 'Annex',
          floor: '4th Floor',
          location: 'North Wing',
        }),
      ).toBe('North Restroom');

      // Leading separator after floor code
      expect(
        getDisplayRoomTitle({
          id: 'test',
          name: '4F • Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
        }),
      ).toBe('Right Wing Female Restroom');

      // Leading hyphen separator after floor code
      expect(
        getDisplayRoomTitle({
          id: 'test',
          name: '4F - Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
        }),
      ).toBe('Right Wing Female Restroom');

      // Building prefix with separator
      expect(
        getDisplayRoomTitle({
          id: 'test',
          name: 'SDCA Annex - 4F Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
        }),
      ).toBe('Right Wing Female Restroom');

      // Hyphenated stall suffix
      expect(
        getDisplayRoomTitle({
          id: 'test',
          name: '1F Canteen Male Restroom - Stall 1',
          building: 'SDCA Annex',
          floor: '1F',
          location: '',
        }),
      ).toBe('Canteen Male Restroom');

      // Generic stall name infers room title from location
      expect(
        getDisplayRoomTitle({
          id: 'SDCA-FL4-F2-S05',
          name: 'Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '4F · Right Wing Female Restroom · Stall 5',
        }),
      ).toBe('Right Wing Female Restroom');
    });

    it('getDisplayBreadcrumb joins building and floor cleanly', () => {
      expect(
        getDisplayBreadcrumb({
          id: 'test-1',
          name: 'Test',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
        }),
      ).toBe('SDCA Annex · 4F');

      expect(
        getDisplayBreadcrumb({
          id: 'test-2',
          name: 'Test',
          building: 'SDCA Annex',
          floor: '1F',
          location: '',
        }),
      ).toBe('SDCA Annex · 1F');

      // Infers floor from location when floor property is empty
      expect(
        getDisplayBreadcrumb({
          id: 'test-3',
          name: 'Test',
          building: 'SDCA Annex',
          floor: '',
          location: '4F · Right Wing Female Restroom · Stall 5',
        }),
      ).toBe('SDCA Annex · 4F');

      // Avoids duplicate floor when building name already includes floor
      expect(
        getDisplayBreadcrumb({
          id: 'test-4',
          name: 'Test',
          building: 'SDCA Annex 4F',
          floor: '4F',
          location: '',
        }),
      ).toBe('SDCA Annex 4F');
    });

    it('getDisplayStallBadge renders appropriate badge for all stall types', () => {
      expect(
        getDisplayStallBadge({
          id: 'common',
          name: 'Common Area',
          building: 'SDCA Annex',
          floor: '2F',
          location: '',
          isCommonArea: true,
        }),
      ).toBe('Common Area');

      expect(
        getDisplayStallBadge({
          id: 'smart',
          name: 'Smart Stall',
          building: 'SDCA Annex',
          floor: '1F',
          location: '',
          isSmartHardware: true,
        }),
      ).toBe('Automated Restroom Stall');

      expect(
        getDisplayStallBadge({
          id: 'pwd',
          name: '2F Left Wing PWD Restroom • Single Stall',
          building: 'SDCA Annex',
          floor: '2F',
          location: '',
          stallNumber: '1',
        }),
      ).toBe('Single Stall');

      expect(
        getDisplayStallBadge({
          id: 'stall-5',
          name: '4F Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
          stallNumber: '5',
        }),
      ).toBe('Stall 5');

      // Normalizes stallNumber when already formatted with 'Stall' prefix
      expect(
        getDisplayStallBadge({
          id: 'stall-pref',
          name: 'Right Wing Female Restroom',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
          stallNumber: 'Stall 5',
        }),
      ).toBe('Stall 5');

      // Common area detected from name without explicit isCommonArea flag
      expect(
        getDisplayStallBadge({
          id: 'common-name',
          name: '1F Canteen Female Restroom • Common Area',
          building: 'SDCA Annex',
          floor: '1F',
          location: '',
        }),
      ).toBe('Common Area');

      // Common area inside PWD restroom prioritizes Common Area over Single Stall
      expect(
        getDisplayStallBadge({
          id: 'pwd-common',
          name: '2F Left Wing PWD Restroom • Common Area',
          building: 'SDCA Annex',
          floor: '2F',
          location: '',
        }),
      ).toBe('Common Area');

      // Infers stall number from device ID suffix
      expect(
        getDisplayStallBadge({
          id: 'SDCA-FL4-F2-S05',
          name: 'Right Wing Female Restroom',
          building: 'SDCA Annex',
          floor: '4F',
          location: '',
        }),
      ).toBe('Stall 5');
    });

    it('getDisplayReceiptLocation produces non-repetitive canonical paths', () => {
      expect(
        getDisplayReceiptLocation({
          id: 'SDCA-FL4-F2-S05',
          name: '4F Right Wing Female Restroom • Stall 5',
          building: 'SDCA Annex',
          floor: '4F',
          location: '4F · Right Wing Female Restroom · Stall 5',
          stallNumber: '5',
        }),
      ).toBe('SDCA Annex · 4F · Right Wing Female Restroom · Stall 5');

      expect(
        getDisplayReceiptLocation({
          id: 'SDCA-FL2-M1',
          name: '2F Left Wing Male Restroom • Common Area',
          building: 'SDCA Annex',
          floor: '2F',
          location: '2F · Left Wing Male Restroom · Common Area',
          isCommonArea: true,
        }),
      ).toBe('SDCA Annex · 2F · Left Wing Male Restroom · Common Area');

      expect(
        getDisplayReceiptLocation({
          id: 'SDCA-FL2-PWD1-S01',
          name: '2F Left Wing PWD Restroom • Single Stall',
          building: 'SDCA Annex',
          floor: '2F',
          location: '2F · Left Wing PWD Restroom · Single Stall',
          stallNumber: '1',
        }),
      ).toBe('SDCA Annex · 2F · Left Wing PWD Restroom · Single Stall');

      // Retains room title with custom location
      expect(
        getDisplayReceiptLocation({
          id: 'toilet-01',
          name: 'North Restroom',
          building: 'Annex',
          floor: '4th Floor',
          location: 'North Wing',
        }),
      ).toBe('Annex · 4th Floor · North Restroom · North Wing');
    });

  });
});
