import { FieldValue } from 'firebase-admin/firestore';
import type { Message, MulticastMessage } from 'firebase-admin/messaging';
import { adminDb, adminMessaging } from '@/lib/firebase-admin';
import type { TaskDoc } from '@/lib/task-types';

const FCM_BATCH_SIZE = 500;

interface TokenOwner {
  uid: string;
  token: string;
}

interface TaskNotificationPayload {
  notification: {
    title: string;
    body: string;
  };
  data: {
    taskId: string;
    deviceId: string;
    triggerType: string;
  };
}

function readStringField(
  data: Record<string, unknown> | undefined,
  field: string,
): string | null {
  const value = data?.[field];
  return typeof value === 'string' && value.trim() ? value : null;
}

function buildPayload(task: TaskDoc): TaskNotificationPayload {
  return {
    notification: {
      title: 'Cleaning Task Assigned',
      body: task.message,
    },
    data: {
      taskId: task.id,
      deviceId: task.deviceId,
      triggerType: task.triggerType,
    },
  };
}

function errorCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return null;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function errorMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('message' in error)) {
    return null;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' ? message : null;
}

function isStaleTokenError(error: unknown): boolean {
  const code = errorCode(error);
  const message = errorMessage(error);

  return (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token' ||
    message?.includes('UNREGISTERED') === true ||
    message?.includes('404') === true ||
    message?.includes('Requested entity was not found') === true
  );
}

async function removeFcmToken(owner: TokenOwner): Promise<void> {
  try {
    const userRef = adminDb.collection('users').doc(owner.uid);
    const snapshot = await userRef.get();
    const data = snapshot.data() as Record<string, unknown> | undefined;

    if (readStringField(data, 'fcmToken') !== owner.token) {
      return;
    }

    await userRef.update({
      fcmToken: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    console.warn(`[FCM] Removed stale token for user ${owner.uid}`);
  } catch (error) {
    console.error(`[FCM] Failed to remove stale token for ${owner.uid}:`, error);
  }
}

async function readAssignedToken(uid: string): Promise<TokenOwner | null> {
  const snapshot = await adminDb.collection('users').doc(uid).get();
  const data = snapshot.data() as Record<string, unknown> | undefined;
  const token = readStringField(data, 'fcmToken');

  return token ? { uid, token } : null;
}

async function readMaintenanceTokens(): Promise<TokenOwner[]> {
  const snapshot = await adminDb
    .collection('users')
    .where('role', '==', 'maintenance')
    .get();
  const owners: TokenOwner[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Record<string, unknown>;
    const token = readStringField(data, 'fcmToken');
    if (token) {
      owners.push({ uid: doc.id, token });
    }
  }

  return owners;
}

async function sendToSingleToken(
  task: TaskDoc,
  owner: TokenOwner,
): Promise<void> {
  const message: Message = {
    token: owner.token,
    ...buildPayload(task),
  };

  try {
    await adminMessaging.send(message);
    console.info('[FCM] Task notification sent. success=1 failure=0');
  } catch (error) {
    if (isStaleTokenError(error)) {
      await removeFcmToken(owner);
    }

    console.error('[FCM] Task notification failed. success=0 failure=1', error);
  }
}

async function sendToManyTokens(
  task: TaskDoc,
  owners: TokenOwner[],
): Promise<void> {
  let successCount = 0;
  let failureCount = 0;
  const payload = buildPayload(task);

  for (let start = 0; start < owners.length; start += FCM_BATCH_SIZE) {
    const chunk = owners.slice(start, start + FCM_BATCH_SIZE);
    const message: MulticastMessage = {
      tokens: chunk.map((owner) => owner.token),
      ...payload,
    };

    try {
      const response = await adminMessaging.sendEachForMulticast(message);
      successCount += response.successCount;
      failureCount += response.failureCount;

      const staleRemovals = response.responses
        .map((sendResponse, index) =>
          !sendResponse.success &&
          sendResponse.error &&
          isStaleTokenError(sendResponse.error)
            ? removeFcmToken(chunk[index])
            : null,
        )
        .filter((removal): removal is Promise<void> => removal !== null);

      await Promise.all(staleRemovals);
    } catch (error) {
      failureCount += chunk.length;
      console.error('[FCM] Multicast task notification failed:', error);
    }
  }

  console.info(
    `[FCM] Task notification multicast complete. success=${successCount} failure=${failureCount}`,
  );
}

export async function sendTaskNotification(
  task: TaskDoc,
  assignedToUid: string | null,
  assignedToUids: string[] = [],
): Promise<void> {
  if (assignedToUids.length > 0) {
    const owners = (
      await Promise.all(assignedToUids.map((uid) => readAssignedToken(uid)))
    ).filter((owner): owner is TokenOwner => owner !== null);

    if (owners.length === 0) {
      console.info(
        '[FCM] No FCM tokens found for assigned users. success=0 failure=0',
      );
      return;
    }

    await sendToManyTokens(task, owners);
    return;
  }

  if (assignedToUid) {
    const owner = await readAssignedToken(assignedToUid);
    if (!owner) {
      console.info(
        `[FCM] No FCM token found for assigned user ${assignedToUid}. success=0 failure=0`,
      );
      return;
    }

    await sendToSingleToken(task, owner);
    return;
  }

  const owners = await readMaintenanceTokens();
  if (owners.length === 0) {
    console.info('[FCM] No maintenance FCM tokens found. success=0 failure=0');
    return;
  }

  await sendToManyTokens(task, owners);
}
