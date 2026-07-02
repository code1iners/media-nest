import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

/** route navigation lock context 값. */
type NavigationLockContextValue = {
  /** route 이동 차단 여부. */
  navigationLocked: boolean;
  /** route 이동 차단 상태를 갱신한다. */
  setNavigationLocked: (locked: boolean) => void;
};

/** route 이동 차단 상태 context. */
const NavigationLockContext = createContext<NavigationLockContextValue | null>(
  null,
);

/** route 이동 차단 상태 provider props. */
type NavigationLockProviderProps = {
  /** 하위 route tree. */
  children: ReactNode;
};

/** route 이동 차단 상태를 layout 하위 tree에 제공한다. */
export function NavigationLockProvider({
  children,
}: NavigationLockProviderProps) {
  // States.

  /** route 이동 차단 여부. */
  const [navigationLocked, setNavigationLocked] = useState(false);

  // Computed.

  /** context 구독자에게 제공할 route 이동 차단 상태. */
  const value = useMemo(
    () => ({ navigationLocked, setNavigationLocked }),
    [navigationLocked],
  );

  return (
    <NavigationLockContext.Provider value={value}>
      {children}
    </NavigationLockContext.Provider>
  );
}

/** route 이동 차단 상태를 반환한다. */
export function useNavigationLock() {
  /** route 이동 차단 context. */
  const context = useContext(NavigationLockContext);

  if (!context) {
    throw new Error('NavigationLockProvider is missing.');
  }

  return context;
}
