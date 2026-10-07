import {
  changePassword,
  listSessions,
  logoutUser,
  resendVerification,
  revokeOtherSessions,
  revokeSession,
} from '../api/auth.js';
import { updateMe } from '../api/users.js';
import { requireSession, clearCachedSession } from '../state/session.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';
import { initShell, updateUserChip } from '../shell.js';

const profileForm = document.querySelector('#profile-form');
const profileStatus = document.querySelector('#profile-status');
const passwordForm = document.querySelector('#password-form');
const passwordStatus = document.querySelector('#password-status');
const sessionsList = document.querySelector('#sessions-list');
const sessionsStatus = document.querySelector('#sessions-status');
const logoutButton = document.querySelector('#logout-button');
const verifiedNote = document.querySelector('#verified-note');
const resendButton = document.querySelector('#resend-verification-button');
const timezoneSelect = profileForm.querySelector('#timezone');
const householdSelect = profileForm.querySelector('#active-household');

function populateTimezone(selected) {
  const zones = Intl.supportedValuesOf('timeZone');
  const local = Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const zone of [local, ...zones.filter((z) => z !== local)]) {
    const option = document.createElement('option');
    option.value = zone;
    option.textContent = zone;
    timezoneSelect.append(option);
  }
  timezoneSelect.value = zones.includes(selected) ? selected : local;
}

function renderHouseholds(households) {
  householdSelect.innerHTML = '';
  for (const household of households) {
    const option = document.createElement('option');
    option.value = household.householdId;
    option.textContent = `${household.name} (${household.role.toLowerCase()})`;
    householdSelect.append(option);
  }
  householdSelect.disabled = households.length === 0;
  if (households.length > 0) {
    const active = households.find((household) => household.isActive) ?? households[0];
    householdSelect.value = active.householdId;
  }
}

function describeSession(session) {
  const device = session.userAgent ? session.userAgent.slice(0, 40) : 'unknown device';
  return `${device} · ${session.ip ?? 'unknown ip'} · started ${new Date(session.createdAt).toLocaleString()}`;
}

async function renderSessions() {
  const { sessions } = await listSessions();
  sessionsList.innerHTML = '';
  for (const session of sessions) {
    const item = document.createElement('div');
    item.className = 'item-row';

    const info = document.createElement('div');
    info.className = 'item-info';
    info.innerHTML = `<strong>${session.current ? 'This session' : 'Session'}</strong><br>${describeSession(session)}`;

    if (!session.current) {
      const revokeButton = document.createElement('button');
      revokeButton.type = 'button';
      revokeButton.className = 'btn btn--danger';
      revokeButton.textContent = 'Sign out';
      revokeButton.addEventListener('click', async () => {
        try {
          await revokeSession(session.id);
          await renderSessions();
        } catch (error) {
          setStatus(sessionsStatus, describeError(error), 'error');
        }
      });
      item.append(info, revokeButton);
    } else {
      item.append(info);
    }
    sessionsList.append(item);
  }
}

async function init() {
  const [session] = await Promise.all([requireSession(), initShell({ withUser: false })]);
  if (!session) {
    return;
  }
  const { user, households } = session;
  updateUserChip(user);

  profileForm.querySelector('#name').value = user.name;
  populateTimezone(user.timezone);
  renderHouseholds(households);

  verifiedNote.textContent = user.emailVerifiedAt
    ? 'Email verified.'
    : 'Email not verified yet — check your inbox for the verification link.';
  verifiedNote.className = `form-status form-status--${user.emailVerifiedAt ? 'success' : 'warn'}`;
  resendButton.hidden = Boolean(user.emailVerifiedAt);

  await renderSessions().catch((error) => setStatus(sessionsStatus, describeError(error), 'error'));
}

profileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(profileForm);
  setBusy(profileForm, true);
  setStatus(profileStatus, 'Saving profile…');
  try {
    const payload = {
      name: data.name,
      timezone: data.timezone,
    };
    if (data.activeHouseholdId) {
      payload.activeHouseholdId = data.activeHouseholdId;
    }
    const { user } = await updateMe(payload);
    setStatus(profileStatus, 'Profile updated.', 'success');
    const refreshed = await requireSession();
    if (refreshed) {
      renderHouseholds(refreshed.households);
      profileForm.querySelector('#name').value = refreshed.user.name;
    }
  } catch (error) {
    setStatus(profileStatus, describeError(error), 'error');
  } finally {
    setBusy(profileForm, false);
  }
});

passwordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(passwordForm);
  if (data.newPassword !== data.confirmPassword) {
    setStatus(passwordStatus, 'The two passwords do not match.', 'error');
    return;
  }
  setBusy(passwordForm, true);
  setStatus(passwordStatus, 'Updating password…');
  try {
    const { message } = await changePassword(data.currentPassword, data.newPassword);
    setStatus(passwordStatus, message, 'success');
    passwordForm.reset();
    await renderSessions();
  } catch (error) {
    setStatus(passwordStatus, describeError(error), 'error');
  } finally {
    setBusy(passwordForm, false);
  }
});

resendButton.addEventListener('click', async () => {
  resendButton.disabled = true;
  try {
    const { message } = await resendVerification();
    setStatus(verifiedNote, message, 'success');
  } catch (error) {
    setStatus(verifiedNote, describeError(error), 'error');
  } finally {
    resendButton.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => {
  logoutButton.disabled = true;
  try {
    await logoutUser();
  } catch {
    // Even a failed logout clears the local state and returns to login.
  }
  clearCachedSession();
  window.location.assign('/pages/login.html');
});

document.querySelector('#revoke-other-sessions')?.addEventListener('click', async () => {
  try {
    await revokeOtherSessions();
    await renderSessions();
    setStatus(sessionsStatus, 'Other sessions were signed out.', 'success');
  } catch (error) {
    setStatus(sessionsStatus, describeError(error), 'error');
  }
});

init().catch((error) => setStatus(profileStatus, describeError(error), 'error'));
