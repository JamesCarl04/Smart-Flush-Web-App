// scripts/set-admin.mjs
// Run with: node scripts/set-admin.mjs
// Lists all users in Firestore and sets role:'admin' on the one matching TARGET_EMAIL.

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

const TARGET_EMAIL = 'jamescarl.alvarez@sdca.edu.ph'; // ← change if needed

const privateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDkqjEs+OQwNKxd
N8xyQT3HhM5HlCAsYZt7snKJ3mMlkaIPZFM326ZSMVkHZNENOEOHUCDY0DYb+ZT4
nP1M9TIrYDMP/SMJLC+9phwaGtgR/xm9eTXsUupVOjax39jS4UOPqBgPsKTQmdqb
HwczTVxK2Ji/IgHvGZ29bv2bEkNq4d4gcBNZHdPTrE62BCUHg9jKwDX5kzF8mZ0v
aFRCuucNCC55jd+3MhlSlhOo9O9amfkE//v4JgzY4KTppwYefOIZLV9nznRGZwuS
ukN/l9u2NcaLV2mjx8eTmfj40bAAC65mWamO0R7wont9YDqia9xbOhlyHlXYx21Q
pYyDKt5fAgMBAAECggEAZT3HTRKbsY44vIMehX3GVSbDUCTQw+WpejCNjuZEPpeG
ycrRH5ukPaL0uJXWC0TcfTYofOZe9q7f2t1jNyYewt6ybQNWdlK2hoDb02EMRpeM
dXwLuGkTsI14NvQVo3SyPZIeqR+8MVHVXLX1saywTsEsi/+KHKtaUEuqhHSnHdQx
1nKGsvEJpe4uUweJNsjZe+4TXwokrdZSyEKJ2bmY8NYMopB/466n+1xrYzmg7SBp
7wwFp0ohIkuZ8PhfUr7eahv+Ge5tJQQhrzT3mT00Cuc8tUNsT06AHoxf7wuSB5Yd
ggI42o7uOtHtKVtSIjnM3LbLxlbDNapOrg4NbhKnzQKBgQD9GkmNsTs8NIm3xKLa
7lm9mSxJDSui+BdjCHPOuoANShFj6TTWUcmC2MKpw8wMF70M2TgASdGlO9fxrglT
4mu8BZGcf4yY+v6QUf4oCUpSds9RsdT++bg0AUkANSxFghy+bA76Xu5oDdQsUUXZ
65whUp7ivL6NAy+d8o+30x/cawKBgQDnSEpAj+mBA5qFdqntitaZJ8ekBYWxUqOd
d5GLb8CL3QIiB5+QkKgHiFJ6fTdtDd8kERWg9u/ayKsXMkLlbTGZ4/+PdGhrXPiv
PcPA9VqfNeMUILp7wYjy+5ZTeoQPxcLQnwdxwMfP1X7kogRMpZKezSCo1yapkVvv
4mHMMwJC3QKBgEr/6yPNjNv+RYDrB8cQMg94wCK1gGS+V0/FRWvQ3/kQJa8Rf9Ky
UaAwUx6zIlfDAQY5p9qOBU2NOiQniiQNSBdjHw7czPDYD278nO+IMTnWcwCmTZNw
tCDU8KjbGM9QCuxyYM3YK5Ux49luC+DTbGSDcwmFHIH0m7uWEPhL23kZAoGAXDpR
kclRnibnuY0GWjlhNhXM4LVrCLkhkauamHXp3Fw3e4Z6tNVajBZqfXntXkmH0AQY
EeYm46HdyBQ85OxUOT/YK0aKVTXv3UHOC+ZLSu3cLayXcL5OdEarPYK/ouKDu1mP
SGdNxq0mOtn4yO/FthmqimmxezEB7njh8uHsZukCgYEA9KsuV2fjmyIz3tIAzBaI
3KBhBPYwx3WbT6WiPOY/LXw4zYE36xawSxEEsS1Jvpfn7sZql6TH6zrmTxIJhhUG
Z8JO1THpEDVC7gxkzGmH0NoP+Q/o3OjiipvC/lUDJU8mGXFd5YOcww1UBdRQTG1x
RohZLdmmlwuSqEh0FsRswg8=
-----END PRIVATE KEY-----
`;

initializeApp({
  credential: cert({
    projectId: 'smart-flushing-system',
    clientEmail: 'firebase-adminsdk-fbsvc@smart-flushing-system.iam.gserviceaccount.com',
    privateKey,
  }),
});

const db = getFirestore();
const auth = getAuth();

async function run() {
  console.log('\n🔍 Listing all users in Firebase Auth...\n');

  // List all Firebase Auth users
  const listResult = await auth.listUsers();
  const allUsers = listResult.users;

  if (allUsers.length === 0) {
    console.log('❌ No users found in Firebase Auth.');
    process.exit(1);
  }

  console.log('Found users:');
  for (const u of allUsers) {
    const doc = await db.collection('users').doc(u.uid).get();
    const role = doc.exists ? (doc.data()?.role ?? 'no role set') : 'no Firestore doc';
    console.log(`  • ${u.email}  (uid: ${u.uid})  role: ${role}`);
  }

  // Find the target user
  const target = allUsers.find(
    (u) => u.email?.toLowerCase() === TARGET_EMAIL.toLowerCase(),
  );

  if (!target) {
    console.log(`\n❌ Email "${TARGET_EMAIL}" not found in Firebase Auth.`);
    console.log('   Update TARGET_EMAIL at the top of this script and re-run.\n');
    process.exit(1);
  }

  console.log(`\n✅ Found target user: ${target.email} (${target.uid})`);
  console.log('   Setting role to "admin" in Firestore...');

  await db.collection('users').doc(target.uid).set(
    { role: 'admin' },
    { merge: true },
  );

  console.log(`\n🎉 Done! ${target.email} is now an admin.\n`);
  process.exit(0);
}

run().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
