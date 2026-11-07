import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  updateProfile,
  signInAnonymously,
  signOut as fbSignOut,
  onAuthStateChanged,
  type User
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  getDocFromServer,
  collection,
  getDocs,
  query,
  orderBy,
  where,
  limit,
  deleteDoc,
  type Unsubscribe
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase
export const app = initializeApp(firebaseConfig);

// CRITICAL: The app will break without firebaseConfig.firestoreDatabaseId
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Fast test connection on boot with timeout
export async function testConnection(): Promise<boolean> {
  try {
    const fetchPromise = getDoc(doc(db, 'test', 'connection'));
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000));
    await Promise.race([fetchPromise, timeoutPromise]);
    return true;
  } catch (error) {
    console.warn("Firebase client connection notice:", error);
    return false;
  }
}

// Sign in with Google. If the browser blocks popups, safely fall back to redirect.
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    const code = error?.code || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return null;
    }
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, googleProvider);
      return null;
    }
    console.error('Google Sign-in Error:', error);
    throw error;
  }
}

export async function getGoogleRedirectResult(): Promise<User | null> {
  const result = await getRedirectResult(auth);
  return result?.user || null;
}

export async function createEmailAccount(email: string, password: string, displayName: string): Promise<User> {
  const credential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  if (displayName.trim()) await updateProfile(credential.user, { displayName: displayName.trim() });
  return credential.user;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  return credential.user;
}

export async function getEmailSignInMethods(email: string): Promise<string[]> {
  return fetchSignInMethodsForEmail(auth, email.trim().toLowerCase());
}


export async function signInAnonymouslyUser(): Promise<User | null> {
  try {
    if (auth.currentUser) return auth.currentUser;
    const cred = await signInAnonymously(auth);
    return cred.user;
  } catch (error) {
    console.warn('Anonymous sign-in notice (will use local fallback):', error);
    return null;
  }
}

// Sign out
export async function signOutUser(): Promise<void> {
  try {
    await fbSignOut(auth);
  } catch (error) {
    console.error('Sign-out Error:', error);
    throw error;
  }
}

// User Profile Interface
export interface UserProfileData {
  id: string;
  displayName: string;
  username?: string;
  email: string;
  authUid?: string;
  avatarDataUrl?: string | null;
  bannerDataUrl?: string | null;
  stardust: number;
  streak: number;
  level?: number;
  xp?: number;
  title?: string;
  role?: string;
  staffRole?: string;
  isAdmin?: boolean;
  isOwner?: boolean;
  equippedBorder?: string;
  equippedFrame?: string;
  equippedNameGlow?: string | null;
  equippedChatBadge?: string | null;
  inventory?: string[];
  bio?: string;
  friends?: string[];
  incomingRequests?: string[];
  outgoingRequests?: string[];
  isBanned?: boolean;
  bannedReason?: string;
  appealMessage?: string;
  appealStatus?: string;
  mutedUntil?: number;
  ipSessionLog?: string;
  lastClaimedDate?: string;
  createdAt?: string;
  updatedAt?: string;
}

function buildPublicProfile(uid: string, profile: any): Record<string, any> {
  return {
    id: uid,
    authUid: uid,
    username: String(profile.username || profile.displayName || 'Voyager').slice(0, 24),
    displayName: String(profile.displayName || profile.username || 'Voyager').slice(0, 80),
    avatarDataUrl: profile.avatarDataUrl || null,
    equippedFrame: profile.equippedFrame || 'galaxy',
    equippedNameGlow: profile.equippedNameGlow || null,
    equippedChatBadge: profile.equippedChatBadge || null,
    level: Number(profile.level) || 1,
    title: String(profile.title || 'Novice Voyager').slice(0, 80),
    updatedAt: new Date().toISOString()
  };
}

async function writePublicProfile(uid: string, profile: any): Promise<void> {
  await setDoc(doc(db, 'publicProfiles', uid), buildPublicProfile(uid, profile), { merge: true });
}

