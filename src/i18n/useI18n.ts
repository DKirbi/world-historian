import { useTimeline } from '@/state/store';
import { createI18n, type I18n } from './i18n';

/** The reader's language: messages, names and formatting. Re-renders when the language changes. */
export function useI18n(): I18n {
  const locale = useTimeline((st) => st.locale);
  return createI18n(locale);
}
