import { Alert } from 'react-native';

/**
 * Native confirmation for a destructive action.
 *
 * Delete was a single tap and permanent on tasks, goals, challenges,
 * transactions and reminders — a bare red text link, often around 24pt tall,
 * one mis-tap away from losing data with no undo. A grep for `Alert` across
 * apps/mobile/src returned nothing, so nothing confirmed anything.
 *
 * The platform dialog is the right tool here rather than a custom sheet: it is
 * what users already recognise as "this is irreversible", it gets the
 * destructive styling and button order right per platform for free, and it
 * needs no toast or undo infrastructure.
 */
export function confirmDestructive(options: {
  title: string;
  message?: string;
  confirmLabel?: string;
  onConfirm: () => void;
}): void {
  Alert.alert(
    options.title,
    options.message,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: options.confirmLabel ?? 'Delete', style: 'destructive', onPress: options.onConfirm },
    ],
    { cancelable: true },
  );
}