// Store profiles under immutable Firebase Auth UIDs, not editable usernames.
export async function syncUserProfile(user: User): Promise<UserProfileData> {
  const uid = user.uid;
  const isOwner = !user.isAnonymous && !!user.emailVerified &&
    (user.email || '').trim().toLowerCase() === 'jaydentorru4@gmail.com';
  const fallbackName = isOwner ? 'JaydenTorru' : 'Voyager';
  const cleanUsername = (user.displayName || fallbackName).replace(/\s+/g, '').slice(0, 24);
  const userRef = doc(db, 'users', uid);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const existingProfile = { ...(snap.data() as UserProfileData), id: uid, authUid: uid };
      await writePublicProfile(uid, existingProfile);
      return existingProfile;
    }

    // Profile migration from legacy username-keyed localStorage data happens
    // in the application after this secure UID identity is established.
    const legacyProfile: Partial<UserProfileData> = {};

    const profile: UserProfileData = {
      ...legacyProfile,
      id: uid,
      authUid: uid,
      displayName: user.displayName || legacyProfile.displayName || cleanUsername,
      username: legacyProfile.username || cleanUsername,
      email: user.email || '',
      avatarDataUrl: user.photoURL || legacyProfile.avatarDataUrl || null,
      stardust: isOwner ? Math.max(Number(legacyProfile.stardust) || 0, 999999) : (Number(legacyProfile.stardust) || 100),
      streak: isOwner ? Math.max(Number(legacyProfile.streak) || 0, 99) : (Number(legacyProfile.streak) || 1),
      level: isOwner ? Math.max(Number(legacyProfile.level) || 0, 999) : (Number(legacyProfile.level) || 1),
      xp: isOwner ? Math.max(Number(legacyProfile.xp) || 0, 99900) : (Number(legacyProfile.xp) || 0),
      title: isOwner ? 'System Administrator / Owner' : (legacyProfile.title || 'Novice Voyager'),
      equippedBorder: legacyProfile.equippedBorder || (isOwner ? 'void' : 'Standard Voyager Frame'),
      equippedFrame: legacyProfile.equippedFrame || (isOwner ? 'void' : 'galaxy'),
      equippedNameGlow: legacyProfile.equippedNameGlow || null,
      equippedChatBadge: legacyProfile.equippedChatBadge || null,
      bio: legacyProfile.bio || 'Stargazing through infinite space, collecting rare celestial soundtracks, and indexing anime classics.',
      inventory: Array.isArray(legacyProfile.inventory) ? legacyProfile.inventory : ['frame_galaxy', 'theme_violet', 'audio_coin'],
      friends: Array.isArray(legacyProfile.friends) ? legacyProfile.friends : [],
      incomingRequests: [],
      outgoingRequests: [],
      createdAt: legacyProfile.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    if (isOwner) {
      profile.staffRole = 'owner';
      profile.role = 'owner';
      profile.isAdmin = true;
      profile.isOwner = true;
    } else {
      // Old username-keyed documents were writable by any visitor under the
      // former Firestore rules. Never carry their unverified privilege flags.
      profile.staffRole = '';
      profile.role = '';
      profile.isAdmin = false;
      profile.isOwner = false;
      profile.isBanned = false;
      profile.bannedReason = '';
      profile.mutedUntil = 0;
    }
    await setDoc(userRef, profile, { merge: true });
    await writePublicProfile(uid, profile);
    return profile;
  } catch (error) {
    console.warn('Sync profile notice:', error);
    return {
      id: uid,
      authUid: uid,
      displayName: user.displayName || cleanUsername,
      username: cleanUsername,
      email: user.email || '',
      stardust: isOwner ? 999999 : 100,
      streak: isOwner ? 99 : 1,
      level: isOwner ? 999 : 1,
      ...(isOwner ? { staffRole: 'owner', role: 'owner', isAdmin: true, isOwner: true } : {})
    };
  }
}

