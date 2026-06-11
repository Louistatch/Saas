/**
 * Shared app-wide constants.
 */

/** Maximum accepted size for CSV imports (5 MiB). */
export const MAX_CSV_IMPORT_SIZE_BYTES = 5 * 1024 * 1024

/**
 * Public base URL of the Haroo platform (emploi saisonnier, préventes,
 * missions d'agronomes). Haroo has its own auth — we link to it, we
 * don't proxy it.
 */
export const HAROO_URL = process.env.NEXT_PUBLIC_HAROO_URL ?? 'https://haroo.tg'
