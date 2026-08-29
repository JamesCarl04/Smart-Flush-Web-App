export interface FirebaseAdminEnvironment {
  [key: string]: string | undefined;
  FIREBASE_ADMIN_PROJECT_ID?: string;
  FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  FIREBASE_ADMIN_CLIENT_EMAIL?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_ADMIN_PRIVATE_KEY?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
}

export function normalizePrivateKey(value: string | undefined): string | undefined {
  let key = value?.trim();
  if (!key) return undefined;

  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
}

export function normalizeStorageBucket(value: string | undefined): string | undefined {
  let bucket = value?.trim();
  if (!bucket) return undefined;

  // Strip gs:// prefix if user copied directly from Firebase Console storage overview
  if (bucket.startsWith('gs://')) {
    bucket = bucket.slice(5);
  }
  // Strip http:// or https:// if pasted from a URL
  bucket = bucket.replace(/^https?:\/\//, '');
  // Strip trailing slashes
  bucket = bucket.replace(/\/+$/, '');

  return bucket || undefined;
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
  const projectId =
    env.FIREBASE_ADMIN_PROJECT_ID?.trim() ||
    env.FIREBASE_PROJECT_ID?.trim() ||
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim() ||
    undefined;

  const clientEmail =
    env.FIREBASE_ADMIN_CLIENT_EMAIL?.trim() ||
    env.FIREBASE_CLIENT_EMAIL?.trim() ||
    undefined;

  const privateKey = normalizePrivateKey(
    env.FIREBASE_ADMIN_PRIVATE_KEY || env.FIREBASE_PRIVATE_KEY,
  );

  const rawBucket =
    env.FIREBASE_STORAGE_BUCKET?.trim() ||
    env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim() ||
    undefined;

  const storageBucket = normalizeStorageBucket(rawBucket);

  const values = {
    projectId,
    clientEmail,
    privateKey,
    storageBucket,
  };

  const missing = [
    !values.projectId && 'FIREBASE_ADMIN_PROJECT_ID',
    !values.clientEmail && 'FIREBASE_ADMIN_CLIENT_EMAIL',
    !values.privateKey && 'FIREBASE_ADMIN_PRIVATE_KEY',
    !values.storageBucket && 'FIREBASE_STORAGE_BUCKET',
  ].filter((name): name is string => typeof name === 'string');

  return { values, missing };
}