// Save the signed-in user's own profile, or another profile only for the verified owner.
export async function saveUserToFirestore(userData: any): Promise<void> {
  try {
    const currentUser = auth.currentUser;
    const targetUid = String(userData?.authUid || userData?.uid || '');
    if (!currentUser || !targetUid) return;

    const isVerifiedOwner = !currentUser.isAnonymous && !!currentUser.emailVerified &&
      (currentUser.email || '').trim().toLowerCase() === 'jaydentorru4@gmail.com';
    const isSelf = targetUid === currentUser.uid;

    // Staff updates must touch only fields their Firestore role allows.
    if (!isSelf && !isVerifiedOwner) {
      const callerProfile = await getDoc(doc(db, 'users', currentUser.uid));
      const callerRole = String(callerProfile.data()?.staffRole || '').toLowerCase();
      if (!['admin', 'moderator'].includes(callerRole)) return;

      const isModerationChange = Object.prototype.hasOwnProperty.call(userData, 'isBanned') ||
        Object.prototype.hasOwnProperty.call(userData, 'mutedUntil') ||
        Object.prototype.hasOwnProperty.call(userData, 'bannedReason');

      if (isModerationChange) {
        await updateDoc(doc(db, 'users', targetUid), {
          isBanned: !!userData.isBanned,
          bannedReason: userData.bannedReason || '',
          mutedUntil: userData.mutedUntil || 0,
          updatedAt: new Date().toISOString()
        });
      } else {
        if (callerRole !== 'admin') return;
        const adminChanges = {
          stardust: typeof userData.stardust === 'number' ? userData.stardust : 0,
          level: userData.level || 1,
          xp: userData.xp || 0,
          title: userData.title || 'Novice Voyager',
          inventory: Array.isArray(userData.inventory) ? userData.inventory : [],
          updatedAt: new Date().toISOString()
        };
        await updateDoc(doc(db, 'users', targetUid), adminChanges);
        await updateDoc(doc(db, 'publicProfiles', targetUid), {
          level: adminChanges.level,
          title: adminChanges.title,
          updatedAt: adminChanges.updatedAt
        });
      }
      return;
    }

    const username = String(userData.username || userData.displayName || 'Voyager').trim().slice(0, 24);
    const payload: Record<string, any> = {
      id: targetUid,
      authUid: targetUid,
      displayName: String(userData.displayName || username).slice(0, 80),
      username,
      email: currentUser.email || '',
      avatarDataUrl: userData.avatarDataUrl || userData.photoURL || null,
      bannerDataUrl: userData.bannerDataUrl || null,
      stardust: typeof userData.stardust === 'number' ? userData.stardust : 0,
      streak: typeof userData.streakDays === 'number' ? userData.streakDays : (userData.streak || 0),
      level: userData.level || 1,
      xp: userData.xp || 0,
      title: userData.title || 'Novice Voyager',
      equippedBorder: userData.equippedFrame || 'galaxy',
      equippedFrame: userData.equippedFrame || 'galaxy',
      equippedNameGlow: userData.equippedNameGlow || null,
      equippedChatBadge: userData.equippedChatBadge || null,
      inventory: Array.isArray(userData.inventory) ? userData.inventory : ['frame_galaxy', 'theme_violet', 'audio_coin'],
      bio: String(userData.bio || '').slice(0, 500),
      friends: Array.isArray(userData.friends) ? userData.friends : [],
      lastClaimedDate: userData.lastClaimedDate || '',
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    if (isVerifiedOwner) {
      Object.assign(payload, {
        role: userData.role || userData.staffRole || '',
        staffRole: userData.staffRole || userData.role || '',
        isAdmin: !!userData.isAdmin,
        isOwner: isSelf,
        isBanned: !!userData.isBanned,
        bannedReason: userData.bannedReason || '',
        mutedUntil: userData.mutedUntil || 0,
        appealMessage: userData.appealMessage || '',
        appealStatus: userData.appealStatus || '',
        ipSessionLog: userData.ipSessionLog || 'Web Session • Active'
      });
    }

    await setDoc(doc(db, 'users', targetUid), payload, { merge: true });
    await writePublicProfile(targetUid, payload);
  } catch (error) {
    console.warn('saveUserToFirestore notice:', error);
  }
}

// Read the public directory for members; trusted staff can read the private registry.
export async function fetchAllUsers(): Promise<UserProfileData[]> {
  try {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) return [];

    const isOwner = !!currentUser.emailVerified &&
      (currentUser.email || '').trim().toLowerCase() === 'jaydentorru4@gmail.com';
    let staffRole = '';
    if (!isOwner) {
      const ownProfile = await getDoc(doc(db, 'users', currentUser.uid));
      staffRole = String(ownProfile.data()?.staffRole || '').toLowerCase();
    }

    const canReadRegistry = isOwner || ['admin', 'developer', 'tester', 'moderator'].includes(staffRole);
    const sourceCollection = canReadRegistry ? 'users' : 'publicProfiles';
    const snap = await getDocs(collection(db, sourceCollection));
    const profiles: UserProfileData[] = [];
    snap.forEach((item) => {
      const data = item.data() as UserProfileData;
      if (data.authUid && data.username) profiles.push({ ...data, id: item.id, authUid: data.authUid });
    });
    return profiles;
  } catch (error) {
    console.warn('fetchAllUsers notice:', error);
    return [];
  }
}

