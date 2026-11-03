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
  stardust: number;
  streak: number;
  level?: number;
  xp?: number;
  lastClaimedDate?: string;
  equippedBorder?: string;
  equippedFrame?: string;
  bio?: string;
  staffRole?: string;
  isBanned?: boolean;
  mutedUntil?: number;
  ipSessionLog?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Sync or initialize user profile in Firestore
export async function syncUserProfile(user: User): Promise<UserProfileData> {
  const userRef = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      return snap.data() as UserProfileData;
    } else {
      const isOwner = (user.email || '').trim().toLowerCase() === 'jaydentorru4@gmail.com';
      const newProfile: UserProfileData = {
        id: user.uid,
        displayName: user.displayName || (isOwner ? 'JaydenTorru' : 'Starlight Voyager'),
        username: user.displayName ? user.displayName.replace(/\s+/g, '') : (isOwner ? 'JaydenTorru' : 'Voyager'),
        email: user.email || '',
        stardust: isOwner ? 999999 : 100,
        streak: isOwner ? 99 : 1,
        level: isOwner ? 999 : 1,
        xp: isOwner ? 99900 : 0,
        staffRole: isOwner ? 'owner' : '',
        lastClaimedDate: '',
        equippedBorder: isOwner ? 'void' : 'Standard Voyager Frame',
        equippedFrame: isOwner ? 'void' : 'galaxy',
        bio: isOwner ? 'System Administrator & Soranix Platform Owner.' : 'Stargazing through infinite space, collecting rare celestial soundtracks, and indexing deep universe cyberpunk archives.',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await setDoc(userRef, newProfile, { merge: true });
      return newProfile;
    }
  } catch (error) {
    console.warn('Sync profile notice:', error);
    return {
      id: user.uid,
      displayName: user.displayName || 'Voyager',
      username: user.displayName ? user.displayName.replace(/\s+/g, '') : 'Voyager',
      email: user.email || '',
      stardust: 100,
      streak: 1
    };
  }
}

// Save any user profile to Firestore so admin can see new registrations across devices
export async function saveUserToFirestore(userData: any): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid;
    const cleanUsername = (userData.username || userData.displayName || 'user').toLowerCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    const docId = userData.uid || userData.id || (cleanUsername !== 'user' ? cleanUsername : null) || currentUid || ('user_' + Date.now());
    const userRef = doc(db, 'users', docId);

    const payload: UserProfileData = {
      id: docId,
      displayName: userData.username || userData.displayName || 'Voyager',
      username: userData.username || userData.displayName || 'Voyager',
      email: userData.email || '',
      stardust: typeof userData.stardust === 'number' ? userData.stardust : 0,
      streak: typeof userData.streakDays === 'number' ? userData.streakDays : (userData.streak || 0),
      level: userData.level || 1,
      xp: userData.xp || 0,
      bio: (userData.bio || '').slice(0, 250),
      equippedBorder: userData.equippedFrame || 'galaxy',
      equippedFrame: userData.equippedFrame || 'galaxy',
      staffRole: userData.staffRole || '',
      isBanned: !!userData.isBanned,
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

// Fetch all registered users from Firestore for the Admin Panel
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
    console.warn('fetchAllUsers notice (admin clearance required or network):', error);
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

// Listen to real-time updates for user profile
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
