import { NextResponse } from 'next/server'

export async function GET(_req: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params
  return NextResponse.redirect(new URL(`/reports/attestation/${memberId}`, _req.url))
}
