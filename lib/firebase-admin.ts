// lib/firebase-admin.ts
// Server-side only — never import this from client components
import * as admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(
      /\\n/g,
      '\n',
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
      console.warn(
        '[Firebase Admin] Initialization skipped due to missing environment variables.',
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

export { adminApp, adminDb, adminAuth };
