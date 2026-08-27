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
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

const CATEGORY_LABEL = Object.fromEntries(TRANSACTION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TransactionCategory,
  string
>;

function formatMoney(amount: number): string {
  return amount.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function RecurrencePicker({
  value,
  onChange,
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
}) {
  const theme = useTheme();
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === 'weekly' ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: 'weekly', interval, daysOfWeek: next });
  }

  return (
    <View style={{ gap: Spacing.one }}>
      <View style={styles.chipRow}>
        {(['none', 'daily', 'weekly', 'monthly'] as const).map((f) => {
          const active = (f === 'none' && !freq) || f === freq;
          return (
            <Pressable
              key={f}
              onPress={() => setFreq(f === 'none' ? undefined : f)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small" style={active ? { fontWeight: '700' } : undefined}>
                {f === 'none' ? 'One-time' : f}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {freq && (
        <View style={styles.recurrenceIntervalRow}>
          <ThemedText type="small" themeColor="textSecondary">
            every
          </ThemedText>
          <TextInput
            value={String(interval)}
            onChangeText={(text) => onChange({ freq, interval: Number(text) || 1, daysOfWeek: value?.daysOfWeek })}
            keyboardType="number-pad"
            style={[styles.intervalInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {freq === 'daily' ? 'day(s)' : freq === 'weekly' ? 'week(s)' : 'month(s)'}
          </ThemedText>
        </View>
      )}
      {freq === 'weekly' && (
        <View style={styles.chipRow}>
          {WEEKDAY_LABELS.map((label, i) => {
            const active = daysOfWeek.includes(i);
            return (
              <Pressable
                key={i}
                onPress={() => toggleDay(i)}
                style={[styles.weekdayChip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
                <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

function TransactionForm({ onSubmit }: { onSubmit: (input: NewTransaction) => void }) {
  const theme = useTheme();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);

  const parsedAmount = Number(amount);
  const canSubmit = amount.trim().length > 0 && parsedAmount > 0 && date.trim().length > 0;

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.chipRow}>
        {(['expense', 'income'] as const).map((t) => {
          const active = type === t;
          return (
            <Pressable
              key={t}
              onPress={() => setType(t)}
              style={[styles.typeButton, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {t}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRowWrap}>
        {TRANSACTION_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {c.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} />
      <Pressable
        disabled={!canSubmit}
        onPress={() =>
          onSubmit({
            type,
            amount: parsedAmount,
            category,
            note: note.trim() || undefined,
            date,
            recurrence,
          })
        }
        style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: canSubmit ? 1 : 0.5 }]}>
        <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Log it</ThemedText>
      </Pressable>
    </View>
  );
}

function BudgetForm({ onSubmit }: { onSubmit: (input: NewBudget) => void }) {
  const theme = useTheme();
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const parsedLimit = Number(monthlyLimit);

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.chipRowWrap}>
        {TRANSACTION_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Pressable
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {c.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={monthlyLimit}
        onChangeText={setMonthlyLimit}
        placeholder="Monthly limit"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <Pressable
        disabled={!monthlyLimit.trim() || parsedLimit <= 0}
        onPress={() => onSubmit({ category, monthlyLimit: parsedLimit })}
        style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: parsedLimit > 0 ? 1 : 0.5 }]}>
        <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>Set budget</ThemedText>
      </Pressable>
    </View>
  );
}

export default function MoneyScreen() {
  const { user } = useAuth();
  const theme = useTheme();
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
      setError(err instanceof Error ? err.message : 'Could not log transaction');
    }
  }

  async function handleAddBudget(input: NewBudget) {
    if (!user || !db) return;
    setError(null);
    try {
      await createBudget(db, user.uid, input);
      setBudgetFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not set budget');
    }
  }

  const thisMonth = monthKey();
  const monthlyExpense = computeMonthlySpend(transactions, undefined, thisMonth);
  const monthlyIncome = transactions
    .filter((t) => t.type === 'income' && t.date.startsWith(thisMonth))
    .reduce((sum, t) => sum + t.amount, 0);
  const subscriptions = transactions.filter((t) => t.recurrence);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Money
            </ThemedText>
            <ThemedText type="subtitle">Money</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log expenses/income, track budgets by category, and watch subscriptions.
            </ThemedText>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle" style={{ color: '#dc2626' }}>
                {formatMoney(monthlyExpense)}
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
                Spent
              </ThemedText>
            </View>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle" themeColor="primary">
                {formatMoney(monthlyIncome)}
              </ThemedText>
              <ThemedText type="code" themeColor="textSecondary" style={styles.statLabel}>
                Income
              </ThemedText>
            </View>
          </View>

          {error && (
            <ThemedText themeColor="text" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle">Log a transaction</ThemedText>
            {!txFormOpen && (
              <Pressable
                onPress={() => setTxFormOpen(true)}
                style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
                <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                  New transaction
                </ThemedText>
              </Pressable>
            )}
          </View>
          {txFormOpen && <TransactionForm onSubmit={handleAddTransaction} />}

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle">Budgets</ThemedText>
            {!budgetFormOpen && (
              <Pressable
                onPress={() => setBudgetFormOpen(true)}
                style={[styles.smallOutlineButton, { borderColor: theme.border }]}>
                <ThemedText type="small" style={{ fontWeight: '700' }}>
                  New budget
                </ThemedText>
              </Pressable>
            )}
          </View>
          {budgetFormOpen && <BudgetForm onSubmit={handleAddBudget} />}
          <View style={{ gap: Spacing.two }}>
            {budgets.map((budget) => {
              const status = computeBudgetStatus(budget, transactions, thisMonth);
              const over = status.percent > 1;
              return (
                <ThemedView key={budget.id} type="backgroundElement" style={[styles.budgetCard, { borderColor: theme.border }]}>
                  <View style={styles.sectionHeaderRow}>
                    <ThemedText type="smallBold">{CATEGORY_LABEL[budget.category]}</ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                      <ThemedText type="code" style={over ? { color: '#dc2626' } : undefined} themeColor={over ? undefined : 'textSecondary'}>
                        {formatMoney(status.spent)} / {formatMoney(status.limit)}
                      </ThemedText>
                      <Pressable onPress={() => user && db && deleteBudget(db, user.uid, budget.id)}>
                        <ThemedText type="small" style={styles.deleteText}>
                          Delete
                        </ThemedText>
                      </Pressable>
                    </View>
                  </View>
                  <View style={[styles.progressTrack, { borderColor: theme.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(100, Math.round(status.percent * 100))}%`, backgroundColor: over ? '#dc2626' : theme.primary },
                      ]}
                    />
                  </View>
                </ThemedView>
              );
            })}
            {budgets.length === 0 && !budgetFormOpen && (
              <ThemedText themeColor="textSecondary" style={styles.emptyText}>
                No budgets set yet — add one above to start tracking a category.
              </ThemedText>
            )}
          </View>

          {subscriptions.length > 0 && (
            <View style={{ gap: Spacing.two }}>
              <ThemedText type="subtitle">Subscriptions</ThemedText>
              {subscriptions.map((tx) => (
                <View key={tx.id} style={[styles.row, { borderColor: theme.border }]}>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold">{tx.note || CATEGORY_LABEL[tx.category]}</ThemedText>
                    <ThemedText type="code" themeColor="textSecondary">
                      {formatMoney(tx.amount)} · {describeRecurrence(tx.recurrence!)} · next{' '}
                      {nextOccurrenceDate(tx.date, tx.recurrence!)}
                    </ThemedText>
                  </View>
                </View>
              ))}
            </View>
          )}

          <View style={{ gap: Spacing.two }}>
            <ThemedText type="subtitle">Recent transactions</ThemedText>
            {transactions.map((tx) => (
              <View key={tx.id} style={[styles.row, { borderColor: theme.border }]}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="smallBold">{tx.note || CATEGORY_LABEL[tx.category]}</ThemedText>
                  <ThemedText type="code" themeColor="textSecondary">
                    {tx.date} · {CATEGORY_LABEL[tx.category]}
                    {tx.recurrence && ` · ↻ ${describeRecurrence(tx.recurrence)}`}
                  </ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: Spacing.half }}>
                  <ThemedText type="smallBold" style={tx.type === 'expense' ? { color: '#dc2626' } : { color: theme.primary }}>
                    {tx.type === 'expense' ? '-' : '+'}
                    {formatMoney(tx.amount)}
                  </ThemedText>
                  <Pressable onPress={() => user && db && deleteTransaction(db, user.uid, tx.id)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete
                    </ThemedText>
                  </Pressable>
                </View>
              </View>
            ))}
            {transactions.length === 0 && (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText themeColor="textSecondary">No transactions yet — log your first one above.</ThemedText>
              </ThemedView>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statTile: { flex: 1, borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', gap: 2 },
  statLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  error: {},
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logToggle: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  smallOutlineButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  chipRow: { flexDirection: 'row', gap: Spacing.one },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  typeButton: { flex: 1, borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.one, alignItems: 'center' },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  recurrenceIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  intervalInput: { width: 44, borderWidth: 2, borderRadius: Spacing.half, paddingHorizontal: Spacing.one, paddingVertical: 2 },
  weekdayChip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.one + Spacing.half, paddingVertical: Spacing.half },
  budgetCard: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  progressTrack: { height: 8, borderWidth: 2, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: '100%' },
  deleteText: { color: '#dc2626' },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.three },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
