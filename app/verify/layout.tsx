/**
 * Layout for /verify pages — NO auth providers.
 * This is a public page (QR code scanning) that must work
 * without any authentication context.
 */
export default function VerifyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
