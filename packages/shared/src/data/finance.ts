import * as fb from "../finance";
import * as sb from "../supabase/finance";
import type { Budget, NewBudget, NewTransaction, Transaction } from "../types";
import { getDataBackend } from "./backend";

export { monthKey, computeMonthlySpend, computeBudgetStatus } from "../finance";

export function subscribeTransactions(
  uid: string,
  onChange: (transactions: Transaction[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeTransactions(b.firestore, uid, onChange, onError)
    : sb.subscribeTransactionsSb(b.client, uid, onChange, onError);
}

export function createTransaction(uid: string, transaction: NewTransaction): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createTransaction(b.firestore, uid, transaction)
    : sb.createTransactionSb(b.client, uid, transaction);
}

export function deleteTransaction(uid: string, transactionId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteTransaction(b.firestore, uid, transactionId)
    : sb.deleteTransactionSb(b.client, uid, transactionId);
}

export function subscribeBudgets(
  uid: string,
  onChange: (budgets: Budget[]) => void,
  onError?: (error: Error) => void,
): () => void {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.subscribeBudgets(b.firestore, uid, onChange, onError)
    : sb.subscribeBudgetsSb(b.client, uid, onChange, onError);
}

export function createBudget(uid: string, budget: NewBudget): Promise<string> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.createBudget(b.firestore, uid, budget)
    : sb.createBudgetSb(b.client, uid, budget);
}

export function updateBudget(uid: string, budgetId: string, patch: Partial<NewBudget>): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.updateBudget(b.firestore, uid, budgetId, patch)
    : sb.updateBudgetSb(b.client, uid, budgetId, patch);
}

export function deleteBudget(uid: string, budgetId: string): Promise<void> {
  const b = getDataBackend();
  return b.provider === "firebase"
    ? fb.deleteBudget(b.firestore, uid, budgetId)
    : sb.deleteBudgetSb(b.client, uid, budgetId);
}
