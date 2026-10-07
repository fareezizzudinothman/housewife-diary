import { resetPassword } from '../api/auth.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';

const form = document.querySelector('#reset-password-form');
const status = document.querySelector('#form-status');

const token = new URLSearchParams(window.location.search).get('token');
if (!token) {
  setStatus(status, 'This reset link is missing its token. Request a new reset email.', 'error');
  form.querySelector('[type="submit"]').disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(form);
  if (data.password !== data.confirmPassword) {
    setStatus(status, 'The two passwords do not match.', 'error');
    return;
  }
  setBusy(form, true);
  setStatus(status, 'Updating your password…');
  try {
    const { message } = await resetPassword(token, data.password);
    setStatus(status, message, 'success');
    form.reset();
  } catch (error) {
    setStatus(status, describeError(error), 'error');
  } finally {
    setBusy(form, false);
  }
});
