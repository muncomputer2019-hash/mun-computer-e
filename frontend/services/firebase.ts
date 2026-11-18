import { FirebaseApp, getApps, initializeApp } from 'firebase/app';
import {
  Auth,
  GoogleAuthProvider,
  User as FirebaseUser,
  getAuth,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Firestore,
  Timestamp,
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseAppletConfig from '../../firebase-applet-config.json';
import { RoleName, UserProfile } from '../modules/types';

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

const BOOTSTRAPPED_ADMIN_EMAILS = [
  'muncomputer2019@gmail.com',
  'mamunreja335@gmail.com',
];

const envConfig = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim(),
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim(),
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim(),
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim(),
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim(),
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim(),
  measurementId: (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '').trim(),
  databaseId: (import.meta.env.VITE_FIREBASE_DATABASE_ID || '').trim(),
};

const resolvedProjectId = envConfig.projectId || firebaseAppletConfig.projectId || '';
const resolvedDatabaseId =
  envConfig.databaseId ||
  (resolvedProjectId === firebaseAppletConfig.projectId
    ? firebaseAppletConfig.firestoreDatabaseId || ''
    : '');

export const firebaseConfig = {
  apiKey: envConfig.apiKey || firebaseAppletConfig.apiKey || '',
  authDomain: envConfig.authDomain || firebaseAppletConfig.authDomain || '',
  projectId: resolvedProjectId,
  storageBucket: envConfig.storageBucket || firebaseAppletConfig.storageBucket || '',
  messagingSenderId:
    envConfig.messagingSenderId || firebaseAppletConfig.messagingSenderId || '',
  appId: envConfig.appId || firebaseAppletConfig.appId || '',
  ...(envConfig.measurementId || firebaseAppletConfig.measurementId
    ? { measurementId: envConfig.measurementId || firebaseAppletConfig.measurementId }
    : {}),
};

export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
  );
}

let appInstance: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let initErrorMessage: string | null = null;

if (!isFirebaseConfigured()) {
  initErrorMessage =
    'Firebase is not configured. Please set VITE_FIREBASE_API_KEY, VITE_FIREBASE_AUTH_DOMAIN, VITE_FIREBASE_PROJECT_ID, and VITE_FIREBASE_APP_ID.';
} else {
  try {
    appInstance = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
    authInstance = getAuth(appInstance);
    dbInstance =
      resolvedDatabaseId && resolvedDatabaseId !== '(default)'
        ? getFirestore(appInstance, resolvedDatabaseId)
        : getFirestore(appInstance);
  } catch (err) {
    initErrorMessage =
      err instanceof Error ? err.message : 'Failed to initialize Firebase SDK.';
  }
}

export const firebaseApp = appInstance;
export const auth = authInstance;
export const db = dbInstance;
export const firebaseInitError = initErrorMessage;

export function requireFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!appInstance || !authInstance || !dbInstance || initErrorMessage) {
    throw new Error(
      initErrorMessage ||
        'Firebase / Firestore is not initialized. Check your VITE_FIREBASE_* environment variables.'
    );
  }
  return { app: appInstance, auth: authInstance, db: dbInstance };
}

