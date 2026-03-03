import { db } from '../../config/database'

// ─── Aggregate all verifications for a user ───────────────────────────────────

export async function getAllVerificationsStatus(userId: string) {
  const verifications = await db.verification.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  const byType: Record<string, (typeof verifications)[number] | null> = {
    HUMANITY:       null,
    KYC_INDIVIDUAL: null,
    KYB_BUSINESS:   null,
  }

  for (const v of verifications) {
    // Keep only the most recent record per type
    if (!byType[v.type]) {
      byType[v.type] = v
    }
  }

  const creditScoreRequest = await db.creditScoreRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  })

  return {
    humanity:       toStatusEntry(byType['HUMANITY']),
    kyc:            toStatusEntry(byType['KYC_INDIVIDUAL']),
    kyb:            toStatusEntry(byType['KYB_BUSINESS']),
    creditScore: creditScoreRequest
      ? { status: creditScoreRequest.status, requestId: creditScoreRequest.id, score: creditScoreRequest.score, rating: creditScoreRequest.rating }
      : { status: 'NOT_STARTED' as const },
  }
}

function toStatusEntry(v: { id: string; status: string; type: string } | null) {
  if (!v) return { status: 'NOT_STARTED' as const }
  return { status: v.status, verificationId: v.id }
}
