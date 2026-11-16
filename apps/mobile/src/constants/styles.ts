import { StyleSheet } from 'react-native';

import { Spacing } from '@/constants/theme';

/**
 * Layout primitives every screen repeats verbatim.
 *
 * Measured before extracting: of 294 top-level style definitions across the
 * eleven screens, 96 were byte-identical copies of one of the entries below.
 * `screen` and `eyebrow` appeared eleven times each — once per screen —
 * and `safeArea` ten.
 *
 * Only genuinely identical definitions live here. Styles that share a name but
 * have drifted in value (`card`, `addButton`, `progressTrack`) are left where
 * they are: collapsing those would be a design decision, not a refactor, and
 * it would change what the screens render.
 *
 * Colour belongs at the call site, not here. These are shape and spacing only,
 * so a screen still composes `[Common.chip, { borderColor: theme.border }]`
 * and the theme hook stays the single source of colour.
 */
export const Common = StyleSheet.create({
  /** Root view of a screen. */
  screen: { flex: 1 },

  /** The safe-area inset wrapper, with the standard page gutter. */
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },

  /** Small caps label above a section or page title. */
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },

  /** Page/section header block. */
  header: { marginTop: Spacing.four, gap: Spacing.one },

  /** The text column of a header row that also holds an action. */
  headerText: { flex: 1, gap: Spacing.one },

  /** Pill-shaped toggle or filter. Pair with a borderColor at the call site. */
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
  },

  /**
   * Row of chips that wraps.
   *
   * This existed under two names — `chipRow` on three screens and
   * `chipRowWrap` on five — with an identical body, so the two names carried
   * no distinction worth keeping.
   */
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },

  /** Count or status pill. */
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },

  /** Label inside a badge. */
  badgeText: { fontSize: 10 },

  /** Squared-off outline button used for inline log/toggle actions. */
  logToggle: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },

  /** Text input. 44pt because the padded box alone is only about 38. */
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },

  /** Bordered form container. */
  form: {
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },

  /** Panel shown in place of an empty list. */
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },

  /** Filled portion of a progress track. */
  progressFill: { height: '100%' },

  /** A completed item's label. */
  doneText: { textDecorationLine: 'line-through' },
});
