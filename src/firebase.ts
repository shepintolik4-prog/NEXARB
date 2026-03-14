// Firebase has been replaced with Telegram WebApp authentication.
// This file is kept as a stub to avoid breaking any remaining imports.

export const auth = null;
export const googleProvider = null;

export const signInWithGoogle = async () => {
  throw new Error('Google auth removed. Use Telegram WebApp.');
};

export const logout = () => {
  // In Telegram WebApp context, closing the app = "logout"
  window.Telegram?.WebApp?.close();
};

export const getAuthToken = async (): Promise<string | null> => null;
