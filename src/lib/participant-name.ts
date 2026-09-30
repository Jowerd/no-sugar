export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/gu, ' ');
}

export function nameKey(name: string): string {
  return normalizeName(name).toLowerCase();
}

// Supabase errors can be plain objects rather than Error instances.
export function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return '';
}
