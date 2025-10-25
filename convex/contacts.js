import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

/* ===================== GET ALL CONTACTS (1–1 + GROUPS) ===================== */
// Purpose: To fetch all the people and groups that the current user interacts with.
// Steps:
  // 1. Get current logged-in user.
  // 2. Get personal expenses you paid.
  // 3. Get personal expenses others paid but you are involved.
  // 4. Collect unique user IDs from these expenses → your contacts.
  // 5. Fetch user info for each contact.
  // 6. Get groups where you are a member.
  // 7. Sort users and groups alphabetically.
// Returns: { users: [...], groups: [...] }
export const getAllContacts = query({
  handler: async (ctx) => {
    // Get current logged in user from central API
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    /* --- PERSONAL EXPENSES WHERE YOU ARE THE PAYER --- */
    const expensesYouPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", currentUser._id).eq("groupId", undefined)
      )
      .collect();

    /* --- PERSONAL EXPENSES WHERE SOMEONE ELSE PAID, but YOU are in splits --- */
    const expensesNotPaidByYou = (
      await ctx.db
        .query("expenses")
        .withIndex("by_group", (q) => q.eq("groupId", undefined)) // only 1‑to‑1
        .collect()
    ).filter(
      (e) =>
        e.paidByUserId !== currentUser._id &&
        e.splits.some((s) => s.userId === currentUser._id)
    );

    const personalExpenses = [...expensesYouPaid, ...expensesNotPaidByYou];

    /* --- Collect all unique user IDs from these expenses (contacts) --- */
    const contactIds = new Set();
    personalExpenses.forEach((exp) => {
      if (exp.paidByUserId !== currentUser._id)
        contactIds.add(exp.paidByUserId);

      exp.splits.forEach((s) => {
        if (s.userId !== currentUser._id) contactIds.add(s.userId);
      });
    });

    /* ── fetch user docs ───────────────────────────────────────────────── */
    const contactUsers = await Promise.all(
      [...contactIds].map(async (id) => {
        const u = await ctx.db.get(id);
        return u
          ? {
              id: u._id,
              name: u.name,
              email: u.email,
              imageUrl: u.imageUrl,
              type: "user",
            }
          : null;
      })
    );

    /* --- Get all groups where current user is a member --- */
    const userGroups = (await ctx.db.query("groups").collect())
      .filter((g) => g.members.some((m) => m.userId === currentUser._id))
      .map((g) => ({
        id: g._id,
        name: g.name,
        description: g.description,
        memberCount: g.members.length,
        type: "group",
      }));

    /* --- Sort contacts and groups alphabetically --- */
    contactUsers.sort((a, b) => a?.name.localeCompare(b?.name));
    userGroups.sort((a, b) => a.name.localeCompare(b.name));

    return { users: contactUsers.filter(Boolean), groups: userGroups };
  },
});


/* ============================ CREATE GROUP ============================ */
// Purpose: make a new group for splitting expenses
// Steps:
// 1. Get current logged-in user.
// 2. Check that group name is not empty.
// 3. Combine members from UI + creator.
// 4. Validate each user exists in DB.
// 5. Insert new group with:
      // name, description
      // createdBy → current user
      // members → role: admin (creator) / member
export const createGroup = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    members: v.array(v.id("users")),
  },
  handler: async (ctx, args) => {
    // Get logged-in user
    const currentUser = await ctx.runQuery(internal.users.getCurrentUser);

    if (!args.name.trim()) throw new Error("Group name cannot be empty");

    // Add current user (creator) to member list
    const uniqueMembers = new Set(args.members);
    uniqueMembers.add(currentUser._id); // ensure creator

    // Validate that all members exist in DB
    for (const id of uniqueMembers) {
      if (!(await ctx.db.get(id)))
        throw new Error(`User with ID ${id} not found`);
    }

    // Insert group with member roles and createdBy
    return await ctx.db.insert("groups", {
      name: args.name.trim(),
      description: args.description?.trim() ?? "",
      createdBy: currentUser._id,
      members: [...uniqueMembers].map((id) => ({
        userId: id,
        role: id === currentUser._id ? "admin" : "member",
        joinedAt: Date.now(),
      })),
    });
  },
});                                                    