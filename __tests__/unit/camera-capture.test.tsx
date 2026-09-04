/** @jest-environment jsdom */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CameraCapture } from '@/app/report/[deviceId]/CameraCapture';

describe('camera-first evidence capture', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders native camera input and triggers file picker on Open camera click', () => {
    const onChange = jest.fn();
    render(<CameraCapture onChange={onChange} />);

    const fileInput = screen.getByLabelText('Capture photo with camera app');
    expect(fileInput).toBeInTheDocument();
    expect(fileInput).toHaveAttribute('type', 'file');
    expect(fileInput).toHaveAttribute('accept', 'image/*');
    expect(fileInput).toHaveAttribute('capture', 'environment');

    const clickSpy = jest.spyOn(fileInput, 'click');
    fireEvent.click(screen.getByRole('button', { name: 'Open camera' }));
    expect(clickSpy).toHaveBeenCalled();
  });

  it('moves to the no-photo fallback when user selects continue without photo', async () => {
    const onChange = jest.fn();
    render(<CameraCapture onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Continue without photo' }));
    await waitFor(() =>
      expect(screen.getByText('No photo attached')).toBeInTheDocument(),
    );
    expect(onChange).toHaveBeenCalledWith(null, null, 'unavailable');
    expect(screen.getByRole('button', { name: 'Add photo' })).toBeInTheDocument();
  });

  it('handles captured photo selection and displays preview with retake option', async () => {
    global.URL.createObjectURL = jest.fn(() => 'blob:http://localhost/mock-photo');
    global.URL.revokeObjectURL = jest.fn();

    const onChange = jest.fn();
    render(<CameraCapture onChange={onChange} />);

    const fileInput = screen.getByLabelText('Capture photo with camera app');
    const mockFile = new File(['mock content'], 'test-photo.jpg', { type: 'image/jpeg' });

    fireEvent.change(fileInput, { target: { files: [mockFile] } });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Retake' })).toBeInTheDocument(),
    );
    expect(screen.getByText('Photo attached')).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith(mockFile, expect.any(Number), 'captured');
  });
});
