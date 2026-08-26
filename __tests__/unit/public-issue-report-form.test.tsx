/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { PublicIssueReportForm } from '@/app/report/[deviceId]/PublicIssueReportForm';

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

  it('renders the public device location and only anonymous report fields', () => {
    render(<PublicIssueReportForm device={device} />);

    expect(screen.getByRole('heading', { name: 'Report a restroom issue' })).toBeInTheDocument();
    expect(screen.getByText('North Restroom')).toBeInTheDocument();
    expect(screen.getByText(/Annex.*4th Floor.*North Wing/)).toBeInTheDocument();
    expect(screen.getByLabelText('Issue category')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toHaveAttribute('maxlength', '500');
    expect(screen.getByLabelText('Photo (optional)')).toHaveAttribute(
      'accept',
      'image/jpeg,image/png,image/webp',
    );
    expect(document.querySelector('input[name="startedAt"]')).toHaveValue('1800000000000');
    expect(document.querySelector('input[name="website"]')).toBeInTheDocument();
    expect(screen.queryByLabelText(/name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/phone/i)).not.toBeInTheDocument();
  });

  it('shows only a reference code and confirmation after successful submission', async () => {
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

    fireEvent.submit(screen.getByRole('button', { name: 'Submit report' }).closest('form')!);

    await waitFor(() => expect(screen.getByText('IR-ABC12345')).toBeInTheDocument());
    expect(screen.getByText('Your report has been received for administrator review.')).toBeInTheDocument();
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
    expect(submitted.has('name')).toBe(false);
    expect(submitted.has('email')).toBe(false);
    expect(submitted.has('phone')).toBe(false);
  });
});
