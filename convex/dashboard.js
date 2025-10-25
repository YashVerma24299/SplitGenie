import { query } from "./_generated/server";
import { internal } from "./_generated/api";

// Get user balances
// Purpose: Calculate how much the current user owes and is owed for 1‑to‑1 expenses (non-group).
// Concepts: “You Owe” vs “You Are Owed”
      // youOwe → Money you need to pay to others.
      // youAreOwed → Money others need to pay you.
      // youOwe → money leaving your wallet.
      // youAreOwed → money coming to your wallet.
      //Example
      // | Situation                    | Counted as       |
      // | ---------------------------- | ---------------- |
      // | You borrowed ₹100 from Alice | youOwe += 100    |
      // | You lent ₹50 to Bob          | youAreOwed += 50 |
// Step:
// 1. Fetch current user using getCurrentUser.
// 2. Collect all 1‑to‑1 expenses where the user is involved (payer or splitter).
// 3. Initialize youOwe, youAreOwed, and a balanceByUser map
// 4. Loop over each expense:
    // If user is payer → tally how much others owe them.
    // If user is splitter → tally how much user owes.
// 5. Apply settlements (subtract amounts already paid/settled).
// 6. Build two lists for UI:
    // youOweList → who the user owes.
    // youAreOwedByList → who owes the user.
// 7. Return youOwe, youAreOwed, totalBalance, and detailed lists.
export const getUserBalances = query({
  handler: async (ctx) => {
    // this fetches the logged-in user’s ID.
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Collect all 1‑to‑1 expenses where the user is involved (payer or splitter).
    // Only expenses user paid or is part of (split).
    const expenses = (await ctx.db.query("expenses").collect()).filter(
      (e) =>
        !e.groupId && // 1‑to‑1 only
        (e.paidByUserId === user._id ||
          e.splits.some((s) => s.userId === user._id))
    );

    let youOwe = 0; // money user ko dena
    let youAreOwed = 0; // money others user se lena
    const balanceByUser = {}; // track per-person balances

    for (const e of expenses) {
      const isPayer = e.paidByUserId === user._id;
      const mySplit = e.splits.find((s) => s.userId === user._id);

      // You paid for someone
      if (isPayer) {
        for (const s of e.splits) {
          if (s.userId === user._id || s.paid) continue;
          youAreOwed += s.amount;
          (balanceByUser[s.userId] ??= { owed: 0, owing: 0 }).owed += s.amount;
        }
      }
      // User didn’t pay → dene hai kisiko
      else if (mySplit && !mySplit.paid) {
        youOwe += mySplit.amount;
        (balanceByUser[e.paidByUserId] ??= { owed: 0, owing: 0 }).owing +=
          mySplit.amount;
      }
    }

    // Apply settlements (subtract amounts already paid/settled).
    const settlements = (await ctx.db.query("settlements").collect()).filter(
      (s) =>
        !s.groupId &&
        (s.paidByUserId === user._id || s.receivedByUserId === user._id)
    );
    // If user already paid someone → subtract from youOwe.
    // If someone already paid user → subtract from youAreOwed.
    for (const s of settlements) {
      if (s.paidByUserId === user._id) {
        youOwe -= s.amount;
        (balanceByUser[s.receivedByUserId] ??= { owed: 0, owing: 0 }).owing -=
          s.amount;
      } else {
        youAreOwed -= s.amount;
        (balanceByUser[s.paidByUserId] ??= { owed: 0, owing: 0 }).owed -=
          s.amount;
      }
    }

    /* build lists for UI */
    const youOweList = [];  // Who you owe and how much
    const youAreOwedByList = [];  // Who owes you and how much
    for (const [uid, { owed, owing }] of Object.entries(balanceByUser)) {
      const net = owed - owing;
      if (net === 0) continue;
      const counterpart = await ctx.db.get(uid);
      const base = {
        userId: uid,
        name: counterpart?.name ?? "Unknown",
        imageUrl: counterpart?.imageUrl,
        amount: Math.abs(net),
      };
      net > 0 ? youAreOwedByList.push(base) : youOweList.push(base);
    }

    youOweList.sort((a, b) => b.amount - a.amount);
    youAreOwedByList.sort((a, b) => b.amount - a.amount);

    return {
      youOwe,         // total money you owe
      youAreOwed,     // total money you are owed
      totalBalance: youAreOwed - youOwe,
      oweDetails: { youOwe: youOweList, youAreOwedBy: youAreOwedByList },
    };
  },
});


