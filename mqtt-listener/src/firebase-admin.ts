// src/firebase-admin.ts
// Firebase Admin SDK singleton for the standalone MQTT listener service.
// Reads credentials from environment variables (set in Railway dashboard).
import * as admin from 'firebase-admin';

function normalizePrivateKey(value: string | undefined): string | undefined {
  let key = value?.trim();
  if (!key) return undefined;

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, '\n');
}

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

if (!projectId || !clientEmail || !privateKey) {
  console.error('[Firebase Admin] Missing one or more required env vars:');
  console.error('  FIREBASE_ADMIN_PROJECT_ID:', projectId ? '✓' : '✗');
  console.error('  FIREBASE_ADMIN_CLIENT_EMAIL:', clientEmail ? '✓' : '✗');
  console.error('  FIREBASE_ADMIN_PRIVATE_KEY:', privateKey ? '✓' : '✗');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
  console.log(`[Firebase Admin] Initialised — project: ${projectId}`);
}

export const adminDb = admin.firestore();
