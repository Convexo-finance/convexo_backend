import type { FastifyRequest, FastifyReply } from 'fastify'

export async function requireOnboarded(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (request.user.onboardingStep !== 'COMPLETE') {
    reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'Onboarding must be completed before accessing this resource.',
      onboardingStep: request.user.onboardingStep,
      redirectTo: '/onboarding',
    })
  }
}