export async function updateUserProfile(userId: string, data: Partial<UserProfileData>): Promise<void> {
  const userRef = doc(db, 'users', userId);
  try {
    await updateDoc(userRef, {
      ...data,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.warn(`updateUserProfile notice for users/${userId}:`, error);
  }
}

// Listen to real-time updates for single user profile
export function subscribeToUserProfile(userId: string, onUpdate: (data: UserProfileData) => void): Unsubscribe {
  const userRef = doc(db, 'users', userId);
  return onSnapshot(userRef, (docSnap) => {
    if (docSnap.exists()) {
      onUpdate(docSnap.data() as UserProfileData);
    }
  }, (error) => {
    console.warn(`subscribeToUserProfile notice for users/${userId}:`, error);
  });
}

// Listen to real-time updates for ALL users across devices & browsers
export function subscribeToAllUsers(onUpdate: (users: UserProfileData[]) => void): Unsubscribe {
  return onSnapshot(collection(db, 'publicProfiles'), (snap) => {
    const users: UserProfileData[] = [];
    snap.forEach((item) => {
      const data = item.data() as UserProfileData;
      if (data.authUid && data.username) users.push({ ...data, id: item.id, authUid: data.authUid });
    });
    onUpdate(users);
  }, (error) => {
    console.warn('subscribeToAllUsers notice:', error);
  });
}

// Listen to real-time updates for Global Chat across devices & browsers
export function subscribeToGlobalChat(onUpdate: (messages: any[]) => void): Unsubscribe {
  // Keep a bounded live window so chat snapshots do not download the entire
  // conversation history every time a new message arrives.
  const chatCol = query(
    collection(db, 'globalChat'),
    orderBy('time', 'desc'),
    limit(100)
  );
  return onSnapshot(chatCol, (snap) => {
    const msgs: any[] = [];
    snap.forEach((d) => {
      msgs.push({ id: d.id, ...d.data() });
    });
    msgs.reverse();
    onUpdate(msgs);
  }, (error) => {
    console.warn('subscribeToGlobalChat notice:', error);
  });
}

// Send real-time Global Chat message to Firestore
export async function sendFirestoreChatMessage(msgData: any): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in is required to send a global chat message.');
  const msgId = msgData.id || `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'globalChat', msgId), {
    ...msgData,
    id: msgId,
    senderUid: currentUser.uid,
    time: Number(msgData.time) || Date.now()
  });
}

// Purge all Global Chat messages from Firestore
export async function purgeFirestoreChat(): Promise<void> {
  try {
    const chatCol = collection(db, 'globalChat');
    const snap = await getDocs(chatCol);
    const deleteDocModule = await import('firebase/firestore');
    const promises = snap.docs.map(d => deleteDocModule.deleteDoc(d.ref));
    await Promise.all(promises);
  } catch (error) {
    console.warn('purgeFirestoreChat notice:', error);
  }
}

// Listen to one authenticated direct-message thread across devices.
export function subscribeToDirectMessages(threadKey: string, onUpdate: (messages: any[]) => void): Unsubscribe {
  const currentUser = auth.currentUser;
  if (!currentUser || !threadKey) return () => undefined;
  const messagesQuery = query(
    collection(db, 'directMessages'),
    where('threadKey', '==', threadKey),
    where('participantUids', 'array-contains', currentUser.uid),
    limit(100)
  );
  return onSnapshot(messagesQuery, (snap) => {
    const messages = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a: any, b: any) => (a.time || 0) - (b.time || 0));
    onUpdate(messages);
  }, (error) => {
    console.warn('subscribeToDirectMessages notice:', error);
  });
}

export async function sendFirestoreDirectMessage(dmData: any): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in is required to send a direct message.');
  const participants = Array.isArray(dmData.participantUids)
    ? dmData.participantUids.filter((uid: unknown) => typeof uid === 'string')
    : [];
  if (!participants.includes(currentUser.uid) || participants.length !== 2) {
    throw new Error('This direct-message thread does not belong to the signed-in account.');
  }
  const msgId = dmData.id || `dm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await setDoc(doc(db, 'directMessages', msgId), {
    ...dmData,
    id: msgId,
    senderUid: currentUser.uid,
    participantUids: participants,
    timestamp: Date.now(),
    time: Date.now()
  });
}

export async function sendFirestoreFriendRequest(requestData: any): Promise<string> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('Sign in is required to add friends.');
  if (requestData.senderUid !== currentUser.uid || !requestData.recipientUid ||
      requestData.recipientUid === currentUser.uid) throw new Error('Invalid friend-request participants.');

  const pendingQuery = query(
    collection(db, 'friendRequests'),
    where('participantUids', 'array-contains', currentUser.uid),
    where('senderUid', '==', currentUser.uid),
    where('recipientUid', '==', requestData.recipientUid),
    where('status', '==', 'pending'),
    limit(1)
  );
  const pending = await getDocs(pendingQuery);
  if (!pending.empty) throw new Error('A friend request is already pending.');

  const requestId = `fr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  await setDoc(doc(db, 'friendRequests', requestId), {
    id: requestId,
    senderUid: currentUser.uid,
    recipientUid: requestData.recipientUid,
    senderUsername: requestData.senderUsername,
    recipientUsername: requestData.recipientUsername,
    participantUids: [currentUser.uid, requestData.recipientUid],
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return requestId;
}

export async function setFirestoreFriendRequestStatus(requestId: string, status: 'accepted' | 'declined'): Promise<void> {
  if (!auth.currentUser) throw new Error('Sign in is required to respond to friend requests.');
  if (!['accepted', 'declined'].includes(status)) throw new Error('Invalid friend-request response.');
  await updateDoc(doc(db, 'friendRequests', requestId), { status, updatedAt: Date.now() });
}

export function subscribeToFriendActivity(uid: string, onUpdate: (requests: any[]) => void): Unsubscribe {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return () => undefined;
  const activityQuery = query(
    collection(db, 'friendRequests'),
    where('participantUids', 'array-contains', uid),
    limit(100)
  );
  return onSnapshot(activityQuery, (snap) => {
    onUpdate(snap.docs.map(item => ({ id: item.id, ...item.data() })));
  }, (error) => console.warn('subscribeToFriendActivity notice:', error));
}

export async function createFirestoreFriendship(friendshipData: any): Promise<void> {
  const currentUser = auth.currentUser;
  const memberUids = Array.isArray(friendshipData.memberUids) ? friendshipData.memberUids : [];
  const memberUsernames = Array.isArray(friendshipData.memberUsernames) ? friendshipData.memberUsernames : [];
  if (!currentUser || !memberUids.includes(currentUser.uid) || memberUids.length !== 2 || !friendshipData.requestId) {
    throw new Error('Invalid friendship participants or accepted request.');
  }

  const orderedMembers = memberUids
    .map((uid: string, index: number) => ({ uid, username: String(memberUsernames[index] || '') }))
    .sort((a: any, b: any) => a.uid.localeCompare(b.uid));
  const sortedUids = orderedMembers.map((member: any) => member.uid);
  const friendshipId = sortedUids.join('_');

  await setDoc(doc(db, 'friendships', friendshipId), {
    id: friendshipId,
    memberUids: sortedUids,
    memberUsernames: orderedMembers.map((member: any) => member.username),
    requestId: friendshipData.requestId,
    createdAt: Date.now()
  });
}

export function subscribeToFriendships(uid: string, onUpdate: (friendships: any[]) => void): Unsubscribe {
  if (!auth.currentUser || auth.currentUser.uid !== uid) return () => undefined;
  const friendshipsQuery = query(
    collection(db, 'friendships'),
    where('memberUids', 'array-contains', uid),
    limit(100)
  );
  return onSnapshot(friendshipsQuery, (snap) => {
    onUpdate(snap.docs.map(item => ({ id: item.id, ...item.data() })));
  }, (error) => console.warn('subscribeToFriendships notice:', error));
}

export async function deleteFirestoreFriendship(friendUid: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !friendUid) throw new Error('Sign in is required to remove friends.');
  await deleteDoc(doc(db, 'friendships', [currentUser.uid, friendUid].sort().join('_')));
}


export function subscribeToAdminConfig(onUpdate: (config: any) => void): Unsubscribe {
  const configRef = doc(db, 'adminConfig', 'main');
  return onSnapshot(configRef, (docSnap) => {
    if (docSnap.exists()) {
      onUpdate(docSnap.data());
    }
  }, (error) => {
    console.warn('subscribeToAdminConfig notice:', error);
  });
}

// Save Admin Platform Config to Firestore
export async function saveAdminConfigToFirestore(cfg: any): Promise<void> {
  try {
    const configRef = doc(db, 'adminConfig', 'main');
    await setDoc(configRef, cfg, { merge: true });
  } catch (error) {
    console.warn('saveAdminConfigToFirestore notice:', error);
  }
}

