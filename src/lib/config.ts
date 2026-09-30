// Edit the matching single row in supabase/setup.sql to configure the shared challenge.
export const APP_TITLE = 'უშაქროდ';
export const STORAGE_KEY = 'no-sugar-device-token-v1';
export const CHALLENGE = {
  name: '90-დღიანი გამოწვევა',
  startDate: '2026-10-01',
  goalDays: 90,
  calendarDays: 92,
} as const;