export async function testConnection(): Promise<void> {
  if (!dbInstance) {
    console.error('Please check your Firebase configuration.', initErrorMessage);
    return;
  }
  try {
    await getDocFromServer(doc(dbInstance, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
    }
  }
}

void testConnection();

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = authInstance?.currentUser ?? null;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function timestampToIso(value: unknown, fallback = new Date().toISOString()): string {
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return fallback;
}

// Role permission matrix aligned with backend RBAC
const ROLE_PERMISSIONS: Record<RoleName, Record<string, string[]>> = {
  ADMIN: {
    dashboard: ['VIEW', 'EXPORT', 'PRINT', 'MANAGE'],
    customers: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'MANAGE'],
    services: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE', 'FINANCIAL', 'MANAGE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE', 'MANAGE'],
    transactions: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL', 'MANAGE'],
    receipts: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    invoices: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    expenses: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL'],
    daily_cash: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL'],
    finance_engine: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL', 'MANAGE'],
    employees: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT', 'FINANCIAL', 'MANAGE'],
    products: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    inventory: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'FINANCIAL'],
    documents: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'PRINT', 'EXPORT', 'APPROVE', 'REJECT'],
    notifications: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'MANAGE'],
    reports: ['VIEW', 'PRINT', 'EXPORT', 'FINANCIAL', 'MANAGE'],
    users: ['VIEW', 'ADD', 'EDIT', 'DELETE', 'APPROVE', 'REJECT', 'MANAGE'],
    roles: ['VIEW', 'EDIT', 'ASSIGN', 'MANAGE'],
    permissions: ['VIEW', 'EDIT', 'APPROVE', 'REJECT', 'ASSIGN', 'MANAGE'],
    approvals: ['VIEW', 'APPROVE', 'REJECT', 'MANAGE'],
    approval_history: ['VIEW', 'EXPORT'],
    security_logs: ['VIEW', 'EXPORT', 'MANAGE'],
    settings: ['VIEW', 'EDIT', 'MANAGE'],
    settings_proposal: ['VIEW', 'ADD', 'APPROVE', 'REJECT'],
    service_rate_proposals: ['VIEW', 'ADD', 'APPROVE', 'REJECT'],
    csc_portal: ['VIEW', 'MANAGE'],
  },
  MANAGER: {
    dashboard: ['VIEW', 'PRINT'],
    customers: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'EXPORT'],
    services: ['VIEW', 'ASSIGN', 'EXECUTE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'PRINT', 'APPROVE', 'REJECT', 'ASSIGN', 'EXECUTE'],
    transactions: ['VIEW', 'PRINT'],
    receipts: ['VIEW', 'ADD', 'PRINT'],
    invoices: ['VIEW', 'ADD', 'PRINT'],
    expenses: ['VIEW', 'ADD', 'PRINT'],
    daily_cash: ['VIEW', 'ADD', 'PRINT'],
    finance_engine: ['VIEW', 'ADD', 'PRINT', 'EXPORT'],
    employees: ['VIEW', 'PRINT'],
    products: ['VIEW', 'ADD', 'EDIT'],
    inventory: ['VIEW', 'ADD', 'EDIT'],
    documents: ['VIEW', 'ADD', 'PRINT', 'APPROVE', 'REJECT'],
    notifications: ['VIEW'],
    reports: ['VIEW', 'PRINT', 'EXPORT'],
    users: ['VIEW', 'ADD', 'EDIT'],
    roles: ['VIEW'],
    permissions: ['VIEW', 'ASSIGN'],
    approvals: ['VIEW', 'APPROVE'],
    approval_history: ['VIEW'],
    security_logs: ['VIEW'],
    settings: [],
    settings_proposal: ['VIEW', 'ADD'],
    service_rate_proposals: ['VIEW', 'ADD'],
    csc_portal: [],
  },
  STAFF: {
    dashboard: ['VIEW'],
    customers: ['VIEW', 'ADD'],
    services: ['VIEW', 'EXECUTE'],
    applications: ['VIEW', 'ADD', 'EDIT', 'EXECUTE'],
    transactions: [],
    receipts: ['VIEW', 'ADD', 'PRINT'],
    invoices: ['VIEW', 'PRINT'],
    expenses: [],
    daily_cash: ['VIEW', 'ADD'],
    finance_engine: ['VIEW'],
    employees: [],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW', 'ADD'],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: [],
  },
  EMPLOYEE: {
    dashboard: ['VIEW'],
    customers: ['VIEW'],
    services: ['VIEW'],
    applications: ['VIEW', 'EXECUTE'],
    transactions: [],
    receipts: ['VIEW'],
    invoices: ['VIEW'],
    expenses: [],
    daily_cash: [],
    finance_engine: [],
    employees: [],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW'],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: [],
  },
  AUDITOR: {
    dashboard: ['VIEW', 'PRINT'],
    customers: ['VIEW'],
    services: ['VIEW'],
    applications: ['VIEW'],
    transactions: ['VIEW', 'PRINT', 'EXPORT'],
    receipts: ['VIEW', 'PRINT'],
    invoices: ['VIEW', 'PRINT'],
    expenses: ['VIEW', 'PRINT'],
    daily_cash: ['VIEW', 'PRINT'],
    finance_engine: ['VIEW', 'PRINT', 'EXPORT'],
    employees: ['VIEW'],
    products: ['VIEW'],
    inventory: ['VIEW'],
    documents: ['VIEW'],
    notifications: ['VIEW'],
    reports: ['VIEW', 'PRINT', 'EXPORT'],
    users: ['VIEW'],
    roles: ['VIEW'],
    permissions: ['VIEW'],
    approvals: ['VIEW'],
    approval_history: ['VIEW', 'EXPORT'],
    security_logs: ['VIEW', 'EXPORT'],
    settings: ['VIEW'],
    settings_proposal: ['VIEW'],
    service_rate_proposals: ['VIEW'],
    csc_portal: [],
  },
  CUSTOMER: {
    dashboard: ['VIEW'],
    customers: [],
    services: ['VIEW'],
    applications: [],
    transactions: [],
    receipts: [],
    invoices: [],
    expenses: [],
    daily_cash: [],
    finance_engine: [],
    employees: [],
    products: [],
    inventory: [],
    documents: [],
    notifications: ['VIEW'],
    reports: [],
    users: [],
    roles: [],
    permissions: [],
    approvals: [],
    approval_history: [],
    security_logs: [],
    settings: [],
    settings_proposal: [],
    service_rate_proposals: [],
    csc_portal: ['VIEW'],
  },
};

