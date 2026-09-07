// scripts/create-maintenance-accounts.mjs
// Usage:
//   node --env-file=.env scripts/create-maintenance-accounts.mjs
//
// Creates or updates 5 maintenance accounts in Firebase Authentication and Firestore.

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
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

if (!getApps().length) {
  initializeApp({
    credential: cert({
      projectId: requiredEnv('FIREBASE_ADMIN_PROJECT_ID'),
      clientEmail: requiredEnv('FIREBASE_ADMIN_CLIENT_EMAIL'),
      privateKey: normalizePrivateKey(requiredEnv('FIREBASE_ADMIN_PRIVATE_KEY')),
    }),
  });
}

const auth = getAuth();
const db = getFirestore();

const MAINTENANCE_ACCOUNTS = [
  {
    name: 'Juan Dela Cruz',
    email: 'juan.delacruz@sdca.edu.ph',
    password: 'maintenance121',
    role: 'maintenance',
    shift: '1st',
    building: 'SDCA Annex Building',
    assignedFloor: '1st Floor',
    floors: ['1F', '1st Floor'],
  },
  {
    name: 'Maria Santos',
    email: 'maria.santos@sdca.edu.ph',
    password: 'maintenance122',
    role: 'maintenance',
    shift: '1st',
    building: 'SDCA Annex Building',
    assignedFloor: '2nd Floor',
    floors: ['2F', '2nd Floor'],
  },
  {
    name: 'Antonio Luna',
    email: 'antonio.luna@sdca.edu.ph',
    password: 'maintenance123',
    role: 'maintenance',
    shift: '1st',
    building: 'SDCA Annex Building',
    assignedFloor: '3rd Floor',
    floors: ['3F', '3rd Floor'],
  },
  {
    name: 'Ramon Bautista',
    email: 'ramon.bautista@sdca.edu.ph',
    password: 'maintenance124',
    role: 'maintenance',
    shift: '1st',
    building: 'SDCA Annex Building',
    assignedFloor: '4th Floor',
    floors: ['4F', '4th Floor'],
  },
  {
    name: 'Carlos Garcia',
    email: 'carlos.garcia@sdca.edu.ph',
    password: 'maintenance125',
    role: 'maintenance',
    shift: '1st',
    building: 'SDCA Annex Building',
    assignedFloor: 'All Floors',
    floors: ['1F', '2F', '3F', '4F', '1st Floor', '2nd Floor', '3rd Floor', '4th Floor'],
  },
];

async function createOrUpdateUser(acc) {
  let userRecord;
  let isNew = false;

  try {
    userRecord = await auth.getUserByEmail(acc.email);
    console.log(`[Auth] User already exists: ${acc.email} (${userRecord.uid}). Updating password & displayName...`);
    userRecord = await auth.updateUser(userRecord.uid, {
      password: acc.password,
      displayName: acc.name,
    });
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.log(`[Auth] Creating new user: ${acc.email}...`);
      userRecord = await auth.createUser({
        email: acc.email,
        password: acc.password,
        displayName: acc.name,
      });
      isNew = true;
    } else {
      throw error;
    }
  }

  const userDocRef = db.collection('users').doc(userRecord.uid);
  const existingDoc = await userDocRef.get();

  const docPayload = {
    id: userRecord.uid,
    email: acc.email,
    displayName: acc.name,
    name: acc.name,
    role: acc.role,
    shift: acc.shift,
    building: acc.building,
    assignedFloor: acc.assignedFloor,
    floors: acc.floors,
    isAvailable: true,
    isOnline: true,
    status: 'online',
    currentTaskId: null,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existingDoc.exists) {
    docPayload.createdAt = FieldValue.serverTimestamp();
  }

  await userDocRef.set(docPayload, { merge: true });
  console.log(`[Firestore] Updated users/${userRecord.uid} profile doc.`);

  return {
    uid: userRecord.uid,
    name: acc.name,
    email: acc.email,
    password: acc.password,
    role: acc.role,
    assignedFloor: acc.assignedFloor,
    status: isNew ? 'Created' : 'Updated',
  };
}

async function main() {
  console.log('====================================================');
  console.log('Starting creation of 5 maintenance accounts...');
  console.log('====================================================\n');

  const results = [];
  for (const account of MAINTENANCE_ACCOUNTS) {
    try {
      const res = await createOrUpdateUser(account);
      results.push(res);
    } catch (err) {
      console.error(`Error processing ${account.email}:`, err);
      process.exit(1);
    }
  }

  console.log('\n====================================================');
  console.log('Maintenance Accounts Provisioning Complete!');
  console.log('====================================================');
  console.table(results);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
