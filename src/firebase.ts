import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
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
  limit,
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

// Sign in with Google Popup
export async function signInWithGoogle(): Promise<User | null> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error: any) {
    if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
      console.log('Google Sign-in popup closed by user.');
      return null;
    }
    console.error('Google Sign-in Error:', error);
    throw error;
  }
}

// Sign in anonymously for local accounts to link with Firestore
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

// Sync or initialize user profile in Firestore
export async function syncUserProfile(user: User): Promise<UserProfileData> {
  const isOwner = (user.email || '').trim().toLowerCase() === 'jaydentorru4@gmail.com';
  const cleanUsername = (user.displayName || (isOwner ? 'JaydenTorru' : 'Voyager')).replace(/\s+/g, '');
  const userRef = doc(db, 'users', cleanUsername.toLowerCase());
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfileData;
    } else {
      const newProfile: UserProfileData = {
        id: cleanUsername.toLowerCase(),
        displayName: user.displayName || (isOwner ? 'JaydenTorru' : 'Starlight Voyager'),
        username: cleanUsername,
        email: user.email || '',
        avatarDataUrl: user.photoURL || null,
        stardust: isOwner ? 999999 : 100,
        streak: isOwner ? 99 : 1,
        level: isOwner ? 999 : 1,
        xp: isOwner ? 99900 : 0,
        title: isOwner ? 'System Administrator / Owner' : 'Novice Voyager',
        staffRole: isOwner ? 'owner' : '',
        isAdmin: isOwner,
        isOwner: isOwner,
        lastClaimedDate: '',
        equippedBorder: isOwner ? 'void' : 'Standard Voyager Frame',
        equippedFrame: isOwner ? 'void' : 'galaxy',
        bio: isOwner ? 'System Administrator & Soranix Platform Owner.' : 'Stargazing through infinite space, collecting rare celestial soundtracks, and indexing deep universe cyberpunk archives.',
        inventory: ['frame_galaxy', 'theme_violet', 'audio_coin'],
        friends: [],
        incomingRequests: [],
        outgoingRequests: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userRef, newProfile, { merge: true });
      return newProfile;
    }
  } catch (error) {
    console.warn('Sync profile notice:', error);
    return {
      id: cleanUsername.toLowerCase(),
      displayName: user.displayName || 'Voyager',
      username: cleanUsername,
      email: user.email || '',
      stardust: 100,
      streak: 1
    };
  }
}

// Save any user profile to Firestore so all users and admins sync across all devices
export async function saveUserToFirestore(userData: any): Promise<void> {
  try {
    const cleanUsername = (userData.username || userData.displayName || 'user').trim().toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docId = cleanUsername;
    const userRef = doc(db, 'users', docId);

    const payload: UserProfileData = {
      id: docId,
      displayName: userData.displayName || userData.username || 'Voyager',
      username: userData.username || userData.displayName || 'Voyager',
      email: userData.email || '',
      avatarDataUrl: userData.avatarDataUrl || userData.photoURL || null,
      bannerDataUrl: userData.bannerDataUrl || null,
      stardust: typeof userData.stardust === 'number' ? userData.stardust : 0,
      streak: typeof userData.streakDays === 'number' ? userData.streakDays : (userData.streak || 0),
      level: userData.level || 1,
      xp: userData.xp || 0,
      title: userData.title || 'Novice Voyager',
      role: userData.role || userData.staffRole || '',
      staffRole: userData.staffRole || userData.role || '',
      isAdmin: !!userData.isAdmin,
      isOwner: !!userData.isOwner,
      equippedBorder: userData.equippedFrame || 'galaxy',
      equippedFrame: userData.equippedFrame || 'galaxy',
      equippedNameGlow: userData.equippedNameGlow || null,
      equippedChatBadge: userData.equippedChatBadge || null,
      inventory: Array.isArray(userData.inventory) ? userData.inventory : ['frame_galaxy', 'theme_violet', 'audio_coin'],
      bio: (userData.bio || '').slice(0, 500),
      friends: Array.isArray(userData.friends) ? userData.friends : [],
      incomingRequests: Array.isArray(userData.incomingRequests) ? userData.incomingRequests : [],
      outgoingRequests: Array.isArray(userData.outgoingRequests) ? userData.outgoingRequests : [],
      isBanned: !!userData.isBanned,
      bannedReason: userData.bannedReason || '',
      appealMessage: userData.appealMessage || '',
      appealStatus: userData.appealStatus || '',
      mutedUntil: userData.mutedUntil || 0,
      ipSessionLog: userData.ipSessionLog || 'Web Session • Active',
      createdAt: userData.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await setDoc(userRef, payload, { merge: true });
  } catch (error) {
    console.warn('saveUserToFirestore notice:', error);
  }
}

// Fetch all registered users from Firestore
export async function fetchAllUsers(): Promise<UserProfileData[]> {
  try {
    const usersCol = collection(db, 'users');
    const snap = await getDocs(usersCol);
    const users: UserProfileData[] = [];
    snap.forEach((d) => {
      users.push(d.data() as UserProfileData);
    });
    return users;
  } catch (error) {
    console.warn('fetchAllUsers notice:', error);
    return [];
  }
}

// Update profile data in Firestore
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
  const usersCol = collection(db, 'users');
  return onSnapshot(usersCol, (snap) => {
    const users: UserProfileData[] = [];
    snap.forEach((d) => {
      users.push(d.data() as UserProfileData);
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
  try {
    const msgId = msgData.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const msgRef = doc(db, 'globalChat', msgId);
    await setDoc(msgRef, {
      ...msgData,
      id: msgId,
      time: msgData.time || Date.now()
    });
  } catch (error) {
    console.warn('sendFirestoreChatMessage notice:', error);
  }
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

// Listen to real-time updates for Direct Messages across devices & browsers
export function subscribeToDirectMessages(onUpdate: (messages: any[]) => void): Unsubscribe {
  const dmCol = collection(db, 'directMessages');
  return onSnapshot(dmCol, (snap) => {
    const msgs: any[] = [];
    snap.forEach((d) => {
      msgs.push({ id: d.id, ...d.data() });
    });
    msgs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    onUpdate(msgs);
  }, (error) => {
    console.warn('subscribeToDirectMessages notice:', error);
  });
}

// Send Direct Message to Firestore
export async function sendFirestoreDirectMessage(dmData: any): Promise<void> {
  try {
    const msgId = dmData.id || `dm_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const dmRef = doc(db, 'directMessages', msgId);
    await setDoc(dmRef, {
      ...dmData,
      id: msgId,
      timestamp: dmData.timestamp || Date.now()
    });
  } catch (error) {
    console.warn('sendFirestoreDirectMessage notice:', error);
  }
}

// Listen to Admin Platform Config updates (announcements & maintenance mode)
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

