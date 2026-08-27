import { NextResponse } from 'next/server';
import { requireAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import {
  dismissIssueReport,
  IssueReportModerationError,
  parseDismissal,
} from '@/lib/issue-report-moderation';

interface RouteParams { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);
    const dismissal = parseDismissal(await request.json());
    const { id } = await params;
    const data = await dismissIssueReport(id, dismissal, { uid: user.uid, email: user.email, name: user.name });
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    if (error instanceof IssueReportModerationError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[Issue Reports] dismissal failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to dismiss issue report' }, { status: 500 });
  }
}
