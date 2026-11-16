import {
  TRANSACTION_CATEGORIES,
  computeBudgetStatus,
  computeMonthlySpend,
  describeRecurrence,
  formatMoney,
  formatMoneyShort,
  monthKey,
  monthlyMoneyTrend,
  nextOccurrenceDate,
  spendingSlices,
  spendingTotal,
  toDateStr,
  type Budget,
  type NewBudget,
  type NewTransaction,
  type Recurrence,
  type Transaction,
  type TransactionCategory,
  type TransactionType,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BarTrend, ChartCard, Donut, Legend, withAlpha } from '@/components/charts';
import { Button, Chip, ErrorBanner, PressableScale } from '@/components/ui';
import { RecurrencePicker } from '@/components/recurrence-picker';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Common } from '@/constants/styles';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { confirmDestructive } from '@/lib/confirm';

const CATEGORY_LABEL = Object.fromEntries(TRANSACTION_CATEGORIES.map((c) => [c.id, c.label])) as Record<
  TransactionCategory,
  string
>;



const DONUT_TINTS = [1, 0.72, 0.5, 0.34, 0.22];
const DONUT_MAX_SLICES = DONUT_TINTS.length;
const TREND_MONTHS = 6;

function SpendingCharts({ transactions, month }: { transactions: Transaction[]; month: string }) {
  const theme = useTheme();
  const { slices, monthTotal, trend, net, hasTrend } = useMemo(() => {
    // Ranking and the "other" roll-up are shared with web, which had the same
    // algorithm written out separately. Only the colour is decided here: web
    // tints a CSS variable, this alpha-blends the theme value.
    const slices = spendingSlices(transactions, month, DONUT_MAX_SLICES).map((slice, i) => ({
      label: CATEGORY_LABEL[slice.category],
      value: slice.value,
      color: withAlpha(theme.primary, DONUT_TINTS[Math.min(i, DONUT_TINTS.length - 1)]!),
    }));
    const monthTotal = spendingTotal(transactions, month);
    // Shared with web, which already suppressed an all-zero trend. This screen
    // rendered it whenever any transaction existed, so a user whose history
    // was all older than the window got six invisible bars and "Net +$0".
    const { rows: trend, net, hasTrend } = monthlyMoneyTrend(transactions, TREND_MONTHS);
    return { slices, monthTotal, trend, net, hasTrend };
  }, [transactions, month, theme.primary]);
  const incomeColor = theme.primary;
  const spendColor = withAlpha(theme.textSecondary, 0.55);

  return (
    <View style={{ gap: Spacing.two }}>
      <ChartCard title="Spending by category" summary="This month">
        {monthTotal > 0 ? (
          <Donut slices={slices} centerValue={formatMoneyShort(monthTotal)} centerCaption="spent" formatValue={formatMoneyShort} />
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No spending logged this month yet.
          </ThemedText>
        )}
      </ChartCard>
      <ChartCard
        title={`Last ${TREND_MONTHS} months`}
        summary={hasTrend ? `Net ${net >= 0 ? '+' : '−'}${formatMoneyShort(Math.abs(net))}` : 'No activity'}>
        {!hasTrend ? (
          <ThemedText type="small" themeColor="textSecondary">
            Nothing logged in the last {TREND_MONTHS} months.
          </ThemedText>
        ) : (
          <>
            <BarTrend
              layout="grouped"
              colors={[incomeColor, spendColor]}
              groups={trend.map((r) => ({ label: r.label, values: [r.income, r.spend] }))}
            />
            <Legend
              items={[
                { label: 'Income', color: incomeColor },
                { label: 'Spend', color: spendColor },
              ]}
            />
          </>
        )}
      </ChartCard>
    </View>
  );
}

function TransactionForm({ onSubmit }: { onSubmit: (input: NewTransaction) => void }) {
  const theme = useTheme();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [note, setNote] = useState('');
  // toDateStr (local), not toISOString (UTC). computeMonthlySpend buckets
  // with monthKey(), which is local, so a UTC default booked an evening
  // transaction at UTC-8 into next month — missing from the month the user
  // was still in, for both spend and budgets.
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [recurrence, setRecurrence] = useState<Recurrence | undefined>(undefined);

  const parsedAmount = Number(amount);
  const canSubmit = amount.trim().length > 0 && parsedAmount > 0 && date.trim().length > 0;

  return (
    <View style={[Common.form, { borderColor: theme.border }]}>
      <View style={styles.chipRow}>
        {(['expense', 'income'] as const).map((t) => {
          const active = type === t;
          return (
            <PressableScale
              key={t}
              onPress={() => setType(t)}
              style={[styles.typeButton, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {t}
              </ThemedText>
            </PressableScale>
          );
        })}
      </View>
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={Common.chipRow}>
        {TRANSACTION_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Chip
              key={c.id}
              label={c.label}
              active={active}
              onPress={() => setCategory(c.id)}
            />
          );
        })}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="Note (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <RecurrencePicker value={recurrence} onChange={setRecurrence} noneLabel="One-time" />
      <Button
        label="Log it"
        onPress={() =>
          onSubmit({
            type,
            amount: parsedAmount,
            category,
            note: note.trim() || undefined,
            date,
            recurrence,
          })}
        disabled={!canSubmit}
      />
    </View>
  );
}

