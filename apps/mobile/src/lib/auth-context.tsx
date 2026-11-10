import { GoogleSignin } from "@react-native-google-signin/google-signin";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithCredential,
  signOut,
  type User,
} from "firebase/auth";
import { createContext, useContext, useEffect, useState } from "react";
import "./data-backend"; // configures the shared data.* facade on load
import { unregisterThisDevice } from "@/hooks/use-push-registration";
import { auth, GOOGLE_WEB_CLIENT_ID } from "./firebase";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const NOT_CONFIGURED_ERROR =
  "Firebase isn't configured yet — add your project's EXPO_PUBLIC_FIREBASE_* values to apps/mobile/.env (see README.md).";

if (GOOGLE_WEB_CLIENT_ID) {
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => auth !== null);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  async function signInWithGoogle() {
    if (!auth) throw new Error(NOT_CONFIGURED_ERROR);
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (response.type !== "success" || !response.data.idToken) {
      throw new Error("Google sign-in was cancelled or returned no ID token");
    }
    const credential = GoogleAuthProvider.credential(response.data.idToken);
    await signInWithCredential(auth, credential);
  }

  async function signOutUser() {
    if (!auth) return;
    const uid = auth.currentUser?.uid;
    // Before signing out, while we still have the uid and Firestore access:
    // otherwise the token stays registered against this account and its
    // notifications keep arriving on a device somebody else may now be using.
    // Best-effort — failing to clean up must not block the sign-out itself.
    if (uid) {
      await unregisterThisDevice(uid).catch((err) =>
        console.error('Could not unregister this device for push', err),
      );
    }
    await signOut(auth);
    // Errors here used to reject *after* the Firebase sign-out had already
    // succeeded, and the only caller does not catch — an unhandled rejection
    // for a step that cannot be meaningfully retried.
    await GoogleSignin.signOut().catch((err) =>
      console.error('Google sign-out failed after Firebase sign-out', err),
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
