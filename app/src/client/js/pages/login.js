import { loginUser } from '../api/auth.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';

const form = document.querySelector('#login-form');
const status = document.querySelector('#form-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(form);
  const payload = { email: data.email, password: data.password };
  if (data.rememberMe) {
    payload.rememberMe = true;
  }
  setBusy(form, true);
  setStatus(status, 'Signing in…');
  try {
    const { user } = await loginUser(payload);
    setStatus(status, 'Signed in. Redirecting…', 'success');
    window.location.assign(user.activeHouseholdId ? '/pages/profile.html' : '/pages/household.html');
  } catch (error) {
    setStatus(status, describeError(error), 'error');
    setBusy(form, false);
  }
});
