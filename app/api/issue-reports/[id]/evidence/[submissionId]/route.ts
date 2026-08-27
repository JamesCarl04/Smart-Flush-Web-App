import { NextResponse } from 'next/server';
import { requireAdmin, verifyAuthToken } from '@/lib/auth-helpers';
import { IssueReportModerationError, readIssueReportEvidence } from '@/lib/issue-report-moderation';

interface RouteParams { params: Promise<{ id: string; submissionId: string }> }

export async function GET(request: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await verifyAuthToken(request);
    await requireAdmin(user);
    const { id, submissionId } = await params;
    const evidence = await readIssueReportEvidence(id, submissionId);
    return new NextResponse(new Uint8Array(evidence.bytes), {
      headers: {
        'Content-Type': evidence.contentType,
        'Content-Disposition': `inline; filename="${evidence.filename.replace(/[^a-zA-Z0-9._-]/g, '')}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    if (error instanceof IssueReportModerationError) return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    console.error('[Issue Reports] evidence read failed:', error);
    return NextResponse.json({ success: false, error: 'Failed to read evidence' }, { status: 500 });
  }
}
