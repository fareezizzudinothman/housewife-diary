import { prisma } from '../utils/prisma.js';

const DOCUMENT_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  originalName: true,
  storedName: true,
  mimeType: true,
  sizeBytes: true,
  expiryDate: true,
  referenceType: true,
  referenceId: true,
  createdAt: true,
  updatedAt: true,
};

export function findDocumentById(id, householdId) {
  return prisma.document.findFirst({
    where: { id, householdId },
    select: {
      ...DOCUMENT_SELECT,
      uploadedBy: { select: { id: true, name: true } },
    },
  });
}

export function listDocuments(householdId, { search, category, referenceType, page, limit }) {
  return prisma.document.findMany({
    where: {
      householdId,
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      ...(category ? { category } : {}),
      ...(referenceType ? { referenceType } : {}),
    },
    select: {
      ...DOCUMENT_SELECT,
      uploadedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    skip: (page - 1) * limit,
    take: limit,
  });
}

export function countDocuments(householdId, { search, category, referenceType }) {
  return prisma.document.count({
    where: {
      householdId,
      ...(search ? { title: { contains: search, mode: 'insensitive' } } : {}),
      ...(category ? { category } : {}),
      ...(referenceType ? { referenceType } : {}),
    },
  });
}

export function countDocumentsExpiringSoon(householdId, asOfDate, horizonDate) {
  return prisma.document.count({
    where: {
      householdId,
      expiryDate: { gte: asOfDate, lte: horizonDate },
    },
  });
}

export function createDocument(data) {
  return prisma.document.create({
    data,
    select: DOCUMENT_SELECT,
  });
}

export function updateDocument(id, householdId, data) {
  return prisma.document.update({
    where: { id },
    data,
    select: DOCUMENT_SELECT,
  });
}

export function deleteDocument(id, householdId) {
  return prisma.document.deleteMany({
    where: { id, householdId },
  });
}

export function listDocumentsForExport(householdId) {
  return prisma.document.findMany({
    where: { householdId },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      expiryDate: true,
      referenceType: true,
      referenceId: true,
      uploadedBy: { select: { id: true, name: true } },
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}