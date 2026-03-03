import type { FastifyRequest, FastifyReply } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { db } from '../../config/database'
import { BadRequestError } from '../../shared/errors'
import { getAllVerificationsStatus } from './verification.service'
import { createVeriffSession, getKycStatus } from './veriff.service'
import { createSumsubApplicant, getKybStatus } from './sumsub.service'
import {
  submitCreditScore,
  getCreditScoreStatus,
  type CreditScoreDocuments,
} from './credit-score.service'
import {
  startKycSchema,
  startKybSchema,
  creditScoreSubmitSchema,
} from './verification.schema'

// ─── GET /verification/status ─────────────────────────────────────────────────

export async function getStatus(request: FastifyRequest, reply: FastifyReply) {
  const statuses = await getAllVerificationsStatus(request.user.sub)
  return reply.send(statuses)
}

// ─── POST /verification/kyc/start (Individual only) ──────────────────────────

export async function startKyc(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: request.user.sub },
    include: { individualProfile: true },
  })

  const body = startKycSchema.parse(request.body)

  const result = await createVeriffSession({
    userId: user.id,
    walletAddress: user.walletAddress,
    firstName: body.firstName ?? user.individualProfile?.firstName ?? undefined,
    lastName:  body.lastName  ?? user.individualProfile?.lastName  ?? undefined,
  })

  return reply.status(201).send(result)
}

// ─── GET /verification/kyc/status (Individual only) ──────────────────────────

export async function getKycStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getKycStatus(request.user.sub)
  return reply.send(result)
}

// ─── POST /verification/kyb/start (Business only) ────────────────────────────

export async function startKyb(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: request.user.sub },
    include: { businessProfile: true },
  })

  const body = startKybSchema.parse(request.body)

  const result = await createSumsubApplicant({
    userId:        user.id,
    walletAddress: user.walletAddress,
    email:         user.businessProfile?.email ?? undefined,
    levelName:     body.levelName,
  })

  return reply.status(201).send(result)
}

// ─── GET /verification/kyb/status (Business only) ────────────────────────────

export async function getKybStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getKybStatus(request.user.sub)
  return reply.send(result)
}

// ─── POST /verification/credit-score/submit (Business only) ──────────────────

export async function submitCreditScoreHandler(request: FastifyRequest, reply: FastifyReply) {
  const user = await db.user.findUniqueOrThrow({
    where: { id: request.user.sub },
  })

  // Parse multipart: 3 files + JSON body fields
  const parts = request.parts()

  const fileBuffers: Record<string, { buffer: Buffer; filename: string; mimetype: string }> = {}
  const fieldValues: Record<string, string> = {}

  for await (const part of parts) {
    if (part.type === 'file') {
      const file = part as MultipartFile
      const chunks: Buffer[] = []
      for await (const chunk of file.file) {
        chunks.push(chunk)
      }
      fileBuffers[file.fieldname] = {
        buffer:   Buffer.concat(chunks),
        filename: file.filename,
        mimetype: file.mimetype,
      }
    } else {
      fieldValues[part.fieldname] = part.value as string
    }
  }

  // Validate required files
  if (!fileBuffers['income_statement']) throw new BadRequestError('income_statement file is required')
  if (!fileBuffers['balance_sheet'])    throw new BadRequestError('balance_sheet file is required')
  if (!fileBuffers['cash_flow'])        throw new BadRequestError('cash_flow file is required')

  // Parse + validate form fields
  const formData = creditScoreSubmitSchema.parse({
    ...fieldValues,
    employeeCount:  fieldValues['employeeCount']  ? Number(fieldValues['employeeCount'])  : undefined,
    yearsOperating: fieldValues['yearsOperating'] ? Number(fieldValues['yearsOperating']) : undefined,
  })

  const docs: CreditScoreDocuments = {
    incomeStatement: fileBuffers['income_statement'],
    balanceSheet:    fileBuffers['balance_sheet'],
    cashFlow:        fileBuffers['cash_flow'],
  }

  const result = await submitCreditScore(user.id, user.walletAddress, docs, formData)
  return reply.status(201).send(result)
}

// ─── GET /verification/credit-score/status (Business only) ───────────────────

export async function getCreditScoreStatusHandler(request: FastifyRequest, reply: FastifyReply) {
  const result = await getCreditScoreStatus(request.user.sub)
  return reply.send(result)
}