function BudgetForm({ onSubmit }: { onSubmit: (input: NewBudget) => void }) {
  const theme = useTheme();
  const [category, setCategory] = useState<TransactionCategory>('food');
  const [monthlyLimit, setMonthlyLimit] = useState('');
  const parsedLimit = Number(monthlyLimit);

  return (
    <View style={[Common.form, { borderColor: theme.border }]}>
      <View style={Common.chipRow}>
        {TRANSACTION_CATEGORIES.map((c) => {
          const active = c.id === category;
          return (
            <Chip
              key={c.id}
              label={c.label}
              active={active}
              onPress={() => setCategory(c.id)}
            />
          );
        })}
      </View>
      <TextInput
        value={monthlyLimit}
        onChangeText={setMonthlyLimit}
        placeholder="Monthly limit"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <Button
        label="Set budget"
        onPress={() => onSubmit({ category, monthlyLimit: parsedLimit })}
        disabled={!monthlyLimit.trim() || parsedLimit <= 0}
      />
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
    if (!user) return;
    return data.subscribeTransactions(user.uid, setTransactions, (err) => setError(err.message));
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return data.subscribeBudgets(user.uid, setBudgets, (err) => setError(err.message));
  }, [user]);

  async function handleAddTransaction(input: NewTransaction) {
    if (!user) return;
    setError(null);
    try {
      await data.createTransaction(user.uid, input);
      setTxFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log transaction');
    }
  }

  async function handleAddBudget(input: NewBudget) {
    if (!user) return;
    setError(null);
    try {
      await data.createBudget(user.uid, input);
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
    <ThemedView style={Common.screen}>
      <SafeAreaView style={Common.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={Common.eyebrow}>
              Money
            </ThemedText>
            <ThemedText type="subtitle">Money</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Log expenses/income, track budgets by category, and watch subscriptions.
            </ThemedText>
          </View>

          <View style={styles.statsRow}>
            <View style={[styles.statTile, { borderColor: theme.border }]}>
              <ThemedText type="subtitle" style={{ color: theme.danger }}>
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

          {transactions.length > 0 && <SpendingCharts transactions={transactions} month={thisMonth} />}

          <ErrorBanner>{error}</ErrorBanner>

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={styles.sectionHeaderTitle}>
              Log a transaction
            </ThemedText>
            {!txFormOpen && (
              <Button
                label="New transaction"
                onPress={() => setTxFormOpen(true)}
              />
            )}
          </View>
          {txFormOpen && <TransactionForm onSubmit={handleAddTransaction} />}

          <View style={styles.sectionHeaderRow}>
            <ThemedText type="subtitle" style={styles.sectionHeaderTitle}>
              Budgets
            </ThemedText>
            {!budgetFormOpen && (
              <Button
                label="New budget"
                onPress={() => setBudgetFormOpen(true)}
                variant="outline"
              />
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
                    <ThemedText type="smallBold" style={styles.sectionHeaderTitle}>
                      {CATEGORY_LABEL[budget.category]}
                    </ThemedText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
                      <ThemedText type="code" style={over ? { color: theme.danger } : undefined} themeColor={over ? undefined : 'textSecondary'}>
                        {formatMoney(status.spent)} / {formatMoney(status.limit)}
                      </ThemedText>
                      <PressableScale
                        onPress={() =>
                          user &&
                          confirmDestructive({
                            title: 'Delete this budget?',
                            onConfirm: () => data.deleteBudget(user.uid, budget.id),
                          })
                        }
                        hitSlop={8}>
                        <ThemedText type="small" themeColor="danger">
                          Delete
                        </ThemedText>
                      </PressableScale>
                    </View>
                  </View>
                  <View style={[styles.progressTrack, { borderColor: theme.border }]}>
                    <View
                      style={[
                        Common.progressFill,
                        { width: `${Math.min(100, Math.round(status.percent * 100))}%`, backgroundColor: over ? theme.danger : theme.primary },
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
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {tx.note || CATEGORY_LABEL[tx.category]}
                    </ThemedText>
                    <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
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
                <View style={{ flex: 1, minWidth: 0 }}>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {tx.note || CATEGORY_LABEL[tx.category]}
                  </ThemedText>
                  <ThemedText type="code" themeColor="textSecondary" numberOfLines={1}>
                    {tx.date} · {CATEGORY_LABEL[tx.category]}
                    {tx.recurrence && ` · ↻ ${describeRecurrence(tx.recurrence)}`}
                  </ThemedText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: Spacing.half }}>
                  <ThemedText type="smallBold" style={tx.type === 'expense' ? { color: theme.danger } : { color: theme.primary }}>
                    {tx.type === 'expense' ? '-' : '+'}
                    {formatMoney(tx.amount)}
                  </ThemedText>
                  <PressableScale
                    onPress={() =>
                      user &&
                      confirmDestructive({
                        title: 'Delete this transaction?',
                        onConfirm: () => data.deleteTransaction(user.uid, tx.id),
                      })
                    }
                    hitSlop={8}>
                    <ThemedText type="small" themeColor="danger">
                      Delete
                    </ThemedText>
                  </PressableScale>
                </View>
              </View>
            ))}
            {transactions.length === 0 && (
              <ThemedView type="backgroundElement" style={[Common.emptyState, { borderColor: theme.border }]}>
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
  content: { paddingVertical: Spacing.four, gap: Spacing.four },
  header: { gap: Spacing.one },
  statsRow: { flexDirection: 'row', gap: Spacing.two },
  statTile: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center', gap: 2 },
  statLabel: { textTransform: 'uppercase', letterSpacing: 0.5 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  sectionHeaderTitle: { flexShrink: 1 },
  chipRow: { flexDirection: 'row', gap: Spacing.one },
  typeButton: { flex: 1, borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.one, alignItems: 'center' },
  budgetCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  progressTrack: { height: 8, borderWidth: 1, borderRadius: 999, overflow: 'hidden' },
  emptyText: { textAlign: 'center', paddingVertical: Spacing.three },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
