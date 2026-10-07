import { forgotPassword } from '../api/auth.js';
import { readFormData, setBusy, setStatus, describeError } from '../utils/forms.js';

const form = document.querySelector('#forgot-password-form');
const status = document.querySelector('#form-status');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const data = readFormData(form);
  setBusy(form, true);
  setStatus(status, 'Sending reset instructions…');
  try {
    const { message } = await forgotPassword(data.email);
    setStatus(status, message, 'success');
    form.reset();
  } catch (error) {
    setStatus(status, describeError(error), 'error');
  } finally {
    setBusy(form, false);
  }
});
