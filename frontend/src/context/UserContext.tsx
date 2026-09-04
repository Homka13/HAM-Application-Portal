/**
 * @file frontend/src/context/UserContext.tsx
 * @module context/UserContext
 * @description React Context managing user authentication role and authorization state.
 *
 * Architectural Role:
 * Provides client-side role state (`USER` vs `ADMIN`) across the component hierarchy.
 * Enables the UI to toggle between standard user views and privileged administrative
 * tabs (Change Board, Problem Board, Audit Timelines). Supplies the active role
 * to API client invocations via custom request headers (`x-user-role`).
 *
 * Inputs:
 * - Child React nodes rendered within `<UserProvider>`.
 *
 * Outputs:
 * - React Context hook `useUser()` exposing `role` and `setRole`.
 *
 * Constraints & Assumptions:
 * - Defaults to 'USER' on initial load to maintain least-privilege security posture.
 */

import { createContext, useContext, useState, type ReactNode } from 'react';

/**
 * User authorization role classification.
 */
export type Role = 'ADMIN' | 'USER';

/**
 * Shape of the context value exposed by `UserContext`.
 */
export interface UserContextValue {
  /** The currently active user role. */
  role: Role;
  /** Function to update the active role. */
  setRole: (newRole: Role) => void;
}

/**
 * React Context instance holding the user authorization state.
 */
export const UserContext = createContext<UserContextValue>({
  role: 'USER',
  setRole: () => {},
});

/**
 * Custom React hook providing convenient access to user role context.
 *
 * @returns Object containing `role` and `setRole`.
 */
export const useUser = (): UserContextValue => useContext(UserContext);

/**
 * Provider component wrapping the React tree to supply user role state.
 *
 * @param props - Component props containing `children`.
 * @returns React Context Provider element.
 */
export const UserProvider = ({ children }: { children: ReactNode }) => {
  const [activeRole, setActiveRole] = useState<Role>('USER');

  return (
    <UserContext.Provider
      value={{
        role: activeRole,
        setRole: setActiveRole,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
