import {
  generatePDFBuffer,
  generateMaintenanceTaskPDFBuffer,
  generateSupervisorAuditPDFBuffer,
  type FlushEventRow,
  type UVCycleRow,
  type MaintenanceTaskRow,
  type MaintenanceTaskSummary,
  type SupervisorAuditRow,
  type SupervisorAuditSummary,
} from '@/lib/pdf-report';

describe('PDF Reports Generation Engine', () => {
  it('generates standard usage PDF with water conservation calculation', async () => {
    const flushRows: FlushEventRow[] = [
      {
        id: 'flush-1',
        deviceId: 'SDCA-FL1-CANTEEN-M',
        waterVolume: 2.1,
        duration: 5,
        timestamp: '2026-08-29T10:00:00.000Z',
      },
      {
        id: 'flush-2',
        deviceId: 'SDCA-FL1-CANTEEN-F',
        waterVolume: 2.0,
        duration: 4,
        timestamp: '2026-08-29T10:05:00.000Z',
      },
    ];

    const uvRows: UVCycleRow[] = [
      {
        id: 'uv-1',
        deviceId: 'SDCA-FL1-CANTEEN-M',
        duration: 45,
        completed: true,
        timestamp: '2026-08-29T10:01:00.000Z',
      },
    ];

    const pdfBuffer = await generatePDFBuffer(
      '2026-08-23',
      '2026-08-29',
      flushRows,
      uvRows,
    );

    expect(pdfBuffer).toBeInstanceOf(Uint8Array);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const pdfString = Buffer.from(pdfBuffer).toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('Smart Flush System Report')).toBe(true);
    expect(pdfString.includes('Estimated Water Saved')).toBe(true);
  });

  it('generates maintenance task PDF buffer', async () => {
    const rows: MaintenanceTaskRow[] = [
      {
        id: 'task-101',
        deviceId: 'SDCA-FL2-M1',
        triggerType: 'flush_count',
        message: 'Flush cycle threshold reached (100 cycles)',
        assignedTo: 'tech-1',
        createdBy: 'system',
        timeAssigned: 'Aug 28, 2026 09:00',
        timeAcknowledged: 'Aug 28, 2026 09:15',
        timeCompleted: 'Aug 28, 2026 09:45',
        totalDuration: '45 min',
        status: 'completed',
      },
    ];

    const summary: MaintenanceTaskSummary = {
      totalTasks: 1,
      completedCount: 1,
      pendingCount: 0,
      averageResponseTime: '15 min',
      averageCompletionTime: '45 min',
    };

    const pdfBuffer = await generateMaintenanceTaskPDFBuffer(
      '2026-08-23',
      '2026-08-29',
      rows,
      summary,
    );

    expect(pdfBuffer).toBeInstanceOf(Uint8Array);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const pdfString = Buffer.from(pdfBuffer).toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('Maintenance Task Report')).toBe(true);
    expect(pdfString.includes('Average Response Time')).toBe(true);
  });

  it('generates supervisor audit QA PDF buffer with QA metrics', async () => {
    const rows: SupervisorAuditRow[] = [
      {
        id: 'task-202',
        location: '2F Male Restroom 1',
        deviceId: 'SDCA-FL2-M1',
        floor: '2nd Floor',
        building: 'SDCA Annex Building',
        triggerType: 'water_overuse',
        message: 'Water meter exceeded threshold (>10L/flush)',
        technician: 'John Cruz',
        inspectedBy: 'Maria Santos',
        inspectedAt: 'Aug 29, 2026 14:00',
        inspectionStatus: 'approved',
        flagReason: null,
        recheckCount: 0,
        timeCompleted: 'Aug 29, 2026 13:30',
        workDuration: '30 min',
        biometricVerified: true,
      },
    ];

    const summary: SupervisorAuditSummary = {
      totalSubmissions: 1,
      approvedCount: 1,
      flaggedCount: 0,
      pendingAuditCount: 0,
      approvalRate: '100%',
      complianceRate: '100%',
    };

    const pdfBuffer = await generateSupervisorAuditPDFBuffer(
      '2026-08-23',
      '2026-08-29',
      rows,
      summary,
    );

    expect(pdfBuffer).toBeInstanceOf(Uint8Array);
    expect(pdfBuffer.length).toBeGreaterThan(500);

    const pdfString = Buffer.from(pdfBuffer).toString('binary');
    expect(pdfString.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfString.includes('%%EOF')).toBe(true);
    expect(pdfString.includes('Supervisor QA & Approval Audit Report')).toBe(true);
    expect(pdfString.includes('Approval Rate: 100%')).toBe(true);
  });
});
