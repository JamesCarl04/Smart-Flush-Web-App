// lib/firebase-admin.ts
// Server-side only — never import this from client components
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

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = normalizePrivateKey(
      process.env.FIREBASE_ADMIN_PRIVATE_KEY,
    );

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    } else {
      const missing = [
        !projectId && 'FIREBASE_ADMIN_PROJECT_ID',
        !clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
        !privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
      ].filter(Boolean).join(', ');
      console.error(
        `[Firebase Admin] Server configuration is incomplete. Missing: ${missing}. ` +
          'Add these variables to the linked Vercel project for Production and Preview environments, then redeploy.',
      );
    }
  } catch (error) {
    console.error('[Firebase Admin] Initialization error:', error);
  }
}

const adminApp = admin.apps.length > 0 ? admin.app() : ({} as admin.app.App);
const adminDb =
  admin.apps.length > 0 ? admin.firestore() : ({} as admin.firestore.Firestore);
const adminAuth =
  admin.apps.length > 0 ? admin.auth() : ({} as admin.auth.Auth);
const adminMessaging =
  admin.apps.length > 0
    ? admin.messaging()
    : ({} as admin.messaging.Messaging);

export { adminApp, adminDb, adminAuth, adminMessaging };