export function buildPermissionsForRole(role: RoleName): Record<string, boolean> {
  const effective: Record<string, boolean> = {};
  const matrix = ROLE_PERMISSIONS[role];
  for (const [mod, perms] of Object.entries(matrix)) {
    for (const perm of [
      'VIEW',
      'ADD',
      'EDIT',
      'DELETE',
      'PRINT',
      'EXPORT',
      'APPROVE',
      'REJECT',
      'ASSIGN',
      'EXECUTE',
      'FINANCIAL',
      'MANAGE',
    ]) {
      effective[`${mod}.${perm}`] = perms.includes(perm);
    }
  }
  const canReport = role !== 'STAFF' && role !== 'CUSTOMER';
  const isAdmin = role === 'ADMIN';
  effective['report.view'] = canReport;
  effective['report.create'] = role === 'ADMIN' || role === 'MANAGER';
  effective['report.update'] = role === 'ADMIN' || role === 'MANAGER';
  effective['report.delete'] = isAdmin;
  effective['report.export.pdf'] = canReport;
  effective['report.export.excel'] = canReport;
  effective['report.print'] = canReport;
  effective['report.schedule'] = isAdmin;
  effective['report.archive.view'] = canReport;
  effective['report.audit.view'] = role === 'ADMIN' || role === 'AUDITOR';

  // Granular CSC Operator Permissions (Part 7)
  const isOperator = role === 'ADMIN' || role === 'MANAGER' || role === 'STAFF';
  effective['csc.customerReg'] = isOperator;
  effective['csc.orderCreate'] = isOperator;
  effective['csc.appEntry'] = isOperator;
  effective['csc.docUpload'] = isOperator;
  effective['csc.paymentEntry'] = isOperator;
  effective['csc.receiptPrint'] = isOperator;
  effective['csc.statusUpdate'] = isOperator;
  effective['csc.pvcOrderEntry'] = isOperator;
  effective['csc.customerSearch'] = isOperator;
  effective['csc.reportView'] = isAdmin || role === 'MANAGER';
  effective['csc.rateEdit'] = isAdmin; // Default FALSE for non-Admin unless explicitly granted
  return effective;
}

export async function signInWithGoogleFirebase(): Promise<{
  user: UserProfile;
  permissions: Record<string, boolean>;
}> {
  const { auth: fbAuth } = requireFirebase();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const credential = await signInWithPopup(fbAuth, provider);
  return ensureFirebaseUserProfile(credential.user);
}

