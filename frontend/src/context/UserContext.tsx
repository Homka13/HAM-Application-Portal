import { createContext, useContext, useState } from 'react';

export type Role = 'ADMIN' | 'USER';

interface UserContextValue {
  role: Role;
  setRole: (r: Role) => void;
}

export const UserContext = createContext<UserContextValue>({
  role: 'USER',
  setRole: () => {},
});

export const useUser = () => useContext(UserContext);

export const UserProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>('USER');
  return (
    <UserContext.Provider value={{ role, setRole }}>
      {children}
    </UserContext.Provider>
  );
};
