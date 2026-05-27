// [SECURITY FIX - SHIELD-005]
// Sert le fichier security.txt selon la RFC 9116
export async function GET() {
  const content = `Contact: mailto:security@faitierehub.com
Expires: 2027-05-24T00:00:00.000Z
Preferred-Languages: fr, en
Canonical: https://www.faitierehub.com/.well-known/security.txt
Policy: https://www.faitierehub.com/politique-securite`

  return new Response(content, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
