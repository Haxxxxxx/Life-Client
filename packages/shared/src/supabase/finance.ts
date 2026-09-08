import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Budget,
  NewBudget,
  NewTransaction,
  Recurrence,
  Transaction,
  TransactionCategory,
  TransactionType,
} from "../types";
import { subscribeCollection } from "./realtime";
import { randomId } from "./id";

interface TransactionRow {
  id: string;
  type: TransactionType;
  amount: number;
  category: TransactionCategory;
  note: string | null;
  date: string;
  recurrence: Recurrence | null;
  created_at: string;
}

function rowToTransaction(r: TransactionRow): Transaction {
  return {
    id: r.id,
    type: r.type,
    amount: r.amount,
    category: r.category,
    note: r.note ?? undefined,
    date: r.date,
    recurrence: r.recurrence ?? undefined,
    createdAt: r.created_at,
  };
}

interface BudgetRow {
  id: string;
  category: TransactionCategory;
  monthly_limit: number;
  created_at: string;
}

function rowToBudget(r: BudgetRow): Budget {
  return { id: r.id, category: r.category, monthlyLimit: r.monthly_limit, createdAt: r.created_at };
}

export function subscribeTransactionsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<TransactionRow, Transaction>({
    client,
    table: "transactions",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToTransaction,
    order: { column: "date", ascending: false },
    sort: (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
    onChange,
    onError,
  });
}

export async function createTransactionSb(
  client: SupabaseClient,
  userId: string,
  t: NewTransaction,
): Promise<string> {
  const id = randomId();
  const { error } = await client.from("transactions").insert({
    id,
    user_id: userId,
    type: t.type,
    amount: t.amount,
    category: t.category,
    note: t.note ?? null,
    date: t.date,
    recurrence: t.recurrence ?? null,
  });
  if (error) throw new Error(error.message);
  return id;
}

export async function deleteTransactionSb(
  client: SupabaseClient,
  userId: string,
  transactionId: string,
): Promise<void> {
  const { error } = await client
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export function subscribeBudgetsSb(
  client: SupabaseClient,
  userId: string,
  onChange: (budgets: Budget[]) => void,
  onError?: (error: Error) => void,
): () => void {
  return subscribeCollection<BudgetRow, Budget>({
    client,
    table: "budgets",
    filterColumn: "user_id",
    filterValue: userId,
    rowId: (r) => r.id,
    map: rowToBudget,
    order: { column: "created_at", ascending: false },
    sort: (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0),
    onChange,
    onError,
  });
}

export async function createBudgetSb(client: SupabaseClient, userId: string, b: NewBudget): Promise<string> {
  const id = randomId();
  const { error } = await client
    .from("budgets")
    .insert({ id, user_id: userId, category: b.category, monthly_limit: b.monthlyLimit });
  if (error) throw new Error(error.message);
  return id;
}

export async function updateBudgetSb(
  client: SupabaseClient,
  userId: string,
  budgetId: string,
  patch: Partial<NewBudget>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.monthlyLimit !== undefined) row.monthly_limit = patch.monthlyLimit;
  const { error } = await client.from("budgets").update(row).eq("id", budgetId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteBudgetSb(client: SupabaseClient, userId: string, budgetId: string): Promise<void> {
  const { error } = await client.from("budgets").delete().eq("id", budgetId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}