// Get total spent in the "current year"
// Purpose: This function calculates how much money the current user has spent in the current year, considering only their personal share of each expense.
// ✅ Simple idea: “How much did I personally spend this year?”
// Step:
// 1. Get the current user → fetch the logged-in user’s ID.
// 2. Determine the start of the year → only consider expenses from Jan 1 of the current year.
// 3. Fetch all expenses from this year from the database.
// 4. Filter expenses involving the user → either the user paid or is part of the split.
// 5. Sum the user’s share of each expense → add only what the user actually paid.
// 6. Return the total spent → a single number representing money the user spent this year.
export const getTotalSpent = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Get start of current year timestamp
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    // Get all expenses on or after Jan 1 of this year.
    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_date", (q) => q.gte("date", startOfYear))
      .collect();

    // Only keep expenses where the user paid or is part of a split.
    const userExpenses = expenses.filter(
      (expense) =>
        expense.paidByUserId === user._id ||
        expense.splits.some((split) => split.userId === user._id)
    ); 

    // Calculate total spent (personal share only)
    let totalSpent = 0;
    // Loop through each expense.
    // Find user’s share (userSplit.amount) and add it to totalSpent.
    userExpenses.forEach((expense) => {
      const userSplit = expense.splits.find(
        (split) => split.userId === user._id
      );
      if (userSplit) {
        totalSpent += userSplit.amount;
      }
    });

    return totalSpent;
  },
});


// Get each monthly spending
// Purpose: Calculate how much the current user spent each month in the current year.
//Step:
// 1. Get Current User
// 2. Determine Start of Year
// 3. Fetch All Expenses from DB
// 4. Filter Expenses Involving User paid or in splits
// 5. Prepare Monthly Totals
    // Initialize an object for all 12 months with value 0.
    // Ensures each month has an entry, even if no expense.
// 6. Calculate User’s Share per Month
    // For each expense:
      // Find the month it belongs to.
      // Get user’s split amount.
      // Add to that month’s total.
// 7. Convert Object to Array
// 8. Sort by Month
export const getMonthlySpending = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Get current year
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    // Get all expenses for current year
    const allExpenses = await ctx.db
      .query("expenses")
      .withIndex("by_date", (q) => q.gte("date", startOfYear))
      .collect();

    // Filter for expenses where user is involved
    const userExpenses = allExpenses.filter(
      (expense) =>
        expense.paidByUserId === user._id ||
        expense.splits.some((split) => split.userId === user._id)
    );

    // Group expenses by month
    // Initialize all 12 months with 0 so every month is represented.
    const monthlyTotals = {};
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(currentYear, i, 1);
      monthlyTotals[monthDate.getTime()] = 0;
    }

    // For each expense, calculate which month it belongs to, and add only the user’s share.
    userExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      const monthStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        1
      ).getTime();

      // Get user's share of this expense
      const userSplit = expense.splits.find(
        (split) => split.userId === user._id
      );
      if (userSplit) {
        monthlyTotals[monthStart] =
          (monthlyTotals[monthStart] || 0) + userSplit.amount;
      }
    });

    // Convert to array format
    // Convert object {monthTimestamp: total} to an array of {month, total} for UI.
    const result = Object.entries(monthlyTotals).map(([month, total]) => ({
      month: parseInt(month),
      total,
    }));

    // Ensure months are in ascending order (Jan → Dec).
    result.sort((a, b) => a.month - b.month);

    return result;
  },
});


// Get groups for the current user
// Purpose: Fetch all groups that the current user is part of and calculate the net balance (how much the user owes or is owed) for each group.
// step:
// 1. Get the current logged-in user
// 2. Get all groups from database
// 3. Filter only groups where this user is a member
// 4. For each of those groups:
    // Fetch all expenses in that group
    // Calculate how much user should receive or pay based on splits
    // Fetch settlements done in that group
    // Adjust balance using those settlements
// 5. Return the list of groups with the final balance for each group
export const getUserGroups = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    // Get every group stored in database.
    const allGroups = await ctx.db.query("groups").collect();

    // Filter for groups where the user is a member
    const groups = allGroups.filter((group) =>
      group.members.some((member) => member.userId === user._id)
    );

    // We iterate each group and calculate money balance for user.
    const enhancedGroups = await Promise.all(
      groups.map(async (group) => {

        // This gives all expenses added in this group.
        const expenses = await ctx.db
          .query("expenses")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect();

        let balance = 0;

        // Case 1: User paid that bill
        //     → Others owe them → add to balance
        // Case 2: Someone else paid
        //     → User owes them → subtract from balance
        expenses.forEach((expense) => {
          if (expense.paidByUserId === user._id) {
            // User paid for others
            expense.splits.forEach((split) => {
              if (split.userId !== user._id && !split.paid) {
                balance += split.amount;
              }
            });
          } else {
            // User owes someone else
            const userSplit = expense.splits.find(
              (split) => split.userId === user._id
            );
            if (userSplit && !userSplit.paid) {
              balance -= userSplit.amount;
            }
          }
        });

        // Apply settlements
        const settlements = await ctx.db
          .query("settlements")
          .filter((q) =>
            q.and(
              q.eq(q.field("groupId"), group._id),
              q.or(
                q.eq(q.field("paidByUserId"), user._id),
                q.eq(q.field("receivedByUserId"), user._id)
              )
            )
          )
          .collect();

        settlements.forEach((settlement) => {
          if (settlement.paidByUserId === user._id) {
            // User paid someone
            balance += settlement.amount;
          } else {
            // Someone paid the user
            balance -= settlement.amount;
          }
        });

        //  Attach balance with group data.
        return {
          ...group,
          id: group._id,
          balance,
        };
      })
    );

    return enhancedGroups;
  },
});