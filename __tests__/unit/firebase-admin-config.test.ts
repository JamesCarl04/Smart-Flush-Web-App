import { resolveFirebaseAdminConfig } from '@/lib/firebase-admin-config';

describe('Firebase Admin server configuration', () => {
  it('includes the private storage bucket and normalizes escaped private-key newlines', () => {
    expect(
      resolveFirebaseAdminConfig({
        FIREBASE_ADMIN_PROJECT_ID: 'project-1',
        FIREBASE_ADMIN_CLIENT_EMAIL: 'service@example.com',
        FIREBASE_ADMIN_PRIVATE_KEY: '"line-one\\nline-two"',
        FIREBASE_STORAGE_BUCKET: 'private-bucket.appspot.com',
      }),
    ).toEqual({
      values: {
        projectId: 'project-1',
        clientEmail: 'service@example.com',
        privateKey: 'line-one\nline-two',
        storageBucket: 'private-bucket.appspot.com',
      },
      missing: [],
    });
  });

  it('reports a missing server-only storage bucket as incomplete configuration', () => {
    expect(
      resolveFirebaseAdminConfig({
        FIREBASE_ADMIN_PROJECT_ID: 'project-1',
        FIREBASE_ADMIN_CLIENT_EMAIL: 'service@example.com',
        FIREBASE_ADMIN_PRIVATE_KEY: 'private-key',
      }).missing,
    ).toContain('FIREBASE_STORAGE_BUCKET');
  });
});
