// scripts/set-admin.mjs
// Usage:
//   TARGET_EMAIL=user@example.com node scripts/set-admin.mjs
//   node scripts/set-admin.mjs user@example.com
//
// Required environment variables:
//   FIREBASE_ADMIN_PROJECT_ID
//   FIREBASE_ADMIN_CLIENT_EMAIL
//   FIREBASE_ADMIN_PRIVATE_KEY

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizePrivateKey(value) {
  let key = value.trim();
  if (
    (key.startsWith('"') && key.endsWith('"')) ||
    (key.startsWith("'") && key.endsWith("'"))
  ) {
    key = key.slice(1, -1);
  }

  return key.replace(/\\n/g, '\n');
}

const targetEmail = process.env.TARGET_EMAIL ?? process.argv[2];
if (!targetEmail) {
  throw new Error('Set TARGET_EMAIL or pass the target email as the first argument');
}

initializeApp({
  credential: cert({
    projectId: requiredEnv('FIREBASE_ADMIN_PROJECT_ID'),
    clientEmail: requiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
    privateKey: normalizePrivateKey(requiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')),
  }),
});

const db = getFirestore();
const auth = getAuth();

function isQuotaError(error) {
  if (!error || typeof error !== 'object') {
    const text = String(error);
    return text.includes('RESOURCE_EXHAUSTED') || text.includes('Quota exceeded');
  }

  const code = error.code;
  const message = typeof error.message === 'string' ? error.message : '';
  return (
    code === 8 ||
    code === 'resource-exhausted' ||
    message.includes('RESOURCE_EXHAUSTED') ||
    message.includes('Quota exceeded')
  );
}

async function run() {
  console.log('\nListing all users in Firebase Auth...\n');

  const listResult = await auth.listUsers();
  const allUsers = listResult.users;

  if (allUsers.length === 0) {
    console.log('No users found in Firebase Auth.');
    process.exit(1);
  }

  console.log('Found users:');
  let firestoreReadsUnavailable = false;
  for (const user of allUsers) {
    let firestoreRole = 'skipped (Firestore quota exhausted)';
    if (!firestoreReadsUnavailable) {
      try {
        const doc = await db.collection('users').doc(user.uid).get();
        firestoreRole = doc.exists
          ? (doc.data()?.role ?? 'no role set')
          : 'no Firestore doc';
      } catch (error) {
        if (isQuotaError(error)) {
          firestoreReadsUnavailable = true;
          firestoreRole = 'skipped (Firestore quota exhausted)';
        } else {
          throw error;
        }
      }
    }
    const claimRole = user.customClaims?.role ?? 'none';
    console.log(
      `  - ${user.email} (uid: ${user.uid}) claimRole: ${claimRole}, firestoreRole: ${firestoreRole}`,
    );
  }

  const target = allUsers.find(
    (user) => user.email?.toLowerCase() === targetEmail.toLowerCase(),
  );

  if (!target) {
    console.log(`\nEmail "${targetEmail}" not found in Firebase Auth.`);
    process.exit(1);
  }

  console.log(`\nFound target user: ${target.email} (${target.uid})`);
  console.log('Setting custom claim { role: "admin" } in Firebase Auth...');
  await auth.setCustomUserClaims(target.uid, {
    ...(target.customClaims ?? {}),
    role: 'admin',
  });

  console.log('Setting role to "admin" in Firestore...');
  try {
    await db.collection('users').doc(target.uid).set({ role: 'admin' }, { merge: true });
  } catch (error) {
    if (isQuotaError(error)) {
      console.warn(
        `Warning: Firestore quota exhausted while writing users/${target.uid}; Firebase Auth custom claim { role: "admin" } was still set.`,
      );
    } else {
      throw error;
    }
  }

  console.log(`\nDone. ${target.email} is now an admin.\n`);
  process.exit(0);
}

run().catch((error) => {
  console.error('Script error:', error);
  process.exit(1);
});
