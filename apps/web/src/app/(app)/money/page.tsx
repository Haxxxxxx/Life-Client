"use client";

import {
  TRANSACTION_CATEGORIES,
  computeBudgetStatus,
  computeMonthlySpend,
  describeRecurrence,
  formatMoney,
  monthKey,
  nextOccurrenceDate,
  toDateStr,
  type Budget,
  type NewBudget,
  type NewTransaction,
  type Recurrence,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from "@life-client/shared";
import { data } from "@life-client/shared";
import { useEffect, useMemo, useState } from "react";
import { MoneyCharts } from "@/components/charts";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Card, ErrorText, Input, PageHeader, SkeletonRows, StatTile, pageShellClassName } from "@/components/ui";
import { RecurrencePicker } from "@/components/recurrence-picker";
import { useAuth } from "@/lib/auth-context";

const CATEGORY_LABEL = Object.fromEntries(TRANSACTION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TransactionCategory,
  string
>;


function TransactionForm({ onSubmit }: { onSubmit: (input: NewTransaction) => void }) {
  const [type, setType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<TransactionCategory>("food");
  const [note, setNote] = useState("");
  // toDateStr (local), not toISOString (UTC). computeMonthlySpend buckets
  // with monthKey(), which is local, so a UTC default booked an evening
  // transaction at UTC-8 into next month — missing from the month the user
  // was still in, for both spend and budgets.
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);

  const parsedAmount = Number(amount);
  const canSubmit = amount.trim().length > 0 && parsedAmount > 0 && date;

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex gap-2">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-xl border px-3 py-1.5 text-sm font-bold capitalize ${
              type === t ? "border-border-strong bg-primary text-primary-foreground" : "border-border text-muted"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          type="number"
          min={0}
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="min-w-0 flex-1"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TransactionCategory)}
          className="rounded-xl border border-border-strong bg-background px-2 py-2 text-xs"
        >
          {TRANSACTION_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
      <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
      <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} noneLabel="One-time" />
      <Button
        size="sm"
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
      >
        Log it
      </Button>
    </Card>
  );
}

function BudgetForm({ onSubmit }: { onSubmit: (input: NewBudget) => void }) {
  const [category, setCategory] = useState<TransactionCategory>("food");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const parsedLimit = Number(monthlyLimit);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-border p-3">
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as TransactionCategory)}
        className="rounded-xl border border-border-strong bg-background px-2 py-1.5 text-xs"
      >
        {TRANSACTION_CATEGORIES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Input
        type="number"
        min={0}
        value={monthlyLimit}
        onChange={(e) => setMonthlyLimit(e.target.value)}
        placeholder="Monthly limit"
        size="sm"
        className="w-32"
      />
      <Button
        variant="secondary"
        size="sm"
        disabled={!monthlyLimit.trim() || parsedLimit <= 0}
        onClick={() => onSubmit({ category, monthlyLimit: parsedLimit })}
      >
        Set budget
      </Button>
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

  // Keyed on uid rather than a boolean reset inside the effect: setState in an
  // effect body cascades a render, and deriving it stops a user switch from
  // briefly showing the previous account's rows as loaded.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loaded = Boolean(user) && loadedFor === user?.uid;

  useEffect(() => {
    if (!user) return;
    const uid = user.uid;
    return data.subscribeTransactions(
      uid,
      (next) => {
        setTransactions(next);
        setLoadedFor(uid);
      },
      (err) => setError(err.message),
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeBudgets(user.uid, setBudgets);
  }, [user]);

  async function handleAddTransaction(input: NewTransaction) {
    if (!user) return;
    setError(null);
    try {
      await data.createTransaction(user.uid, input);
      setTxFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log transaction");
    }
  }

  async function handleAddBudget(input: NewBudget) {
    if (!user) return;
    setError(null);
    try {
      await data.createBudget(user.uid, input);
      setBudgetFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not set budget");
    }
  }

  const thisMonth = monthKey();
  const { monthlyExpense, monthlyIncome, subscriptions } = useMemo(() => {
    return {
      monthlyExpense: computeMonthlySpend(transactions, undefined, thisMonth),
      monthlyIncome: transactions
        .filter((t) => t.type === "income" && t.date.startsWith(thisMonth))
        .reduce((sum, t) => sum + t.amount, 0),
      subscriptions: transactions.filter((t) => t.recurrence),
    };
  }, [transactions, thisMonth]);
  const budgetStatuses = useMemo(
    () => budgets.map((budget) => ({ budget, status: computeBudgetStatus(budget, transactions, thisMonth) })),
    [budgets, transactions, thisMonth],
  );

  return (
    <div className={pageShellClassName()}>
      <PageHeader
        eyebrow="Spending"
        title="Money"
        description="Log expenses/income, track budgets by category, and watch subscriptions."
      />

      <div className="grid grid-cols-2 gap-3">
        <StatTile value={formatMoney(monthlyExpense)} label="Spent this month" tone="danger" />
        <StatTile value={formatMoney(monthlyIncome)} label="Income this month" tone="primary" />
      </div>

      {transactions.length > 0 && <MoneyCharts transactions={transactions} />}

      <ErrorText>{error}</ErrorText>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Log a transaction</h2>
          {!txFormOpen && (
            <Button size="sm" onClick={() => setTxFormOpen(true)}>
              New transaction
            </Button>
          )}
        </div>
        {txFormOpen && <TransactionForm onSubmit={handleAddTransaction} />}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold tracking-tight">Budgets</h2>
          {!budgetFormOpen && (
            <Button variant="secondary" size="sm" onClick={() => setBudgetFormOpen(true)}>
              New budget
            </Button>
          )}
        </div>
        {budgetFormOpen && <BudgetForm onSubmit={handleAddBudget} />}
        <div className="flex flex-col gap-2">
          {budgetStatuses.map(({ budget, status }) => {
            const over = status.percent > 1;
            return (
              <Card key={budget.id} padding="sm" className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold">{CATEGORY_LABEL[budget.category]}</p>
                  <div className="flex items-center gap-2">
                    <p className={`font-mono text-xs ${over ? "text-danger" : "text-muted"}`}>
                      {formatMoney(status.spent)} / {formatMoney(status.limit)}
                    </p>
                    <ConfirmButton onConfirm={() => user && data.deleteBudget(user.uid, budget.id)} />
                  </div>
                </div>
                <div className="h-2 overflow-hidden rounded-full border border-border-strong bg-background">
                  <div
                    className={`h-full ${over ? "bg-danger" : "bg-primary"}`}
                    style={{ width: `${Math.min(100, Math.round(status.percent * 100))}%` }}
                  />
                </div>
              </Card>
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
                className="flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3"
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
              className="flex items-center justify-between gap-3 rounded-xl border border-border-strong bg-surface px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-bold">{tx.note || CATEGORY_LABEL[tx.category]}</p>
                <p className="font-mono text-xs text-muted uppercase">
                  {tx.date} · {CATEGORY_LABEL[tx.category]}
                  {tx.recurrence && ` · ↻ ${describeRecurrence(tx.recurrence)}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <p className={`font-mono text-sm font-bold ${tx.type === "expense" ? "text-danger" : "text-primary"}`}>
                  {tx.type === "expense" ? "-" : "+"}
                  {formatMoney(tx.amount)}
                </p>
                <ConfirmButton onConfirm={() => user && data.deleteTransaction(user.uid, tx.id)} />
              </div>
            </li>
          ))}
          {!loaded && (
            <li>
              <SkeletonRows rows={3} />
            </li>
          )}
          {loaded && transactions.length === 0 && (
            <li className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
              No transactions yet — log your first one above.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
