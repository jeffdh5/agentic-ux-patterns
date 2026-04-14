"use client";

import { useState, useEffect } from "react";
import {
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const actionCodeSettings = {
  url: typeof window !== "undefined" ? window.location.origin : "",
  handleCodeInApp: true,
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const sendMagicLink = async (email: string) => {
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem("emailForSignIn", email);
      setEmailSent(true);
    } catch (error) {
      console.error("Error sending magic link:", error);
      throw error;
    }
  };

  const handleMagicLinkCallback = async () => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem("emailForSignIn");
      if (!email) {
        email = window.prompt("Please provide your email for confirmation");
      }
      if (email) {
        try {
          await signInWithEmailLink(auth, email, window.location.href);
          window.localStorage.removeItem("emailForSignIn");
          window.history.replaceState({}, document.title, window.location.pathname);
        } catch (error) {
          console.error("Error signing in with email link:", error);
          throw error;
        }
      }
    }
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setEmailSent(false);
  };

  const getIdToken = async () => {
    if (!user) return null;
    return await user.getIdToken();
  };

  return {
    user,
    loading,
    emailSent,
    sendMagicLink,
    handleMagicLinkCallback,
    signOut,
    getIdToken,
  };
}
