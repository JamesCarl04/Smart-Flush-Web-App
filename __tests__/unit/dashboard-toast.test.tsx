/** @jest-environment jsdom */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardToast } from '@/components/dashboard/DashboardToast';

describe('DashboardToast Component', () => {
  it('renders success toast with White/Slate neutral styling and Check icon', () => {
    render(
      <DashboardToast kind="success" message="Task dispatched successfully" />
    );

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(screen.getByText('Task dispatched successfully')).toBeInTheDocument();

    const toastCard = screen.getByText('Task dispatched successfully').closest('div');
    expect(toastCard).toHaveClass('bg-white');
    expect(toastCard).toHaveClass('text-slate-900');
    expect(toastCard).not.toHaveClass('alert-success');
    expect(toastCard).not.toHaveClass('alert-error');

    const svg = statusEl.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('renders error toast with red/rose styling and AlertCircle icon', () => {
    render(
      <DashboardToast kind="error" message="Failed to connect to controller" />
    );

    const statusEl = screen.getByRole('status');
    expect(statusEl).toBeInTheDocument();
    expect(screen.getByText('Failed to connect to controller')).toBeInTheDocument();

    const toastCard = screen.getByText('Failed to connect to controller').closest('div');
    expect(toastCard).toHaveClass('bg-rose-50');
    expect(toastCard).toHaveClass('text-rose-900');
    expect(toastCard).not.toHaveClass('alert-success');

    const svg = statusEl.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('has polite aria-live announcement for screen readers', () => {
    render(<DashboardToast kind="success" message="Status saved" />);
    const liveRegion = screen.getByRole('status');
    expect(liveRegion).toHaveAttribute('aria-live', 'polite');
  });
});
