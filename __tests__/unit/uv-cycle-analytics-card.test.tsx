/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UvCycleAnalyticsCard } from '@/components/analytics/UvCycleAnalyticsCard';

const mockApiFetch = jest.fn();

jest.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'admin-1', email: 'admin@sdca.edu.ph' },
    loading: false,
  }),
}));

jest.mock('@/hooks/usePresentationMode', () => ({
  usePresentationMode: () => false,
}));

jest.mock('@/lib/api-client', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

jest.mock('recharts', () => {
  const MockContainer = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="recharts-responsive-container">{children}</div>
  );
  const MockLineChart = ({ children }: { children: React.ReactNode }) => (
    <div data-testid="uv-line-chart">{children}</div>
  );
  const MockLine = ({ name }: { name?: string }) => (
    <div data-testid="uv-line-series">{name}</div>
  );
  return {
    ResponsiveContainer: MockContainer,
    LineChart: MockLineChart,
    Line: MockLine,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
  };
});

describe('UvCycleAnalyticsCard', () => {
  const sampleApiResponse = {
    success: true,
    data: {
      meta: {
        period: 'day',
        anchorDate: '2026-11-19',
        todayPht: '2026-11-19',
        granularity: 'hour',
        hourFilter: null,
        fromDate: '2026-11-19',
        toDate: '2026-11-19',
        weekFrom: '2026-11-16',
        weekTo: '2026-11-22',
        monthLabel: 'November 2026',
        yearLabel: '2026',
      },
      totals: {
        today: 37,
        selectedDay: 37,
        thisWeek: 61,
        thisMonth: 61,
        thisYear: 61,
        todayDurationSeconds: 185,
        selectedDayDurationSeconds: 185,
        thisWeekDurationSeconds: 305,
        thisMonthDurationSeconds: 305,
        thisYearDurationSeconds: 305,
        periodTotal: 37,
        periodCompleted: 37,
        periodInterrupted: 0,
        avgDurationSeconds: 5,
        totalDurationSeconds: 185,
        completedAvgDurationSeconds: 5,
        interruptedAvgDurationSeconds: null,
        relativeEffectivityPercent: null,
      },
      series: [
        {
          key: '2026-11-19T18',
          label: '18:00',
          tooltipTitle: 'Nov 19, 2026 · 18:00–18:59 PHT',
          count: 3,
          completed: 3,
          interrupted: 0,
          avgDurationSeconds: 5,
          totalDurationSeconds: 15,
          exactTimes: ['18:38:50', '18:40:30', '18:59:10'],
          drillDate: '2026-11-19',
          drillHour: 18,
        },
      ],
      logs: [
        {
          id: 'wwsevPnILqWMTMn4tiMp',
          deviceId: 'toilet-01',
          timestampMs: 1795085950303,
          timestampIso: '2026-11-19T18:59:10+08:00',
          phtDate: '2026-11-19',
          phtTime: '18:59:10',
          hour: 18,
          minute: 59,
          second: 10,
          duration: 5,
          completed: true,
          reason: null,
        },
      ],
      totalLogsInScope: 37,
      latestTimestampMs: 1795085950303,
      syncedAtIso: '2026-11-19T22:50:00+08:00',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockResolvedValue(sampleApiResponse);
  });

  it('renders the Line Graph, 4 period summary totals, and verified HH:mm:ss log table without biased 100% donut copy', async () => {
    render(<UvCycleAnalyticsCard />);

    await waitFor(() => {
      expect(screen.getByTestId('uv-line-chart')).toBeInTheDocument();
    });

    expect(screen.getByText('UV Sanitization Cycle Activity')).toBeInTheDocument();
    expect(screen.queryByText(/SUCCESS RATE/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Live 5s sync/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Local log cache/i)).not.toBeInTheDocument();

    expect(screen.getAllByText('37').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('61').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/Total Duration:\s*3m 5s \(185s\)/i)).toBeInTheDocument();
    expect(screen.getByText('3m 5s')).toBeInTheDocument();
    expect(screen.getAllByText('5m 5s').length).toBe(3);
    expect(screen.getByText(/Avg Duration:\s*5\.0s/i)).toBeInTheDocument();
    expect(screen.getByTestId('uv-relative-effectivity')).toHaveTextContent(
      /Relative Effectivity:\s*N\/A \(0 interrupted\)/i,
    );

    // Verified raw log row with exact HH:mm:ss timestamp and 5s duration
    expect(screen.getByText('18:59:10')).toBeInTheDocument();
    expect(screen.getByText('5s')).toBeInTheDocument();
    expect(screen.getByText('toilet-01')).toBeInTheDocument();
  });

  it('re-fetches with matching query params when switching to Exact (HH:mm:ss) and Week/Month/Year tabs', async () => {
    render(<UvCycleAnalyticsCard />);

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole('button', { name: 'Exact (HH:mm:ss)' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('granularity=second'),
        expect.anything(),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Week' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('period=week'),
        expect.anything(),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Month' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('period=month'),
        expect.anything(),
        expect.anything(),
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'Year' }));
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('period=year'),
        expect.anything(),
        expect.anything(),
      );
    });
  });
});
