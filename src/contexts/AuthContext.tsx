import React, { createContext, useContext, useEffect, useState } from 'react';

interface TgUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface AuthContextType {
  user: TgUser | null;
  token: string | null;
  loading: boolean;
  uid: string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  loading: true,
  uid: null,
});

// Declare Telegram WebApp global
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: TgUser;
          hash?: string;
          auth_date?: number;
          start_param?: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        colorScheme: 'light' | 'dark';
        themeParams: Record<string, string>;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (fn: () => void) => void;
        };
      };
    };
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<TgUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    if (tg) {
      // Running inside Telegram
      tg.ready();
      tg.expand();

      const tgUser = tg.initDataUnsafe?.user;
      const initData = tg.initData;

      if (tgUser && initData) {
        // Use initData as token — server will verify it
        setUser(tgUser);
        setToken(initData);
        setUid(`tg_${tgUser.id}`);
        setLoading(false);
        return;
      }
    }

    // Not inside Telegram — check for dev/browser fallback
    if (process.env.NODE_ENV !== 'production') {
      // Dev mode: use a mock user so you can test in browser
      const mockUser: TgUser = {
        id: 123456789,
        first_name: 'Dev',
        last_name: 'User',
        username: 's0mni',
      };
      const mockToken = 'dev-token-' + mockUser.id;
      setUser(mockUser);
      setToken(mockToken);
      setUid(`tg_${mockUser.id}`);
    }
    // In production without Telegram context: stays null (shows "open in Telegram" screen)

    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, uid }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
