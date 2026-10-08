import { initShell, updateUserChip } from '../shell.js';
import { requireSession } from '../state/session.js';
import { describeError, setStatus } from '../utils/forms.js';
import { toast } from '../components/toast.js';
import { listMembers, createMember, updateMember, getMember } from '../api/family.js';

/* Family member form — create or edit. */

const form = document.getElementById('member-form');
const statusEl = document.getElementById('form-status');
const titleEl = document.getElementById('form-title');
const submitBtn = form.querySelector('[data-submit]');
const linkedUserSelect = document.getElementById('linkedUserId');

let memberId = null;
let isEditing = false;

function getQueryId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

async function loadLinkedUsers() {
  try {
    const data = await listMembers({ includeArchived: false, limit: 100 });
    linkedUserSelect.length = 1;
    for (const member of data.items) {
      if (member.linkedUser && (!isEditing || member.id !== memberId)) {
        const option = document.createElement('option');
        option.value = member.linkedUser.id;
        option.textContent = member.linkedUser.name;
        linkedUserSelect.append(option);
      }
    }
  } catch {
    // Ignore - dropdown stays usable without the option list
  }
}

async function loadMember() {
  form.classList.add('form--loading');
  submitBtn.disabled = true;
  try {
    const data = await getMember(memberId);
    form.name.value = data.name;
    form.relationship.value = data.relationship;
    form.dateOfBirth.value = data.dateOfBirth ?? '';
    form.linkedUserId.value = data.linkedUserId ?? '';
    form.notes.value = data.notes ?? '';
    titleEl.textContent = 'Edit family member';
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    form.classList.remove('form--loading');
    submitBtn.disabled = false;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  submitBtn.disabled = true;
  setStatus(statusEl, '');

  const payload = {
    name: form.name.value.trim(),
    relationship: form.relationship.value.trim(),
    dateOfBirth: form.dateOfBirth.value || null,
    linkedUserId: form.linkedUserId.value || null,
    notes: form.notes.value.trim() || null,
  };

  try {
    if (isEditing) {
      await updateMember(memberId, payload);
      toast('Family member updated.', { type: 'success' });
    } else {
      await createMember(payload);
      toast('Family member added.', { type: 'success' });
    }
    window.location.assign('/pages/family.html');
  } catch (error) {
    setStatus(statusEl, describeError(error), 'error');
  } finally {
    submitBtn.disabled = false;
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  updateUserChip(session.user);

  memberId = getQueryId();
  isEditing = Boolean(memberId);

  await loadLinkedUsers();

  if (isEditing) {
    await loadMember();
  }

  form.addEventListener('submit', handleSubmit);
}

init().catch((error) => {
  setStatus(statusEl, describeError(error), 'error');
});