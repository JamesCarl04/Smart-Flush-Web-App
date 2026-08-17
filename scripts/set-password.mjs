import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = {
  projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
  clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!serviceAccount.projectId || !serviceAccount.clientEmail || !serviceAccount.privateKey) {
  console.error('Missing Firebase Admin environment variables.');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}

const adminAuth = getAuth();
const email = process.argv[2];
const newPassword = process.argv[3];

if (!email || !newPassword) {
  console.log('Usage: node --env-file=.env scripts/set-password.mjs <email> <newPassword>');
  process.exit(1);
}

async function setPassword() {
  try {
    const user = await adminAuth.getUserByEmail(email);
    await adminAuth.updateUser(user.uid, {
      password: newPassword,
    });
    console.log(`Successfully updated password for ${email} (UID: ${user.uid})`);
  } catch (error) {
    console.error('Error updating password:', error.message);
    process.exit(1);
  }
}

setPassword();
