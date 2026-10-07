import { registerUser } from '../api/auth.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';

const form = document.querySelector('#register-form');
const status = document.querySelector('#form-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(form);
  if (data.password !== data.confirmPassword) {
    setStatus(status, 'The two passwords do not match.', 'error');
    return;
  }
  const payload = {
    name: data.name,
    email: data.email,
    password: data.password,
  };
  if (data.timezone) {
    payload.timezone = data.timezone;
  }
  setBusy(form, true);
  setStatus(status, 'Creating your account…');
  try {
    await registerUser(payload);
    setStatus(status, 'Account created! Redirecting to household setup…', 'success');
    window.location.assign('/pages/household.html');
  } catch (error) {
    setStatus(status, describeError(error), 'error');
    setBusy(form, false);
  }
});
