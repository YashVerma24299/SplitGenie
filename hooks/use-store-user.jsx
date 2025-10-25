import { useUser } from "@clerk/nextjs";
import { useConvexAuth } from "convex/react";
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../convex/_generated/api";

// This hook makes sure that:
// 1. When a user logs in using Clerk
// 2. The same user is also stored in Convex DB (users table)
// 3. And only after storing, the app considers them “fully authenticated”
// This ensures Clerk auth + Convex DB stay in sync.
// OVERALL
// This hook ensures the logged-in user is saved into the Convex database before allowing the app to treat them as authenticated.


export function useStoreUser() {
  // isLoading = Convex still checking auth
  // isAuthenticated = Convex knows user is logged in
  const { isLoading, isAuthenticated } = useConvexAuth();


  const { user } = useUser();


  // This stores the ID of the user from Convex DB and Until we store the user in DB, it stays null
  const [userId, setUserId] = useState(null);

  
  // Call the `storeUser` mutation function to store and the current user in the `users` table and return the `Id` value.
  const storeUser = useMutation(api.users.store);
  useEffect(() => {
    // If the user is not logged in don't do anything
    if (!isAuthenticated) {
      return;
    }
    
    async function createUser() {
      const id = await storeUser(); // Inserts user into Convex DB
      setUserId(id); // Save returned ID in state
    }
    createUser();
    return () => setUserId(null); // Cleanup on logout
  }, [isAuthenticated, storeUser, user?.id]);

  return {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}