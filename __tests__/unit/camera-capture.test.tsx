/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CameraCapture } from '@/app/report/[deviceId]/CameraCapture';

describe('camera-first evidence capture', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined });
  });

  it('falls back without a photo when camera permission is denied', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn().mockRejectedValue(new Error('denied')) },
    });
    const onChange = jest.fn();
    render(<CameraCapture onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue without photo' })).toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith(null, null, 'unavailable');
    expect(document.querySelector('input[type="file"]')).not.toBeInTheDocument();
  });

  it('moves to the no-photo fallback when camera access is unavailable', async () => {
    const onChange = jest.fn();
    render(<CameraCapture onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Continue without photo' })).toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith(null, null, 'unavailable');
  });
});
