import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// === Store or update a user in DB ===
// Purpose → Save a logged-in user in DB (only once).
// Steps:
// 1. Get logged-in user identity from auth.
// 2. Check if user already exists in users table by tokenIdentifier.
// 3. If exists and name changed → update name.
// 4. If new user → insert in DB.
// 5. Return user _id.
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    // Get current authenticated user identity from auth provider
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storeUser without authentication present");
    }

    // Check if user already exists using tokenIdentifier index
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();

    // If user exists:
    if (user !== null) {
      // Update name if it has changed
      if (user.name !== identity.name) {
        await ctx.db.patch(user._id, { name: identity.name });
      }
      // Return existing user id
      return user._id;
    }
    
    // Else create a new user entry
    return await ctx.db.insert("users", {
      name: identity.name ?? "Anonymous",
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      imageUrl: identity.pictureUrl,
    });
  },
});

// === Get the currently logged-in user from DB ===
// Purpose → Return full user record of the currently logged-in user.
// Steps:
// 1. Get identity of authenticated user.
// 2. Find user in DB using tokenIdentifier.
// 3. If not found → throw error.
// 4. Return user document.
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    // Find user using token index
    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },
});

// === Search users by name or email (for sharing / adding participants) ===
// Purpose → Find users by name or email to show possible members/participants.
// Steps:
// 1. Get current user (to exclude him from results).
// 2. If query text length < 2 → return empty result.
// 3. Search by name (search_name index).
// 4. Search by email (search_email index).
// 5. Merge both results & remove duplicates.
// 6. Remove current user from list.
// 7. Return selected fields (id, name, email, image).
export const searchUsers = query({
  args: {
    query: v.string(), // search keyword
  },
  handler: async (ctx, args) => {
    // Get current user to exclude him from search results
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    // Return empty list if search query is less than 2 characters
    if (args.query.length < 2) {
      return [];
    }

    // Search users by name (using search index)
    const nameResults = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .collect();

    // Search users by email
    const emailResults = await ctx.db
      .query("users")
      .withSearchIndex("search_email", (q) => q.search("email", args.query))
      .collect();

    // Combine both result arrays but remove duplicates
    const users = [
      ...nameResults,
      ...emailResults.filter(
        (email) => !nameResults.some((name) => name._id === email._id)
      ),
    ];

    // Exclude current user and format results
    return users
      .filter((user) => user._id !== currentUser._id)
      .map((user) => ({
        id: user._id,
        name: user.name,
        email: user.email,
        imageUrl: user.imageUrl,
      }));
  },
});