export async function signOutFirebase(): Promise<void> {
  if (!authInstance) return;
  await signOut(authInstance);
}

export async function ensureFirebaseUserProfile(fbUser: FirebaseUser): Promise<{
  user: UserProfile;
  permissions: Record<string, boolean>;
}> {
  const email = fbUser.email || '';
  const isBootstrappedAdminUser =
    fbUser.emailVerified && BOOTSTRAPPED_ADMIN_EMAILS.includes(email.toLowerCase());

  let role: RoleName = isBootstrappedAdminUser ? 'ADMIN' : 'STAFF';
  let userCode = isBootstrappedAdminUser
    ? 'MC-AD-202613-0001'
    : `MC-ST-202613-${fbUser.uid.slice(0, 4).toUpperCase()}`;
  let fullName = fbUser.displayName || email.split('@')[0] || 'MUN User';
  let branch = 'Main Service Center';
  let status: UserProfile['status'] = 'ACTIVE';
  let mobile = fbUser.phoneNumber || '';
  let address = '';

  try {
    const { db: firestore } = requireFirebase();
    const uid = fbUser.uid;
    const userDocRef = doc(firestore, 'users', uid);
    const privateDocRef = doc(firestore, 'users', uid, 'private', 'info');

    let publicSnap;
    try {
      publicSnap = await getDoc(userDocRef);
    } catch (err) {
      console.warn('Firestore getDoc(users/{uid}) permission or network warning (proceeding with fallback/creation):', err);
    }

    if (!publicSnap || !publicSnap.exists()) {
      const newPublic = {
        uid,
        userId: userCode,
        fullName: fullName.slice(0, 120),
        role,
        status,
        branch,
        mobileVerified: Boolean(fbUser.phoneNumber),
        emailVerified: fbUser.emailVerified,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(userDocRef, newPublic, { merge: true });
      } catch (err) {
        console.warn('Firestore setDoc(users/{uid}) warning (handled gracefully):', err);
      }

      const newPrivate = {
        uid,
        email: email.slice(0, 160),
        mobile: mobile.slice(0, 32),
        address: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      try {
        await setDoc(privateDocRef, newPrivate, { merge: true });
      } catch (err) {
        console.warn('Firestore setDoc(users/{uid}/private/info) warning (handled gracefully):', err);
      }

      if (isBootstrappedAdminUser) {
        const adminRef = doc(firestore, 'admins', uid);
        try {
          await setDoc(
            adminRef,
            {
              uid,
              email,
              grantedBy: 'SYSTEM_BOOTSTRAP',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );
        } catch (err) {
          console.warn('Firestore setDoc(admins/{uid}) warning (handled gracefully):', err);
        }
      }
    } else {
      const data = publicSnap.data();
      role = (isBootstrappedAdminUser ? 'ADMIN' : data.role || 'STAFF') as RoleName;
      userCode = String(data.userId || userCode);
      fullName = String(data.fullName || fullName);
      branch = String(data.branch || branch);
      status = (data.status || 'ACTIVE') as UserProfile['status'];

      try {
        const privateSnap = await getDoc(privateDocRef);
        if (privateSnap.exists()) {
          const pData = privateSnap.data();
          mobile = String(pData.mobile || mobile);
          address = String(pData.address || '');
        }
      } catch (err) {
        console.warn('Firestore getDoc private info warning (handled gracefully):', err);
      }
    }
  } catch (firestoreErr) {
    console.warn('Firestore permission or connection error handled gracefully, allowing dashboard access:', firestoreErr);
  }

  const initials =
    fullName
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'MC';

  const profile: UserProfile = {
    id: 1,
    userId: userCode,
    fullName,
    email,
    role,
    mobile,
    address,
    avatarInitials: initials,
    branch,
    status,
    mobileVerified: Boolean(fbUser.phoneNumber),
    emailVerified: fbUser.emailVerified,
  };

  return {
    user: profile,
    permissions: buildPermissionsForRole(role),
  };
}
