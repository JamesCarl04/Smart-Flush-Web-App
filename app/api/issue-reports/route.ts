import { NextResponse } from 'next/server';
import { requireAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import {
  IssueReportModerationError,
  listIssueReports,
  parseIssueReportStatus,
} from '@/lib/issue-report-moderation';

function failure(error: unknown): NextResponse {
  if (error instanceof Response) return new NextResponse(error.body, error);
  if (error instanceof IssueReportModerationError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error('[Issue Reports] listing failed:', error);
  return NextResponse.json({ success: false, error: 'Failed to fetch issue reports' }, { status: 500 });
}

export async function GET(request: Request): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);
    const status = parseIssueReportStatus(new URL(request.url).searchParams.get('status'));
    return NextResponse.json({ success: true, data: await listIssueReports(status) });
  } catch (error) {
    return failure(error);
  }
}
