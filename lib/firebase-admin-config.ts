export interface FirebaseAdminEnvironment {
  [key: string]: string | undefined;
  FIREBASE_ADMIN_PROJECT_ID?: string;
  FIREBASE_ADMIN_CLIENT_EMAIL?: string;
  FIREBASE_ADMIN_PRIVATE_KEY?: string;
  FIREBASE_STORAGE_BUCKET?: string;
}

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

export function resolveFirebaseAdminConfig(env: FirebaseAdminEnvironment): {
  values: {
    projectId?: string;
    clientEmail?: string;
    privateKey?: string;
    storageBucket?: string;
  };
  missing: string[];
} {
  const values = {
    projectId: env.FIREBASE_ADMIN_PROJECT_ID?.trim() || undefined,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() || undefined,
    privateKey: normalizePrivateKey(env.FIREBASE_ADMIN_PRIVATE_KEY),
    storageBucket: env.FIREBASE_STORAGE_BUCKET?.trim() || undefined,
  };
  const missing = [
    !values.projectId && 'FIREBASE_ADMIN_PROJECT_ID',
    !values.clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
    !values.privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
    !values.storageBucket && 'FIREBASE_STORAGE_BUCKET',
  ].filter((name): name is string => typeof name === 'string');

  return { values, missing };
}
