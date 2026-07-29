/**
 * Shared email template cache invalidation registry.
 * Avoids circular imports between services/email.ts and routes/email-templates.ts.
 */

let _invalidateCallback: ((type: string) => void) | null = null;

export function registerEmailTemplateCacheInvalidator(cb: (type: string) => void): void {
  _invalidateCallback = cb;
}

export function invalidateEmailTemplateCache(type: string): void {
  _invalidateCallback?.(type);
}
