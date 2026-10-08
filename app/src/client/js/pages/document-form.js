import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { listDocuments, createDocument, updateDocument, getDocument, getDocumentFileUrl } from '../api/documents.js';

/* Document form — upload or edit metadata. */

const form = document.getElementById('document-form');
const statusEl = document.getElementById('form-status');
const titleEl = document.getElementById('form-title');
const submitBtn = form.querySelector('[data-submit]');
const fileSection = document.getElementById('file-section');
const metadataSection = document.getElementById('metadata-section');
const fileInput = document.getElementById('file');
const referenceTypeSelect = document.getElementById('referenceType');
const referenceIdSelect = document.getElementById('referenceId');
const referenceIdField = document.getElementById('reference-id-field');

let documentId = null;
let isEditing = false;
let currentFile = null;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadReferenceOptions(type) {
  referenceIdSelect.length = 1;
  referenceIdField.hidden = true;

  if (!type) return;

  try {
    let data;
    if (type === 'MAINTENANCE') {
      const { listMaintenance } = await import('../api/home.js');
      data = await listMaintenance({ limit: 100 });
      for (const item of data.items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.title} (${item.category})`;
        referenceIdSelect.append(option);
      }
    } else if (type === 'FINANCE_TRANSACTION') {
      const { listTransactions } = await import('../api/finance.js');
      data = await listTransactions({ limit: 100 });
      for (const item of data.items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = `${item.description} (${item.amount})`;
        referenceIdSelect.append(option);
      }
    } else if (type === 'INVENTORY') {
      const { listInventory } = await import('../api/inventory.js');
      data = await listInventory({ limit: 100 });
      for (const item of data.items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        referenceIdSelect.append(option);
      }
    } else if (type === 'FAMILY_MEMBER') {
      const { listMembers } = await import('../api/family.js');
      data = await listMembers({ includeArchived: false, limit: 100 });
      for (const item of data.items) {
        const option = document.createElement('option');
        option.value = item.id;
        option.textContent = item.name;
        referenceIdSelect.append(option);
      }
    }
    referenceIdField.hidden = false;
  } catch {
    // Ignore
  }
}

async function loadDocument() {
  form.classList.add('form--loading');
  submitBtn.disabled = true;
  fileSection.hidden = true;
  metadataSection.hidden = false;
  submitBtn.textContent = 'Save';
  submitBtn.disabled = false;

  try {
    const data = await getDocument(documentId);
    form.title.value = data.title;
    form.description.value = data.description ?? '';
    form.category.value = data.category ?? 'OTHER';
    form.expiryDate.value = data.expiryDate ?? '';
    form.referenceType.value = data.referenceType ?? '';
    await loadReferenceOptions(data.referenceType);
    form.referenceId.value = data.referenceId ?? '';
    titleEl.textContent = 'Edit document';
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    form.classList.remove('form--loading');
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus(statusEl, '');

  const metadata = {
    title: form.title.value.trim(),
    description: form.description.value.trim() || null,
    category: form.category.value,
    expiryDate: form.expiryDate.value || null,
    referenceType: form.referenceType.value || null,
    referenceId: form.referenceId.value || null,
  };

  try {
    if (isEditing) {
      await updateDocument(documentId, metadata);
      toast('Document updated.', { type: 'success' });
    } else {
      if (!currentFile) {
        setStatus(statusEl, 'Please select a file.', 'error');
        return;
      }
      await createDocument(currentFile, metadata);
      toast('Document uploaded.', { type: 'success' });
    }
    window.location.assign('/pages/documents.html');
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

fileInput.addEventListener('change', () => {
  currentFile = fileInput.files[0];
  if (currentFile) {
    if (!form.title.value) {
      form.title.value = currentFile.name.replace(/\.[^/.]+$/, '');
    }
    submitBtn.disabled = false;
  } else {
    submitBtn.disabled = true;
  }
});

referenceTypeSelect.addEventListener('change', () => {
  loadReferenceOptions(referenceTypeSelect.value);
});

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  documentId = getQueryId();
  isEditing = Boolean(documentId);

  if (isEditing) {
    await loadDocument();
  }

  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});