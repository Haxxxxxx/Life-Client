import {
  type Firestore,
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";
import type { Budget, BudgetStatus, NewBudget, NewTransaction, Transaction, TransactionCategory } from "./types";

function transactionsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "transactions");
}

function budgetsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "budgets");
}

export function subscribeTransactions(
  db: Firestore,
  uid: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(transactionsCollection(db, uid), orderBy("date", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Transaction)),
    (error) => onError?.(error),
  );
}

export async function createTransaction(db: Firestore, uid: string, transaction: NewTransaction): Promise<string> {
  const ref = await addDoc(transactionsCollection(db, uid), {
    ...transaction,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function deleteTransaction(db: Firestore, uid: string, transactionId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "transactions", transactionId));
}

export function subscribeBudgets(
  db: Firestore,
  uid: string,
  onChange: (budgets: Budget[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const q = query(budgetsCollection(db, uid), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snapshot) => onChange(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Budget)),
    (error) => onError?.(error),
  );
}

export async function createBudget(db: Firestore, uid: string, budget: NewBudget): Promise<string> {
  const ref = await addDoc(budgetsCollection(db, uid), { ...budget, createdAt: new Date().toISOString() });
  return ref.id;
}

export async function updateBudget(
  db: Firestore,
  uid: string,
  budgetId: string,
  patch: Partial<NewBudget>,
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "budgets", budgetId), patch);
}

export async function deleteBudget(db: Firestore, uid: string, budgetId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "budgets", budgetId));
}

/** YYYY-MM for the given date (local time), defaulting to now. */
export function monthKey(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** Sum of expense transactions in the given month (defaults to the current month), optionally filtered by category. */
export function computeMonthlySpend(
  transactions: Transaction[],
  category?: TransactionCategory,
  month: string = monthKey(),
): number {
  return transactions
    .filter((t) => t.type === "expense" && t.date.startsWith(month) && (!category || t.category === category))
    .reduce((sum, t) => sum + t.amount, 0);
}

export function computeBudgetStatus(
  budget: Budget,
  transactions: Transaction[],
  month: string = monthKey(),
): BudgetStatus {
  const spent = computeMonthlySpend(transactions, budget.category, month);
  return {
    spent,
    limit: budget.monthlyLimit,
    percent: budget.monthlyLimit > 0 ? spent / budget.monthlyLimit : 0,
    remaining: budget.monthlyLimit - spent,
  };
}
