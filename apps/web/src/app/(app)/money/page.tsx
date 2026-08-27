"use client";

import {
  TRANSACTION_CATEGORIES,
  WEEKDAY_LABELS,
  computeBudgetStatus,
  computeMonthlySpend,
  createBudget,
  createTransaction,
  deleteBudget,
  deleteTransaction,
  describeRecurrence,
  monthKey,
  nextOccurrenceDate,
  subscribeBudgets,
  subscribeTransactions,
  type Budget,
  type NewBudget,
  type NewTransaction,
  type Recurrence,
  type RecurrenceFreq,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from "@life-client/shared";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";

const CATEGORY_LABEL = Object.fromEntries(TRANSACTION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TransactionCategory,
  string
>;

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
}) {
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === "weekly" ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: "weekly", interval, daysOfWeek: next });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {(["none", "daily", "weekly", "monthly"] as const).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFreq(f === "none" ? undefined : f)}
          className={`rounded-full border-2 px-2.5 py-1 text-xs capitalize ${
            (f === "none" && !freq) || f === freq ? "border-foreground bg-accent" : "border-foreground/30 text-muted"
          }`}
        >
          {f === "none" ? "One-time" : f}
        </button>
      ))}
      {freq && (
        <label className="flex items-center gap-1 text-xs text-muted">
          every
          <input
            type="number"
            min={1}
            value={interval}
            onChange={(e) => onChange({ freq, interval: Number(e.target.value) || 1, daysOfWeek: value?.daysOfWeek })}
            className="w-12 rounded-md border-2 border-foreground bg-background px-1 py-0.5 text-xs"
          />
          {freq === "daily" ? "day(s)" : freq === "weekly" ? "week(s)" : "month(s)"}
        </label>
      )}
      {freq === "weekly" && (
        <div className="flex gap-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`rounded-full border-2 px-1.5 py-1 text-[10px] font-bold ${
                daysOfWeek.includes(i) ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/30 text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TransactionForm({ onSubmit }: { onSubmit: (input: NewTransaction) => void }) {
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("food");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);

  const parsedAmount = Number(amount);
  const canSubmit = amount.trim().length > 0 && parsedAmount > 0 && date;

  return (
    <div className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-4">
      <div className="flex gap-2">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-md border-2 px-3 py-1.5 text-sm font-bold capitalize ${
              type === t ? "border-foreground bg-primary text-primary-foreground" : "border-foreground/30 text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="min-w-0 flex-1 rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted focus:shadow-[2px_2px_0_0_var(--primary)]"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          className="rounded-md border-2 border-foreground bg-background px-2 py-2 text-xs"
        >
          {TRANSACTION_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm outline-none placeholder:text-muted"
      />
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="rounded-md border-2 border-foreground bg-background px-3 py-2 text-sm"
      />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <button
        type="button"
        disabled={!canSubmit}
        onClick={() =>
          onSubmit({
            type,
            amount: parsedAmount,
            category,
            note: note.trim() || undefined,
            date,
            recurrence,
          })
        }
        className="rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-50"
      >
        Log it
      </button>
    </div>
  );
}

function BudgetForm({ onSubmit }: { onSubmit: (input: NewBudget) => void }) {
  const [category, setCategory] = useState<TransactionCategory>("food");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const parsedLimit = Number(monthlyLimit);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border-2 border-dashed border-foreground/40 p-3">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TransactionCategory)}
        className="rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-xs"
      >
        {TRANSACTION_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={0}
        value={monthlyLimit}
        onChange={(e) => setMonthlyLimit(e.target.value)}
        placeholder="Monthly limit"
        className="w-32 rounded-md border-2 border-foreground bg-background px-2 py-1.5 text-sm"
      />
      <button
        type="button"
        disabled={!monthlyLimit.trim() || parsedLimit <= 0}
        onClick={() => onSubmit({ category, monthlyLimit: parsedLimit })}
        className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20 disabled:opacity-50"
      >
        Set budget
      </button>
    </div>
  );
}

export default function MoneyPage() {
  const { user } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [txFormOpen, setTxFormOpen] = useState(false);
  const [budgetFormOpen, setBudgetFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeTransactions(db, user.uid, setTransactions, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeBudgets(db, user.uid, setBudgets);
  }, [user]);

  async function handleAddTransaction(input: NewTransaction) {
    if (!user || !db) return;
    setError(null);
    try {
      await createTransaction(db, user.uid, input);
      setTxFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log transaction");
    }
  }

  async function handleAddBudget(input: NewBudget) {
    if (!user || !db) return;
    setError(null);
    try {
      await createBudget(db, user.uid, input);
      setBudgetFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set budget");
    }
  }

  const thisMonth = monthKey();
  const monthlyExpense = computeMonthlySpend(transactions, undefined, thisMonth);
  const monthlyIncome = transactions
    .filter((t) => t.type === "income" && t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const subscriptions = transactions.filter((t) => t.recurrence);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="font-mono text-xs font-bold tracking-[0.3em] text-primary uppercase">Money</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">Money</h1>
        <p className="text-sm text-muted">Log expenses/income, track budgets by category, and watch subscriptions.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-md border-2 border-foreground bg-surface p-3 text-center">
          <p className="text-2xl font-bold text-red-600">{formatMoney(monthlyExpense)}</p>
          <p className="font-mono text-[10px] text-muted uppercase">Spent this month</p>
        </div>
        <div className="rounded-md border-2 border-foreground bg-surface p-3 text-center">
          <p className="text-2xl font-bold text-primary">{formatMoney(monthlyIncome)}</p>
          <p className="font-mono text-[10px] text-muted uppercase">Income this month</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Log a transaction</h2>
          {!txFormOpen && (
            <button
              type="button"
              onClick={() => setTxFormOpen(true)}
              className="rounded-md border-2 border-foreground bg-primary px-3 py-1.5 font-mono text-xs font-bold text-primary-foreground shadow-[2px_2px_0_0_var(--foreground)] transition hover:-translate-y-0.5 active:translate-y-0 active:shadow-none"
            >
              New transaction
            </button>
          )}
        </div>
        {txFormOpen && <TransactionForm onSubmit={handleAddTransaction} />}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Budgets</h2>
          {!budgetFormOpen && (
            <button
              type="button"
              onClick={() => setBudgetFormOpen(true)}
              className="rounded-md border-2 border-foreground px-3 py-1.5 font-mono text-xs font-bold uppercase hover:bg-accent/20"
            >
              New budget
            </button>
          )}
        </div>
        {budgetFormOpen && <BudgetForm onSubmit={handleAddBudget} />}
        <div className="flex flex-col gap-2">
          {budgets.map((budget) => {
            const status = computeBudgetStatus(budget, transactions, thisMonth);
            const over = status.percent > 1;
            return (
              <div key={budget.id} className="flex flex-col gap-2 rounded-md border-2 border-foreground bg-surface p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{CATEGORY_LABEL[budget.category]}</p>
                  <div className="flex items-center gap-2">
                    <p className={`font-mono text-xs ${over ? "text-red-600" : "text-muted"}`}>
                      {formatMoney(status.spent)} / {formatMoney(status.limit)}
                    </p>
                    <button
                      type="button"
                      onClick={() => user && db && deleteBudget(db, user.uid, budget.id)}
                      className="font-mono text-xs font-bold text-red-600 uppercase hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full border-2 border-foreground bg-background">
                  <div
                    className={`h-full ${over ? "bg-red-600" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, Math.round(status.percent * 100))}%` }}
                  />
                </div>
              </div>
            );
          })}
          {budgets.length === 0 && !budgetFormOpen && (
            <p className="text-sm text-muted">No budgets set yet — add one above to start tracking a category.</p>
          )}
        </div>
      </div>

      {subscriptions.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-bold tracking-tight">Subscriptions</h2>
          <ul className="flex flex-col gap-2">
            {subscriptions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-bold">{tx.note || CATEGORY_LABEL[tx.category]}</p>
                  <p className="font-mono text-xs text-muted uppercase">
                    {formatMoney(tx.amount)} · {describeRecurrence(tx.recurrence!)} · next{" "}
                    {nextOccurrenceDate(tx.date, tx.recurrence!)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-bold tracking-tight">Recent transactions</h2>
        <ul className="flex flex-col gap-2">
          {transactions.map((tx) => (
            <li
              key={tx.id}
              className="flex items-center justify-between gap-3 rounded-md border-2 border-foreground bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{tx.note || CATEGORY_LABEL[tx.category]}</p>
                <p className="font-mono text-xs text-muted uppercase">
                  {tx.date} · {CATEGORY_LABEL[tx.category]}
                  {tx.recurrence && ` · ↻ ${describeRecurrence(tx.recurrence)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className={`font-mono text-sm font-bold ${tx.type === "expense" ? "text-red-600" : "text-primary"}`}>
                  {tx.type === "expense" ? "-" : "+"}
                  {formatMoney(tx.amount)}
                </p>
                <button
                  type="button"
                  onClick={() => user && db && deleteTransaction(db, user.uid, tx.id)}
                  className="font-mono text-xs font-bold text-red-600 uppercase hover:underline"
                >
                  Delete
                </button>
              </div>
            </li>
          ))}
          {transactions.length === 0 && (
            <li className="rounded-md border-2 border-dashed border-foreground/30 px-4 py-8 text-center text-sm text-muted">
              No transactions yet — log your first one above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
