import {
  addMember,
  createHousehold,
  leaveHousehold,
  listHouseholds,
  listMembers,
  removeMember,
  switchHousehold,
  updateMemberRole,
} from '../api/households.js';
import { logoutUser } from '../api/auth.js';
import { requireSession, clearCachedSession } from '../state/session.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';
import { hasAtLeast } from '/shared/roles.js';

const createForm = document.querySelector('#create-household-form');
const createStatus = document.querySelector('#create-status');
const householdList = document.querySelector('#household-list');
const membersSection = document.querySelector('#members-section');
const membersHeading = document.querySelector('#members-heading');
const membersList = document.querySelector('#members-list');
const membersStatus = document.querySelector('#members-status');
const addMemberForm = document.querySelector('#add-member-form');
const addMemberStatus = document.querySelector('#add-member-status');
const logoutButton = document.querySelector('#logout-button');

let households = [];
let currentHouseholdId = null;
let viewerRole = 'VIEWER';

function roleBadge(role) {
  return `<span class="badge badge--${role.toLowerCase()}">${role.toLowerCase()}</span>`;
}

async function renderHouseholds() {
  const data = await listHouseholds();
  households = data.households;
  householdList.innerHTML = '';
  if (households.length === 0) {
    householdList.innerHTML = '<p class="form-status">No households yet — create your first one above.</p>';
    membersSection.hidden = true;
    return;
  }
  const active = households.find((household) => household.isActive) ?? households[0];
  currentHouseholdId = active.householdId;
  viewerRole = active.role;
  for (const household of households) {
    const item = document.createElement('div');
    item.className = 'item-row';

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<strong>${household.name}</strong> ${roleBadge(household.role)}<br>${household.memberCount} member${household.memberCount === 1 ? '' : 's'}`;

    if (!household.isActive) {
      const switchButton = document.createElement('button');
      switchButton.type = 'button';
      switchButton.className = 'btn btn--secondary';
      switchButton.textContent = 'Make active';
      switchButton.addEventListener('click', async () => {
        try {
          await switchHousehold(household.householdId);
          await renderHouseholds();
        } catch (error) {
          setStatus(membersStatus, describeError(error), 'error');
        }
      });
      item.append(info, switchButton);
    } else {
      item.append(info);
    }
    householdList.append(item);
  }
  await renderMembers();
}

async function renderMembers() {
  if (!currentHouseholdId) {
    membersSection.hidden = true;
    return;
  }
  const active = households.find((household) => household.householdId === currentHouseholdId);
  membersHeading.textContent = `Members — ${active?.name ?? 'household'}`;
  const { members } = await listMembers(currentHouseholdId);
  membersList.innerHTML = '';
  const canManage = hasAtLeast(viewerRole, 'ADMIN');
  addMemberForm.hidden = !canManage;
  for (const member of members) {
    const item = document.createElement('div');
    item.className = 'item-row';

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<strong>${member.name}</strong> ${roleBadge(member.role)}${member.isOwner ? ' (owner)' : ''}<br>${member.email}`;

    const actions = document.createElement('div');
    actions.className = 'item-actions';

    if (canManage) {
      const roleSelect = document.createElement('select');
      roleSelect.className = 'role-select';
      roleSelect.setAttribute('aria-label', `Role for ${member.name}`);
      for (const role of ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']) {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role.toLowerCase();
        roleSelect.append(option);
      }
      roleSelect.value = member.role;
      roleSelect.addEventListener('change', async () => {
        try {
          await updateMemberRole(currentHouseholdId, member.userId, roleSelect.value);
          setStatus(membersStatus, 'Role updated.', 'success');
          await renderHouseholds();
        } catch (error) {
          setStatus(membersStatus, describeError(error), 'error');
          roleSelect.value = member.role;
        }
      });
      actions.append(roleSelect);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'btn btn--danger';
      removeButton.textContent = 'Remove';
      removeButton.addEventListener('click', async () => {
        try {
          await removeMember(currentHouseholdId, member.userId);
          await renderHouseholds();
        } catch (error) {
          setStatus(membersStatus, describeError(error), 'error');
        }
      });
      actions.append(removeButton);
    }

    item.append(info, actions);
    membersList.append(item);
  }
  membersSection.hidden = false;
}

createForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(createForm);
  setBusy(createForm, true);
  setStatus(createStatus, 'Creating household…');
  try {
    await createHousehold(data.name);
    setStatus(createStatus, 'Household created! You are its owner.', 'success');
    createForm.reset();
    await renderHouseholds();
  } catch (error) {
    setStatus(createStatus, describeError(error), 'error');
  } finally {
    setBusy(createForm, false);
  }
});

addMemberForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(addMemberForm);
  setBusy(addMemberForm, true);
  setStatus(addMemberStatus, 'Adding member…');
  try {
    await addMember(currentHouseholdId, data.email, data.role);
    setStatus(addMemberStatus, 'Member added.', 'success');
    addMemberForm.reset();
    await renderHouseholds();
  } catch (error) {
    setStatus(addMemberStatus, describeError(error), 'error');
  } finally {
    setBusy(addMemberForm, false);
  }
});

document.querySelector('#leave-button')?.addEventListener('click', async () => {
  try {
    await leaveHousehold(currentHouseholdId);
    setStatus(membersStatus, 'You left the household.', 'success');
    await renderHouseholds();
  } catch (error) {
    setStatus(membersStatus, describeError(error), 'error');
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await logoutUser();
  } catch {
    // Proceed to login regardless.
  }
  clearCachedSession();
  window.location.assign('/pages/login.html');
});

async function init() {
  const session = await requireSession();
  if (!session) {
    return;
  }
  await renderHouseholds();
}

init().catch((error) => setStatus(createStatus, describeError(error), 'error'));
