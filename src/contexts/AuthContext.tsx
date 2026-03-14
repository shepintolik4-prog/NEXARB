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
  user: null, token: null, loading: true, uid: null,
});

declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string;
        initDataUnsafe: {
          user?: TgUser;
          hash?: string;
          auth_date?: number;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        isExpanded: boolean;
        colorScheme: 'light' | 'dark';
        version: string;
      };
    };
  }
}

function getTgWebApp() {
  return window?.Telegram?.WebApp;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<TgUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    // Give Telegram SDK up to 500ms to initialize
    const tryInit = (attempts = 0) => {
      const tg = getTgWebApp();

      if (tg) {
        tg.ready();
        tg.expand();

        const tgUser = tg.initDataUnsafe?.user;
        const initData = tg.initData;

        if (tgUser) {
          setUser(tgUser);
          // Use initData if available, otherwise construct a simple token
          setToken(initData || `tg-${tgUser.id}-${Date.now()}`);
          setUid(`tg_${tgUser.id}`);
          setLoading(false);
          return;
        }
      }

      // Retry up to 5 times with 100ms delay
      if (attempts < 5) {
        setTimeout(() => tryInit(attempts + 1), 100);
        return;
      }

      // Telegram SDK not available — dev mode fallback
      if (process.env.NODE_ENV !== 'production') {
        const mockUser: TgUser = {
          id: 123456789,
          first_name: 'Dev',
          username: 's0mni',
        };
        setUser(mockUser);
        setToken(`dev-token-${mockUser.id}`);
        setUid(`tg_${mockUser.id}`);
      }
      // In production without TG — stays null → shows "open in Telegram" screen

      setLoading(false);
    };

    tryInit();
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, uid }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
