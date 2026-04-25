'use client';

import { useEffect, useState } from 'react';
import {
  type User as FirebaseUser,
  updateProfile as firebaseUpdateProfile,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/hooks/useAuth';
import type { NotificationPrefs } from '@/types';

const DEFAULT_PREFS: NotificationPrefs = {
  criticalAlerts: true,
  highPriorityAlerts: true,
  dailySummaryEmail: false,
  weeklyReportEmail: false,
};

interface UpdateProfileArgs {
  displayName: string;
  email: string;
}

interface ChangePasswordArgs {
  currentPassword: string;
  newPassword: string;
}

interface UseProfileReturn {
  user: FirebaseUser | null;
  notifPrefs: NotificationPrefs;
  loading: boolean;
  updateProfile: (args: UpdateProfileArgs) => Promise<void>;
  changePassword: (args: ChangePasswordArgs) => Promise<void>;
  updateNotifications: (prefs: NotificationPrefs) => Promise<void>;
}

export function useProfile(): UseProfileReturn {
  const { user, loading: authLoading } = useAuth();
  const [notifPrefs, setNotifPrefs] =
    useState<NotificationPrefs>(DEFAULT_PREFS);
  const [prefsLoading, setPrefsLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isActive = true;

    const loadNotificationPrefs = async () => {
      setPrefsLoading(true);

      try {
        const docRef = doc(db, 'users', user.uid);
        const snap = await getDoc(docRef);

        if (!isActive || !snap.exists()) {
          return;
        }

        const data = snap.data();
        if (data.notifications) {
          setNotifPrefs(data.notifications as NotificationPrefs);
        }
      } finally {
        if (isActive) {
          setPrefsLoading(false);
        }
      }
    };

    void loadNotificationPrefs();

    return () => {
      isActive = false;
    };
  }, [user]);

  const updateProfile = async ({
    displayName,
    email,
  }: UpdateProfileArgs): Promise<void> => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    await firebaseUpdateProfile(user, { displayName });
    if (email !== user.email) {
      await updateEmail(user, email);
    }

    const docRef = doc(db, 'users', user.uid);
    await setDoc(
      docRef,
      { displayName, email, updatedAt: Date.now() },
      { merge: true },
    );
  };

  const changePassword = async ({
    currentPassword,
    newPassword,
  }: ChangePasswordArgs): Promise<void> => {
    if (!user || !user.email) {
      throw new Error('Not authenticated');
    }

    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword,
    );
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
  };

  const updateNotifications = async (
    prefs: NotificationPrefs,
  ): Promise<void> => {
    if (!user) {
      throw new Error('Not authenticated');
    }

    const docRef = doc(db, 'users', user.uid);
    await updateDoc(docRef, { notifications: prefs });
    setNotifPrefs(prefs);
  };

  return {
    user,
    notifPrefs: user ? notifPrefs : DEFAULT_PREFS,
    loading: authLoading || (user ? prefsLoading : false),
    updateProfile,
    changePassword,
    updateNotifications,
  };
}
