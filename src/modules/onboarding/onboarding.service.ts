import { db } from '../../config/database'
import { BadRequestError, NotFoundError } from '../../shared/errors'
import type {
  SetAccountTypeInput,
  IndividualProfileInput,
  BusinessProfileInput,
} from './onboarding.schema'

export async function getOnboardingStatus(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      onboardingStep: true,
      accountType: true,
      onboardedAt: true,
    },
  })

  if (!user) throw new NotFoundError('User')

  const nextAction = resolveNextAction(user.onboardingStep)

  return {
    currentStep: user.onboardingStep,
    accountType: user.accountType,
    onboardedAt: user.onboardedAt,
    isComplete: user.onboardingStep === 'COMPLETE',
    nextAction,
  }
}

export async function setAccountType(userId: string, input: SetAccountTypeInput) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.onboardingStep === 'COMPLETE') {
    throw new BadRequestError('Account type cannot be changed after onboarding is complete.')
  }

  return db.user.update({
    where: { id: userId },
    data: {
      accountType: input.accountType,
      onboardingStep: 'TYPE_SELECTED',
    },
    select: {
      onboardingStep: true,
      accountType: true,
    },
  })
}

export async function submitIndividualProfile(
  userId: string,
  input: IndividualProfileInput,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.accountType !== 'INDIVIDUAL') {
    throw new BadRequestError('This endpoint is for Individual accounts only.')
  }

  await db.individualProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: { ...input },
  })

  return db.user.update({
    where: { id: userId },
    data: { onboardingStep: 'PROFILE_COMPLETE' },
    include: { individualProfile: true },
  })
}

export async function submitBusinessProfile(
  userId: string,
  input: BusinessProfileInput,
) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } })

  if (user.accountType !== 'BUSINESS') {
    throw new BadRequestError('This endpoint is for Business accounts only.')
  }

  await db.businessProfile.upsert({
    where: { userId },
    create: { userId, ...input },
    update: { ...input },
  })

  return db.user.update({
    where: { id: userId },
    data: { onboardingStep: 'PROFILE_COMPLETE' },
    include: { businessProfile: true },
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveNextAction(step: string): {
  action: string
  endpoint: string
  description: string
} {
  const actions: Record<string, { action: string; endpoint: string; description: string }> = {
    NOT_STARTED: {
      action: 'SET_ACCOUNT_TYPE',
      endpoint: 'POST /onboarding/type',
      description: 'Choose Individual or Business account type',
    },
    TYPE_SELECTED: {
      action: 'SUBMIT_PROFILE',
      endpoint: 'POST /onboarding/profile',
      description: 'Fill in your profile information',
    },
    PROFILE_COMPLETE: {
      action: 'START_HUMANITY',
      endpoint: 'POST /verification/humanity/start',
      description: 'Start ZKPassport humanity verification (Tier 1)',
    },
    HUMANITY_PENDING: {
      action: 'AWAIT_HUMANITY',
      endpoint: 'GET /verification/humanity/status',
      description: 'Complete ZKPassport verification',
    },
    HUMANITY_COMPLETE: {
      action: 'START_IDENTITY',
      endpoint: 'POST /verification/kyc/start or /verification/kyb/start',
      description: 'Start identity verification for your account type',
    },
    KYC_PENDING: {
      action: 'AWAIT_KYC',
      endpoint: 'GET /verification/kyc/status',
      description: 'Complete Veriff KYC verification',
    },
    KYB_PENDING: {
      action: 'AWAIT_KYB',
      endpoint: 'GET /verification/kyb/status',
      description: 'Complete Sumsub KYB verification',
    },
    LP_COMPLETE: {
      action: 'ONBOARDING_DONE',
      endpoint: 'POST /onboarding/complete',
      description: 'Mark onboarding as complete or continue to Credit Score',
    },
    CREDIT_SCORE_PENDING: {
      action: 'AWAIT_CREDIT_SCORE',
      endpoint: 'GET /verification/credit-score/status',
      description: 'Awaiting credit score evaluation',
    },
    COMPLETE: {
      action: 'NONE',
      endpoint: '',
      description: 'Onboarding complete — full access granted',
    },
  }

  return actions[step] ?? actions.NOT_STARTED
}
