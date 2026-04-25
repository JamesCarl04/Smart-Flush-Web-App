// app/api/sensors/[id]/config/route.ts
// PUT /api/sensors/:id/config — update sensor config in Firestore + push to ESP32 via MQTT
import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';
import { verifyAuthToken } from '@/lib/auth-helpers';
import { getDeviceConnectionState } from '@/lib/device-connection';
import { publishConfigUpdate } from '@/lib/mqtt-publish';

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface ConfigBody {
  pumpDuration?: number;
  uvDuration?: number;
  threshold?: number;
  personGoneConfirm?: number;
}

function validateNumericField(
  value: number | undefined,
  label: string,
  minimum: number,
  maximum: number,
): string | null {
  if (value === undefined) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return `${label} must be a valid number`;
  }

  if (value < minimum || value > maximum) {
    return `${label} must be between ${minimum} and ${maximum}`;
  }

  return null;
}

export async function PUT(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  try {
    await verifyAuthToken(request);
    const { id } = await params;

    const body = (await request.json()) as ConfigBody;
    const { pumpDuration, uvDuration, threshold, personGoneConfirm } = body;

    if (
      pumpDuration === undefined &&
      uvDuration === undefined &&
      threshold === undefined &&
      personGoneConfirm === undefined
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            'At least one config field is required (pumpDuration, uvDuration, threshold, personGoneConfirm)',
        },
        { status: 400 },
      );
    }

    const validationError =
      validateNumericField(pumpDuration, 'Pump duration', 1, 30) ??
      validateNumericField(uvDuration, 'UV duration', 10, 120) ??
      validateNumericField(threshold, 'Occupancy threshold', 10, 100) ??
      validateNumericField(
        personGoneConfirm,
        'Departure confirm duration',
        1,
        10,
      );

    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 },
      );
    }

    // Fetch existing device to merge config
    const docRef = adminDb.collection('devices').doc(id);
    const doc = await docRef.get();

    const existingConfig = (doc.data()?.config as Record<string, number>) ?? {};
    const mergedConfig = {
      pumpDuration:
        pumpDuration ?? (existingConfig.pumpDuration as number) ?? 5,
      uvDuration: uvDuration ?? (existingConfig.uvDuration as number) ?? 30,
      threshold: threshold ?? (existingConfig.threshold as number) ?? 30,
      personGoneConfirm:
        personGoneConfirm ?? (existingConfig.personGoneConfirm as number) ?? 3,
    };

    // Update Firestore
    await docRef.set(
      {
        id,
        config: mergedConfig,
        updatedAt: FieldValue.serverTimestamp(),
        ...(doc.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true },
    );

    const connectionState = await getDeviceConnectionState(id);
    if (!connectionState.connected) {
      return NextResponse.json({
        success: true,
        data: { deviceId: id, config: mergedConfig },
        warning:
          'Configuration saved, but the ESP32 is offline so it could not be synced yet.',
      });
    }

    // Push config to ESP32 via MQTT
    try {
      await publishConfigUpdate(mergedConfig);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown MQTT publish error';
      return NextResponse.json({
        success: true,
        data: { deviceId: id, config: mergedConfig },
        warning: `Configuration saved, but syncing to the ESP32 failed: ${message}`,
      });
    }

    return NextResponse.json({
      success: true,
      data: { deviceId: id, config: mergedConfig },
    });
  } catch (error) {
    if (error instanceof Response) return new NextResponse(error.body, error);
    console.error('[Sensors] config PUT error:', error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to update config',
      },
      { status: 500 },
    );
  }
}
