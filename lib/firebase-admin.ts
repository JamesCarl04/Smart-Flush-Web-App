// lib/firebase-admin.ts
// Server-side only — never import this from client components
import * as admin from 'firebase-admin';
import { resolveFirebaseAdminConfig } from '@/lib/firebase-admin-config';

if (!admin.apps.length) {
  try {
    const { values, missing } = resolveFirebaseAdminConfig(process.env);
    const { projectId, clientEmail, privateKey, storageBucket } = values;

    if (projectId && clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
        ...(storageBucket ? { storageBucket } : {}),
      });
      if (!storageBucket) {
        console.error(
          '[Firebase Admin] Storage configuration is incomplete. Missing: FIREBASE_STORAGE_BUCKET.',
        );
      }
    } else {
      console.error(
        `[Firebase Admin] Server configuration is incomplete. Missing: ${missing.join(', ')}. ` +
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
const adminStorage =
  admin.apps.length > 0
    ? admin.storage()
    : ({} as admin.storage.Storage);

export { adminApp, adminDb, adminAuth, adminMessaging, adminStorage };
